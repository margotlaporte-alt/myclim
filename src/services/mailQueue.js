function getMailFunctionUrl() {
  const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
  const configuredUrl = String(env.VITE_MAIL_FUNCTION_URL || "").trim();
  return configuredUrl || "/.netlify/functions/send-transactional-mail";
}

function getAppBaseUrl() {
  const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
  const configuredUrl = String(env.VITE_APP_BASE_URL || "").trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }

  return "https://myclim.app";
}

function getMeetingLogoUrl() {
  return `${getAppBaseUrl()}/icons.svg`;
}

function buildBrandedEmailShell({ title, preheader, content }) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#10233f;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#0d6fb8 0%,#e30d25 100%);padding:32px 32px 24px 32px;text-align:center;">
                    <img src="${getMeetingLogoUrl()}" alt="CMCM Luxembourg Indoor Meeting" width="88" height="88" style="display:block;margin:0 auto 16px auto;border:0;" />
                    <p style="margin:0;color:#dcecff;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;">CMCM Luxembourg Indoor Meeting</p>
                    <h1 style="margin:12px 0 0 0;color:#ffffff;font-size:28px;line-height:1.2;">${title}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 32px 32px;">
                    <p style="margin:0;padding-top:20px;border-top:1px solid #dbe4f0;color:#5d6b82;font-size:13px;line-height:1.6;">
                      CMCM Luxembourg Indoor Meeting<br />
                      MyCLIM volunteer platform
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export async function enqueueTransactionalMail(payload) {
  const response = await fetch(getMailFunctionUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMessage = "Impossible d'envoyer le mail pour le moment.";

    try {
      const data = await response.json();
      errorMessage = data?.error || errorMessage;
    } catch {
      // Ignore parsing failures and use the default message.
    }

    throw new Error(errorMessage);
  }
}

export function buildVolunteerAccountCreatedMail({ firstName, email }) {
  const displayName = String(firstName || "").trim() || "bonjour";
  const loginUrl = `${getAppBaseUrl()}/login`;

  return {
    type: "volunteer-account-created",
    to: email,
    subject: "Votre compte bénévole MyCLIM a été créé",
    body: `Bonjour ${displayName},

Votre compte MyCLIM bénévole a bien été créé.

Vous pouvez désormais vous connecter pour suivre votre dossier, vos affectations, vos documents et votre accréditation.

À bientôt,
L'équipe CMCM Luxembourg Indoor Meeting

---

Hello ${displayName},

Your MyCLIM volunteer account has been created successfully.

You can now sign in to follow your application, assignments, documents, and accreditation.

See you soon,
The CMCM Luxembourg Indoor Meeting team`,
    html: buildBrandedEmailShell({
      title: "Welcome to MyCLIM",
      preheader: "Your volunteer account is ready.",
      content: `
        <p style="margin:0 0 18px 0;font-size:16px;line-height:1.7;">Bonjour ${displayName},</p>
        <p style="margin:0 0 14px 0;font-size:16px;line-height:1.7;">
          Votre compte <strong>MyCLIM bénévole</strong> a bien été créé.
        </p>
        <p style="margin:0 0 22px 0;font-size:16px;line-height:1.7;">
          Vous pouvez désormais vous connecter pour suivre votre dossier, vos affectations, vos documents et votre accréditation.
        </p>
        <p style="margin:0 0 28px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:#e30d25;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:700;">
            Accéder à MyCLIM
          </a>
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 24px 0;border-collapse:collapse;">
          <tr>
            <td style="padding:20px;background:#f6f9fc;border:1px solid #dbe4f0;border-radius:16px;">
              <p style="margin:0 0 12px 0;font-size:13px;letter-spacing:1.4px;text-transform:uppercase;color:#6a7890;">English</p>
              <p style="margin:0 0 12px 0;font-size:16px;line-height:1.7;">Hello ${displayName},</p>
              <p style="margin:0 0 12px 0;font-size:16px;line-height:1.7;">
                Your <strong>MyCLIM volunteer account</strong> has been created successfully.
              </p>
              <p style="margin:0;font-size:16px;line-height:1.7;">
                You can now sign in to follow your application, assignments, documents, and accreditation.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:0;font-size:15px;line-height:1.7;">
          À bientôt,<br />
          <strong>L'équipe CMCM Luxembourg Indoor Meeting</strong>
        </p>
      `,
    }),
  };
}

export function buildPreProgramAccountCreatedMail({ parentFirstName, parentEmail, children }) {
  const displayName = String(parentFirstName || "").trim() || "bonjour";
  const childSummary = Array.isArray(children)
    ? children
        .map((child) => {
          const childName = [child.firstName, child.lastName].filter(Boolean).join(" ").trim();
          return child.requestType === "porte_panier"
            ? `- ${childName}: demande porte-panier`
            : `- ${childName}: ${child.requestedEvent || "pré-programme"}`;
        })
        .join("\n")
    : "";

  return {
    type: "preprogram-account-created",
    to: parentEmail,
    subject: "Votre compte parent MyCLIM a été créé",
    body: `Bonjour ${displayName},

Votre compte parent MyCLIM a bien été créé et votre dossier a été enregistré.

Demandes reçues:
${childSummary || "- Aucun enfant enregistré"}

Vous pouvez vous reconnecter à tout moment pour suivre l'évolution des demandes et confirmer une place si elle vous est proposée.

À bientôt,
L'équipe CMCM Luxembourg Indoor Meeting`,
  };
}

export function buildVolunteerRoleAssignmentMail({ email, firstName, assignedRole, teamRole }) {
  const displayName = String(firstName || "").trim() || "bonjour";

  return {
    type: "volunteer-role-assigned",
    to: email,
    subject: "Votre affectation bénévole MyCLIM",
    body: `Bonjour ${displayName},

Une affectation vient d'être préparée pour vous sur MyCLIM.

Rôle principal: ${assignedRole || "À confirmer"}
Fonction: ${teamRole || "Bénévole"}

Connectez-vous à votre espace MyCLIM pour consulter les détails de mission et les informations utiles.

À bientôt,
L'équipe CMCM Luxembourg Indoor Meeting`,
  };
}

export function buildU14PreprogramAcceptanceMail({ parentEmail, childName, raceLabel }) {
  return {
    type: "u14-confirmation-request",
    to: parentEmail,
    subject: "Votre enfant est retenu pour le pré-programme",
    body: `Bonjour,

Votre enfant ${childName} est retenu pour ${raceLabel}.

Merci de confirmer sa participation dans votre espace parent MyCLIM.

À bientôt,
L'équipe CMCM Luxembourg Indoor Meeting`,
  };
}

export function buildU14BasketAcceptanceMail({ parentEmail, childName }) {
  return {
    type: "u14-basket-accepted",
    to: parentEmail,
    subject: "Votre enfant est retenu comme porte-panier",
    body: `Bonjour,

Votre enfant ${childName} est retenu comme porte-panier pour le CMCM Luxembourg Indoor Meeting 2027.

Merci de confirmer sa participation dans votre espace parent MyCLIM.

À bientôt,
L'équipe CMCM Luxembourg Indoor Meeting`,
  };
}
