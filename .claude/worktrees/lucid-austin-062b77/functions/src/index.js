/* global process */

import admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { sendMail } from "./mailer.js";

admin.initializeApp();

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

export const requestPasswordReset = onCall(
  {
    region: "europe-west1",
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
