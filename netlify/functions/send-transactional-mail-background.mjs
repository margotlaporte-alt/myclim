import { sendTransactionalMail } from "./_mail/send-mail-core.mjs";

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

export default async (request) => {
  if (request.method === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const payload = await request.json();
    const info = await sendTransactionalMail(payload);
    console.log("Transactional email sent", {
      to: String(payload?.to || ""),
      subject: String(payload?.subject || ""),
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    });

    return jsonResponse(202, {
      success: true,
      queued: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    });
  } catch (error) {
    return jsonResponse(error?.statusCode || 500, {
      error: error?.message || "Unable to send email.",
    });
  }
};
