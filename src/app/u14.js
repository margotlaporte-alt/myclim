const luxCompetitionClubs = [
  "CAB",
  "CAD",
  "CAPA",
  "CSL",
  "CELTIC",
  "LIAL",
  "CAEG",
  "CAFOLA",
  "CAS",
  "Karibu",
  "Trispeed",
  "RBUAP",
  "CSN Clervaux",
  "Triathlon Luxembourg",
  "Team X3M Snooze",
];

function getU14AllowedEvents(category) {
  const normalizedCategory = String(category || "").trim().toUpperCase();
  return normalizedCategory === "U14" ? ["60 m", "1000 m"] : ["60 m"];
}

function getValidRequestedEventForCategory(category, requestedEvent) {
  const allowedEvents = getU14AllowedEvents(category);
  return allowedEvents.includes(requestedEvent) ? requestedEvent : allowedEvents[0];
}

function getPreProgramSubmissionErrorMessage(error) {
  switch (error?.code) {
    case "preprogram/users-write-failed":
    case "preprogram/child-write-failed":
    case "preprogram/request-write-failed":
      return error.message;
    case "auth/email-already-in-use":
      return "Un compte existe déjà avec cette adresse email.";
    case "auth/invalid-email":
      return "L'adresse email du parent n'est pas valide.";
    case "auth/missing-password":
      return "Le mot de passe est manquant.";
    case "auth/weak-password":
      return "Le mot de passe doit contenir au moins 6 caractères.";
    case "auth/network-request-failed":
      return "La création du compte a échoué à cause d'un problème réseau. Réessaie dans un instant.";
    case "permission-denied":
    case "firestore/permission-denied":
      return "La création du compte a été refusée par les règles d'accès.";
    case "unavailable":
    case "firestore/unavailable":
      return "Le service d'inscription est momentanément indisponible. Réessaie plus tard.";
    default:
      return error?.message
        ? `La création du compte a échoué : ${error.message}`
        : "La création du compte a échoué pour une raison inconnue.";
  }
}

export {
  getPreProgramSubmissionErrorMessage,
  getU14AllowedEvents,
  getValidRequestedEventForCategory,
  luxCompetitionClubs,
};
