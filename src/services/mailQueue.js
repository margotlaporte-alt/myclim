function getMailFunctionUrl() {
  const configuredUrl = String(import.meta.env.VITE_MAIL_FUNCTION_URL || "").trim();
  return configuredUrl || "/.netlify/functions/send-transactional-mail";
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

  return {
    type: "volunteer-account-created",
    to: email,
    subject: "Votre compte bénévole MyCLIM a été créé",
    body: `Bonjour ${displayName},

Votre compte MyCLIM bénévole a bien été créé.

Vous pouvez désormais vous connecter pour suivre votre dossier, vos affectations, vos documents et votre accréditation.

À bientôt,
L'équipe CMCM Luxembourg Indoor Meeting`,
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
