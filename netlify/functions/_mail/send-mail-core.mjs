import nodemailer from "nodemailer";

let transporterPromise;

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function buildHtmlFromText(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("");
}

async function createTransporter() {
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const nextTransporter = nodemailer.createTransport({
    host: readRequiredEnv("SMTP_HOST"),
    port: smtpPort,
    secure: smtpSecure,
    pool: true,
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 2),
    maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 20),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
    auth: {
      user: readRequiredEnv("SMTP_USER"),
      pass: readRequiredEnv("SMTP_PASS"),
    },
  });

  return nextTransporter;
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = createTransporter().catch((error) => {
      transporterPromise = undefined;
      throw error;
    });
  }

  return transporterPromise;
}

function normalizeMailPayload(payload) {
  const to = String(payload?.to || "").trim();
  const subject = String(payload?.subject || "").trim();
  const text = String(payload?.body || payload?.text || "").trim();
  const html = String(payload?.html || "").trim() || buildHtmlFromText(text);

  if (!to || !subject || (!text && !html)) {
    const error = new Error("Missing required fields: to, subject, and body or html.");
    error.statusCode = 400;
    throw error;
  }

  return {
    from: process.env.SMTP_FROM || readRequiredEnv("SMTP_USER"),
    to,
    subject,
    text: text || subject,
    html,
  };
}

export async function sendTransactionalMail(payload) {
  const transporter = await getTransporter();
  const normalizedPayload = normalizeMailPayload(payload);
  const info = await transporter.sendMail(normalizedPayload);

  return {
    messageId: info.messageId || "",
    accepted: Array.isArray(info.accepted) ? info.accepted : [],
    rejected: Array.isArray(info.rejected) ? info.rejected : [],
  };
}
