/* global process */

import nodemailer from "nodemailer";

let transporter;
let graphAccessToken;
let graphAccessTokenExpiresAt = 0;

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readOptionalEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function getMailTransport() {
  const configuredTransport = readOptionalEnv("MAIL_TRANSPORT").toLowerCase();
  if (configuredTransport) return configuredTransport;

  if (
    readOptionalEnv("MICROSOFT_GRAPH_TENANT_ID") &&
    readOptionalEnv("MICROSOFT_GRAPH_CLIENT_ID") &&
    readOptionalEnv("MICROSOFT_GRAPH_CLIENT_SECRET") &&
    readOptionalEnv("MICROSOFT_GRAPH_SENDER")
  ) {
    return "graph";
  }

  return "smtp";
}

export function getMailer() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: readRequiredEnv("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: readRequiredEnv("SMTP_USER"),
      pass: readRequiredEnv("SMTP_PASS"),
    },
  });

  return transporter;
}

export function getDefaultFromAddress() {
  if (getMailTransport() === "graph") {
    return readOptionalEnv("MICROSOFT_GRAPH_FROM") || readRequiredEnv("MICROSOFT_GRAPH_SENDER");
  }

  return process.env.SMTP_FROM || readRequiredEnv("SMTP_USER");
}

async function fetchGraphAccessToken() {
  const tenantId = readRequiredEnv("MICROSOFT_GRAPH_TENANT_ID");
  const clientId = readRequiredEnv("MICROSOFT_GRAPH_CLIENT_ID");
  const clientSecret = readRequiredEnv("MICROSOFT_GRAPH_CLIENT_SECRET");

  if (graphAccessToken && Date.now() < graphAccessTokenExpiresAt) {
    return graphAccessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error_description ||
        payload?.error?.message ||
        "Unable to fetch Microsoft Graph access token.",
    );
  }

  graphAccessToken = payload.access_token;
  graphAccessTokenExpiresAt =
    Date.now() + Math.max((Number(payload.expires_in) || 3600) - 120, 60) * 1000;
  return graphAccessToken;
}

async function sendMailWithGraph({ to, subject, text, html }) {
  const sender = readRequiredEnv("MICROSOFT_GRAPH_SENDER");
  const fromAddress = getDefaultFromAddress();
  const accessToken = await fetchGraphAccessToken();
  const recipients = String(to || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((address) => ({
      emailAddress: {
        address,
      },
    }));

  if (!recipients.length) {
    throw new Error("At least one recipient email address is required.");
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: html ? "HTML" : "Text",
            content: html || text || "",
          },
          toRecipients: recipients,
          from: {
            emailAddress: {
              address: fromAddress,
            },
          },
        },
        saveToSentItems: true,
      }),
    },
  );

  if (!response.ok) {
    let errorMessage = "Unable to send email with Microsoft Graph.";

    try {
      const payload = await response.json();
      errorMessage = payload?.error?.message || errorMessage;
    } catch {
      // Ignore JSON parsing errors and use the default message.
    }

    throw new Error(errorMessage);
  }

  return {
    messageId: `graph-${Date.now()}`,
  };
}

export async function sendMail({ to, subject, text, html }) {
  if (getMailTransport() === "graph") {
    return sendMailWithGraph({ to, subject, text, html });
  }

  const mailer = getMailer();

  return mailer.sendMail({
    from: getDefaultFromAddress(),
    to,
    subject,
    text,
    html,
  });
}
