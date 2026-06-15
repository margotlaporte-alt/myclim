import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();
const auth = getAuth();
const REGION = "europe-west1";
const TEAM_CONFIGURATION_DOC_PATH = ["appSettings", "teamsConfiguration"];
const ACCREDITATION_CONFIGURATION_DOC_PATH = ["appSettings", "accreditationConfiguration"];

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

  return { requesterUid, requesterProfile };
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
          updatedAt: FieldValue.serverTimestamp(),
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
          updatedAt: FieldValue.serverTimestamp(),
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
    deletedAt: FieldValue.serverTimestamp(),
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
