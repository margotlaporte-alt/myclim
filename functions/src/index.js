/* global process */

import admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { sendMail } from "./mailer.js";

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const REGION = "europe-west1";
const TEAM_CONFIGURATION_DOC_PATH = ["appSettings", "teamsConfiguration"];
const ACCREDITATION_CONFIGURATION_DOC_PATH = ["appSettings", "accreditationConfiguration"];

function buildHtmlFromText(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("");
}

export const processMailQueue = onDocumentCreated(
  {
    document: "mailQueue/{mailId}",
    region: "europe-west1",
    retry: false,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    if (!data?.to || !data?.subject || !data?.body) {
      await snapshot.ref.update({
        status: "error",
        errorMessage: "Missing required fields: to, subject, or body.",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    if (data.status && data.status !== "pending") {
      return;
    }

    try {
      const response = await sendMail({
        to: data.to,
        subject: data.subject,
        text: data.body,
        html: data.html || buildHtmlFromText(data.body),
      });

      await snapshot.ref.update({
        status: "sent",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        providerMessageId: response?.messageId || "",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.error("Mail queue send failed", error);

      await snapshot.ref.update({
        status: "error",
        errorMessage: error?.message || "Unknown mail sending error",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  },
);

async function assertAdminRequester(request) {
  const requesterUid = String(request.auth?.uid || "").trim();
  if (!requesterUid) {
    throw new HttpsError("unauthenticated", "Authentification requise.");
  }

  const requesterSnapshot = await db.collection("users").doc(requesterUid).get();
  const requesterProfile = requesterSnapshot.exists ? requesterSnapshot.data() : null;
  const requesterRoles = Array.isArray(requesterProfile?.userTypes) ? requesterProfile.userTypes : [];

  if (!requesterRoles.includes("admin")) {
    throw new HttpsError("permission-denied", "Seuls les administrateurs peuvent supprimer un utilisateur.");
  }

  return { requesterUid };
}

async function deleteCollectionByField(collectionName, fieldName, value) {
  if (!value) return 0;

  const snapshot = await db.collection(collectionName).where(fieldName, "==", value).get();
  if (snapshot.empty) return 0;

  const batch = db.batch();
  snapshot.docs.forEach((documentSnapshot) => {
    batch.delete(documentSnapshot.ref);
  });
  await batch.commit();
  return snapshot.size;
}

async function cleanupUserReferences(targetUserId) {
  const teamsRef = db.doc(TEAM_CONFIGURATION_DOC_PATH.join("/"));
  const teamsSnapshot = await teamsRef.get();
  let removedAssignments = 0;

  if (teamsSnapshot.exists) {
    const data = teamsSnapshot.data() || {};
    const teamAssignments = Array.isArray(data.teamAssignments) ? data.teamAssignments : [];
    const nextAssignments = teamAssignments.filter((assignment) => assignment?.id !== targetUserId);
    removedAssignments = teamAssignments.length - nextAssignments.length;

    if (removedAssignments > 0) {
      await teamsRef.set(
        {
          teamAssignments: nextAssignments,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  const accreditationRef = db.doc(ACCREDITATION_CONFIGURATION_DOC_PATH.join("/"));
  const accreditationSnapshot = await accreditationRef.get();
  let removedAccreditationOverride = false;

  if (accreditationSnapshot.exists) {
    const data = accreditationSnapshot.data() || {};
    const volunteerOverrides =
      data.volunteerOverrides && typeof data.volunteerOverrides === "object" ? data.volunteerOverrides : {};

    if (Object.prototype.hasOwnProperty.call(volunteerOverrides, targetUserId)) {
      const nextOverrides = { ...volunteerOverrides };
      delete nextOverrides[targetUserId];
      removedAccreditationOverride = true;

      await accreditationRef.set(
        {
          volunteerOverrides: nextOverrides,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  return {
    removedAssignments,
    removedAccreditationOverride,
  };
}

export const requestPasswordReset = onCall(
  {
    region: REGION,
  },
  async (request) => {
    const email = String(request.data?.email || "").trim();
    if (!email) {
      throw new HttpsError("invalid-argument", "Email is required.");
    }

    try {
      const actionCodeSettings = process.env.APP_BASE_URL
        ? {
            url: `${process.env.APP_BASE_URL.replace(/\/$/, "")}/login`,
            handleCodeInApp: false,
          }
        : undefined;
      const resetLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);

      await sendMail({
        to: email,
        subject: "Réinitialisation de votre mot de passe MyCLIM",
        text: `Bonjour,

Vous avez demandé la réinitialisation de votre mot de passe MyCLIM.

Utilisez ce lien pour définir un nouveau mot de passe:
${resetLink}

Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.

L'équipe CMCM Luxembourg Indoor Meeting`,
        html: `
          <p>Bonjour,</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe MyCLIM.</p>
          <p><a href="${resetLink}">Définir un nouveau mot de passe</a></p>
          <p>Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.</p>
          <p>L'équipe CMCM Luxembourg Indoor Meeting</p>
        `,
      });

      return { success: true };
    } catch (error) {
      logger.error("Password reset request failed", error);
      throw new HttpsError("internal", "Unable to send password reset email.");
    }
  },
);

export const deletePlatformUser = onCall({ region: REGION }, async (request) => {
  const { requesterUid } = await assertAdminRequester(request);
  const targetUserId = String(request.data?.userId || "").trim();

  if (!targetUserId) {
    throw new HttpsError("invalid-argument", "Identifiant utilisateur manquant.");
  }

  if (targetUserId === requesterUid) {
    throw new HttpsError("failed-precondition", "Tu ne peux pas supprimer ton propre compte depuis cet écran.");
  }

  const userRef = db.collection("users").doc(targetUserId);
  const userSnapshot = await userRef.get();
  const userProfile = userSnapshot.exists ? userSnapshot.data() : null;
  const targetEmail = String(request.data?.email || userProfile?.email || "").trim();

  await db.collection("usersDeletionArchive").doc(targetUserId).set({
    originalDocId: targetUserId,
    deletedBy: requesterUid,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    email: targetEmail,
    userProfile: userProfile || null,
  });

  if (userSnapshot.exists) {
    await userRef.delete();
  }

  const [deletedVolunteerApplicationsByUid, deletedVolunteerApplicationsByEmail, deletedChildren, deletedRequests] =
    await Promise.all([
      deleteCollectionByField("volunteerApplications", "uid", targetUserId),
      deleteCollectionByField("volunteerApplications", "email", targetEmail),
      deleteCollectionByField("u14Children", "parentUserId", targetUserId),
      deleteCollectionByField("u14Requests", "parentUserId", targetUserId),
    ]);

  const referenceCleanup = await cleanupUserReferences(targetUserId);

  let authDeleted = false;
  let authMissing = false;
  try {
    await auth.deleteUser(targetUserId);
    authDeleted = true;
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      authMissing = true;
    } else {
      throw error;
    }
  }

  return {
    success: true,
    userId: targetUserId,
    authDeleted,
    authMissing,
    deletedVolunteerApplicationsByUid,
    deletedVolunteerApplicationsByEmail,
    deletedChildren,
    deletedRequests,
    ...referenceCleanup,
  };
});
