import nodemailer from "nodemailer";

let transporter;

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

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

function getTransporter() {
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

export default async (request) => {
  if (request.method === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const payload = await request.json();
    const to = String(payload?.to || "").trim();
    const subject = String(payload?.subject || "").trim();
    const text = String(payload?.body || payload?.text || "").trim();
    const html = String(payload?.html || "").trim() || buildHtmlFromText(text);

    if (!to || !subject || (!text && !html)) {
      return jsonResponse(400, {
        error: "Missing required fields: to, subject, and body or html.",
      });
    }

    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM || readRequiredEnv("SMTP_USER"),
      to,
      subject,
      text: text || subject,
      html,
    });

    return jsonResponse(200, {
      success: true,
      messageId: info.messageId || "",
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error?.message || "Unable to send email.",
    });
  }
};
