import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { auth, db } from "./services/firebase";
import {
  buildU14BasketAcceptanceMail,
  buildU14PreprogramAcceptanceMail,
  buildVolunteerRoleAssignmentMail,
  enqueueTransactionalMail,
} from "./services/mailQueue";
import "./App.css";
import cmcmLogo from "./assets/cmcm-logo.png";
import volunteersHomeImage from "./assets/volunteers-home.jpg";
import preprogrammeHomeImage from "./assets/preprogramme-home.jpg";
import portePanierHomeImage from "./assets/porte-panier-home.jpg";

const LanguageContext = createContext(null);
const LANGUAGE_STORAGE_KEY = "myclim-language";
const REMEMBER_ME_STORAGE_KEY = "myclim-remember-me";
const supportedLanguages = ["en", "fr", "de"];
const PREPROGRAM_OPEN_AT = new Date("2026-11-10T10:00:00+01:00");
const DEFAULT_PHONE_COUNTRY_CODE = "+352";
const VOLUNTEER_LANGUAGE_OPTIONS = ["Français", "Anglais", "Allemand", "Belge", "Luxembourgeois", "Autre"];
const VOLUNTEER_SUPPORT_AVAILABILITY_OPTIONS = [
  "Avant-meeting - vendredi matin",
  "Avant-meeting - vendredi après-midi",
  "Avant-meeting - samedi matin",
  "Avant-meeting - samedi après-midi",
  "Après-meeting - lundi 9h-12h",
];
const VOLUNTEER_MEETING_DAY_LABEL = "Meeting - dimanche 17/01/2027 9h30-19h00 (obligatoire)";
const PHONE_COUNTRY_OPTIONS = [
  { code: "+352", label: "Luxembourg" },
  { code: "+33", label: "France" },
  { code: "+32", label: "Belgique" },
  { code: "+49", label: "Allemagne" },
  { code: "+41", label: "Suisse" },
  { code: "+351", label: "Portugal" },
  { code: "+34", label: "Espagne" },
  { code: "+39", label: "Italie" },
  { code: "+31", label: "Pays-Bas" },
  { code: "+44", label: "Royaume-Uni" },
];

function parsePhoneValue(value) {
  const normalizedValue = String(value || "").trim();
  const sortedOptions = [...PHONE_COUNTRY_OPTIONS].sort((left, right) => right.code.length - left.code.length);

  const matchingOption = sortedOptions.find(
    (option) => normalizedValue === option.code || normalizedValue.startsWith(`${option.code} `),
  );

  if (matchingOption) {
    return {
      countryCode: matchingOption.code,
      localNumber: normalizedValue.slice(matchingOption.code.length).trim(),
    };
  }

  if (normalizedValue.startsWith("+")) {
    const [rawCountryCode, ...localNumberParts] = normalizedValue.split(/\s+/);
    return {
      countryCode: rawCountryCode,
      localNumber: localNumberParts.join(" "),
    };
  }

  return {
    countryCode: DEFAULT_PHONE_COUNTRY_CODE,
    localNumber: normalizedValue,
  };
}

function buildPhoneValue(countryCode, localNumber) {
  const normalizedLocalNumber = String(localNumber || "").trim();
  return normalizedLocalNumber ? `${countryCode} ${normalizedLocalNumber}` : "";
}

function readRememberMePreference() {
  if (typeof window === "undefined") {
    return true;
  }

  const storedValue = window.localStorage.getItem(REMEMBER_ME_STORAGE_KEY);
  return storedValue === null ? true : storedValue === "true";
}

const messages = {
  en: {
    myclim: "MyCLIM",
    returnHome: "Back to home",
    landingTopline: "CMCM Luxembourg Indoor Meeting",
    landingTitle: "MyCLIM - Everything you need for the CMCM Luxembourg Indoor Meeting 2027",
    landingDescription:
      "Choose your path to access registrations, practical information, and your personal space.",
    landingLoginButton: "Log in",
    landingLoginHint: "Already have an account? Access your personal space directly.",
    volunteersTitle: "Volunteers",
    volunteersDescription: "Sign in, create an account, or apply as a volunteer.",
    preprogramTitle: "U12/U14 Pre-Program",
    preprogramDescription: "Parent access and registration for the pre-program and basket carriers.",
    volunteerPageTitle: "CMCM Luxembourg Indoor Meeting Volunteers",
    volunteerPageSubtitle: "Sign in to your space or submit your volunteer application.",
    volunteerLoginEyebrow: "Sign in",
    volunteerLoginTitle: "I already have an account",
    volunteerLoginDescription: "Sign in to view your assignments, documents, and meeting information.",
    volunteerApplyEyebrow: "Application",
    volunteerApplyTitle: "I want to volunteer",
    volunteerApplyButton: "Apply now",
    volunteerCloseButton: "Close form",
    volunteerPlaceholder: "The volunteer form will appear here, just below this section.",
    preprogramPageTitle: "U12/U14 Pre-Program and Basket Carrier Registration",
    preprogramPageSubtitle:
      "Register your child for the U12/U14 pre-program or the basket carrier role, then follow updates in your parent space.",
    preprogramIntroEyebrow: "U12 / U14 2027",
    preprogramIntroTitle: "Register my child for the pre-program or as a basket carrier",
    preprogramIntroDescription:
      "The parent account is created during registration. For each child, you can indicate whether they would like to join the pre-program, be a basket carrier, or be considered for either option depending on availability.",
    preprogramClosedTitle: "Registrations open on November 10, 2026 at 10:00 AM",
    preprogramClosedDescription:
      "The pre-program and basket carrier form is not open yet. Until then, this page explains how selections and confirmations will work.",
    preprogramClosedCardTitle: "How selections work for the 2027 edition",
    preprogramClosedCardBody:
      "For the 2027 edition, your child's application will only be reviewed if the file is complete. For the races, places are allocated in the order complete applications are received, then a waiting list applies once capacity is reached. On meeting day, each child can only be confirmed for one activity. If you request both the pre-program and the basket carrier role, the final confirmation will be given for only one of the two options.",
    preprogramClosedRulesTitle: "Important rules to know before opening day",
    preprogramClosedRulesBody:
      "Each child can only be confirmed in one activity on the day of the meeting. If a request is submitted for both the pre-program and basket carrier role, the final confirmation will only be given for one of them.",
    preprogramClosedTimingTitle: "What happens on opening day",
    preprogramClosedTimingBody:
      "On November 10, 2026 at 10:00 AM, the form will automatically become available on this same page. You will then be able to create the parent account and submit the request.",
    languageLabel: "Language",
    langEn: "EN",
    langFr: "FR",
    langDe: "DE",
  },
  fr: {
    myclim: "MyCLIM",
    returnHome: "Retour à l'accueil",
    landingTopline: "CMCM Luxembourg Indoor Meeting",
    landingTitle: "MyCLIM - Toutes les informations sur le CMCM Luxembourg Indoor Meeting 2027",
    landingDescription:
      "Choisissez votre parcours pour accéder rapidement aux inscriptions, aux informations pratiques et à votre espace personnel.",
    landingLoginButton: "Se connecter",
    landingLoginHint: "Vous avez déjà un compte ? Accédez directement à votre espace personnel.",
    volunteersTitle: "Bénévoles",
    volunteersDescription: "Connexion, création de compte et candidature bénévole.",
    preprogramTitle: "Pré-programme U12/U14",
    preprogramDescription: "Accès parents et inscription au pré-programme et porte-panier.",
    volunteerPageTitle: "Bénévoles CMCM Luxembourg Indoor Meeting",
    volunteerPageSubtitle: "Connectez-vous à votre espace ou déposez votre candidature bénévole.",
    volunteerLoginEyebrow: "Connexion",
    volunteerLoginTitle: "J'ai déjà un compte",
    volunteerLoginDescription: "Connectez-vous pour retrouver vos affectations, documents et informations du meeting.",
    volunteerApplyEyebrow: "Candidature",
    volunteerApplyTitle: "Je candidate comme bénévole",
    volunteerApplyButton: "Candidater",
    volunteerCloseButton: "Fermer le questionnaire",
    volunteerPlaceholder: "Le questionnaire bénévole s'ouvrira ici, juste sous ce bloc.",
    preprogramPageTitle: "Inscription Pré-programme U12/U14 et porte-panier",
    preprogramPageSubtitle:
      "Inscrivez votre enfant au Pré-programme U12/U14 ou au rôle de porte-panier, puis retrouvez ensuite les statuts et informations pratiques dans votre espace parent.",
    preprogramIntroEyebrow: "U12 / U14 2027",
    preprogramIntroTitle: "Inscrire mon enfant au Pré-programme ou comme porte-panier",
    preprogramIntroDescription:
      "Le compte parent est créé en même temps que l'inscription. Pour chaque enfant, vous pouvez indiquer s'il souhaite participer au Pré-programme, au porte-panier, ou si vous acceptez l'une ou l'autre des deux possibilités selon les places disponibles.",
    preprogramClosedTitle: "Les inscriptions ouvriront le 10 novembre 2026 à 10h00",
    preprogramClosedDescription:
      "Le formulaire Pré-programme et porte-panier n'est pas encore ouvert. En attendant, cette page vous explique le fonctionnement des sélections et des confirmations.",
    preprogramClosedCardTitle: "Fonctionnement des acceptations pour l'édition 2027",
    preprogramClosedCardBody:
      "Pour l'édition 2027, la demande de votre enfant ne pourra être étudiée que si le dossier est complet. Pour les courses, les places sont attribuées dans l'ordre d'arrivée des dossiers complets, puis une liste d'attente s'applique une fois les quotas atteints. Le jour du meeting, chaque enfant ne pourra être confirmé que dans une seule activité. Si vous demandez à la fois le Pré-programme et le rôle de porte-panier, la confirmation finale ne sera donnée que pour une seule des deux options.",
    preprogramClosedRulesTitle: "Règles importantes à connaître",
    preprogramClosedRulesBody:
      "Chaque enfant ne pourra être confirmé que dans une seule activité le jour du meeting. Si une demande porte à la fois sur le Pré-programme et sur le porte-panier, la confirmation finale ne sera donnée que pour une seule des deux options.",
    preprogramClosedTimingTitle: "Ce qui se passera à l'ouverture",
    preprogramClosedTimingBody:
      "Le 10 novembre 2026 à 10h00, le formulaire deviendra automatiquement accessible sur cette même page. Vous pourrez alors créer le compte parent et envoyer la demande.",
    languageLabel: "Langue",
    langEn: "EN",
    langFr: "FR",
    langDe: "DE",
  },
  de: {
    myclim: "MyCLIM",
    returnHome: "Zur Startseite",
    landingTopline: "CMCM Luxembourg Indoor Meeting",
    landingTitle: "MyCLIM - Alle Informationen zum CMCM Luxembourg Indoor Meeting 2027",
    landingDescription:
      "Wählen Sie Ihren Zugang, um Registrierungen, praktische Informationen und Ihren persönlichen Bereich schnell zu erreichen.",
    landingLoginButton: "Anmelden",
    landingLoginHint: "Sie haben bereits ein Konto? Gehen Sie direkt zu Ihrem persönlichen Bereich.",
    volunteersTitle: "Freiwillige",
    volunteersDescription: "Anmelden, Konto erstellen oder sich als Volunteer bewerben.",
    preprogramTitle: "U12/U14 Vorprogramm",
    preprogramDescription: "Elternzugang und Anmeldung für Vorprogramm und Korbträger.",
    volunteerPageTitle: "Freiwillige des CMCM Luxembourg Indoor Meeting",
    volunteerPageSubtitle: "Melden Sie sich an oder reichen Sie Ihre Volunteer-Bewerbung ein.",
    volunteerLoginEyebrow: "Anmeldung",
    volunteerLoginTitle: "Ich habe bereits ein Konto",
    volunteerLoginDescription: "Melden Sie sich an, um Einsätze, Dokumente und Meeting-Infos zu sehen.",
    volunteerApplyEyebrow: "Bewerbung",
    volunteerApplyTitle: "Ich möchte Volunteer werden",
    volunteerApplyButton: "Bewerben",
    volunteerCloseButton: "Formular schließen",
    volunteerPlaceholder: "Das Volunteer-Formular wird hier direkt unter diesem Abschnitt angezeigt.",
    preprogramPageTitle: "Anmeldung Vorprogramm U12/U14 und Korbträger",
    preprogramPageSubtitle:
      "Melden Sie Ihr Kind für das U12/U14-Vorprogramm oder die Korbträger-Rolle an und verfolgen Sie danach alles im Elternbereich.",
    preprogramIntroEyebrow: "U12 / U14 2027",
    preprogramIntroTitle: "Mein Kind für das Vorprogramm oder als Korbträger anmelden",
    preprogramIntroDescription:
      "Das Elternkonto wird während der Anmeldung erstellt. Für jedes Kind können Sie angeben, ob es am Vorprogramm teilnehmen, Korbträger sein oder je nach Verfügbarkeit für beide Optionen berücksichtigt werden soll.",
    preprogramClosedTitle: "Die Anmeldungen öffnen am 10. November 2026 um 10:00 Uhr",
    preprogramClosedDescription:
      "Das Formular für Vorprogramm und Korbträger ist noch nicht geöffnet. Bis dahin erklärt diese Seite, wie Auswahl und Bestätigung funktionieren.",
    preprogramClosedCardTitle: "So laufen die Zusagen für die Ausgabe 2027 ab",
    preprogramClosedCardBody:
      "Für die Ausgabe 2027 kann die Anmeldung Ihres Kindes nur berücksichtigt werden, wenn das Dossier vollständig ist. Für die Läufe werden die Plätze in der Reihenfolge des Eingangs vollständiger Anmeldungen vergeben, danach gilt eine Warteliste. Am Tag des Meetings kann jedes Kind nur für eine Aktivität bestätigt werden. Wenn Sie sowohl das Vorprogramm als auch die Korbträger-Rolle anfragen, wird die endgültige Bestätigung nur für eine der beiden Optionen erteilt.",
    preprogramClosedRulesTitle: "Wichtige Regeln vor der Öffnung",
    preprogramClosedRulesBody:
      "Jedes Kind kann am Tag des Meetings nur für eine Aktivität bestätigt werden. Wenn eine Anfrage sowohl Vorprogramm als auch Korbträger betrifft, wird die endgültige Bestätigung nur für eine der beiden Optionen erteilt.",
    preprogramClosedTimingTitle: "Was am Eröffnungstag passiert",
    preprogramClosedTimingBody:
      "Am 10. November 2026 um 10:00 Uhr wird das Formular automatisch auf dieser Seite freigeschaltet. Dann können Sie das Elternkonto erstellen und die Anfrage absenden.",
    languageLabel: "Sprache",
    langEn: "EN",
    langFr: "FR",
    langDe: "DE",
  },
};

const teamNeeds = [
  { team: "Transport", needed: 18, assigned: 14, leader: "Sofia Da Costa" },
  { team: "Warm-up", needed: 10, assigned: 10, leader: "Tom Weber" },
  { team: "VIP", needed: 12, assigned: 8, leader: "Anne Pinto" },
  { team: "Call room", needed: 16, assigned: 13, leader: "Joao Martins" },
];

const assignmentRows = [
  {
    person: "Mia Fernandes",
    role: "Benevole",
    team: "Transport",
    shift: "Sam 08:00 - 13:00",
    status: "Confirme",
    accreditation: "Transport + Arrivees",
  },
  {
    person: "Noah Schmit",
    role: "Chef d'equipe",
    team: "Warm-up",
    shift: "Sam 07:30 - 15:00",
    status: "Confirme",
    accreditation: "Terrain + Warm-up",
  },
  {
    person: "Emma Dupont",
    role: "Remplacante",
    team: "VIP",
    shift: "Sam 12:00 - 18:00",
    status: "En attente",
    accreditation: "VIP",
  },
];

const volunteerAdminSeed = [
  {
    id: "vol-001",
    firstName: "Mia",
    lastName: "Fernandes",
    age: 22,
    email: "mia.fernandes@email.com",
    phone: "+352 621 400 118",
    languages: ["Français", "Anglais", "Luxembourgeois"],
    workflowStatus: "Candidature reçue",
    assignedRole: "",
    assignmentStatus: "En attente",
    teamRole: "Bénévole",
    shift: "Dimanche 09:30 - 19:00",
    sundayAvailability: "Oui, disponible dimanche 17/01/2027 de 09h30 à 19h00",
    supportAvailability: "Samedi après-midi, lundi 09h00 - 12h00",
    supportTasks: {
      "Samedi après-midi": "",
      "lundi 09h00 - 12h00": "",
    },
    notes: "Disponible toute la journée, certificat demandé.",
    accountEmailSent: true,
    teamEmailSent: false,
  },
  {
    id: "vol-002",
    firstName: "Noah",
    lastName: "Schmit",
    age: 24,
    email: "noah.schmit@email.com",
    phone: "+352 691 221 814",
    languages: ["Français", "Allemand", "Anglais"],
    workflowStatus: "Confirmé",
    assignedRole: "Warm-up",
    assignmentStatus: "Confirmé",
    teamRole: "Chef d'équipe",
    shift: "Dimanche 09:30 - 16:00",
    sundayAvailability: "Oui, disponible dimanche 17/01/2027 de 09h30 à 19h00",
    supportAvailability: "Pas d'aide complémentaire indiquée",
    supportTasks: {},
    notes: "Profil chef d'équipe potentiel.",
    accountEmailSent: true,
    teamEmailSent: true,
  },
  {
    id: "vol-003",
    firstName: "Emma",
    lastName: "Dupont",
    age: 17,
    email: "emma.dupont@email.com",
    phone: "+352 661 114 550",
    languages: ["Français", "Belge"],
    workflowStatus: "Affecté",
    assignedRole: "VIP",
    assignmentStatus: "Proposé",
    teamRole: "Bénévole",
    shift: "Dimanche 12:00 - 19:00",
    sundayAvailability: "Oui, disponible dimanche 17/01/2027 de 09h30 à 19h00",
    supportAvailability: "Pas d'aide complémentaire indiquée",
    supportTasks: {},
    notes: "À éviter si mineure, vérification en cours.",
    accountEmailSent: true,
    teamEmailSent: false,
  },
  {
    id: "vol-004",
    firstName: "Ibrahim",
    lastName: "Saidi",
    age: 29,
    email: "ibrahim.saidi@email.com",
    phone: "+352 691 998 440",
    languages: ["Anglais", "Français", "Autre"],
    workflowStatus: "Informé",
    assignedRole: "Call room",
    assignmentStatus: "Proposé",
    teamRole: "Bénévole",
    shift: "Dimanche 11:00 - 19:00",
    sundayAvailability: "Oui, disponible dimanche 17/01/2027 de 09h30 à 19h00",
    supportAvailability: "Vendredi après-midi",
    supportTasks: {
      "Vendredi après-midi": "Préparation logistique",
    },
    notes: "Très bon niveau anglais, utile sur postes internationaux.",
    accountEmailSent: true,
    teamEmailSent: true,
  },
  {
    id: "vol-005",
    firstName: "Claire",
    lastName: "Becker",
    age: 20,
    email: "claire.becker@email.com",
    phone: "+352 691 004 771",
    languages: ["Français", "Anglais"],
    workflowStatus: "Candidature reçue",
    assignedRole: "",
    assignmentStatus: "En attente",
    teamRole: "Bénévole",
    shift: "",
    sundayAvailability: "Oui, disponible dimanche 17/01/2027 de 09h30 à 19h00",
    supportAvailability: "Vendredi après-midi",
    supportTasks: {
      "Vendredi après-midi": "",
    },
    notes: "Parle bien anglais, expérience accueil.",
    accountEmailSent: true,
    teamEmailSent: false,
  },
];

const roleConfigurationSeed = [
  {
    id: "role-transport",
    roleName: "Transport",
    neededCount: 18,
    requiredLanguages: ["Français", "Anglais"],
    briefingTime: "09:30",
    setupTime: "10:00",
    shiftTime: "10:30 - 19:00",
    leaderName: "Sofia Da Costa",
    leaderContact: "+352 621 441 002",
    allowLeaderDocuments: true,
    teamInfo: "",
    teamInfoPlaceholder:
      "Accueil et accompagnement des athlètes, coordination des flux gare/hôtel/Coque, consignes remises le matin.",
    documents: ["Briefing transport.pdf", "Plan navettes.pdf"],
  },
  {
    id: "role-warmup",
    roleName: "Warm-up",
    neededCount: 10,
    requiredLanguages: ["Français", "Anglais", "Allemand"],
    briefingTime: "09:15",
    setupTime: "09:45",
    shiftTime: "10:00 - 18:30",
    leaderName: "Noah Schmit",
    leaderContact: "noah.schmit@email.com",
    allowLeaderDocuments: true,
    teamInfo: "",
    teamInfoPlaceholder:
      "Orientation des athlètes, contrôle des accès, relais avec le responsable de zone et rappel des consignes terrain.",
    documents: ["Plan warm-up.pdf", "Consignes accès zone.pdf"],
  },
  {
    id: "role-callroom",
    roleName: "Call room",
    neededCount: 16,
    requiredLanguages: ["Français", "Anglais"],
    briefingTime: "09:00",
    setupTime: "09:30",
    shiftTime: "10:30 - 19:00",
    leaderName: "Ibrahim Saidi",
    leaderContact: "+352 691 998 440",
    allowLeaderDocuments: false,
    teamInfo: "",
    teamInfoPlaceholder:
      "Vérification des passages, coordination avec les officiels, ponctualité stricte et informations équipe centralisées ici.",
    documents: ["Procédure call room.pdf", "Liste contacts terrain.pdf"],
  },
];

const assignmentStatusOptions = ["En attente", "Proposé", "Confirmé", "Remplaçant", "Annulé"];
const volunteerWorkflowStatusOptions = [
  "Candidature reçue",
  "Affecté",
  "Informé",
  "Confirmé",
  "Annulé",
];
const supportTaskOptions = [
  "Montage",
  "Préparation logistique",
  "Accueil bénévoles",
  "Distribution matériel",
  "Démontage",
  "Support terrain",
];
const supportTaskDayOptions = ["Vendredi", "Samedi", "Dimanche", "Lundi"];

const platformRoleOptions = [
  { value: "admin", label: "Administrateur" },
  { value: "gestionnaire", label: "Gestionnaire" },
  { value: "chef_equipe", label: "Chef d'équipe" },
  { value: "benevole", label: "Bénévole" },
  { value: "parent_u14", label: "Parent U14" },
];

const TEAM_CONFIGURATION_DOC_PATH = ["appSettings", "teamsConfiguration"];
const ACCREDITATION_CONFIGURATION_DOC_PATH = ["appSettings", "accreditationConfiguration"];
const defaultTeamRoleOptions = ["Bénévole", "Chef d'équipe", "Remplaçant"];
const PARTICIPATION_CERTIFICATE_SIGNATORY = "Responsable bénévoles";

function normalizeSubRoles(subRoles) {
  if (!Array.isArray(subRoles)) return [];

  const seen = new Set();

  return subRoles
    .map((subRole) => String(subRole || "").trim())
    .filter((subRole) => {
      if (!subRole) return false;
      const normalizedSubRole = subRole.toLowerCase();
      if (seen.has(normalizedSubRole)) return false;
      seen.add(normalizedSubRole);
      return true;
    });
}

function normalizeTeamRoleConfig(role, index = 0) {
  const fallbackRole = roleConfigurationSeed[index] ?? roleConfigurationSeed[0] ?? {};
  const normalizedNeededCount = Number(role?.neededCount);
  const normalizedExpectedLeadCount = Number(role?.expectedLeadCount);

  return {
    id: String(role?.id || fallbackRole.id || `role-${index + 1}`),
    roleName: String(role?.roleName || fallbackRole.roleName || `Équipe ${index + 1}`),
    neededCount: Number.isFinite(normalizedNeededCount) && normalizedNeededCount >= 0 ? normalizedNeededCount : 0,
    expectedLeadCount:
      Number.isFinite(normalizedExpectedLeadCount) && normalizedExpectedLeadCount >= 0
        ? normalizedExpectedLeadCount
        : 1,
    requiredLanguages: Array.isArray(role?.requiredLanguages) ? role.requiredLanguages : [],
    briefingTime: String(role?.briefingTime || ""),
    setupTime: String(role?.setupTime || ""),
    shiftTime: String(role?.shiftTime || ""),
    leaderName: String(role?.leaderName || ""),
    leaderContact: String(role?.leaderContact || ""),
    allowLeaderDocuments: Boolean(role?.allowLeaderDocuments),
    teamInfo: String(role?.teamInfo || ""),
    teamInfoPlaceholder: String(
      role?.teamInfoPlaceholder ||
        fallbackRole.teamInfoPlaceholder ||
        "Décrivez ici les consignes, missions et informations utiles pour cette équipe.",
    ),
    documents: Array.isArray(role?.documents) ? role.documents : [],
    subRoles: normalizeSubRoles(role?.subRoles),
  };
}

function buildDefaultTeamRoles() {
  return roleConfigurationSeed.map((role, index) =>
    normalizeTeamRoleConfig(
      {
        ...role,
        expectedLeadCount: role.leaderName ? 1 : 0,
      },
      index,
    ),
  );
}

function buildDefaultTeamAssignments(roles) {
  const roleIdByName = new Map(roles.map((role) => [role.roleName.trim().toLowerCase(), role.id]));

  return volunteerAdminSeed
    .flatMap((volunteer) => {
      const assignedRoles = Array.isArray(volunteer.assignedRoles)
        ? volunteer.assignedRoles.filter(Boolean)
        : volunteer.assignedRole
          ? [volunteer.assignedRole]
          : [];

      const teamRoleAssignments =
        volunteer.teamRoleAssignments && typeof volunteer.teamRoleAssignments === "object"
          ? volunteer.teamRoleAssignments
          : {};

      return assignedRoles.map((assignedRole, index) => {
        const assignedRoleId = roleIdByName.get(String(assignedRole || "").trim().toLowerCase()) || "";

        return {
          assignmentEntryId:
            String(volunteer.id || "") && assignedRoleId
              ? `${String(volunteer.id)}::${assignedRoleId}`
              : `team-assignment-${index + 1}-${Date.now()}`,
          id: volunteer.id,
          firstName: volunteer.firstName,
          lastName: volunteer.lastName,
          email: volunteer.email,
          phone: volunteer.phone,
          languages: volunteer.languages,
          workflowStatus: volunteer.workflowStatus,
          assignedRoleId,
          assignedRole,
          teamRole: String(teamRoleAssignments[assignedRole] || (index === 0 ? volunteer.teamRole : "") || "Bénévole"),
        };
      });
    });
}

function normalizeTeamAssignment(member, roles) {
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const roleIdByName = new Map(roles.map((role) => [role.roleName.trim().toLowerCase(), role.id]));
  const resolvedRoleId =
    roleById.get(member?.assignedRoleId)?.id ||
    roleIdByName.get(String(member?.assignedRole || "").trim().toLowerCase()) ||
    "";
  const resolvedRole = roleById.get(resolvedRoleId);

  return {
    assignmentEntryId:
      String(member?.assignmentEntryId || "").trim() ||
      (String(member?.id || "").trim() && resolvedRoleId
        ? `${String(member?.id || "").trim()}::${resolvedRoleId}`
        : ""),
    id: String(member?.id || ""),
    firstName: String(member?.firstName || ""),
    lastName: String(member?.lastName || ""),
    email: String(member?.email || ""),
    phone: String(member?.phone || ""),
    languages: Array.isArray(member?.languages) ? member.languages : [],
    workflowStatus: String(member?.workflowStatus || ""),
    assignedRoleId: resolvedRoleId,
    assignedRole: resolvedRole?.roleName || String(member?.assignedRole || ""),
    teamRole: String(member?.teamRole || "Bénévole"),
  };
}

function normalizeTeamConfigurationPayload(data) {
  const rolesSource = Array.isArray(data?.roles) && data.roles.length > 0 ? data.roles : buildDefaultTeamRoles();
  const roles = rolesSource.map((role, index) => normalizeTeamRoleConfig(role, index));
  const assignmentsSource =
    Array.isArray(data?.teamAssignments) && data.teamAssignments.length > 0
      ? data.teamAssignments
      : [];
  const supportTasks =
    Array.isArray(data?.supportTasks) && data.supportTasks.length > 0
      ? data.supportTasks.map((task, index) => ({
          id: String(task?.id || `support-task-${index + 1}`),
          day:
            task?.day === undefined || task?.day === null
              ? String(supportTaskDayOptions[0] || "")
              : String(task.day),
          startTime:
            task?.startTime === undefined || task?.startTime === null ? "" : String(task.startTime),
          endTime:
            task?.endTime === undefined || task?.endTime === null ? "" : String(task.endTime),
          taskLabel:
            task?.taskLabel === undefined || task?.taskLabel === null
              ? String(supportTaskOptions[0] || "")
              : String(task.taskLabel),
        }))
      : [
          {
            id: "support-task-1",
            day: "Vendredi",
            startTime: "14:00",
            endTime: "18:00",
            taskLabel: "Préparation logistique",
          },
          {
            id: "support-task-2",
            day: "Lundi",
            startTime: "09:00",
            endTime: "12:00",
            taskLabel: "Démontage",
          },
        ];

  return {
    roles,
    teamAssignments: assignmentsSource.map((member) => normalizeTeamAssignment(member, roles)),
    supportTasks,
  };
}

function buildTeamAssignmentsFromVolunteer(volunteer, roles) {
  const roleIdByName = new Map(roles.map((role) => [role.roleName.trim().toLowerCase(), role.id]));
  const assignedRoles = normalizeSubRoles(
    Array.isArray(volunteer?.assignedRoles)
      ? volunteer.assignedRoles
      : volunteer?.assignedRole
        ? [volunteer.assignedRole]
        : [],
  );
  const teamRoleAssignments =
    volunteer?.teamRoleAssignments && typeof volunteer.teamRoleAssignments === "object"
      ? volunteer.teamRoleAssignments
      : {};

  return assignedRoles
    .map((assignedRole, index) => {
      const assignedRoleId = roleIdByName.get(String(assignedRole || "").trim().toLowerCase()) || "";
      if (!assignedRoleId) return null;

      return normalizeTeamAssignment(
        {
          assignmentEntryId: `${String(volunteer?.uid || volunteer?.id || "")}::${assignedRoleId}`,
          id: String(volunteer?.uid || volunteer?.id || ""),
          firstName: volunteer?.firstName,
          lastName: volunteer?.lastName,
          email: volunteer?.email,
          phone: volunteer?.phone,
          languages: volunteer?.languages,
          workflowStatus: volunteer?.workflowStatus,
          assignedRoleId,
          assignedRole,
          teamRole: String(teamRoleAssignments[assignedRole] || (index === 0 ? volunteer?.teamRole : "") || "Bénévole"),
        },
        roles,
      );
    })
    .filter(Boolean);
}

async function syncVolunteerAssignmentsToTeamConfiguration(volunteer) {
  const teamsConfigurationRef = doc(db, ...TEAM_CONFIGURATION_DOC_PATH);
  const teamsSnapshot = await getDoc(teamsConfigurationRef);
  const currentConfiguration = teamsSnapshot.exists()
    ? normalizeTeamConfigurationPayload(teamsSnapshot.data())
    : {
        roles: defaultTeamRoles,
        teamAssignments: defaultTeamAssignments,
        supportTasks: normalizeTeamConfigurationPayload({}).supportTasks,
      };

  const nextAssignments = buildTeamAssignmentsFromVolunteer(volunteer, currentConfiguration.roles);
  const nextAssignmentEntryIds = new Set(nextAssignments.map((assignment) => assignment.assignmentEntryId));
  const filteredAssignments = currentConfiguration.teamAssignments.filter((assignment) => {
    if (assignment.id !== String(volunteer?.uid || volunteer?.id || "")) return true;
    return !nextAssignmentEntryIds.has(assignment.assignmentEntryId);
  });

  await setDoc(
    teamsConfigurationRef,
    {
      roles: currentConfiguration.roles,
      teamAssignments: [...filteredAssignments, ...nextAssignments],
      supportTasks: currentConfiguration.supportTasks,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function syncVolunteerAssignmentToUserProfile(volunteer) {
  const userId = String(volunteer?.uid || "").trim();
  if (!userId) return;

  const assignedRoles = normalizeSubRoles(
    Array.isArray(volunteer?.assignedRoles)
      ? volunteer.assignedRoles
      : volunteer?.assignedRole
        ? [volunteer.assignedRole]
        : [],
  );

  await setDoc(
    doc(db, "users", userId),
    {
      assignedRole: assignedRoles[0] || "",
      assignedTeams: assignedRoles,
      teamRole: volunteer?.teamRole || "Bénévole",
      assignmentStatus: volunteer?.assignmentStatus || (assignedRoles.length > 0 ? "Proposé" : "En attente"),
      teamEmailSent: Boolean(volunteer?.teamEmailSent),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function getAvailableTeamRoles(role, extraRoles = []) {
  return normalizeSubRoles([
    ...defaultTeamRoleOptions,
    ...normalizeSubRoles(role?.subRoles),
    ...normalizeSubRoles(extraRoles),
  ]);
}

const defaultTeamRoles = buildDefaultTeamRoles();
const defaultTeamAssignments = [];

function getVolunteerStableId(volunteer = {}) {
  return String(volunteer?.uid || volunteer?.id || "").trim();
}

function isLegacySeedAssignment(member = {}) {
  const memberId = String(member?.id || "").trim();
  const email = String(member?.email || "").trim().toLowerCase();
  return /^vol-\d+$/i.test(memberId) && email.endsWith("@email.com");
}

function isExternalDocumentLink(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getDocumentConsultationUrl(document) {
  if (document?.fileUrl) return document.fileUrl;
  if (isExternalDocumentLink(document?.reference)) return document.reference;
  return "";
}

function mapStoredDocument(snapshot) {
  const data = snapshot.data();
  const createdAt = data.createdAt?.toDate?.() ?? null;
  const scope = data.scope === "teams" ? "teams" : "global";

  return {
    id: snapshot.id,
    title: data.title || "Document",
    reference: data.reference || "",
    fileName: data.fileName || "",
    fileUrl: data.fileUrl || "",
    filePath: data.filePath || "",
    scope,
    teams: Array.isArray(data.teams) ? data.teams : [],
    visibility:
      data.visibility || (scope === "global" ? "Tous les utilisateurs concernés" : "Équipes ciblées"),
    createdAtLabel: createdAt ? createdAt.toLocaleDateString("fr-LU") : "",
    createdAtMs: createdAt ? createdAt.getTime() : 0,
  };
}

function getRoleLabel(role) {
  const normalizedRole = normalizeRole(role);
  return (
    platformRoleOptions.find((option) => option.value === normalizedRole)?.label ||
    normalizedRole.replace(/_/g, " ")
  );
}

function getDocumentUploadErrorMessage(error) {
  const code = error?.code || "";

  if (code === "permission-denied") {
    return "Écriture Firestore refusée. Vérifie les règles Firestore pour la collection documents.";
  }

  return error?.message || "L'enregistrement du document a échoué.";
}

const accreditationZoneSeed = [
  { id: "zone-infield", order: 1, name: "Infield" },
  { id: "zone-warmup", order: 2, name: "Warm-up" },
  { id: "zone-coaching", order: 3, name: "Coaching Zone" },
  { id: "zone-judges", order: 4, name: "Judges Room" },
  { id: "zone-mixed", order: 5, name: "Mixed Zone" },
  { id: "zone-vip", order: 6, name: "VIP Zone" },
];

const roleAccreditationSeed = {
  Transport: ["zone-mixed", "zone-vip"],
  "Warm-up": ["zone-infield", "zone-warmup", "zone-coaching"],
  "Call room": ["zone-judges", "zone-mixed"],
};

const volunteerAccreditationOverrideSeed = {
  "vol-002": {
    addZoneIds: ["zone-vip"],
    removeZoneIds: [],
    printStatus: "Non-imprimé",
  },
  "vol-003": {
    addZoneIds: ["zone-infield"],
    removeZoneIds: ["zone-mixed"],
    printStatus: "Imprimé",
  },
  "vol-005": {
    addZoneIds: [],
    removeZoneIds: ["zone-vip"],
    printStatus: "Imprimé",
  },
};
const ACCREDITATION_PRINT_STATUS_OPTIONS = ["Non-imprimé", "Dans la file", "Imprimé"];

function normalizeAccreditationZone(zone, index = 0) {
  const fallbackZone = accreditationZoneSeed[index] ?? accreditationZoneSeed[0] ?? {};
  const normalizedOrder = Number(zone?.order);

  return {
    id: String(zone?.id || fallbackZone.id || `zone-${index + 1}`),
    order: Number.isFinite(normalizedOrder) && normalizedOrder > 0 ? normalizedOrder : index + 1,
    name: String(zone?.name || fallbackZone.name || `Zone ${index + 1}`),
  };
}

function normalizeAccreditationOverride(override = {}, availableZoneIds = new Set()) {
  const normalizedPrintStatus = ACCREDITATION_PRINT_STATUS_OPTIONS.includes(String(override?.printStatus || "").trim())
    ? String(override.printStatus).trim()
    : override?.badgeStatus === "Imprimé" || override?.badgeStatus === "Remis"
      ? "Imprimé"
      : "Non-imprimé";

  return {
    addZoneIds: normalizeSubRoles(Array.isArray(override?.addZoneIds) ? override.addZoneIds : []).filter((zoneId) =>
      availableZoneIds.has(zoneId),
    ),
    removeZoneIds: normalizeSubRoles(Array.isArray(override?.removeZoneIds) ? override.removeZoneIds : []).filter(
      (zoneId) => availableZoneIds.has(zoneId),
    ),
    printStatus: normalizedPrintStatus,
    badgeLabel: String(override?.badgeLabel || "").trim(),
    warningMessage: String(override?.warningMessage || "").trim(),
    lastQueuedAt: override?.lastQueuedAt || null,
    lastPrintedAt: override?.lastPrintedAt || null,
    printedSnapshot: {
      roleLabel: String(override?.printedSnapshot?.roleLabel || "").trim(),
      roleNames: normalizeSubRoles(Array.isArray(override?.printedSnapshot?.roleNames) ? override.printedSnapshot.roleNames : []),
      zoneIds: normalizeSubRoles(Array.isArray(override?.printedSnapshot?.zoneIds) ? override.printedSnapshot.zoneIds : []).filter(
        (zoneId) => availableZoneIds.has(zoneId),
      ),
    },
  };
}

function normalizeAccreditationConfigurationPayload(data, roles = defaultTeamRoles) {
  const zonesSource = Array.isArray(data?.zones) && data.zones.length > 0 ? data.zones : accreditationZoneSeed;
  const zones = zonesSource.map((zone, index) => normalizeAccreditationZone(zone, index));
  const availableZoneIds = new Set(zones.map((zone) => zone.id));
  const storedRoleZoneAssignments =
    data?.roleZoneAssignments && typeof data.roleZoneAssignments === "object" ? data.roleZoneAssignments : {};
  const storedVolunteerOverrides =
    data?.volunteerOverrides && typeof data.volunteerOverrides === "object" ? data.volunteerOverrides : {};

  const roleZoneAssignments = roles.reduce((accumulator, role) => {
    const storedZoneIds = storedRoleZoneAssignments[role.id];
    const fallbackZoneIds = roleAccreditationSeed[role.roleName] ?? [];

    accumulator[role.id] = normalizeSubRoles(Array.isArray(storedZoneIds) ? storedZoneIds : fallbackZoneIds).filter(
      (zoneId) => availableZoneIds.has(zoneId),
    );
    return accumulator;
  }, {});

  const volunteerOverrideSource = Object.keys(storedVolunteerOverrides).length
    ? storedVolunteerOverrides
    : volunteerAccreditationOverrideSeed;

  const volunteerOverrides = Object.fromEntries(
    Object.entries(volunteerOverrideSource).map(([volunteerId, override]) => [
      String(volunteerId || "").trim(),
      normalizeAccreditationOverride(override, availableZoneIds),
    ]),
  );
  const printHistory = Array.isArray(data?.printHistory)
    ? data.printHistory.map((entry, index) => ({
        id: String(entry?.id || `print-history-${index + 1}`),
        volunteerId: String(entry?.volunteerId || "").trim(),
        name: String(entry?.name || "").trim(),
        roleLabel: String(entry?.roleLabel || "").trim(),
        roleNames: normalizeSubRoles(Array.isArray(entry?.roleNames) ? entry.roleNames : []),
        zoneLabels: normalizeSubRoles(Array.isArray(entry?.zoneLabels) ? entry.zoneLabels : []),
        printedAt: entry?.printedAt || null,
      }))
    : [];

  return {
    zones,
    roleZoneAssignments,
    volunteerOverrides,
    printHistory,
  };
}

const U14_DEFAULT_RACE_CAPACITY = 14;
const U14_RESERVED_SLOTS_PER_RACE = 3;
const U14_RESERVED_SLOTS_COLLECTION = "u14ProtectedEntries";
const U14_PRACTICAL_INFO_DOC_PATH = ["appSettings", "u14PracticalInfo"];
const U14_RACE_DEFINITIONS = [
  { code: "U12F60", label: "U12 Filles - 60 m", category: "U12", gender: "fille", event: "60 m", totalCapacity: 14 },
  { code: "U12M60", label: "U12 Garçons - 60 m", category: "U12", gender: "garcon", event: "60 m", totalCapacity: 14 },
  { code: "U14F60", label: "U14 Filles - 60 m", category: "U14", gender: "fille", event: "60 m", totalCapacity: 14 },
  { code: "U14M60", label: "U14 Garçons - 60 m", category: "U14", gender: "garcon", event: "60 m", totalCapacity: 14 },
  { code: "U14F1000", label: "U14 Filles - 1000 m", category: "U14", gender: "fille", event: "1000 m", totalCapacity: 14 },
  { code: "U14M1000", label: "U14 Garçons - 1000 m", category: "U14", gender: "garcon", event: "1000 m", totalCapacity: 14 },
];
const U14_RACE_DEFINITION_MAP = new Map(U14_RACE_DEFINITIONS.map((definition) => [definition.code, definition]));
const U14_REQUESTABLE_EVENTS_BY_CATEGORY = {
  U12: ["60 m"],
  U14: ["60 m", "1000 m"],
};

function normalizeU14PracticalInfoPayload(data) {
  return {
    preprogram: String(data?.preprogram || "").trim(),
    porte_panier: String(data?.porte_panier || "").trim(),
  };
}

const publicPaths = [
  {
    to: "/benevoles",
    titleKey: "volunteersTitle",
    descriptionKey: "volunteersDescription",
    image: volunteersHomeImage,
  },
  {
    to: "/pre-programme",
    titleKey: "preprogramTitle",
    descriptionKey: "preprogramDescription",
    image: preprogrammeHomeImage,
  },
];

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

function normalizeComparableValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeBibNumber(value) {
  return normalizeComparableValue(value).replace(/\s+/g, "");
}

function getTimestampMs(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();

  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDateForDisplay(value) {
  if (!value) return "Non définie";

  const timestamp = getTimestampMs(value);
  const date = timestamp ? new Date(timestamp) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("fr-LU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTimeForDisplay(value) {
  if (!value) return "Non définie";

  const timestamp = getTimestampMs(value);
  const date = timestamp ? new Date(timestamp) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("fr-LU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizePresenceRecord(record = {}) {
  const normalizedStatus = ["present", "absent"].includes(String(record?.status || "").trim().toLowerCase())
    ? String(record.status).trim().toLowerCase()
    : "absent";

  return {
    status: normalizedStatus,
    checkedInAt: record?.checkedInAt || null,
    accreditationDeliveredAt: record?.accreditationDeliveredAt || null,
    tshirtDeliveredAt: record?.tshirtDeliveredAt || null,
    lunchCollectedAt: record?.lunchCollectedAt || null,
    departureTime: String(record?.departureTime || "").trim(),
    departureRecordedAt: record?.departureRecordedAt || null,
    missionCompletedAt: record?.missionCompletedAt || null,
    missionCompletedBy: String(record?.missionCompletedBy || "").trim(),
  };
}

function getPresenceStatusLabel(status) {
  return normalizeComparableValue(status) === "present" ? "Présent" : "Absent";
}

function getPresenceStatusClass(status) {
  return normalizeComparableValue(status) === "present" ? "status-pill status-pill--ok" : "status-pill status-pill--danger";
}

function isPresenceLocked(record) {
  return Boolean(record?.missionCompletedAt);
}

function formatTimeForDisplay(value) {
  const normalizedValue = String(value || "").trim();
  return normalizedValue || "Non renseigné";
}

function getRoundedParticipationHours(record) {
  const presence = normalizePresenceRecord(record);
  const arrivalTimestamp = getTimestampMs(presence.checkedInAt);
  if (!arrivalTimestamp) return 0;

  let departureTimestamp = 0;
  const departureValue = String(presence.departureTime || "").trim();

  if (/^\d{2}:\d{2}$/.test(departureValue)) {
    const arrivalDate = new Date(arrivalTimestamp);
    const [hours, minutes] = departureValue.split(":").map((item) => Number(item));
    const departureDate = new Date(arrivalDate);
    departureDate.setHours(hours, minutes, 0, 0);
    departureTimestamp = departureDate.getTime();
  } else if (presence.missionCompletedAt) {
    departureTimestamp = getTimestampMs(presence.missionCompletedAt);
  }

  if (!departureTimestamp || departureTimestamp <= arrivalTimestamp) return 0;

  const durationHours = (departureTimestamp - arrivalTimestamp) / (1000 * 60 * 60);
  return Math.max(1, Math.ceil(durationHours));
}

function buildParticipationCertificateMarkup({ fullName, teamName, roleLabel, roundedHours }) {
  const issueDate = new Intl.DateTimeFormat("fr-LU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  return `<!doctype html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>Certificat de participation</title>
      <style>
        @page { size: A4 portrait; margin: 18mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Segoe UI", Arial, sans-serif;
          color: #12313c;
          background: #ffffff;
        }
        .certificate {
          min-height: 259mm;
          border: 2mm solid #d7b247;
          padding: 18mm;
          background:
            radial-gradient(circle at top right, rgba(21, 109, 172, 0.08), transparent 35%),
            radial-gradient(circle at top left, rgba(239, 11, 28, 0.08), transparent 28%),
            #fff;
        }
        .certificate__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 10pt;
          color: #7a692d;
          font-weight: 700;
        }
        .certificate h1 {
          margin: 8mm 0 6mm;
          font-size: 28pt;
          line-height: 1;
          color: #103b58;
        }
        .certificate p {
          margin: 0 0 6mm;
          font-size: 13pt;
          line-height: 1.7;
          color: #23414c;
        }
        .certificate__name {
          margin: 14mm 0 8mm;
          font-size: 24pt;
          font-weight: 800;
          color: #d23c33;
        }
        .certificate__meta {
          display: grid;
          gap: 4mm;
          margin-top: 12mm;
          padding: 8mm;
          border-radius: 6mm;
          background: rgba(19, 59, 88, 0.05);
        }
        .certificate__meta strong {
          color: #103b58;
        }
        .certificate__footer {
          margin-top: 22mm;
          display: flex;
          justify-content: space-between;
          gap: 12mm;
          align-items: end;
        }
        .certificate__signature {
          min-width: 85mm;
          border-top: 0.5mm solid #12313c;
          padding-top: 4mm;
          text-align: center;
          font-weight: 700;
        }
      </style>
    </head>
    <body>
      <main class="certificate">
        <div class="certificate__eyebrow">CMCM Luxembourg Indoor Meeting</div>
        <h1>Certificat de participation</h1>
        <p>Nous certifions la participation bénévole de</p>
        <div class="certificate__name">${escapeHtml(fullName || "Bénévole")}</div>
        <p>
          à l'organisation du meeting au sein de l'équipe <strong>${escapeHtml(teamName || "Non définie")}</strong>
          ${roleLabel ? `comme <strong>${escapeHtml(roleLabel)}</strong>` : ""}.
        </p>
        <div class="certificate__meta">
          <div><strong>Volume horaire retenu :</strong> ${escapeHtml(String(roundedHours || 0))} heure(s), arrondi supérieur.</div>
          <div><strong>Date d'édition :</strong> ${escapeHtml(issueDate)}</div>
        </div>
        <div class="certificate__footer">
          <div>
            <p>Merci pour l'engagement apporté à la réussite de l'événement.</p>
          </div>
          <div class="certificate__signature">${escapeHtml(PARTICIPATION_CERTIFICATE_SIGNATORY)}</div>
        </div>
      </main>
      <script>
        window.onload = () => {
          window.print();
        };
      </script>
    </body>
  </html>`;
}

function getU14EventCode(requestedEvent) {
  const normalizedEvent = normalizeComparableValue(requestedEvent);
  if (normalizedEvent.includes("1000")) return "1000";
  if (normalizedEvent.includes("60")) return "60";
  return "";
}

function getU14GenderCode(gender) {
  const normalizedGender = normalizeComparableValue(gender);
  if (normalizedGender.startsWith("f")) return "F";
  if (normalizedGender.startsWith("g") || normalizedGender.startsWith("m")) return "M";
  return "";
}

function getU14RaceCode({ category, gender, requestedEvent }) {
  const normalizedCategory = String(category || "").trim().toUpperCase();
  const genderCode = getU14GenderCode(gender);
  const eventCode = getU14EventCode(requestedEvent);

  if (!normalizedCategory || !genderCode || !eventCode) return "";
  return `${normalizedCategory}${genderCode}${eventCode}`;
}

function getU14RaceDefinition(raceCode) {
  return U14_RACE_DEFINITION_MAP.get(String(raceCode || "").trim()) || null;
}

function getU14RaceLabel(raceCode) {
  return getU14RaceDefinition(raceCode)?.label || "Course à confirmer";
}

function getU14AllowedEvents(category) {
  const normalizedCategory = String(category || "").trim().toUpperCase();
  return U14_REQUESTABLE_EVENTS_BY_CATEGORY[normalizedCategory] || ["60 m"];
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

function getProtectedSlotStatusLabel(status) {
  switch (normalizeComparableValue(status)) {
    case "invited":
      return "Invitation envoyée";
    case "matched":
      return "Matchée";
    case "released":
      return "Libérée";
    default:
      return "À configurer";
  }
}

function getParentDecisionLabel(status) {
  switch (normalizeComparableValue(status)) {
    case "confirmed":
      return "Validé";
    case "declined":
      return "Désisté";
    default:
      return "En attente parent";
  }
}

function getAdminApprovalLabel(status) {
  switch (normalizeComparableValue(status)) {
    case "approved":
      return "Retenu";
    case "pending":
      return "En attente admin";
    default:
      return "Non concerné";
  }
}

function getU14WorkflowStatusLabel(requestLike) {
  const requestStatus = normalizeComparableValue(requestLike?.status);
  const adminStatus = normalizeComparableValue(requestLike?.adminApprovalStatus);
  const parentStatus = normalizeComparableValue(requestLike?.parentDecisionStatus);

  if (parentStatus === "confirmed") return "Validé";
  if (requestStatus === "declined" || parentStatus === "declined") return "Désisté";
  if (requestStatus === "confirmed" && adminStatus === "approved") return "Retenu";
  if (requestStatus === "submitted") return "Demande enregistrée";
  if (requestStatus === "waitlisted") return "Liste d'attente";
  if (requestStatus === "rejected") return "Non retenue";
  return formatU14RequestStatusLabel(requestLike?.status);
}

function getU14ParentStatusLabel(requestLike) {
  const requestStatus = normalizeComparableValue(requestLike?.status);
  const adminStatus = normalizeComparableValue(requestLike?.adminApprovalStatus);
  const parentStatus = normalizeComparableValue(requestLike?.parentDecisionStatus);

  if (requestStatus === "declined" || parentStatus === "declined") return "Désisté";
  if (requestStatus === "rejected") return "Non retenue";
  if (requestStatus === "waitlisted") return "Liste d'attente";
  if (adminStatus !== "approved") return "Demande enregistrée";
  if (parentStatus === "confirmed") return "Validé";
  if (requestStatus === "confirmed" && adminStatus === "approved") return "Retenu";
  return "Demande enregistrée";
}

function getU14ParentStatusPillClass(status) {
  switch (normalizeComparableValue(status)) {
    case "valide":
      return "status-pill status-pill--ok";
    case "retenu":
      return "status-pill status-pill--accent";
    case "liste d'attente":
      return "status-pill status-pill--warn";
    case "desiste":
    case "non retenue":
      return "status-pill status-pill--danger";
    default:
      return "status-pill";
  }
}

function getU14PracticalRoleKey(requestLike) {
  const allocationMode = normalizeComparableValue(requestLike?.allocationMode);
  const requestType = normalizeComparableValue(requestLike?.requestType);

  if (allocationMode === "porte_panier" || requestType === "porte_panier") {
    return "porte_panier";
  }

  return "preprogram";
}

function isU14RequestInactive(status) {
  return ["declined", "cancelled", "rejected"].includes(normalizeComparableValue(status));
}

function isProtectedSlotActive(slot) {
  return normalizeComparableValue(slot?.status) !== "released";
}

function buildU14RequestRecord(request, child) {
  const childFirstName = request.childFirstName || child?.firstName || "";
  const childLastName = request.childLastName || child?.lastName || "";
  const childName = [childFirstName, childLastName].filter(Boolean).join(" ").trim() || "Enfant";
  const parentName =
    [request.parentFirstName, request.parentLastName].filter(Boolean).join(" ").trim() || "Responsable";
  const raceCode =
    request.raceCode ||
    getU14RaceCode({
      category: request.category || child?.category,
      gender: request.gender || child?.gender,
      requestedEvent: request.requestedEvent,
    });

  return {
    ...request,
    child,
    childFirstName,
    childLastName,
    childName,
    parentName,
    parentEmail: request.parentEmail || "",
    category: request.category || child?.category || "",
    club: request.club || child?.club || "",
    bibNumber: request.bibNumber || child?.bibNumber || "",
    gender: request.gender || child?.gender || "",
    raceCode,
    raceLabel: getU14RaceLabel(raceCode),
    submittedAtMs: getTimestampMs(request.submittedAt),
  };
}

function doesProtectedSlotMatchRequest(slot, request) {
  if (!slot || !request) return false;
  if (slot.raceCode !== request.raceCode) return false;

  const slotBib = normalizeBibNumber(slot.bibNumber);
  const requestBib = normalizeBibNumber(request.bibNumber);
  if (slotBib && requestBib) return slotBib === requestBib;

  return (
    normalizeComparableValue(slot.firstName) === normalizeComparableValue(request.childFirstName) &&
    normalizeComparableValue(slot.lastName) === normalizeComparableValue(request.childLastName) &&
    normalizeComparableValue(slot.club) === normalizeComparableValue(request.club)
  );
}

function buildU14AllocationSnapshot({ requests, children, protectedEntries }) {
  const childrenById = children.reduce((accumulator, child) => {
    accumulator.set(child.id, child);
    return accumulator;
  }, new Map());

  const requestRecords = requests.map((request) => buildU14RequestRecord(request, childrenById.get(request.childId)));
  const requestStatusMap = new Map();
  const raceSummaries = U14_RACE_DEFINITIONS.map((definition) => {
    const activeProtectedEntries = protectedEntries
      .filter((entry) => entry.raceCode === definition.code && isProtectedSlotActive(entry))
      .sort((left, right) => Number(left.slotNumber || 0) - Number(right.slotNumber || 0));
    const matchedProtectedRequestIds = new Set(
      activeProtectedEntries
        .map((entry) => String(entry.matchedRequestId || "").trim())
        .filter(Boolean),
    );
    const matchedProtectedRequests = requestRecords.filter((request) => matchedProtectedRequestIds.has(request.id));
    const generalCandidates = requestRecords
      .filter(
        (request) =>
          request.raceCode === definition.code &&
          request.requestType !== "porte_panier" &&
          !isU14RequestInactive(request.status) &&
          !matchedProtectedRequestIds.has(request.id),
      )
      .sort((left, right) => {
        if (left.submittedAtMs !== right.submittedAtMs) return left.submittedAtMs - right.submittedAtMs;
        return left.childName.localeCompare(right.childName, "fr");
      });

    const generalCapacity = Math.max(
      (definition.totalCapacity || U14_DEFAULT_RACE_CAPACITY) - activeProtectedEntries.length,
      0,
    );
    const confirmedGeneralRequests = generalCandidates.slice(0, generalCapacity);
    const waitlistedRequests = generalCandidates.slice(generalCapacity);
    const protectedPendingEntries = activeProtectedEntries.filter(
      (entry) => normalizeComparableValue(entry.status) !== "matched",
    );
    const totalPlaces = definition.totalCapacity || U14_DEFAULT_RACE_CAPACITY;
    const takenPlaces = activeProtectedEntries.length + confirmedGeneralRequests.length;

    activeProtectedEntries.forEach((entry) => {
      const matchedRequestId = String(entry.matchedRequestId || "").trim();
      if (!matchedRequestId) return;

      requestStatusMap.set(matchedRequestId, {
        status: "confirmed",
        allocationMode: "protected",
        protectedSlotId: entry.id,
        acceptedPosition: Number(entry.slotNumber || 0) || null,
        waitlistPosition: null,
        queuePosition: Number(entry.slotNumber || 0) || null,
        parentDecisionRequired: false,
      });
    });

    confirmedGeneralRequests.forEach((request, index) => {
      requestStatusMap.set(request.id, {
        status: "confirmed",
        allocationMode: "platform",
        protectedSlotId: null,
        acceptedPosition: index + 1,
        waitlistPosition: null,
        queuePosition: index + 1,
        parentDecisionRequired: false,
      });
    });

    waitlistedRequests.forEach((request, index) => {
      requestStatusMap.set(request.id, {
        status: "waitlisted",
        allocationMode: "platform",
        protectedSlotId: null,
        acceptedPosition: null,
        waitlistPosition: index + 1,
        queuePosition: generalCapacity + index + 1,
        parentDecisionRequired: false,
      });
    });

    return {
      ...definition,
      protectedEntries: activeProtectedEntries,
      matchedProtectedRequests,
      confirmedGeneralRequests,
      waitlistedRequests,
      protectedPendingEntries,
      generalCapacity,
      totalPlaces,
      protectedPlaces: activeProtectedEntries.length,
      takenPlaces,
      remainingPlaces: Math.max(totalPlaces - takenPlaces, 0),
      availableProtectedSlots: Math.max(U14_RESERVED_SLOTS_PER_RACE - activeProtectedEntries.length, 0),
    };
  });

  return { requestRecords, requestStatusMap, raceSummaries };
}

async function syncU14RaceAllocations({ requests, children, protectedEntries }) {
  const { requestRecords, requestStatusMap } = buildU14AllocationSnapshot({
    requests,
    children,
    protectedEntries,
  });

  for (const request of requestRecords) {
    if (request.requestType === "porte_panier" || !request.raceCode || isU14RequestInactive(request.status)) {
      continue;
    }

    const nextState = requestStatusMap.get(request.id);
    if (!nextState) continue;

    const currentStatus = normalizeComparableValue(request.status);
    const nextStatus = normalizeComparableValue(nextState.status);
    const currentAllocationMode = normalizeComparableValue(request.allocationMode);
    const nextAllocationMode = normalizeComparableValue(nextState.allocationMode);
    const currentAcceptedPosition = Number(request.acceptedPosition || 0) || null;
    const currentWaitlistPosition = Number(request.waitlistPosition || 0) || null;

    if (
      currentStatus === nextStatus &&
      currentAllocationMode === nextAllocationMode &&
      currentAcceptedPosition === nextState.acceptedPosition &&
      currentWaitlistPosition === nextState.waitlistPosition &&
      String(request.protectedSlotId || "") === String(nextState.protectedSlotId || "")
    ) {
      continue;
    }

    await updateDoc(doc(db, "u14Requests", request.id), {
      status: nextState.status,
      allocationMode: nextState.allocationMode,
      protectedSlotId: nextState.protectedSlotId,
      acceptedPosition: nextState.acceptedPosition,
      waitlistPosition: nextState.waitlistPosition,
      queuePosition: nextState.queuePosition,
      parentDecisionRequired:
        nextState.status === "confirmed"
          ? normalizeComparableValue(request.adminApprovalStatus) === "approved"
          : nextState.parentDecisionRequired,
      adminApprovalStatus:
        nextState.status === "confirmed"
          ? currentStatus === "confirmed" && normalizeComparableValue(request.adminApprovalStatus) === "approved"
            ? "approved"
            : "pending"
          : null,
      parentDecisionStatus:
        nextState.status === "confirmed"
          ? currentStatus === "confirmed" &&
            normalizeComparableValue(request.parentDecisionStatus) === "confirmed" &&
            normalizeComparableValue(request.adminApprovalStatus) === "approved"
            ? "confirmed"
            : null
          : null,
      allocationUpdatedAt: serverTimestamp(),
    });
  }
}

function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";

    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return supportedLanguages.includes(storedLanguage) ? storedLanguage : "en";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key) => messages[language]?.[key] ?? messages.en[key] ?? key,
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return context;
}

function LanguageSwitch() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="language-switch" aria-label={t("languageLabel")}>
      {supportedLanguages.map((option) => (
        <button
          key={option}
          className={`language-switch__button ${language === option ? "language-switch__button--active" : ""}`}
          type="button"
          onClick={() => setLanguage(option)}
        >
          {t(`lang${option[0].toUpperCase()}${option.slice(1)}`)}
        </button>
      ))}
    </div>
  );
}

function getAgeFromBirthDate(dateString) {
  if (!dateString) return null;

  const today = new Date();
  const birthDate = new Date(dateString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return Number.isNaN(age) ? null : age;
}

function getU14CategoryFromBirthDate(dateString) {
  if (!dateString) return "";

  const birthDate = new Date(dateString);
  const year = birthDate.getFullYear();

  if (Number.isNaN(year)) return "";
  if (year === 2016 || year === 2017) return "U12";
  if (year === 2014 || year === 2015) return "U14";

  return "";
}

function getBirthYear(dateString) {
  if (!dateString) return "";

  const birthDate = new Date(dateString);
  const year = birthDate.getFullYear();

  return Number.isNaN(year) ? "" : String(year);
}

function getDisplayName(profile, fallbackEmail) {
  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");
  return fullName || fallbackEmail || "Utilisateur";
}

function listToCommaSeparatedText(value) {
  return Array.isArray(value) ? value.join(", ") : String(value || "");
}

function commaSeparatedTextToList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAgeBracketFromAge(age) {
  if (age === null) return "";
  if (age < 14) return "u14";
  if (age < 16) return "u16";
  if (age < 18) return "u18";
  return "18+";
}

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function buildSearchPrefixes(value) {
  const normalizedValue = normalizeSearchValue(value);
  if (!normalizedValue) return [];

  const collapsedValue = normalizedValue.replace(/\s+/g, " ");
  const tokens = collapsedValue
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
  const prefixes = new Set();

  for (const token of tokens) {
    for (let index = 2; index <= Math.min(token.length, 10); index += 1) {
      prefixes.add(token.slice(0, index));
    }
  }

  if (collapsedValue.length >= 2) {
    prefixes.add(collapsedValue);
  }

  return [...prefixes];
}

function buildUserSearchTokens(profile = {}) {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  return [
    ...new Set(
      [profile.firstName, profile.lastName, profile.email, fullName]
        .flatMap((value) => buildSearchPrefixes(value))
        .filter(Boolean),
    ),
  ];
}

function extractRolesFromProfile(profile = {}) {
  const collectedRoles = [
    ...(Array.isArray(profile.userTypes) ? profile.userTypes : []),
    ...(Array.isArray(profile.roles) ? profile.roles : []),
    profile.userType,
    profile.role,
    profile.isAdmin ? "admin" : "",
    profile.isManager ? "gestionnaire" : "",
    profile.isTeamLead ? "chef_equipe" : "",
    profile.isParentU14 ? "parent_u14" : "",
    profile.isVolunteer ? "benevole" : "",
  ]
    .map(normalizeRole)
    .filter(Boolean);

  return [...new Set(collectedRoles)];
}

function normalizeVolunteerYesNoValue(value) {
  return String(value || "").trim().toLowerCase() === "oui" ? "oui" : "non";
}

function createEmptyVolunteerProfileFormData() {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    birthDate: "",
    gender: "",
    tshirtSize: "M",
    languages: [],
    otherLanguage: "",
    occupation: "",
    cmcmExperience: "",
    volunteerExperience: "",
    availability: [],
    meetingDayConfirmed: false,
    missionPreferences: "",
    healthSafetyInfo: "",
    lunexStudent: "non",
    lunexProgram: "",
    certificateNeeded: false,
    retainForNextYear: true,
    imageConsent: false,
    guardianFirstName: "",
    guardianLastName: "",
    guardianEmail: "",
    guardianPhone: "",
  };
}

function createVolunteerProfileFormData(application, userProfile) {
  const nextFormData = createEmptyVolunteerProfileFormData();
  const savedLanguages = Array.isArray(application?.languages) ? application.languages : [];
  const standardLanguageOptions = VOLUNTEER_LANGUAGE_OPTIONS.filter((option) => option !== "Autre");
  const selectedLanguages = standardLanguageOptions.filter((option) => savedLanguages.includes(option));
  const otherLanguages = savedLanguages.filter((option) => !standardLanguageOptions.includes(option));
  const savedAvailability = Array.isArray(application?.availability) ? application.availability : [];

  return {
    ...nextFormData,
    firstName: application?.firstName || userProfile?.firstName || "",
    lastName: application?.lastName || userProfile?.lastName || "",
    phone: application?.phone || userProfile?.phone || "",
    birthDate: application?.birthDate || userProfile?.birthDate || "",
    gender: String(application?.gender || "").trim().toLowerCase(),
    tshirtSize: application?.tshirtSize || "M",
    languages: otherLanguages.length ? [...selectedLanguages, "Autre"] : selectedLanguages,
    otherLanguage: otherLanguages.join(", "),
    occupation: application?.occupation || "",
    cmcmExperience: application?.cmcmExperience || "",
    volunteerExperience: application?.volunteerExperience || "",
    availability: savedAvailability.filter((option) => option !== VOLUNTEER_MEETING_DAY_LABEL),
    meetingDayConfirmed: savedAvailability.includes(VOLUNTEER_MEETING_DAY_LABEL),
    missionPreferences: listToCommaSeparatedText(application?.missionPreferences),
    healthSafetyInfo: application?.healthSafetyInfo || "",
    lunexStudent: normalizeVolunteerYesNoValue(application?.lunexStudent),
    lunexProgram: application?.lunexProgram || "",
    certificateNeeded: Boolean(application?.certificateNeeded),
    retainForNextYear:
      application?.retainForNextYear === undefined ? true : Boolean(application?.retainForNextYear),
    imageConsent: Boolean(application?.imageConsent),
    guardianFirstName: application?.legalGuardian?.firstName || "",
    guardianLastName: application?.legalGuardian?.lastName || "",
    guardianEmail: application?.legalGuardian?.email || "",
    guardianPhone: application?.legalGuardian?.phone || "",
  };
}

function buildVolunteerApplicationPayload({ currentUser, formData, status }) {
  const age = getAgeFromBirthDate(formData.birthDate);
  const legalGuardianRequired = age !== null && age < 18;
  const applicationStatus = legalGuardianRequired ? "pending_guardian_approval" : status || "candidature_recue";

  const languages = [
    ...formData.languages.filter((option) => option !== "Autre"),
    ...(formData.languages.includes("Autre")
      ? formData.otherLanguage
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : []),
  ];

  return {
    age,
    applicationStatus,
    legalGuardianRequired,
    applicationPayload: {
      uid: currentUser.uid,
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: currentUser.email || "",
      phone: formData.phone.trim(),
      gender: formData.gender,
      birthDate: formData.birthDate,
      age,
      languages,
      tshirtSize: formData.tshirtSize,
      ageBracket: getAgeBracketFromAge(age),
      lunexStudent: formData.lunexStudent,
      lunexProgram: formData.lunexProgram.trim(),
      occupation: formData.occupation.trim(),
      cmcmExperience: formData.cmcmExperience.trim(),
      volunteerExperience: formData.volunteerExperience.trim(),
      healthSafetyInfo: formData.healthSafetyInfo.trim(),
      certificateNeeded: formData.certificateNeeded,
      retainForNextYear: formData.retainForNextYear,
      imageConsent: formData.imageConsent,
      availability: [
        ...(formData.meetingDayConfirmed ? [VOLUNTEER_MEETING_DAY_LABEL] : []),
        ...formData.availability,
      ],
      missionPreferences: formData.missionPreferences
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      legalGuardianRequired,
      legalGuardian: legalGuardianRequired
        ? {
            firstName: formData.guardianFirstName.trim(),
            lastName: formData.guardianLastName.trim(),
            email: formData.guardianEmail.trim(),
            phone: formData.guardianPhone.trim(),
            status: "pending",
          }
        : null,
      status: applicationStatus,
      updatedAt: serverTimestamp(),
    },
  };
}

function deriveVolunteerWorkflowStatus(application = {}) {
  const explicitWorkflowStatus = String(application?.workflowStatus || "").trim();
  if (explicitWorkflowStatus) return explicitWorkflowStatus;

  const normalizedStatus = normalizeRole(application?.status);
  if (normalizedStatus === "annule") return "Annulé";
  if (normalizedStatus === "confirme") return "Confirmé";
  if (normalizedStatus === "informe") return "Informé";
  if (normalizedStatus === "affecte") return "Affecté";

  const assignedRoles = normalizeSubRoles(
    Array.isArray(application?.assignedRoles)
      ? application.assignedRoles
      : application?.assignedRole
        ? [application.assignedRole]
        : [],
  );

  if (assignedRoles.length > 0) {
    return "Affecté";
  }

  return "Candidature reçue";
}

function buildVolunteerSupportAvailabilityLabel(availability = []) {
  const supportSlots = availability.filter((slot) => slot !== VOLUNTEER_MEETING_DAY_LABEL);
  return supportSlots.length ? supportSlots.join(", ") : "Pas d'aide complémentaire indiquée";
}

function buildVolunteerAdminNotes(application = {}) {
  const notes = [
    application?.healthSafetyInfo,
    application?.volunteerExperience,
    application?.cmcmExperience,
    application?.certificateNeeded ? "Certificat demandé." : "",
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return notes.join(" | ") || "Aucune note renseignée.";
}

function mapVolunteerApplicationToAdminVolunteer(application = {}) {
  const availability = Array.isArray(application?.availability) ? application.availability : [];
  const assignedRoles = normalizeSubRoles(
    Array.isArray(application?.assignedRoles)
      ? application.assignedRoles
      : application?.assignedRole
        ? [application.assignedRole]
        : [],
  );
  const primaryAssignedRole = assignedRoles[0] || "";
  const rawTeamRoleAssignments =
    application?.teamRoleAssignments && typeof application.teamRoleAssignments === "object"
      ? application.teamRoleAssignments
      : {};
  const teamRoleAssignments = assignedRoles.reduce((accumulator, assignedRole, index) => {
    accumulator[assignedRole] = String(
      rawTeamRoleAssignments[assignedRole] || (index === 0 ? application?.teamRole : "") || "Bénévole",
    );
    return accumulator;
  }, {});

  return {
    id: String(application?.id || ""),
    uid: String(application?.uid || ""),
    firstName: String(application?.firstName || ""),
    lastName: String(application?.lastName || ""),
    age: Number.isFinite(Number(application?.age)) ? Number(application.age) : null,
    email: String(application?.email || ""),
    phone: String(application?.phone || ""),
    languages: Array.isArray(application?.languages) ? application.languages : [],
    workflowStatus: deriveVolunteerWorkflowStatus(application),
    assignedRole: primaryAssignedRole,
    assignedRoles,
    assignmentStatus: String(application?.assignmentStatus || (primaryAssignedRole ? "Proposé" : "En attente")),
    teamRole: String(application?.teamRole || teamRoleAssignments[primaryAssignedRole] || "Bénévole"),
    teamRoleAssignments,
    shift: String(application?.shift || ""),
    sundayAvailability: availability.includes(VOLUNTEER_MEETING_DAY_LABEL)
      ? "Oui, disponible dimanche 17/01/2027 de 09h30 à 19h00"
      : "Non confirmé",
    supportAvailability: buildVolunteerSupportAvailabilityLabel(availability),
    supportTasks:
      application?.supportTasks && typeof application.supportTasks === "object" ? application.supportTasks : {},
    notes: buildVolunteerAdminNotes(application),
    accountEmailSent: application?.accountEmailSent === undefined ? Boolean(application?.uid) : Boolean(application?.accountEmailSent),
    teamEmailSent: Boolean(application?.teamEmailSent),
  };
}

function getActiveRoles(profile) {
  const roles = extractRolesFromProfile(profile);
  return roles.length ? roles : ["benevole"];
}

function getPrimaryRole(profile) {
  const roles = getActiveRoles(profile);

  if (roles.includes("admin")) return "admin";
  if (roles.includes("gestionnaire")) return "gestionnaire";
  if (roles.includes("chef_equipe")) return "chef_equipe";
  if (roles.includes("parent_u14")) return "parent_u14";
  return "benevole";
}

function buildNavigation(profile) {
  return buildNavigationFromRoles(getActiveRoles(profile));
}

function getDefaultRouteByRoles(roles = []) {
  if (roles.includes("admin")) return "/app";
  if (roles.includes("gestionnaire")) return "/app/documents";
  if (roles.includes("chef_equipe")) return "/app/equipe";
  if (roles.includes("benevole")) return "/app/mes-affectations";
  if (roles.includes("parent_u14")) return "/app/mes-enfants";
  return "/app";
}

function buildNavigationFromRoles(roles) {
  const links = [{ to: "/app", label: "Vue d'ensemble" }];

  if (roles.includes("admin")) {
    links.push(
      { to: "/app/benevoles", label: "Gestion des bénévoles" },
      { to: "/app/postes", label: "Gestion des équipes" },
      { to: "/app/documents", label: "Documents" },
      { to: "/app/accreditations", label: "Accreditations" },
      { to: "/app/u14", label: "Pré-programme" },
    );
  }

  if (roles.includes("gestionnaire") && !roles.includes("admin")) {
    links.push(
      { to: "/app/presences", label: "Présences" },
      { to: "/app/documents", label: "Documents" },
    );
  }

  if (roles.includes("chef_equipe")) {
    links.push(
      { to: "/app/equipe", label: "Mon equipe" },
      { to: "/app/presences", label: "Presences" },
    );
  }

  if (roles.includes("benevole")) {
    links.push(
      { to: "/app/mon-dossier-benevole", label: "Mon dossier bénévole" },
      { to: "/app/mes-affectations", label: "Mes affectations" },
      { to: "/app/mon-accreditation", label: "Mon accréditation" },
      { to: "/app/mes-documents", label: "Mes documents" },
    );
  }

  if (roles.includes("parent_u14")) {
    links.push({ to: "/app/mes-enfants", label: "Mes enfants" });
  }

  if (roles.includes("admin")) {
    links.push({ to: "/app/roles", label: "Roles plateforme" });
  }

  links.push({ to: "/app/profil", label: "Mon profil" });

  return links;
}

function useVolunteerApplication(uid) {
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) {
      setApplication(null);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    const applicationQuery = query(collection(db, "volunteerApplications"), where("uid", "==", uid));

    const unsubscribe = onSnapshot(
      applicationQuery,
      (snapshot) => {
        const firstApplication = snapshot.docs[0];
        setApplication(firstApplication ? { id: firstApplication.id, ...firstApplication.data() } : null);
        setError("");
        setLoading(false);
      },
      () => {
        setApplication(null);
        setError("Impossible de charger le dossier bénévole.");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [uid]);

  return { application, loading, error };
}

function useTeamConfiguration() {
  const [configuration, setConfiguration] = useState(() => normalizeTeamConfigurationPayload({}));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const teamsConfigurationRef = doc(db, ...TEAM_CONFIGURATION_DOC_PATH);

    const unsubscribe = onSnapshot(
      teamsConfigurationRef,
      (snapshot) => {
        setConfiguration(snapshot.exists() ? normalizeTeamConfigurationPayload(snapshot.data()) : normalizeTeamConfigurationPayload({}));
        setLoading(false);
        setError("");
      },
      () => {
        setConfiguration(normalizeTeamConfigurationPayload({}));
        setLoading(false);
        setError("Impossible de synchroniser la composition des équipes pour le moment.");
      },
    );

    return unsubscribe;
  }, []);

  return {
    ...configuration,
    loading,
    error,
  };
}

function useAccreditationConfiguration(roles = defaultTeamRoles) {
  const roleSignature = useMemo(
    () => roles.map((role) => `${role.id}:${role.roleName}`).join("|"),
    [roles],
  );
  const [configuration, setConfiguration] = useState(() =>
    normalizeAccreditationConfigurationPayload({}, roles),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const accreditationConfigurationRef = doc(db, ...ACCREDITATION_CONFIGURATION_DOC_PATH);

    const unsubscribe = onSnapshot(
      accreditationConfigurationRef,
      (snapshot) => {
        setConfiguration(
          normalizeAccreditationConfigurationPayload(snapshot.exists() ? snapshot.data() : {}, roles),
        );
        setLoading(false);
        setError("");
      },
      () => {
        setConfiguration(normalizeAccreditationConfigurationPayload({}, roles));
        setLoading(false);
        setError("Impossible de synchroniser la configuration des accréditations pour le moment.");
      },
    );

    return unsubscribe;
  }, [roleSignature, roles]);

  return {
    ...configuration,
    loading,
    error,
  };
}

function useU14PracticalInfoConfiguration(enabled = true) {
  const [configuration, setConfiguration] = useState(() => normalizeU14PracticalInfoPayload({}));
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setConfiguration(normalizeU14PracticalInfoPayload({}));
      setLoading(false);
      setError("");
      return undefined;
    }

    const practicalInfoRef = doc(db, ...U14_PRACTICAL_INFO_DOC_PATH);
    const unsubscribe = onSnapshot(
      practicalInfoRef,
      (snapshot) => {
        setConfiguration(
          snapshot.exists() ? normalizeU14PracticalInfoPayload(snapshot.data()) : normalizeU14PracticalInfoPayload({}),
        );
        setLoading(false);
        setError("");
      },
      () => {
        setConfiguration(normalizeU14PracticalInfoPayload({}));
        setLoading(false);
        setError("Impossible de charger les informations pratiques du pré-programme.");
      },
    );

    return unsubscribe;
  }, [enabled]);

  return {
    ...configuration,
    loading,
    error,
  };
}

function formatVolunteerApplicationStatus(status) {
  switch (String(status || "").trim().toLowerCase()) {
    case "candidature_recue":
      return "Candidature reçue";
    case "pending_guardian_approval":
      return "Accord parental attendu";
    default:
      return String(status || "À compléter");
  }
}

function formatU14RequestTypeLabel(requestType) {
  switch (String(requestType || "").trim().toLowerCase()) {
    case "preprogram":
      return "Pré-programme";
    case "porte_panier":
      return "Porte-panier";
    case "preprogram_ou_porte_panier":
      return "Pré-programme ou porte-panier";
    default:
      return "Demande U14";
  }
}

function formatU14RequestStatusLabel(status) {
  switch (String(status || "").trim().toLowerCase()) {
    case "submitted":
      return "Demande reçue";
    case "confirmed":
      return "Retenue";
    case "waitlisted":
      return "Liste d'attente";
    case "declined":
      return "Désisté";
    case "rejected":
      return "Non retenue";
    default:
      return String(status || "À confirmer");
  }
}

function useVolunteerApplicationsList(enabled = true) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setApplications([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "volunteerApplications"),
      (snapshot) => {
        setApplications(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setLoading(false);
        setError("");
      },
      () => {
        setApplications([]);
        setLoading(false);
        setError("Impossible de charger les candidatures bénévoles.");
      },
    );

    return unsubscribe;
  }, [enabled]);

  return { applications, loading, error };
}

function useDocumentsCollection(enabled = true) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setDocuments([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "documents"),
      (snapshot) => {
        setDocuments(snapshot.docs.map(mapStoredDocument));
        setLoading(false);
        setError("");
      },
      () => {
        setDocuments([]);
        setLoading(false);
        setError("Impossible de récupérer les documents.");
      },
    );

    return unsubscribe;
  }, [enabled]);

  return { documents, loading, error };
}

function useU14RequestsList(enabled = true) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setRequests([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "u14Requests"),
      (snapshot) => {
        setRequests(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setLoading(false);
        setError("");
      },
      () => {
        setRequests([]);
        setLoading(false);
        setError("Impossible de charger les demandes U14.");
      },
    );

    return unsubscribe;
  }, [enabled]);

  return { requests, loading, error };
}

function useU14ChildrenList(enabled = true) {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setChildren([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "u14Children"),
      (snapshot) => {
        setChildren(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setLoading(false);
        setError("");
      },
      () => {
        setChildren([]);
        setLoading(false);
        setError("Impossible de charger les enfants U14.");
      },
    );

    return unsubscribe;
  }, [enabled]);

  return { children, loading, error };
}

function useProtectedU14Entries(enabled = true) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, U14_RESERVED_SLOTS_COLLECTION),
      (snapshot) => {
        setEntries(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setLoading(false);
        setError("");
      },
      () => {
        setEntries([]);
        setLoading(false);
        setError("Impossible de charger les places protégées.");
      },
    );

    return unsubscribe;
  }, [enabled]);

  return { entries, loading, error };
}

function useParentU14Children(parentUserId) {
  const [children, setChildren] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(Boolean(parentUserId));
  const [loadingRequests, setLoadingRequests] = useState(Boolean(parentUserId));
  const [error, setError] = useState("");
  const practicalInfoConfiguration = useU14PracticalInfoConfiguration(Boolean(parentUserId));

  useEffect(() => {
    if (!parentUserId) {
      setChildren([]);
      setLoadingChildren(false);
      setError("");
      return undefined;
    }

    setLoadingChildren(true);
    const childrenQuery = query(collection(db, "u14Children"), where("parentUserId", "==", parentUserId));
    const unsubscribe = onSnapshot(
      childrenQuery,
      (snapshot) => {
        setChildren(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setLoadingChildren(false);
        setError("");
      },
      () => {
        setChildren([]);
        setLoadingChildren(false);
        setError("Impossible de charger les enfants U14.");
      },
    );

    return unsubscribe;
  }, [parentUserId]);

  useEffect(() => {
    if (!parentUserId) {
      setRequests([]);
      setLoadingRequests(false);
      setError("");
      return undefined;
    }

    setLoadingRequests(true);
    const requestsQuery = query(collection(db, "u14Requests"), where("parentUserId", "==", parentUserId));
    const unsubscribe = onSnapshot(
      requestsQuery,
      (snapshot) => {
        setRequests(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setLoadingRequests(false);
        setError("");
      },
      () => {
        setRequests([]);
        setLoadingRequests(false);
        setError("Impossible de charger les demandes U14.");
      },
    );

    return unsubscribe;
  }, [parentUserId]);

  const rows = useMemo(() => {
    const requestsByChildId = requests.reduce((accumulator, request) => {
      const childId = String(request.childId || "").trim();
      if (!childId) return accumulator;
      accumulator.set(childId, request);
      return accumulator;
    }, new Map());

    return children.map((child) => {
      const request = requestsByChildId.get(child.id);
      const childName = [child.firstName, child.lastName].filter(Boolean).join(" ").trim() || "Enfant";
      const practicalInfo =
        request?.requestType === "porte_panier"
          ? "Rôle porte-panier"
          : request?.requestedEvent
            ? `Course ${request.requestedEvent}`
            : "Détails à confirmer";

      return {
        id: child.id,
        requestId: request?.id || "",
        childId: child.id,
        name: childName,
        type: formatU14RequestTypeLabel(request?.requestType),
        status: getU14ParentStatusLabel(request),
        submittedAt: request?.submittedAt ? formatDateTimeForDisplay(request.submittedAt) : "-",
        schedule: practicalInfo,
        requestType: request?.requestType || "",
        raceCode:
          request?.raceCode ||
          getU14RaceCode({
            category: request?.category || child.category,
            gender: request?.gender || child.gender,
            requestedEvent: request?.requestedEvent,
          }),
        acceptedPosition: Number(request?.acceptedPosition || 0) || null,
        waitlistPosition: Number(request?.waitlistPosition || 0) || null,
        queuePosition: Number(request?.queuePosition || 0) || null,
        protectedSlotId: request?.protectedSlotId || "",
        allocationMode: request?.allocationMode || "",
        adminApprovalStatus: request?.adminApprovalStatus || "",
        parentDecisionStatus: request?.parentDecisionStatus || "",
        parentDecisionRequired: Boolean(request?.parentDecisionRequired),
        adminApprovalLabel: getAdminApprovalLabel(request?.adminApprovalStatus),
        practicalInfoText:
          getU14ParentStatusLabel(request) === "Validé"
            ? practicalInfoConfiguration[getU14PracticalRoleKey(request)] || ""
            : "",
      };
    });
  }, [children, practicalInfoConfiguration, requests]);

  return {
    rows,
    loading: loadingChildren || loadingRequests || practicalInfoConfiguration.loading,
    error: error || practicalInfoConfiguration.error,
  };
}

function createEmptyParentU14ChildForm() {
  return {
    firstName: "",
    lastName: "",
    birthDate: "",
    category: "",
    gender: "",
    club: "",
    bibNumber: "",
    requestType: "preprogram",
    requestedEvent: "60 m",
    notes: "",
    imageConsent: false,
  };
}

function buildUserIdentitySet(userProfile, currentUser) {
  return new Set(
    [
      currentUser?.uid,
      currentUser?.email,
      userProfile?.uid,
      userProfile?.email,
      getDisplayName(userProfile, currentUser?.email),
      [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(" "),
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean),
  );
}

function getAssignedTeamNames(userProfile) {
  return [
    userProfile?.assignedRole,
    userProfile?.teamName,
    ...(Array.isArray(userProfile?.assignedTeams) ? userProfile.assignedTeams : []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function isTeamLeadAssignment(assignment) {
  return normalizeRole(assignment?.teamRole) === normalizeRole("Chef d'équipe");
}

function RequireAuth() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="page">
        <section className="page-header">
          <div>
            <p className="eyebrow">Chargement</p>
            <h1>Ouverture de MyCLIM</h1>
            <p>Nous restaurons votre session et vos accès.</p>
          </div>
        </section>
      </div>
    );
  }
  return currentUser ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}

function RequireRouteAccess({ allowedRoles }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);

  if (!allowedRoles?.length || allowedRoles.some((role) => roles.includes(role))) {
    return <Outlet />;
  }

  return (
    <Navigate
      replace
      to={getDefaultRouteByRoles(roles)}
      state={{
        accessDeniedMessage:
          "Vous n'avez pas les droits pour ouvrir cette page. Vous avez été redirigé vers un espace autorisé.",
      }}
    />
  );
}

function PublicHomePage() {
  const { t } = useLanguage();

  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-topbar">
          <div className="landing-topline">{t("landingTopline")}</div>
          <div className="landing-topbar-actions">
            <NavLink className="landing-login-link" to="/login">
              {t("landingLoginButton")}
            </NavLink>
            <LanguageSwitch />
          </div>
        </div>
        <div className="landing-brand">
          <div className="landing-logo-shell">
            <img alt="Logo CMCM Luxembourg Indoor Meeting" className="landing-logo" src={cmcmLogo} />
          </div>
          <div className="landing-copy">
            <h1>{t("landingTitle")}</h1>
            <p>{t("landingDescription")}</p>
            <div className="landing-actions">
              <NavLink className="landing-login-button" to="/login">
                {t("landingLoginButton")}
              </NavLink>
              <span className="landing-login-hint">{t("landingLoginHint")}</span>
            </div>
          </div>
        </div>
        <div className="landing-links">
          {publicPaths.map((item) => (
            <NavLink key={item.to} className="landing-link-card" to={item.to}>
              <div className="landing-link-media">
                <img alt={t(item.titleKey)} src={item.image} />
              </div>
              <strong>{t(item.titleKey)}</strong>
              <span>{t(item.descriptionKey)}</span>
            </NavLink>
          ))}
        </div>
      </section>
    </div>
  );
}

function AuthLayout({ title, subtitle, children, sideCard }) {
  const { t } = useLanguage();

  return (
    <div className="auth-page">
      <section className="auth-page-header">
        <div className="auth-header-shell">
          <div className="auth-header-brand">
            <div className="auth-header-logo-shell">
              <img alt="Logo CMCM Luxembourg Indoor Meeting" className="auth-header-logo" src={cmcmLogo} />
            </div>
            <div className="auth-header-copy">
              <div className="hero-badge">{t("myclim")}</div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
          </div>
          <div className="auth-header-actions">
            <LanguageSwitch />
            <NavLink className="auth-header-link" to="/">
              {t("returnHome")}
            </NavLink>
          </div>
        </div>
      </section>
      <section className={`auth-page-body ${sideCard ? "" : "auth-page-body--single"}`.trim()}>
        <div className="auth-panel auth-panel--form">{children}</div>
        {sideCard ? <aside className="auth-side-card">{sideCard}</aside> : null}
      </section>
    </div>
  );
}

function AuthFormField({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function PhoneInput({
  name,
  value,
  onChange,
  required = false,
  placeholder = "Numéro local",
}) {
  const phoneParts = useMemo(() => parsePhoneValue(value), [value]);
  const [countryCode, setCountryCode] = useState(phoneParts.countryCode);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const pickerRef = useRef(null);

  const filteredCountryOptions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return PHONE_COUNTRY_OPTIONS;

    return PHONE_COUNTRY_OPTIONS.filter((option) => {
      const countryLabel = option.label.toLowerCase();
      return countryLabel.includes(normalizedSearch) || option.code.includes(normalizedSearch);
    });
  }, [searchTerm]);

  useEffect(() => {
    if (String(value || "").trim()) {
      setCountryCode(phoneParts.countryCode);
    }
  }, [phoneParts.countryCode, value]);

  useEffect(() => {
    if (!isPickerOpen) return undefined;

    function handlePointerDown(event) {
      if (!pickerRef.current?.contains(event.target)) {
        setIsPickerOpen(false);
        setSearchTerm("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isPickerOpen]);

  function emitChange(nextCountryCode, nextLocalNumber) {
    onChange({
      target: {
        name,
        value: buildPhoneValue(nextCountryCode, nextLocalNumber),
        type: "text",
      },
    });
  }

  function handleCountrySelect(nextCountryCode) {
    setCountryCode(nextCountryCode);
    emitChange(nextCountryCode, phoneParts.localNumber);
    setIsPickerOpen(false);
    setSearchTerm("");
  }

  function handleNumberChange(event) {
    emitChange(countryCode, event.target.value);
  }

  return (
    <div className="phone-input">
      <div className="phone-picker" ref={pickerRef}>
        <button
          aria-expanded={isPickerOpen}
          aria-haspopup="listbox"
          className="phone-picker__trigger"
          onClick={() => setIsPickerOpen((current) => !current)}
          type="button"
        >
          <span>{countryCode}</span>
          <span className="phone-picker__chevron" aria-hidden="true">
            ▾
          </span>
        </button>
        {isPickerOpen ? (
          <div className="phone-picker__popover">
            <input
              autoFocus
              className="phone-picker__search"
              inputMode="search"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Chercher un pays"
              value={searchTerm}
            />
            <div className="phone-picker__list" role="listbox">
              {filteredCountryOptions.map((option) => (
                <button
                  className={`phone-picker__option${option.code === countryCode ? " phone-picker__option--active" : ""}`}
                  key={option.code}
                  onClick={() => handleCountrySelect(option.code)}
                  type="button"
                >
                  <span>{option.code}</span>
                  <small>{option.label}</small>
                </button>
              ))}
              {filteredCountryOptions.length === 0 ? (
                <p className="phone-picker__empty">Aucun pays trouvé.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <input
        autoComplete="tel-national"
        className="phone-input__number"
        inputMode="tel"
        name={name}
        onChange={handleNumberChange}
        placeholder={placeholder}
        required={required}
        type="tel"
        value={phoneParts.localNumber}
      />
    </div>
  );
}

function LoginPage() {
  const { login, requestPasswordReset } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(readRememberMePreference);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(REMEMBER_ME_STORAGE_KEY, String(rememberMe));
  }, [rememberMe]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    setIsSubmitting(true);

    try {
      await login(email, password, rememberMe);
      const requestedPath = location.state?.from?.pathname;
      const requestedSearch = location.state?.from?.search || "";
      navigate(requestedPath ? `${requestedPath}${requestedSearch}` : "/app", { replace: true });
    } catch {
      setError("Connexion impossible. Verifie ton email et ton mot de passe.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setStatusMessage("");

    if (!String(email || "").trim()) {
      setError("Indiquez d'abord votre adresse email pour recevoir le lien de réinitialisation.");
      return;
    }

    setIsResetSubmitting(true);

    try {
      await requestPasswordReset(email);
      setStatusMessage("Si un compte existe pour cette adresse, un email de réinitialisation vient d'être envoyé.");
    } catch {
      setError("Impossible d'envoyer le mail de réinitialisation pour le moment.");
    } finally {
      setIsResetSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Espace bénévoles MyCLIM"
      subtitle="Connectez-vous pour retrouver vos affectations, vos documents, votre accréditation et toutes les informations utiles du meeting."
      sideCard={
        <>
          <h3>Un accès simple</h3>
          <p>
            Cette page permet de se connecter à l'espace personnel. Si vous n'avez pas encore de
            compte, vous pouvez soit le créer directement, soit remplir la candidature bénévole.
          </p>
          <div className="auth-links auth-links--stack">
            <NavLink to="/register">Créer un compte</NavLink>
            <NavLink to="/volunteer-apply">Candidater comme bénévole</NavLink>
            <NavLink to="/">Retour à l'accueil</NavLink>
          </div>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Connexion</p>
          <h2>Accéder à MyCLIM</h2>
        </div>
        <AuthFormField label="Email">
          <input
            autoComplete="email"
            placeholder="prenom.nom@email.com"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </AuthFormField>
        <AuthFormField label="Mot de passe">
          <input
            autoComplete="current-password"
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </AuthFormField>
        <div className="auth-links">
          <button className="button button--secondary" type="button" disabled={isResetSubmitting} onClick={handleForgotPassword}>
            {isResetSubmitting ? "Envoi..." : "Mot de passe oublié"}
          </button>
        </div>
        <label className="selection-card selection-card--compact">
          <input
            checked={rememberMe}
            type="checkbox"
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          <div>
            <strong>Se souvenir de moi</strong>
            <p>Rester connecté sur cet appareil après fermeture du navigateur.</p>
          </div>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {statusMessage ? <p className="panel-note panel-note--success">{statusMessage}</p> : null}
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Connexion..." : "Se connecter"}
        </button>
        <div className="auth-links">
          <NavLink to="/register">Créer un compte</NavLink>
          <NavLink to="/volunteer-apply">Candidater comme bénévole</NavLink>
        </div>
      </form>
    </AuthLayout>
  );
}

function VolunteerAccessPage() {
  const { login, createVolunteerApplication } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(readRememberMePreference);
  const [loginError, setLoginError] = useState("");
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [applicationError, setApplicationError] = useState("");
  const [isApplicationSubmitting, setIsApplicationSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    gender: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    birthDate: "",
    languages: [],
    otherLanguage: "",
    tshirtSize: "M",
    lunexStudent: "non",
    lunexProgram: "",
    occupation: "",
    cmcmExperience: "",
    volunteerExperience: "",
    healthSafetyInfo: "",
    certificateNeeded: false,
    retainForNextYear: true,
    imageConsent: false,
    availability: [],
    meetingDayConfirmed: false,
    missionPreferences: "",
    guardianFirstName: "",
    guardianLastName: "",
    guardianEmail: "",
    guardianPhone: "",
  });

  const volunteerAge = getAgeFromBirthDate(formData.birthDate);
  const isUnder14Volunteer = volunteerAge !== null && volunteerAge < 14;
  const isMinorVolunteer = volunteerAge !== null && volunteerAge >= 14 && volunteerAge < 18;

  useEffect(() => {
    window.localStorage.setItem(REMEMBER_ME_STORAGE_KEY, String(rememberLogin));
  }, [rememberLogin]);

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setLoginError("");
    setIsLoginSubmitting(true);

    try {
      await login(loginEmail, loginPassword, rememberLogin);
      navigate("/app");
    } catch (submissionError) {
      setLoginError("Connexion impossible. Vérifiez votre email et votre mot de passe.");
    } finally {
      setIsLoginSubmitting(false);
    }
  }

  function handleApplicationChange(event) {
    const { name, type, checked, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function toggleAvailabilityOption(option) {
    setFormData((current) => ({
      ...current,
      availability: current.availability.includes(option)
        ? current.availability.filter((item) => item !== option)
        : [...current.availability, option],
    }));
  }

  function toggleLanguageOption(option) {
    setFormData((current) => ({
      ...current,
      languages: current.languages.includes(option)
        ? current.languages.filter((item) => item !== option)
        : [...current.languages, option],
      otherLanguage:
        option === "Autre" && current.languages.includes(option) ? "" : current.otherLanguage,
    }));
  }

  async function handleApplicationSubmit(event) {
    event.preventDefault();
    setApplicationError("");

    if (formData.password !== formData.confirmPassword) {
      setApplicationError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    if (!formData.meetingDayConfirmed) {
      setApplicationError(
        "Merci de confirmer explicitement votre présence le dimanche 17/01/2027 avant d'envoyer votre candidature.",
      );
      return;
    }

    if (!formData.imageConsent) {
      setApplicationError(
        "La présence sur l'événement implique des prises de vue globales photo et vidéo. Sans accord sur ce point, nous ne pouvons malheureusement pas retenir votre candidature.",
      );
      return;
    }

    if (isUnder14Volunteer) {
      setApplicationError(
        "Désolée, nous ne pouvons malheureusement pas prendre de bénévole de moins de 14 ans sauf pour le rôle de porte-panier dans la mesure des places disponibles.",
      );
      return;
    }

    setIsApplicationSubmitting(true);

    try {
      await createVolunteerApplication(formData);
      navigate("/app");
    } catch (submissionError) {
      setApplicationError(
        "La candidature n'a pas pu être enregistrée. Vérifiez les champs obligatoires ou utilisez un autre email si un compte existe déjà.",
      );
    } finally {
      setIsApplicationSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={t("volunteerPageTitle")}
      subtitle={t("volunteerPageSubtitle")}
    >
      <div className="stacked-entry">
        <section className="entry-card">
          <div className="entry-card__header">
            <div>
              <p className="eyebrow">{t("volunteerLoginEyebrow")}</p>
              <h2>{t("volunteerLoginTitle")}</h2>
              <p>{t("volunteerLoginDescription")}</p>
            </div>
          </div>
          <form className="auth-form auth-form--compact" onSubmit={handleLoginSubmit}>
            <AuthFormField label="Email">
              <input
                autoComplete="email"
                placeholder="prenom.nom@email.com"
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
              />
            </AuthFormField>
            <AuthFormField label="Mot de passe">
              <input
                autoComplete="current-password"
                placeholder="••••••••"
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
              />
            </AuthFormField>
            <label className="selection-card selection-card--compact">
              <input
                checked={rememberLogin}
                type="checkbox"
                onChange={(event) => setRememberLogin(event.target.checked)}
              />
              <div>
                <strong>Se souvenir de moi</strong>
                <p>Rester connecté sur cet appareil après fermeture du navigateur.</p>
              </div>
            </label>
            {loginError ? <p className="form-error">{loginError}</p> : null}
            <button className="button button--primary" disabled={isLoginSubmitting} type="submit">
              {isLoginSubmitting ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </section>

        <section className="entry-card">
          <div className="entry-card__header">
            <div>
              <p className="eyebrow">{t("volunteerApplyEyebrow")}</p>
              <h2>{t("volunteerApplyTitle")}</h2>
            </div>
            <button
              className={`button ${showApplicationForm ? "button--secondary" : "button--primary"}`}
              type="button"
              onClick={() => setShowApplicationForm((current) => !current)}
            >
              {showApplicationForm ? t("volunteerCloseButton") : t("volunteerApplyButton")}
            </button>
          </div>

          {showApplicationForm ? (
            <form className="auth-form auth-form--long" onSubmit={handleApplicationSubmit}>
              <div className="field-grid">
                <AuthFormField label="Prénom">
                  <input name="firstName" required value={formData.firstName} onChange={handleApplicationChange} />
                </AuthFormField>
                <AuthFormField label="Nom">
                  <input name="lastName" required value={formData.lastName} onChange={handleApplicationChange} />
                </AuthFormField>
              </div>
              <div className="field-grid">
                <AuthFormField label="Genre">
                  <select name="gender" value={formData.gender} onChange={handleApplicationChange}>
                    <option value="">Sélectionner</option>
                    <option value="femme">Femme</option>
                    <option value="homme">Homme</option>
                    <option value="autre">Autre</option>
                  </select>
                </AuthFormField>
                <AuthFormField label="Taille t-shirt">
                  <select name="tshirtSize" value={formData.tshirtSize} onChange={handleApplicationChange}>
                    <option>S</option>
                    <option>M</option>
                    <option>L</option>
                    <option>XL</option>
                  </select>
                </AuthFormField>
              </div>
              <div className="field-grid">
                <AuthFormField label="Email">
                  <input name="email" required type="email" value={formData.email} onChange={handleApplicationChange} />
                </AuthFormField>
                <AuthFormField label="Téléphone">
                  <PhoneInput name="phone" required value={formData.phone} onChange={handleApplicationChange} />
                </AuthFormField>
              </div>
              <div className="field-grid">
                <AuthFormField label="Mot de passe">
                  <input name="password" required type="password" value={formData.password} onChange={handleApplicationChange} />
                </AuthFormField>
                <AuthFormField label="Confirmer le mot de passe">
                  <input
                    name="confirmPassword"
                    required
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleApplicationChange}
                  />
                </AuthFormField>
              </div>
              <div className="field-grid">
                <AuthFormField label="Date de naissance">
                  <input
                    name="birthDate"
                    required
                    type="date"
                    value={formData.birthDate}
                    onChange={handleApplicationChange}
                  />
                </AuthFormField>
              </div>

              {volunteerAge !== null ? (
                <div className={`notice-card${isUnder14Volunteer ? " notice-card--danger" : isMinorVolunteer ? " notice-card--warn" : " notice-card--ok"}`}>
                  <strong>
                    {isUnder14Volunteer
                      ? "Moins de 14 ans"
                      : isMinorVolunteer
                        ? "Bénévole mineur"
                        : "Candidature adulte"}
                  </strong>
                  <p>
                    {isUnder14Volunteer
                      ? "Désolée, nous ne pouvons malheureusement pas prendre de bénévole de moins de 14 ans sauf pour le rôle de porte-panier dans la mesure des places disponibles."
                      : isMinorVolunteer
                        ? "Votre date de naissance indique un bénévole mineur. Un contact de responsable légal est obligatoire et devra valider l'autorisation par email."
                        : "Vous pouvez poursuivre la candidature bénévole normale."}
                  </p>
                  {isUnder14Volunteer ? (
                    <div className="auth-links">
                      <NavLink className="button button--secondary button-link" to="/pre-programme">
                        Créer un compte parent
                      </NavLink>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isMinorVolunteer ? (
                <section className="minor-guardian-card">
                  <div className="form-section-head">
                    <p className="eyebrow">Responsable légal</p>
                    <h3>Validation obligatoire pour les 14-17 ans</h3>
                  </div>
                  <div className="field-grid">
                    <AuthFormField label="Prénom du responsable légal">
                      <input
                        name="guardianFirstName"
                        required={isMinorVolunteer}
                        value={formData.guardianFirstName}
                        onChange={handleApplicationChange}
                      />
                    </AuthFormField>
                    <AuthFormField label="Nom du responsable légal">
                      <input
                        name="guardianLastName"
                        required={isMinorVolunteer}
                        value={formData.guardianLastName}
                        onChange={handleApplicationChange}
                      />
                    </AuthFormField>
                  </div>
                  <div className="field-grid">
                    <AuthFormField label="Email du responsable légal">
                      <input
                        name="guardianEmail"
                        required={isMinorVolunteer}
                        type="email"
                        value={formData.guardianEmail}
                        onChange={handleApplicationChange}
                      />
                    </AuthFormField>
                    <AuthFormField label="Téléphone du responsable légal">
                      <PhoneInput
                        name="guardianPhone"
                        required={isMinorVolunteer}
                        value={formData.guardianPhone}
                        onChange={handleApplicationChange}
                      />
                    </AuthFormField>
                  </div>
                </section>
              ) : null}

              <div className="field-grid">
                <div className="language-card">
                  <div className="form-section-head">
                    <p className="eyebrow">Langues</p>
                    <h3>Quelles langues parlez-vous ?</h3>
                  </div>
                  <div className="choice-grid">
                    {["Français", "Anglais", "Allemand", "Belge", "Luxembourgeois", "Autre"].map(
                      (option) => (
                        <label key={option} className="selection-card selection-card--compact">
                          <input
                            checked={formData.languages.includes(option)}
                            type="checkbox"
                            onChange={() => toggleLanguageOption(option)}
                          />
                          <div>
                            <strong>{option}</strong>
                          </div>
                        </label>
                      ),
                    )}
                  </div>
                  {formData.languages.includes("Autre") ? (
                    <AuthFormField label="Autre langue">
                      <input
                        name="otherLanguage"
                        value={formData.otherLanguage}
                        onChange={handleApplicationChange}
                      />
                    </AuthFormField>
                  ) : null}
                </div>
                <div className="lunex-card">
                  <div className="form-section-head">
                    <p className="eyebrow">LUNEX</p>
                    <h3>Êtes-vous étudiant LUNEX ?</h3>
                  </div>
                  <div className="lunex-choice-row">
                    <label className="selection-card selection-card--inline">
                      <input
                        checked={formData.lunexStudent === "oui"}
                        name="lunexStudent"
                        type="radio"
                        value="oui"
                        onChange={handleApplicationChange}
                      />
                      <div>
                        <strong>Oui</strong>
                      </div>
                    </label>
                    <label className="selection-card selection-card--inline">
                      <input
                        checked={formData.lunexStudent === "non"}
                        name="lunexStudent"
                        type="radio"
                        value="non"
                        onChange={handleApplicationChange}
                      />
                      <div>
                        <strong>Non</strong>
                      </div>
                    </label>
                  </div>
                  {formData.lunexStudent === "oui" ? (
                    <AuthFormField label="Programme LUNEX">
                      <input
                        name="lunexProgram"
                        value={formData.lunexProgram}
                        onChange={handleApplicationChange}
                      />
                    </AuthFormField>
                  ) : null}
                </div>
              </div>
              <AuthFormField label="Profession / occupation">
                <input name="occupation" value={formData.occupation} onChange={handleApplicationChange} />
              </AuthFormField>
              <AuthFormField label="Expérience précédente au CMCM">
                <textarea name="cmcmExperience" rows="3" value={formData.cmcmExperience} onChange={handleApplicationChange} />
              </AuthFormField>
              <AuthFormField label="Autre expérience bénévole">
                <textarea
                  name="volunteerExperience"
                  rows="3"
                  value={formData.volunteerExperience}
                  onChange={handleApplicationChange}
                />
              </AuthFormField>
              <div className="availability-card">
                <div className="form-section-head">
                  <p className="eyebrow">Disponibilités</p>
                  <h3>Quand pouvez-vous être présent(e) ?</h3>
                </div>
                <p className="availability-lead">
                  Les briefings du matin sont obligatoires. Pour le meeting, nous avons besoin de
                  bénévoles disponibles le dimanche 17/01/2027 de 9h30 à 19h00. Les horaires
                  exacts seront confirmés plus tard, mais cette amplitude doit être considérée comme
                  indispensable pour le jour du meeting. Toute aide avant l'événement est la
                  bienvenue, et nous serions particulièrement reconnaissants pour les aides
                  disponibles le lundi.
                </p>
                <div className="notice-card notice-card--warn">
                  <strong>Dimanche 17/01/2027 obligatoire</strong>
                  <p>
                    Disponibilité requise pour le briefing, la collation avant le meeting,
                    l'ouverture des portes à 13h00 et la compétition de 16h à 19h00.
                  </p>
                </div>
                <label className="selection-card availability-confirm-card">
                  <input
                    checked={formData.meetingDayConfirmed}
                    name="meetingDayConfirmed"
                    type="checkbox"
                    onChange={handleApplicationChange}
                  />
                  <div>
                    <strong>Je confirme être disponible le dimanche 17/01/2027</strong>
                    <p>
                      J'ai bien compris que ma présence de 9h30 à 19h00 environ, briefing compris,
                      est indispensable pour le jour du meeting.
                    </p>
                  </div>
                </label>
                <p className="availability-subnote">
                  Vous pouvez aussi nous indiquer ci-dessous si vous êtes disponible pour aider
                  avant le meeting ou lors du rangement du lundi.
                </p>
                <div className="availability-options">
                  {[
                    "Avant-meeting - vendredi matin",
                    "Avant-meeting - vendredi après-midi",
                    "Avant-meeting - samedi matin",
                    "Avant-meeting - samedi après-midi",
                    "Après-meeting - lundi 9h-12h",
                  ].map((option) => (
                    <label key={option} className="selection-card">
                      <input
                        checked={formData.availability.includes(option)}
                        type="checkbox"
                        onChange={() => toggleAvailabilityOption(option)}
                      />
                      <div>
                        <strong>{option}</strong>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <AuthFormField label="Préférences de mission" hint="Ex: transport, aéroport, warm-up">
                <input
                  name="missionPreferences"
                  placeholder="Transport, aéroport, warm-up"
                  value={formData.missionPreferences}
                  onChange={handleApplicationChange}
                />
              </AuthFormField>
              <AuthFormField label="Informations sécurité / santé">
                <textarea
                  name="healthSafetyInfo"
                  rows="3"
                  value={formData.healthSafetyInfo}
                  onChange={handleApplicationChange}
                />
              </AuthFormField>
              <div className="selection-card-group">
                <label className="selection-card">
                  <input
                    checked={formData.certificateNeeded}
                    name="certificateNeeded"
                    onChange={handleApplicationChange}
                    type="checkbox"
                  />
                  <div>
                    <strong>Certificat bénévole</strong>
                    <p>Je souhaite recevoir un certificat après l'événement.</p>
                  </div>
                </label>
                <label className="selection-card">
                  <input
                    checked={formData.retainForNextYear}
                    name="retainForNextYear"
                    onChange={handleApplicationChange}
                    type="checkbox"
                  />
                  <div>
                    <strong>Édition suivante</strong>
                    <p>J'accepte d'être recontacté pour la prochaine édition.</p>
                  </div>
                </label>
                <label className="selection-card">
                  <input
                    checked={formData.imageConsent}
                    name="imageConsent"
                    onChange={handleApplicationChange}
                    type="checkbox"
                  />
                  <div>
                    <strong>Droit à l'image</strong>
                    <p>
                      La présence sur l'événement implique des prises de vue photo et vidéo dans les
                      espaces du meeting. Sans accord sur ce point, nous ne pourrons
                      malheureusement pas retenir votre participation.
                    </p>
                  </div>
                </label>
              </div>
              {applicationError ? <p className="form-error">{applicationError}</p> : null}
              <button className="button button--primary" disabled={isApplicationSubmitting} type="submit">
                {isApplicationSubmitting ? "Envoi..." : "Envoyer ma candidature"}
              </button>
            </form>
          ) : (
            <div className="entry-card__placeholder">
              <p>{t("volunteerPlaceholder")}</p>
            </div>
          )}
        </section>
      </div>
    </AuthLayout>
  );
}

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    wantsVolunteerModule: true,
    wantsParentModule: false,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(event) {
    const { name, type, checked, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const userTypes = [];
    if (formData.wantsVolunteerModule) userTypes.push("benevole");
    if (formData.wantsParentModule) userTypes.push("parent_u14");

    try {
      await register(formData.email, formData.password, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        userTypes: userTypes.length ? userTypes : ["benevole"],
      });
      navigate("/app");
    } catch (submissionError) {
      setError("Creation de compte impossible. Cet email est peut-etre deja utilise.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Creer un compte unique et activer les bons modules"
      subtitle="Cree ton acces personnel puis active l'espace benevole, l'espace parent U14, ou les deux selon ton besoin."
      sideCard={
        <>
          <h3>Creation de compte</h3>
          <p>
            Ce parcours est ideal si tu veux d'abord ouvrir ton espace puis completer les modules
            tranquillement ensuite.
          </p>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Creation de compte</p>
          <h2>Ouvrir mon espace</h2>
        </div>
        <div className="field-grid">
          <AuthFormField label="Prenom">
            <input name="firstName" value={formData.firstName} onChange={handleChange} />
          </AuthFormField>
          <AuthFormField label="Nom">
            <input name="lastName" value={formData.lastName} onChange={handleChange} />
          </AuthFormField>
        </div>
        <AuthFormField label="Email">
          <input name="email" type="email" value={formData.email} onChange={handleChange} />
        </AuthFormField>
        <div className="field-grid">
          <AuthFormField label="Telephone">
            <PhoneInput name="phone" value={formData.phone} onChange={handleChange} />
          </AuthFormField>
          <AuthFormField label="Mot de passe">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
            />
          </AuthFormField>
        </div>
        <div className="selection-card-group">
          <label className="selection-card">
            <input
              checked={formData.wantsVolunteerModule}
              name="wantsVolunteerModule"
              onChange={handleChange}
              type="checkbox"
            />
            <div>
              <strong>Module benevole</strong>
              <p>Profil, disponibilites, affectations, documents et accreditation.</p>
            </div>
          </label>
          <label className="selection-card">
            <input
              checked={formData.wantsParentModule}
              name="wantsParentModule"
              onChange={handleChange}
              type="checkbox"
            />
            <div>
              <strong>Module parent / U14</strong>
              <p>Ajout des enfants, demandes U14, statuts et convocations.</p>
            </div>
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Creation..." : "Creer mon compte"}
        </button>
        <div className="auth-links">
          <NavLink to="/login">J'ai deja un compte</NavLink>
          <NavLink to="/volunteer-apply">Je veux candidater directement</NavLink>
        </div>
      </form>
    </AuthLayout>
  );
}

function U14AccessPage() {
  const { createU14PreProgramRegistration } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [includeSecondChild, setIncludeSecondChild] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    parentFirstName: "",
    parentLastName: "",
    parentEmail: "",
    parentPhone: "",
    password: "",
    confirmPassword: "",
    children: [
      {
        firstName: "",
        lastName: "",
        birthDate: "",
        category: "",
        club: "",
        bibNumber: "",
        gender: "",
        requestType: "preprogram",
        requestedEvent: "60 m",
        notes: "",
        imageConsent: false,
      },
      {
        firstName: "",
        lastName: "",
        birthDate: "",
        category: "",
        club: "",
        bibNumber: "",
        gender: "",
        requestType: "preprogram",
        requestedEvent: "60 m",
        notes: "",
        imageConsent: false,
      },
    ],
  });
  const isPreprogramOpen =
    (typeof window !== "undefined" && window.location.hostname === "localhost") ||
    now >= PREPROGRAM_OPEN_AT.getTime();

  useEffect(() => {
    if (isPreprogramOpen) return undefined;

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => window.clearInterval(interval);
  }, [isPreprogramOpen]);

  function handleParentChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function handleChildChange(index, event) {
    const { name, type, checked, value } = event.target;
    setFormData((current) => ({
      ...current,
      children: current.children.map((child, childIndex) =>
        childIndex === index
          ? {
              ...(() => {
                const nextValue = type === "checkbox" ? checked : value;
                const nextCategory =
                  name === "birthDate" ? getU14CategoryFromBirthDate(value) : child.category;
                const nextChild = {
                  ...child,
                  [name]: nextValue,
                  ...(name === "birthDate" ? { category: nextCategory } : {}),
                };

                return {
                  ...nextChild,
                  requestedEvent: getValidRequestedEventForCategory(
                    nextCategory,
                    name === "requestedEvent" ? value : nextChild.requestedEvent,
                  ),
                };
              })(),
            }
          : child,
      ),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    const children = includeSecondChild ? formData.children : [formData.children[0]];
    const hasInvalidCategory = children.some(
      (child) =>
        child.firstName &&
        child.lastName &&
        child.birthDate &&
        !getU14CategoryFromBirthDate(child.birthDate),
    );

    if (hasInvalidCategory) {
      setError(
        "Pour l'édition 2027, seuls les enfants nés en 2017/2016 (U12) et 2015/2014 (U14) peuvent être inscrits ici.",
      );
      return;
    }

    const hasInvalidClubOrBib = children.some(
      (child) =>
        child.firstName &&
        child.lastName &&
        child.birthDate &&
        (!luxCompetitionClubs.includes(child.club) || !child.bibNumber.trim()),
    );

    if (hasInvalidClubOrBib) {
      setError(
        "Pour toute demande, y compris porte-panier, merci d'indiquer un club luxembourgeois autorisé et le numéro de licence de l'enfant.",
      );
      return;
    }

    const hasInvalidRequestedEvent = children.some(
      (child) =>
        child.firstName &&
        child.lastName &&
        child.birthDate &&
        child.requestType !== "porte_panier" &&
        !getU14AllowedEvents(child.category).includes(child.requestedEvent),
    );

    if (hasInvalidRequestedEvent) {
      setError("Pour la catégorie U12, seule l'épreuve du 60 m peut être demandée.");
      return;
    }

    const hasMissingImageConsent = children.some(
      (child) => child.firstName && child.lastName && child.birthDate && !child.imageConsent,
    );

    if (hasMissingImageConsent) {
      setError(
        "La participation au meeting implique des prises de vue photo et vidéo dans les espaces de l'événement. Sans cet accord, nous ne pourrons malheureusement pas confirmer l'inscription de l'enfant.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      await createU14PreProgramRegistration({
        ...formData,
        children,
      });

      navigate("/app");
    } catch (submissionError) {
      setError(getPreProgramSubmissionErrorMessage(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isPreprogramOpen) {
    return (
      <AuthLayout title={t("preprogramPageTitle")} subtitle={t("preprogramPageSubtitle")}>
        <div className="placeholder-card placeholder-card--u14">
          <div className="u14-closed-layout">
            <div className="u14-closed-layout__content">
              <div className="u14-hero__copy">
                <p className="eyebrow">{t("preprogramIntroEyebrow")}</p>
                <h2>{t("preprogramClosedTitle")}</h2>
                <p>{t("preprogramClosedDescription")}</p>
              </div>
              <div className="feature-card-grid">
                <div className="mini-feature">
                  <strong>{t("preprogramClosedCardTitle")}</strong>
                  <span>{t("preprogramClosedCardBody")}</span>
                </div>
                <div className="mini-feature">
                  <strong>{t("preprogramClosedTimingTitle")}</strong>
                  <span>{t("preprogramClosedTimingBody")}</span>
                </div>
              </div>
            </div>
            <div className="u14-closed-layout__aside">
              <div className="u14-hero__media">
                <div className="u14-hero__image u14-hero__image--large">
                  <img alt="Pré-programme U12/U14" src={preprogrammeHomeImage} />
                </div>
                <div className="u14-hero__image u14-hero__image--small">
                  <img alt="Porte-paniers" src={portePanierHomeImage} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("preprogramPageTitle")}
      subtitle={t("preprogramPageSubtitle")}
    >
      <form className="auth-form auth-form--long u14-form" onSubmit={handleSubmit}>
        <div className="u14-intro-card">
          <div className="u14-hero">
            <div className="u14-hero__copy">
              <p className="eyebrow">{t("preprogramIntroEyebrow")}</p>
              <h2>{t("preprogramIntroTitle")}</h2>
              <p>{t("preprogramIntroDescription")}</p>
            </div>
            <div className="u14-hero__media">
              <div className="u14-hero__image u14-hero__image--large">
                <img alt="Pré-programme U12/U14" src={preprogrammeHomeImage} />
              </div>
              <div className="u14-hero__image u14-hero__image--small">
                <img alt="Porte-paniers" src={portePanierHomeImage} />
              </div>
            </div>
          </div>
        </div>
        <div className="notice-card">
          <strong>{t("preprogramClosedCardTitle")}</strong>
          <p>{t("preprogramClosedCardBody")}</p>
        </div>
        <div className="notice-card notice-card--warn">
          <strong>Courses U12/U14 réservées aux licenciés luxembourgeois</strong>
          <p>
            Les courses U12/U14 sont réservées aux licenciés luxembourgeois des clubs suivants :
            CAB, CAD, CAPA, CSL, CELTIC, LIAL, CAEG, CAFOLA, CAS, Karibu, Trispeed, RBUAP,
            CSN Clervaux, Triathlon Luxembourg et Team X3M Snooze.
          </p>
        </div>

        <section className="form-section-card">
          <div className="form-section-head">
            <p className="eyebrow">Bloc 1</p>
            <h3>Informations parentales</h3>
          </div>
          <div className="field-grid">
            <AuthFormField label="Prénom du parent">
              <input
                name="parentFirstName"
                required
                value={formData.parentFirstName}
                onChange={handleParentChange}
              />
            </AuthFormField>
            <AuthFormField label="Nom du parent">
              <input
                name="parentLastName"
                required
                value={formData.parentLastName}
                onChange={handleParentChange}
              />
            </AuthFormField>
          </div>
          <div className="field-grid">
            <AuthFormField label="Email du parent">
              <input
                name="parentEmail"
                required
                type="email"
                value={formData.parentEmail}
                onChange={handleParentChange}
              />
            </AuthFormField>
            <AuthFormField label="Téléphone du parent">
              <PhoneInput
                name="parentPhone"
                required
                value={formData.parentPhone}
                onChange={handleParentChange}
              />
            </AuthFormField>
          </div>
          <div className="field-grid">
            <AuthFormField
              label="Mot de passe"
              hint="Ce mot de passe servira pour vous reconnecter à l'espace parent après l'inscription."
            >
              <input
                name="password"
                required
                type="password"
                value={formData.password}
                onChange={handleParentChange}
              />
            </AuthFormField>
            <AuthFormField label="Confirmer le mot de passe">
              <input
                name="confirmPassword"
                required
                type="password"
                value={formData.confirmPassword}
                onChange={handleParentChange}
              />
            </AuthFormField>
          </div>
        </section>

        {[0, ...(includeSecondChild ? [1] : [])].map((childIndex) => (
          <section key={childIndex} className="form-section-card">
            <div className="form-section-head">
              <p className="eyebrow">Bloc {childIndex + 2}</p>
              <h3>{childIndex === 0 ? "Premier enfant" : "Deuxième enfant"}</h3>
            </div>
            <div className="field-grid">
              <AuthFormField label="Prénom de l'enfant">
                <input
                  name="firstName"
                  required
                  value={formData.children[childIndex].firstName}
                  onChange={(event) => handleChildChange(childIndex, event)}
                />
              </AuthFormField>
              <AuthFormField label="Nom de l'enfant">
                <input
                  name="lastName"
                  required
                  value={formData.children[childIndex].lastName}
                  onChange={(event) => handleChildChange(childIndex, event)}
                />
              </AuthFormField>
            </div>
            <div className="field-grid">
              <AuthFormField
                label="Date de naissance"
                hint="Pour le CMCM Luxembourg Indoor Meeting 2027 : U12 = 2017/2016, U14 = 2015/2014."
              >
                <input
                  name="birthDate"
                  required
                  type="date"
                  value={formData.children[childIndex].birthDate}
                  onChange={(event) => handleChildChange(childIndex, event)}
                />
              </AuthFormField>
              <AuthFormField label="Catégorie attribuée">
                <input
                  readOnly
                  name="category"
                  placeholder="Calculée automatiquement"
                  required
                  value={formData.children[childIndex].category}
                />
              </AuthFormField>
            </div>
            {formData.children[childIndex].birthDate &&
            !formData.children[childIndex].category ? (
              <div className="notice-card notice-card--danger">
                <strong>Catégorie non éligible</strong>
                <p>
                  Pour cette page, l'enfant doit être né en 2017 ou 2016 pour la catégorie U12,
                  ou en 2015 ou 2014 pour la catégorie U14.
                </p>
              </div>
            ) : null}
            <div className="field-grid">
              <AuthFormField label="Genre">
                <select
                  name="gender"
                  value={formData.children[childIndex].gender}
                  onChange={(event) => handleChildChange(childIndex, event)}
                >
                  <option value="">Sélectionner</option>
                  <option value="fille">Fille</option>
                  <option value="garcon">Garcon</option>
                </select>
              </AuthFormField>
              <AuthFormField
                label="Club"
                hint="Obligatoire pour toute demande, y compris porte-panier. Choisissez un club luxembourgeois autorisé."
              >
                <select
                  name="club"
                  required
                  value={formData.children[childIndex].club}
                  onChange={(event) => handleChildChange(childIndex, event)}
                >
                  <option value="">Sélectionner un club</option>
                  {luxCompetitionClubs.map((club) => (
                    <option key={club} value={club}>
                      {club}
                    </option>
                  ))}
                </select>
              </AuthFormField>
            </div>
            <AuthFormField
              label="Numéro de licence"
              hint="Obligatoire pour toute demande, y compris porte-panier."
            >
              <input
                name="bibNumber"
                required
                placeholder="Ex: 245"
                value={formData.children[childIndex].bibNumber}
                onChange={(event) => handleChildChange(childIndex, event)}
              />
            </AuthFormField>
            <AuthFormField
              label="Type d'inscription souhaité"
              hint="Choisissez le Pré-programme, le rôle de porte-panier, ou une demande flexible selon les places disponibles."
            >
              <select
                name="requestType"
                value={formData.children[childIndex].requestType}
                onChange={(event) => handleChildChange(childIndex, event)}
              >
                <option value="preprogram">Pré-programme U12/U14</option>
                <option value="porte_panier">Porte-panier</option>
                <option value="preprogram_ou_porte_panier">
                  Pré-programme ou porte-panier
                </option>
              </select>
            </AuthFormField>
            {formData.children[childIndex].requestType !== "porte_panier" ? (
              <AuthFormField
                label="Épreuve demandée"
                hint="Une seule épreuve par enfant. Le 1000 m est réservé à la catégorie U14."
              >
                <select
                  name="requestedEvent"
                  value={formData.children[childIndex].requestedEvent}
                  onChange={(event) => handleChildChange(childIndex, event)}
                >
                  {getU14AllowedEvents(formData.children[childIndex].category).map((eventOption) => (
                    <option key={eventOption} value={eventOption}>
                      {eventOption}
                    </option>
                  ))}
                </select>
              </AuthFormField>
            ) : (
              <div className="notice-card notice-card--ok">
                <strong>Porte-panier</strong>
                <p>
                  Cette demande concerne le rôle de porte-panier. Une licence reste obligatoire et
                  l'organisation reviendra vers vous avec les modalités selon les places disponibles.
                </p>
              </div>
            )}
            <AuthFormField label="Informations utiles">
              <textarea
                name="notes"
                rows="3"
                placeholder="Informations complémentaires, préférences ou remarques si nécessaire"
                value={formData.children[childIndex].notes}
                onChange={(event) => handleChildChange(childIndex, event)}
              />
            </AuthFormField>
            <label className="selection-card">
              <input
                checked={formData.children[childIndex].imageConsent}
                name="imageConsent"
                type="checkbox"
                onChange={(event) => handleChildChange(childIndex, event)}
              />
              <div>
                <strong>Autorisation image</strong>
                <p>
                  La participation implique des prises de vue photo et vidéo dans les espaces du
                  meeting. Sans cet accord, nous ne pourrons malheureusement pas confirmer
                  l'inscription de votre enfant.
                </p>
              </div>
            </label>
          </section>
        ))}

        <button
          className="button button--secondary"
          type="button"
          onClick={() => setIncludeSecondChild((current) => !current)}
        >
          {includeSecondChild ? "Retirer le second enfant" : "Ajouter un deuxième enfant"}
        </button>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="u14-submit-bar">
          <div>
            <strong>Le compte parent sera créé automatiquement.</strong>
            <p>
              Vous pourrez ensuite retrouver dans MyCLIM les statuts, décisions et informations
              pratiques pour le Pré-programme ou le porte-panier.
            </p>
          </div>
          <button className="button button--primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Envoi en cours..." : "Envoyer l'inscription"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

function VipAccessPage() {
  return (
    <AuthLayout
      title="Inscription VIP"
      subtitle="Cette page sera l'entree dediee aux invitations et inscriptions VIP du CMCM Luxembourg Indoor Meeting."
      sideCard={
        <>
          <h3>Module VIP</h3>
          <p>
            Le formulaire d'inscription VIP sera ajoute plus tard. On garde deja une entree
            separee pour structurer le parcours public.
          </p>
          <div className="auth-links auth-links--stack">
            <NavLink to="/">Retour a l'accueil</NavLink>
          </div>
        </>
      }
    >
      <div className="placeholder-card">
        <p className="eyebrow">A venir</p>
        <h2>Page VIP en preparation</h2>
        <p>
          Le parcours VIP sera branche ici avec le formulaire, la confirmation d'inscription et
          les informations pratiques.
        </p>
        <div className="auth-links">
          <NavLink to="/">Retour accueil</NavLink>
        </div>
      </div>
    </AuthLayout>
  );
}

function VolunteerApplyPage() {
  const { createVolunteerApplication } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    gender: "",
    email: "",
    phone: "",
    password: "",
    languages: "Francais, Anglais",
    tshirtSize: "M",
    ageBracket: "18+",
    lunexStudent: "non",
    lunexProgram: "",
    occupation: "",
    cmcmExperience: "",
    volunteerExperience: "",
    healthSafetyInfo: "",
    certificateNeeded: false,
    retainForNextYear: true,
    imageConsent: false,
    availability: "",
    missionPreferences: "",
  });

  function handleChange(event) {
    const { name, type, checked, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createVolunteerApplication(formData);
      navigate("/app");
    } catch (submissionError) {
      setError(
        "La candidature n'a pas pu etre enregistree. Verifie les champs obligatoires ou un compte existant sur cet email.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Candidature benevole avec creation de compte integree"
      subtitle="Un seul formulaire pour creer ton compte et envoyer ta candidature benevole au CMCM Luxembourg Indoor Meeting."
      sideCard={
        <>
          <h3>Inscription benevole</h3>
          <p>
            Si tu veux aller droit au but, cette entree est la plus simple: tu completes ton
            profil et ta demande est enregistree en une fois.
          </p>
        </>
      }
    >
      <form className="auth-form auth-form--long" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Inscription benevole</p>
          <h2>Je candidate pour le meeting</h2>
        </div>
        <div className="field-grid">
          <AuthFormField label="Prenom">
            <input name="firstName" required value={formData.firstName} onChange={handleChange} />
          </AuthFormField>
          <AuthFormField label="Nom">
            <input name="lastName" required value={formData.lastName} onChange={handleChange} />
          </AuthFormField>
        </div>
        <div className="field-grid">
          <AuthFormField label="Genre">
            <select name="gender" value={formData.gender} onChange={handleChange}>
              <option value="">Selectionner</option>
              <option value="femme">Femme</option>
              <option value="homme">Homme</option>
              <option value="autre">Autre</option>
            </select>
          </AuthFormField>
          <AuthFormField label="Taille t-shirt">
            <select name="tshirtSize" value={formData.tshirtSize} onChange={handleChange}>
              <option>S</option>
              <option>M</option>
              <option>L</option>
              <option>XL</option>
            </select>
          </AuthFormField>
        </div>
        <div className="field-grid">
          <AuthFormField label="Email">
            <input name="email" required type="email" value={formData.email} onChange={handleChange} />
          </AuthFormField>
          <AuthFormField label="Telephone">
            <PhoneInput name="phone" required value={formData.phone} onChange={handleChange} />
          </AuthFormField>
        </div>
        <div className="field-grid">
          <AuthFormField label="Mot de passe">
            <input
              name="password"
              required
              type="password"
              value={formData.password}
              onChange={handleChange}
            />
          </AuthFormField>
          <AuthFormField label="Tranche d'age">
            <select name="ageBracket" value={formData.ageBracket} onChange={handleChange}>
              <option value="u16">U16</option>
              <option value="u18">U18</option>
              <option value="18+">18+</option>
            </select>
          </AuthFormField>
        </div>
        <div className="field-grid">
          <AuthFormField label="Langues" hint="Separees par des virgules">
            <input name="languages" value={formData.languages} onChange={handleChange} />
          </AuthFormField>
          <AuthFormField label="Etudiant LUNEX">
            <select name="lunexStudent" value={formData.lunexStudent} onChange={handleChange}>
              <option value="non">Non</option>
              <option value="oui">Oui</option>
            </select>
          </AuthFormField>
        </div>
        <AuthFormField label="Programme LUNEX si applicable">
          <input name="lunexProgram" value={formData.lunexProgram} onChange={handleChange} />
        </AuthFormField>
        <AuthFormField label="Profession / occupation">
          <input name="occupation" value={formData.occupation} onChange={handleChange} />
        </AuthFormField>
        <AuthFormField label="Experience precedente au CMCM">
          <textarea name="cmcmExperience" rows="3" value={formData.cmcmExperience} onChange={handleChange} />
        </AuthFormField>
        <AuthFormField label="Autre experience benevole">
          <textarea
            name="volunteerExperience"
            rows="3"
            value={formData.volunteerExperience}
            onChange={handleChange}
          />
        </AuthFormField>
        <AuthFormField label="Disponibilites globales">
          <textarea
            name="availability"
            rows="3"
            placeholder="Vendredi soir, samedi toute la journee..."
            value={formData.availability}
            onChange={handleChange}
          />
        </AuthFormField>
        <AuthFormField label="Preferences de mission" hint="Ex: transport, aeroport, warm-up">
          <input
            name="missionPreferences"
            placeholder="Transport, aeroport, warm-up"
            value={formData.missionPreferences}
            onChange={handleChange}
          />
        </AuthFormField>
        <AuthFormField label="Informations securite / sante">
          <textarea
            name="healthSafetyInfo"
            rows="3"
            value={formData.healthSafetyInfo}
            onChange={handleChange}
          />
        </AuthFormField>
        <div className="selection-card-group">
          <label className="selection-card">
            <input
              checked={formData.certificateNeeded}
              name="certificateNeeded"
              onChange={handleChange}
              type="checkbox"
            />
            <div>
              <strong>Certificat benevole</strong>
              <p>Je souhaite recevoir un certificat apres l'evenement.</p>
            </div>
          </label>
          <label className="selection-card">
            <input
              checked={formData.retainForNextYear}
              name="retainForNextYear"
              onChange={handleChange}
              type="checkbox"
            />
            <div>
              <strong>Edition suivante</strong>
              <p>J'accepte d'etre recontacte pour la prochaine edition.</p>
            </div>
          </label>
          <label className="selection-card">
            <input
              checked={formData.imageConsent}
              name="imageConsent"
              onChange={handleChange}
              type="checkbox"
            />
            <div>
              <strong>Droit a l'image</strong>
              <p>
                La presence sur l'evenement implique des prises de vue photo et video dans les
                espaces du meeting. Sans accord sur ce point, nous ne pourrons malheureusement pas
                retenir votre participation.
              </p>
            </div>
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Envoi..." : "Envoyer ma candidature"}
        </button>
        <div className="auth-links">
          <NavLink to="/login">J'ai deja un compte</NavLink>
          <NavLink to="/register">Je prefere creer un compte d'abord</NavLink>
        </div>
      </form>
    </AuthLayout>
  );
}

function AppShell() {
  const { currentUser, logout, userProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const roles = getActiveRoles(userProfile);
  const [viewAsRole, setViewAsRole] = useState(getPrimaryRole(userProfile));
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth > 1100,
  );
  const effectiveRoles = useMemo(() => {
    if (!roles.includes("admin")) return roles;
    if (viewAsRole === "admin") return roles;
    return [viewAsRole];
  }, [roles, viewAsRole]);
  const navigation = useMemo(() => buildNavigationFromRoles(effectiveRoles), [effectiveRoles]);
  const primaryRole = getPrimaryRole(userProfile);
  const displayName = getDisplayName(userProfile, currentUser?.email);

  useEffect(() => {
    setViewAsRole(getPrimaryRole(userProfile));
  }, [userProfile]);

  useEffect(() => {
    function syncSidebarWithViewport() {
      if (window.innerWidth > 1100) {
        setIsSidebarOpen(true);
      }
    }

    window.addEventListener("resize", syncSidebarWithViewport);
    return () => window.removeEventListener("resize", syncSidebarWithViewport);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 1100) {
      setIsSidebarOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!location.state?.accessDeniedMessage) return;

    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  function handleViewAsChange(nextRole) {
    setViewAsRole(nextRole);

    const defaultRouteByRole = {
      admin: "/app",
      gestionnaire: "/app/documents",
      chef_equipe: "/app/equipe",
      benevole: "/app/mes-affectations",
      parent_u14: "/app/mes-enfants",
    };

    navigate(defaultRouteByRole[nextRole] || "/app");
  }

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className={`shell${isSidebarOpen ? " shell--sidebar-open" : " shell--sidebar-closed"}`}>
      <aside className={`sidebar${isSidebarOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-lockup">
              <div className="sidebar-brand-logo-shell">
                <img alt="Logo CMCM Luxembourg Indoor Meeting" className="sidebar-brand-logo" src={cmcmLogo} />
              </div>
              <div className="sidebar-brand-copy">
                <h2>MyCLIM</h2>
              </div>
            </div>
            <p className="sidebar-brand-tagline">Plateforme équipes et accès meeting.</p>
          </div>
          <button
            className="button button--ghost sidebar-toggle sidebar-toggle--inside"
            type="button"
            onClick={() => setIsSidebarOpen(false)}
          >
            Replier
          </button>
        </div>
        <div className="sidebar-main">
          <nav className="sidebar-nav">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}
                to={item.to}
                end={item.to === "/app"}
              >
                <span className="nav-link__label">{item.label}</span>
                <span aria-hidden="true" className="nav-link__chevron">
                  ›
                </span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-footer__identity">
            <strong>{displayName}</strong>
            <p>{currentUser?.email}</p>
          </div>
          <div className="sidebar-footer__actions">
            <span className="status-pill status-pill--accent">{primaryRole.replace("_", " ")}</span>
            <button className="button button--ghost sidebar-footer__logout" onClick={handleLogout} type="button">
              Se deconnecter
            </button>
          </div>
        </div>
      </aside>
      {isSidebarOpen ? (
        <button
          aria-label="Fermer le menu"
          className="sidebar-backdrop"
          type="button"
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}
      <main className="content">
        {!isSidebarOpen ? (
          <button
            className="shell-sidebar-rail"
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Rouvrir le menu"
          >
            Menu
          </button>
        ) : null}
        <div className="shell-mobile-bar">
          <button
            className="button button--secondary shell-mobile-bar__toggle"
            type="button"
            onClick={() => setIsSidebarOpen((current) => !current)}
          >
            {isSidebarOpen ? "Fermer" : "Menu"}
          </button>
          <span className="shell-mobile-bar__route">{location.pathname}</span>
        </div>
        {roles.includes("admin") ? (
          <div className="content-toolbar">
            <label className="view-switcher">
              <span>Voir comme</span>
              <select
                value={viewAsRole}
                onChange={(event) => handleViewAsChange(event.target.value)}
              >
                {roles.includes("admin") ? <option value="admin">Administrateur</option> : null}
                {roles.includes("chef_equipe") ? (
                  <option value="chef_equipe">Chef d'équipe</option>
                ) : null}
                {roles.includes("benevole") ? <option value="benevole">Bénévole</option> : null}
                {roles.includes("parent_u14") ? <option value="parent_u14">Parent U14</option> : null}
              </select>
            </label>
          </div>
        ) : null}
        {location.state?.accessDeniedMessage ? (
          <div className="notice-card notice-card--warn">
            <strong>Accès limité</strong>
            <p>{location.state.accessDeniedMessage}</p>
          </div>
        ) : null}
        <Outlet
          context={{
            activeRole: roles.includes("admin") ? viewAsRole : primaryRole,
            availableRoles: roles,
            onSwitchRole: handleViewAsChange,
          }}
        />
      </main>
    </div>
  );
}

function DashboardHome() {
  const { currentUser, userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const outletContext = useOutletContext() ?? {};
  const activeRole = outletContext.activeRole || getPrimaryRole(userProfile);
  const { application: volunteerApplication } = useVolunteerApplication(currentUser?.uid);
  const { roles: teamRoles, teamAssignments, loading: teamsLoading } = useTeamConfiguration();
  const { applications: volunteerApplications, loading: volunteerApplicationsLoading } = useVolunteerApplicationsList(
    roles.includes("admin"),
  );
  const { documents, loading: documentsLoading } = useDocumentsCollection(
    roles.includes("admin") || roles.includes("benevole") || roles.includes("chef_equipe"),
  );
  const { requests: u14Requests, loading: u14RequestsLoading } = useU14RequestsList(roles.includes("admin"));
  const { rows: parentRequestRows, loading: parentRowsLoading } = useParentU14Children(currentUser?.uid);
  const shouldPromptParentToVolunteer =
    roles.includes("parent_u14") && !volunteerApplication;
  const userIdentitySet = useMemo(
    () => buildUserIdentitySet(userProfile, currentUser),
    [currentUser, userProfile],
  );
  const myAssignments = useMemo(
    () =>
      teamAssignments.filter((member) =>
        [member.id, member.email, `${member.firstName} ${member.lastName}`.trim()]
          .map((value) => String(value || "").trim().toLowerCase())
          .some((value) => value && userIdentitySet.has(value)),
      ),
    [teamAssignments, userIdentitySet],
  );
  const myVolunteerAssignments = useMemo(
    () => myAssignments.filter((assignment) => !isTeamLeadAssignment(assignment)),
    [myAssignments],
  );
  const myLeadAssignments = useMemo(
    () => myAssignments.filter((assignment) => isTeamLeadAssignment(assignment)),
    [myAssignments],
  );
  const myLeadRoleIds = useMemo(
    () =>
      teamRoles
        .filter((role) =>
          userIdentitySet.has(String(role.leaderName || "").trim().toLowerCase()) ||
          myLeadAssignments.some((assignment) => assignment.assignedRoleId === role.id),
        )
        .map((role) => role.id),
    [myLeadAssignments, teamRoles, userIdentitySet],
  );
  const ledRoles = useMemo(() => teamRoles.filter((role) => myLeadRoleIds.includes(role.id)), [myLeadRoleIds, teamRoles]);
  const myRoleIds = useMemo(
    () => [...new Set(myVolunteerAssignments.map((assignment) => assignment.assignedRoleId).filter(Boolean))],
    [myVolunteerAssignments],
  );
  const myTeamRoles = useMemo(
    () => teamRoles.filter((role) => myRoleIds.includes(role.id)),
    [myRoleIds, teamRoles],
  );
  const incompleteTeamsCount = useMemo(
    () =>
      teamRoles.filter((role) => {
        const assignedMembers = teamAssignments.filter((member) => member.assignedRoleId === role.id).length;
        return assignedMembers < role.neededCount;
      }).length,
    [teamAssignments, teamRoles],
  );
  const pendingApplicationsCount = useMemo(
    () =>
      volunteerApplications.filter((volunteer) =>
        ["candidature_recue", "pending_guardian_approval"].includes(String(volunteer.status || "").trim().toLowerCase()),
      ).length,
    [volunteerApplications],
  );
  const submittedU14RequestsCount = useMemo(
    () =>
      u14Requests.filter((request) => String(request.status || "").trim().toLowerCase() === "submitted").length,
    [u14Requests],
  );
  const myDocumentsCount = useMemo(() => {
    if (!myTeamRoles.length) return 0;
    const assignedTeamNames = myTeamRoles.map((role) => role.roleName);

    return documents.filter((document) => {
      if (document.scope === "global" || document.teams.length === 0) return true;
      return document.teams.some((team) => assignedTeamNames.includes(team));
    }).length;
  }, [documents, myTeamRoles]);
  const leadDocumentsCount = useMemo(() => {
    if (!ledRoles.length) return 0;
    const ledRoleNames = ledRoles.map((role) => role.roleName);

    return documents.filter((document) => {
      if (document.scope === "global" || document.teams.length === 0) return true;
      return document.teams.some((team) => ledRoleNames.includes(team));
    }).length;
  }, [documents, ledRoles]);
  const totalOpenPositions = useMemo(
    () =>
      ledRoles.reduce((accumulator, role) => {
        const assignedMembers = teamAssignments.filter((member) => member.assignedRoleId === role.id).length;
        return accumulator + Math.max(role.neededCount - assignedMembers, 0);
      }, 0),
    [ledRoles, teamAssignments],
  );
  const totalReplacements = useMemo(
    () =>
      ledRoles.reduce(
        (accumulator, role) =>
          accumulator +
          teamAssignments.filter(
            (member) =>
              member.assignedRoleId === role.id && normalizeRole(member.teamRole) === normalizeRole("Remplaçant"),
          ).length,
        0,
      ),
    [ledRoles, teamAssignments],
  );
  const totalLeadMembers = useMemo(
    () =>
      ledRoles.reduce(
        (accumulator, role) =>
          accumulator + teamAssignments.filter((member) => member.assignedRoleId === role.id).length,
        0,
      ),
    [ledRoles, teamAssignments],
  );
  const nextVolunteerRole = myTeamRoles[0] ?? null;
  const volunteerAssignmentSummary =
    nextVolunteerRole?.roleName || userProfile?.assignedRole || "Aucune affectation confirmée pour l'instant";
  const volunteerShiftSummary =
    userProfile?.shift || nextVolunteerRole?.shiftTime || "Créneau à confirmer";
  const volunteerBriefingSummary =
    nextVolunteerRole?.briefingTime || "Briefing à confirmer";
  const parentConfirmedCount = parentRequestRows.filter((child) => child.status === "Confirmée").length;
  const parentPendingCount = parentRequestRows.filter((child) => child.status !== "Confirmée").length;
  const adminDataLoading = teamsLoading || volunteerApplicationsLoading || documentsLoading || u14RequestsLoading;
  const volunteerDataLoading = teamsLoading || documentsLoading;
  const leadDataLoading = teamsLoading || documentsLoading;

  function renderRoleSummary() {
    if (activeRole === "admin") {
      return (
        <>
          <section className="panel-grid panel-grid--2">
            <Panel title="Mes priorités" subtitle="Les décisions et actions de pilotage à prendre aujourd'hui.">
              <ul className="compact-list">
                <li>
                  {adminDataLoading
                    ? "Chargement des candidatures bénévoles..."
                    : `${pendingApplicationsCount} candidatures bénévoles à traiter`}
                </li>
                <li>
                  {adminDataLoading
                    ? "Chargement de la composition des équipes..."
                    : `${incompleteTeamsCount} équipes encore incomplètes à sécuriser`}
                </li>
                <li>
                  {documentsLoading
                    ? "Chargement des documents..."
                    : `${documents.length} document(s) publiés à relire ou diffuser`}
                </li>
                <li>
                  {u14RequestsLoading
                    ? "Chargement des demandes U14..."
                    : `${submittedU14RequestsCount} demande(s) d'inscription au pré-programme reçue(s) à suivre`}
                </li>
              </ul>
            </Panel>
            <Panel title="Accès rapides" subtitle="Entrées directes vers les modules de pilotage.">
              <div className="dashboard-action-grid">
                <NavLink className="button button--secondary button-link" to="/app/benevoles">
                  Gérer les bénévoles
                </NavLink>
                <NavLink className="button button--secondary button-link" to="/app/roles">
                  Gérer les rôles
                </NavLink>
                <NavLink className="button button--secondary button-link" to="/app/postes">
                  Ajuster les équipes
                </NavLink>
                <NavLink className="button button--secondary button-link" to="/app/accreditations">
                  Produire les badges
                </NavLink>
              </div>
            </Panel>
          </section>
        </>
      );
    }

    if (activeRole === "benevole") {
      return (
        <>
          <section className="panel-grid panel-grid--2">
            <Panel title="Mes priorités" subtitle="L'essentiel pour être prêt le jour du meeting.">
              <ul className="compact-list">
                <li>
                  {volunteerDataLoading
                    ? "Chargement de ton affectation..."
                    : `Affectation actuelle: ${volunteerAssignmentSummary}`}
                </li>
                <li>Créneau prévu: {volunteerShiftSummary}</li>
                <li>
                  Statut du dossier bénévole: {formatVolunteerApplicationStatus(volunteerApplication?.status)}
                </li>
                <li>
                  {documentsLoading
                    ? "Chargement des documents de mission..."
                    : `${myDocumentsCount} document(s) disponible(s) pour tes équipes`}
                </li>
                <li>Briefing: {volunteerBriefingSummary}</li>
              </ul>
            </Panel>
            <Panel title="Accès rapides" subtitle="Retrouve tes écrans bénévoles en un clic.">
              <div className="dashboard-action-grid">
                <NavLink className="button button--secondary button-link" to="/app/mes-affectations">
                  Mes affectations
                </NavLink>
                <NavLink className="button button--secondary button-link" to="/app/mes-documents">
                  Mes documents
                </NavLink>
              </div>
            </Panel>
          </section>
        </>
      );
    }

    if (activeRole === "gestionnaire") {
      return (
        <>
          <section className="panel-grid panel-grid--2">
            <Panel title="Mes priorités" subtitle="Le suivi d'accueil et de coordination du jour J.">
              <ul className="compact-list">
                <li>Pointer les arrivées au guichet bénévoles et distribuer badge + tee-shirt</li>
                <li>Suivre la récupération des sandwichs à midi</li>
                <li>Mettre à jour les présences et horaires de départ avec les chefs d'équipe</li>
              </ul>
            </Panel>
            <Panel title="Accès rapides" subtitle="Outils opérationnels pour le guichet bénévoles.">
              <div className="dashboard-action-grid">
                <NavLink className="button button--secondary button-link" to="/app/presences">
                  Présences
                </NavLink>
                <NavLink className="button button--secondary button-link" to="/app/documents">
                  Documents
                </NavLink>
              </div>
            </Panel>
          </section>
        </>
      );
    }

    if (activeRole === "parent_u14") {
      return (
        <>
          <section className="panel-grid panel-grid--2">
            <Panel title="Mes priorités" subtitle="Les prochains éléments à suivre pour mes enfants.">
              <ul className="compact-list">
                {parentRowsLoading ? <li>Chargement des demandes U14...</li> : null}
                {!parentRowsLoading && parentRequestRows.length === 0 ? (
                  <li>Aucune demande U14 liée à ce compte pour l'instant.</li>
                ) : null}
                {!parentRowsLoading &&
                  parentRequestRows.map((child) => (
                  <li key={child.id}>
                    {child.name}: {child.status} - {child.schedule}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Accès rapides" subtitle="Tout le suivi parent centralisé dans un seul espace.">
              <div className="dashboard-action-grid">
                <NavLink className="button button--secondary button-link" to="/app/mes-enfants">
                  Mes enfants
                </NavLink>
                <NavLink className="button button--secondary button-link" to="/app/profil">
                  Mon profil
                </NavLink>
              </div>
              {!parentRowsLoading && parentRequestRows.length > 0 ? (
                <p className="panel-note">
                  {parentConfirmedCount} demande(s) confirmée(s), {parentPendingCount} encore en attente.
                </p>
              ) : null}
            </Panel>
          </section>
        </>
      );
    }

    if (activeRole === "chef_equipe") {
      return (
        <>
          <section className="panel-grid panel-grid--2">
            <Panel title="Mes priorités" subtitle="Ce qu'il faut suivre pour faire tourner l'équipe.">
              <ul className="compact-list">
                <li>
                  {leadDataLoading
                    ? "Chargement de tes équipes..."
                    : totalOpenPositions > 0
                      ? `${totalOpenPositions} poste(s) encore ouvert(s) sur ${ledRoles.map((role) => role.roleName).join(", ")}`
                      : "Toutes tes équipes ont atteint leur effectif prévu"}
                </li>
                <li>
                  {leadDataLoading
                    ? "Chargement des affectations..."
                    : `${totalLeadMembers} membre(s) actuellement rattaché(s) à tes équipes`}
                </li>
                <li>
                  {documentsLoading
                    ? "Chargement des documents d'équipe..."
                    : `${leadDocumentsCount} document(s) d'équipe déjà disponibles`}
                </li>
                <li>
                  {leadDataLoading
                    ? "Chargement des remplaçants..."
                    : `${totalReplacements} remplaçant(s) actuellement identifié(s)`}
                </li>
              </ul>
            </Panel>
            <Panel title="Accès rapides" subtitle="Les outils de coordination chef d'équipe.">
              <div className="dashboard-action-grid">
                <NavLink className="button button--secondary button-link" to="/app/equipe">
                  Mon équipe
                </NavLink>
                <NavLink className="button button--secondary button-link" to="/app/presences">
                  Présences
                </NavLink>
                <NavLink className="button button--secondary button-link" to="/app/mes-documents">
                  Documents
                </NavLink>
              </div>
            </Panel>
          </section>
        </>
      );
    }

    return null;
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Vue d'ensemble</p>
          <h1>Bienvenue {getDisplayName(userProfile, currentUser?.email)}</h1>
          <p>
            Ton compte centralise tes modules actifs et ouvre les bons parcours selon ton profil.
          </p>
        </div>
      </section>

      <article className="info-card install-app-card">
        <h3>Ajoute MyCLIM à ton téléphone</h3>
        <p>
          Garde MyCLIM sous la main comme une vraie appli, directement depuis l'écran d'accueil.
        </p>
        <section className="install-app-grid" aria-label="Instructions d'installation">
          <article className="install-app-step">
            <strong className="install-app-step__title">
              <span className="install-app-step__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M15.2 3.6c.7-.8 1.2-1.8 1.1-2.9-1 .1-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.8 1.1.1 2-.5 2.7-1.4Z" />
                  <path d="M17.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.7.8-3.5.8s-1.9-.8-3.1-.8c-1.6 0-3 .9-3.8 2.3-1.6 2.7-.4 6.8 1.1 8.9.7 1 1.6 2.2 2.8 2.1 1.1 0 1.6-.7 3-.7 1.4 0 1.9.7 3 .7 1.2 0 2-.9 2.7-1.9.8-1.2 1.2-2.3 1.2-2.4-.1-.1-2-.8-2-3.7Z" />
                </svg>
              </span>
              Sur iPhone
            </strong>
            <p>Ouvre MyCLIM dans Safari, touche Partager puis choisis Sur l'écran d'accueil.</p>
          </article>
          <article className="install-app-step">
            <strong className="install-app-step__title">
              <span className="install-app-step__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M7.1 8.1h9.8c.6 0 1 .5 1 1v6.8c0 .6-.4 1-1 1h-.7v2.3c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-2.3h-4.8v2.3c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-2.3h-.7c-.6 0-1-.4-1-1V9.1c0-.5.4-1 1-1Z" />
                  <path d="M8.7 6.8a3.4 3.4 0 0 1 6.6 0Z" />
                  <path d="M9.2 4.2 8 2.7m8 1.5 1.2-1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="11.1" r=".7" />
                  <circle cx="14" cy="11.1" r=".7" />
                </svg>
              </span>
              Sur Android
            </strong>
            <p>Ouvre MyCLIM dans Chrome, touche le menu puis choisis Ajouter à l'écran d'accueil.</p>
          </article>
        </section>
        <p className="install-app-note">
          Tu pourras lancer MyCLIM en un clic, comme une application classique.
        </p>
      </article>

      {renderRoleSummary()}

      {volunteerApplication ? (
        <section className="panel-grid panel-grid--2">
          <Panel
            title="Mon dossier bénévole"
            subtitle="Retrouve ici l'état de ta candidature et les informations transmises."
            actions={
              <NavLink className="button button--primary button-link" to="/app/mon-dossier-benevole">
                Ouvrir mon dossier
              </NavLink>
            }
          >
            <ul className="compact-list">
              <li>Statut: {volunteerApplication.status || "Candidature reçue"}</li>
              <li>
                Préférences:{" "}
                {Array.isArray(volunteerApplication.missionPreferences) &&
                volunteerApplication.missionPreferences.length
                  ? volunteerApplication.missionPreferences.join(", ")
                  : "À compléter"}
              </li>
              <li>
                Disponibilités:{" "}
                {Array.isArray(volunteerApplication.availability) &&
                volunteerApplication.availability.length
                  ? volunteerApplication.availability.join(", ")
                  : "À compléter"}
              </li>
            </ul>
          </Panel>
          <article className="info-card">
            <h3>Ce que tu peux faire ici</h3>
            <p>
              Relire ta candidature, compléter certaines réponses et garder tes informations
              bénévoles à jour sans recréer un compte.
            </p>
          </article>
        </section>
      ) : null}

      {shouldPromptParentToVolunteer ? (
        <section className="panel-grid panel-grid--2">
          <Panel
            title="Envie de rejoindre aussi les bénévoles ?"
            subtitle="Ton espace parent reste actif, et tu peux ajouter le parcours bénévole sur le même compte."
            actions={
              <NavLink className="button button--primary button-link" to="/app/mon-dossier-benevole">
                Devenir bénévole
              </NavLink>
            }
          >
            <ul className="compact-list">
              <li>Un seul compte pour suivre tes enfants et tes missions bénévoles</li>
              <li>Accès ensuite aux affectations, documents et accréditations bénévoles</li>
              <li>La candidature bénévole reste indépendante de ton module parent U14</li>
            </ul>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}

function Panel({ title, subtitle, children, actions }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function getWorkflowStatusClass(status) {
  switch (status) {
    case "Annulé":
      return "workflow-pill workflow-pill--cancelled";
    case "Affecté":
      return "workflow-pill workflow-pill--assigned";
    case "Informé":
      return "workflow-pill workflow-pill--informed";
    case "Confirmé":
      return "workflow-pill workflow-pill--confirmed";
    default:
      return "workflow-pill workflow-pill--received";
  }
}

function sortAccreditationZones(zones) {
  return [...zones].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    return left.name.localeCompare(right.name);
  });
}

function getRoleByNameFromRoles(roles, roleName) {
  return (
    roles.find(
      (role) => normalizeComparableValue(role?.roleName) === normalizeComparableValue(roleName),
    ) ?? null
  );
}

function getRoleZoneIdsByNameFromConfig(roleName, roles, roleZoneAssignments) {
  const matchingRole = getRoleByNameFromRoles(roles, roleName);
  if (!matchingRole) return [];
  return roleZoneAssignments[matchingRole.id] ?? [];
}

function getAccreditationFinalZoneIds({ assignedRoles, roles, zones, roleZoneAssignments, override }) {
  const inheritedZoneIds = normalizeSubRoles(
    assignedRoles.flatMap((roleName) => getRoleZoneIdsByNameFromConfig(roleName, roles, roleZoneAssignments)),
  );
  const normalizedOverride = override ?? { addZoneIds: [], removeZoneIds: [], badgeStatus: "A produire" };

  return sortAccreditationZones(zones)
    .map((zone) => zone.id)
    .filter((zoneId) => {
      if (normalizedOverride.removeZoneIds.includes(zoneId)) return false;
      return inheritedZoneIds.includes(zoneId) || normalizedOverride.addZoneIds.includes(zoneId);
    });
}

function buildAccreditationUsers(users, teamAssignments) {
  const usersById = new Map();

  users.forEach((user) => {
    const assignedRoles = normalizeSubRoles(
      Array.isArray(user?.assignedTeams) ? user.assignedTeams : user?.assignedRole ? [user.assignedRole] : [],
    );
    const profileRoles = extractRolesFromProfile(user);
    const shouldAppearInAccreditations =
      assignedRoles.length > 0 ||
      profileRoles.some((role) => ["benevole", "chef_equipe", "gestionnaire", "admin"].includes(role));

    if (!shouldAppearInAccreditations) return;

    usersById.set(String(user.id || user.uid || "").trim(), {
      id: String(user.id || user.uid || "").trim(),
      uid: String(user.uid || user.id || "").trim(),
      firstName: String(user.firstName || ""),
      lastName: String(user.lastName || ""),
      email: String(user.email || ""),
      phone: String(user.phone || ""),
      assignedRoles,
      assignedRole: assignedRoles[0] || "",
      assignmentStatus: String(user.assignmentStatus || (assignedRoles.length ? "Proposé" : "En attente")),
      teamRole: String(user.teamRole || "Bénévole"),
      teamRoleAssignments:
        user?.teamRoleAssignments && typeof user.teamRoleAssignments === "object" ? user.teamRoleAssignments : {},
    });
  });

  teamAssignments.forEach((assignment) => {
    const userId = String(assignment?.id || "").trim();
    if (!userId) return;

    const existing = usersById.get(userId) ?? {
      id: userId,
      uid: userId,
      firstName: String(assignment?.firstName || ""),
      lastName: String(assignment?.lastName || ""),
      email: String(assignment?.email || ""),
      phone: String(assignment?.phone || ""),
      assignedRoles: [],
      assignedRole: "",
      assignmentStatus: "Proposé",
      teamRole: "Bénévole",
      teamRoleAssignments: {},
    };

    const nextAssignedRoles = normalizeSubRoles([...existing.assignedRoles, assignment?.assignedRole].filter(Boolean));
    const nextAssignedRole = existing.assignedRole || nextAssignedRoles[0] || "";

    usersById.set(userId, {
      ...existing,
      assignedRoles: nextAssignedRoles,
      assignedRole: nextAssignedRole,
      assignmentStatus:
        nextAssignedRoles.length > 0 && (!existing.assignmentStatus || existing.assignmentStatus === "En attente")
          ? "Proposé"
          : existing.assignmentStatus || "En attente",
      teamRoleAssignments: assignment?.assignedRole
        ? {
            ...existing.teamRoleAssignments,
            [assignment.assignedRole]: String(assignment?.teamRole || existing.teamRole || "Bénévole"),
          }
        : existing.teamRoleAssignments,
      teamRole:
        (nextAssignedRole && assignment?.assignedRole === nextAssignedRole
          ? String(assignment?.teamRole || "")
          : "") || existing.teamRole,
    });
  });

  return [...usersById.values()].sort((left, right) => {
    const leftName = `${left.lastName} ${left.firstName}`.trim() || left.email;
    const rightName = `${right.lastName} ${right.firstName}`.trim() || right.email;
    return leftName.localeCompare(rightName, "fr", { sensitivity: "base" });
  });
}

function buildAccreditationRoleLabel(roleNames = []) {
  if (!roleNames.length) return "";
  if (roleNames.length === 1) return roleNames[0];
  return `${roleNames.slice(0, -1).join(", ")} et ${roleNames[roleNames.length - 1]}`;
}

function isAccreditationRoleConfirmed(volunteer) {
  const assignmentStatus = normalizeComparableValue(volunteer?.assignmentStatus);
  const workflowStatus = normalizeComparableValue(volunteer?.workflowStatus);
  return assignmentStatus === "confirme" || workflowStatus === "confirme";
}

function getConfirmedAccreditationRoleNames(volunteer) {
  return isAccreditationRoleConfirmed(volunteer)
    ? normalizeSubRoles(volunteer?.assignedRoles || [volunteer?.assignedRole].filter(Boolean))
    : [];
}

function getBadgeRoleLabel(volunteer, override) {
  const manualLabel = String(override?.badgeLabel || "").trim();
  if (manualLabel) return manualLabel;

  const confirmedRoles = getConfirmedAccreditationRoleNames(volunteer);
  if (confirmedRoles.length) return buildAccreditationRoleLabel(confirmedRoles);

  const assignedRoles = normalizeSubRoles(volunteer?.assignedRoles || [volunteer?.assignedRole].filter(Boolean));
  return buildAccreditationRoleLabel(assignedRoles);
}

function getAccreditationStatusClass(status) {
  switch (String(status || "").trim()) {
    case "Dans la file":
      return "workflow-pill workflow-pill--assigned";
    case "Imprimé":
      return "workflow-pill workflow-pill--confirmed";
    default:
      return "workflow-pill workflow-pill--received";
  }
}

function buildAccreditationPrintHistoryMarkup(items) {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name || "-")}</td>
          <td>${escapeHtml(item.roleLabel || "-")}</td>
          <td>${escapeHtml((item.zoneLabels || []).join(", ") || "-")}</td>
          <td>${escapeHtml(item.printedAt ? formatDateTimeForDisplay(item.printedAt) : "-")}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>Liste des impressions effectuées</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        body { margin: 0; font-family: Arial, sans-serif; color: #102936; }
        h1 { margin: 0 0 6mm; font-size: 20pt; }
        p { margin: 0 0 8mm; color: #4d6671; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 3mm; border-bottom: 0.4mm solid #d8e3e8; vertical-align: top; }
        th { text-transform: uppercase; font-size: 9pt; letter-spacing: 0.05em; color: #617985; }
        td { font-size: 10.5pt; }
      </style>
    </head>
    <body>
      <h1>Liste des impressions effectuées</h1>
      <p>${escapeHtml(`Total: ${items.length} badge(s)`)}</p>
      <table>
        <thead>
          <tr>
            <th>Personne</th>
            <th>Rôle badge</th>
            <th>Zones</th>
            <th>Imprimé le</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <script>
        window.onload = () => {
          window.print();
        };
      </script>
    </body>
  </html>`;
}

function toggleIdInList(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function formatZoneLabel(zone) {
  return `${zone.order}. ${zone.name}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildBadgePrintMarkup(items) {
  const pages = chunkItems(items, 4);

  const renderFrontBadge = (item) => `
    <article class="print-badge print-badge--front">
      <div class="print-badge__header">CMCM Luxembourg Indoor Meeting 2027</div>
      <div class="print-badge__role">${escapeHtml(item.role || "Accreditation")}</div>
      <div class="print-badge__name">${escapeHtml(item.name || " ")}</div>
      <div class="print-badge__zones">
        ${item.zoneLabels.map((zoneLabel) => `<span>${escapeHtml(zoneLabel)}</span>`).join("")}
      </div>
    </article>
  `;

  const renderBackBadge = (item) => `
    <article class="print-badge print-badge--back">
      <div class="print-badge__back-title">Zones d'acces</div>
      <div class="print-badge__back-role">${escapeHtml(item.role || "Accreditation")}</div>
      <ul class="print-badge__back-list">
        ${item.zoneLabels.map((zoneLabel) => `<li>${escapeHtml(zoneLabel)}</li>`).join("")}
      </ul>
    </article>
  `;

  const frontPages = pages
    .map(
      (page) => `
        <section class="print-sheet">
          ${page.map(renderFrontBadge).join("")}
        </section>
      `,
    )
    .join("");

  const backPages = pages
    .map(
      (page) => `
        <section class="print-sheet print-sheet--back">
          ${page.map(renderBackBadge).join("")}
        </section>
      `,
    )
    .join("");

  return `<!doctype html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>Impression accreditations</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          color: #111;
          background: #fff;
        }
        .print-sheet {
          min-height: 277mm;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          grid-template-rows: repeat(2, 1fr);
          gap: 8mm;
          page-break-after: always;
        }
        .print-sheet--back {
          break-before: page;
        }
        .print-badge {
          border: 1.2mm solid #d8b24a;
          border-radius: 8mm;
          overflow: hidden;
          min-height: 126mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 8mm;
          background:
            linear-gradient(110deg, rgba(235, 187, 55, 0.14), rgba(255, 255, 255, 0.98) 32%, rgba(235, 187, 55, 0.14)),
            #fff;
        }
        .print-badge--front {
          text-align: center;
        }
        .print-badge__header {
          font-size: 10pt;
          font-weight: 700;
          text-transform: uppercase;
          color: #7a692d;
          letter-spacing: 0.04em;
        }
        .print-badge__role {
          margin-top: 10mm;
          font-size: 22pt;
          line-height: 1.05;
          font-weight: 800;
          text-transform: uppercase;
          color: #d63b2f;
        }
        .print-badge__name {
          margin-top: 8mm;
          min-height: 20mm;
          font-size: 18pt;
          line-height: 1.1;
          font-weight: 800;
          text-transform: uppercase;
        }
        .print-badge__zones {
          margin-top: auto;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 3mm;
        }
        .print-badge__zones span,
        .print-badge__back-list li {
          border: 0.5mm solid #d7dee6;
          border-radius: 999px;
          padding: 1.7mm 3mm;
          font-size: 10pt;
          font-weight: 700;
          list-style: none;
        }
        .print-badge--back {
          background:
            linear-gradient(160deg, rgba(17, 55, 75, 0.94), rgba(17, 55, 75, 0.82)),
            #11374b;
          color: #fff;
        }
        .print-badge__back-title {
          font-size: 11pt;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.82);
        }
        .print-badge__back-role {
          margin-top: 8mm;
          font-size: 18pt;
          font-weight: 800;
          text-transform: uppercase;
        }
        .print-badge__back-list {
          margin: 10mm 0 0;
          padding: 0;
          display: grid;
          gap: 3mm;
        }
      </style>
    </head>
    <body>
      ${frontPages}
      ${backPages}
      <script>
        window.onload = () => {
          window.print();
        };
      </script>
    </body>
  </html>`;
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[columns[0].key]}-${index}`} className={row.__rowClass || ""}>
              {columns.map((column) => (
                <td key={column.key}>{row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VolunteersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tous");
  const [activeVolunteerView, setActiveVolunteerView] = useState("meeting");
  const [assignedRoleFilter, setAssignedRoleFilter] = useState("Tous");
  const [teamRoleFilter, setTeamRoleFilter] = useState("Tous");
  const [mailFilter, setMailFilter] = useState("Tous");
  const [selectedVolunteerId, setSelectedVolunteerId] = useState(null);
  const [volunteers, setVolunteers] = useState([]);
  const [teamRoleConfigs, setTeamRoleConfigs] = useState(defaultTeamRoles);
  const [rolePickerOpenByVolunteer, setRolePickerOpenByVolunteer] = useState({});
  const [primaryRoleEditorOpenByVolunteer, setPrimaryRoleEditorOpenByVolunteer] = useState({});
  const [statusEditorOpenByVolunteer, setStatusEditorOpenByVolunteer] = useState({});
  const [volunteerActionStatus, setVolunteerActionStatus] = useState("");
  const {
    applications: volunteerApplications,
    loading: volunteerApplicationsLoading,
    error: volunteerApplicationsError,
  } = useVolunteerApplicationsList(true);

  const roleOptions = useMemo(
    () => teamRoleConfigs.map((role) => role.roleName),
    [teamRoleConfigs],
  );

  useEffect(() => {
    setVolunteers(volunteerApplications.map((application) => mapVolunteerApplicationToAdminVolunteer(application)));
  }, [volunteerApplications]);

  useEffect(() => {
    setSelectedVolunteerId((current) =>
      current && volunteers.some((volunteer) => volunteer.id === current) ? current : null,
    );
  }, [volunteers]);

  useEffect(() => {
    const teamsConfigurationRef = doc(db, ...TEAM_CONFIGURATION_DOC_PATH);

    const unsubscribe = onSnapshot(
      teamsConfigurationRef,
      (snapshot) => {
        const nextRoles = snapshot.exists()
          ? normalizeTeamConfigurationPayload(snapshot.data()).roles
          : defaultTeamRoles;
        setTeamRoleConfigs(nextRoles);
      },
      () => {
        setTeamRoleConfigs(defaultTeamRoles);
      },
    );

    return unsubscribe;
  }, []);

  function getVolunteerAssignedRoles(volunteer) {
    return normalizeSubRoles(
      Array.isArray(volunteer.assignedRoles)
        ? volunteer.assignedRoles
        : volunteer.assignedRole
          ? [volunteer.assignedRole]
          : [],
    );
  }

  function getPrimaryAssignedRole(volunteer) {
    return getVolunteerAssignedRoles(volunteer)[0] || "";
  }

  function getSecondaryAssignedRoles(volunteer) {
    return getVolunteerAssignedRoles(volunteer).slice(1);
  }

  function getVolunteerTeamRoleAssignments(volunteer, assignedRoles = getVolunteerAssignedRoles(volunteer)) {
    const rawAssignments =
      volunteer?.teamRoleAssignments && typeof volunteer.teamRoleAssignments === "object"
        ? volunteer.teamRoleAssignments
        : {};
    const normalizedAssignments = {};

    assignedRoles.forEach((assignedRole, index) => {
      normalizedAssignments[assignedRole] =
        String(
          rawAssignments[assignedRole] ||
            (index === 0 ? volunteer.teamRole : "") ||
            "Bénévole",
        ) || "Bénévole";
    });

    return normalizedAssignments;
  }

  function getVolunteerTeamRoleForAssignedRole(volunteer, assignedRole) {
    return getVolunteerTeamRoleAssignments(volunteer)[assignedRole] || "Bénévole";
  }

  function getTeamConfigByRoleName(roleName) {
    return (
      teamRoleConfigs.find(
        (role) => role.roleName.trim().toLowerCase() === String(roleName || "").trim().toLowerCase(),
      ) ?? null
    );
  }

  function getVolunteerTeamRoleOptions(volunteer, assignedRole = getPrimaryAssignedRole(volunteer)) {
    return getAvailableTeamRoles(
      getTeamConfigByRoleName(assignedRole),
      [getVolunteerTeamRoleForAssignedRole(volunteer, assignedRole)],
    );
  }

  function buildVolunteerAssignmentPatch(volunteer, nextAssignedRoles) {
    const primaryRole = nextAssignedRoles[0] || "";
    const currentAssignments = getVolunteerTeamRoleAssignments(volunteer, getVolunteerAssignedRoles(volunteer));
    const nextTeamRoleAssignments = nextAssignedRoles.reduce((accumulator, assignedRole, index) => {
      const fallbackRole = index === 0 ? volunteer.teamRole : "Bénévole";
      accumulator[assignedRole] = String(currentAssignments[assignedRole] || fallbackRole || "Bénévole");
      return accumulator;
    }, {});
    const nextPrimaryTeamRole = primaryRole ? nextTeamRoleAssignments[primaryRole] || "Bénévole" : "Bénévole";
    const nextTeamRoleOptions = getAvailableTeamRoles(
      getTeamConfigByRoleName(primaryRole),
      [nextPrimaryTeamRole],
    );
    const nextWorkflowStatus =
      volunteer.workflowStatus === "Annulé"
        ? "Annulé"
        : primaryRole
          ? "Affecté"
          : "Candidature reçue";

    return {
      assignedRole: primaryRole,
      assignedRoles: nextAssignedRoles,
      workflowStatus: nextWorkflowStatus,
      teamRole: nextTeamRoleOptions.includes(nextPrimaryTeamRole) ? nextPrimaryTeamRole : "Bénévole",
      teamRoleAssignments: nextTeamRoleAssignments,
    };
  }

  const filteredVolunteers = useMemo(() => {
    return volunteers.filter((volunteer) => {
      const haystack = [
        volunteer.firstName,
        volunteer.lastName,
        volunteer.email,
        ...getVolunteerAssignedRoles(volunteer),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "Tous" || volunteer.workflowStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, volunteers]);

  const compactRoleOptions = useMemo(() => {
    return [...new Set(volunteers.flatMap((volunteer) => getVolunteerAssignedRoles(volunteer)))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [volunteers]);

  const compactTeamRoleOptions = useMemo(() => {
    return [
      ...new Set(
        volunteers.flatMap((volunteer) =>
          getVolunteerAssignedRoles(volunteer).map((assignedRole) =>
            getVolunteerTeamRoleForAssignedRole(volunteer, assignedRole),
          ),
        ),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [volunteers, teamRoleConfigs]);

  const compactAssignmentGroups = useMemo(() => {
    const sortedVolunteers = [...filteredVolunteers].sort((leftVolunteer, rightVolunteer) => {
      const lastNameComparison = String(leftVolunteer.lastName || "").localeCompare(
        String(rightVolunteer.lastName || ""),
        "fr",
        { sensitivity: "base" },
      );

      if (lastNameComparison !== 0) return lastNameComparison;

      const firstNameComparison = String(leftVolunteer.firstName || "").localeCompare(
        String(rightVolunteer.firstName || ""),
        "fr",
        { sensitivity: "base" },
      );

      if (firstNameComparison !== 0) return firstNameComparison;

      return String(leftVolunteer.id || "").localeCompare(String(rightVolunteer.id || ""));
    });

    return teamRoleConfigs
      .map((roleConfig) => {
        const members = sortedVolunteers.filter((volunteer) => {
          const assignedRoles = getVolunteerAssignedRoles(volunteer);
          if (!assignedRoles.includes(roleConfig.roleName)) return false;

          const teamRole = getVolunteerTeamRoleForAssignedRole(volunteer, roleConfig.roleName);
          const matchesTeamRole = teamRoleFilter === "Tous" || teamRole === teamRoleFilter;
          const matchesMail =
            mailFilter === "Tous" ||
            (mailFilter === "Informés" ? volunteer.teamEmailSent : !volunteer.teamEmailSent);

          return matchesTeamRole && matchesMail;
        });

        return {
          roleName: roleConfig.roleName,
          neededCount: Number(roleConfig.neededCount || 0),
          assignedCount: members.length,
          missingCount: Math.max(Number(roleConfig.neededCount || 0) - members.length, 0),
          members,
        };
      })
      .filter((group) => {
        const matchesAssignedRole =
          assignedRoleFilter === "Tous" || group.roleName === assignedRoleFilter;

        return matchesAssignedRole && (group.members.length > 0 || group.neededCount > 0);
      });
  }, [assignedRoleFilter, filteredVolunteers, mailFilter, teamRoleConfigs, teamRoleFilter]);

  const unassignedApplications = filteredVolunteers.filter(
    (volunteer) => volunteer.workflowStatus === "Candidature reçue" && getVolunteerAssignedRoles(volunteer).length === 0,
  );

  const assignedVolunteers = filteredVolunteers.filter(
    (volunteer) => volunteer.workflowStatus !== "Candidature reçue" || getVolunteerAssignedRoles(volunteer).length > 0,
  );
  const hideUnassignedBlock = search.trim() !== "" || statusFilter !== "Tous";

  const supportVolunteers = filteredVolunteers.filter(
    (volunteer) =>
      volunteer.supportAvailability &&
      volunteer.supportAvailability !== "Pas d'aide complémentaire indiquée",
  );

  const selectedVolunteer =
    volunteers.find((volunteer) => volunteer.id === selectedVolunteerId) ?? null;

  async function persistVolunteerPatch(id, patch) {
    setVolunteers((current) =>
      current.map((volunteer) => (volunteer.id === id ? { ...volunteer, ...patch } : volunteer)),
    );

    try {
      await updateDoc(doc(db, "volunteerApplications", id), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Impossible de mettre à jour la candidature bénévole.", error);
    }
  }

  function updateVolunteer(id, field, value) {
    setVolunteerActionStatus("");
    persistVolunteerPatch(id, { [field]: value });
  }

  function assignVolunteer(id, role) {
    setVolunteerActionStatus("");
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    const currentRoles = getVolunteerAssignedRoles(volunteer);
    const secondaryRoles = currentRoles.slice(1).filter((assignedRole) => assignedRole !== role);
    const nextAssignedRoles = role ? [role, ...secondaryRoles] : [];
    persistVolunteerPatch(id, buildVolunteerAssignmentPatch(volunteer, nextAssignedRoles));
  }

  function addVolunteerRole(id, role) {
    if (!role) return;
    setVolunteerActionStatus("");

    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    const currentRoles = getVolunteerAssignedRoles(volunteer);
    if (currentRoles.includes(role)) return;

    if (
      currentRoles.length >= 1 &&
      !window.confirm("Êtes-vous sûr de vouloir attribuer deux rôles à la même personne ?")
    ) {
      return;
    }

    persistVolunteerPatch(id, buildVolunteerAssignmentPatch(volunteer, [...currentRoles, role]));
    setRolePickerOpenByVolunteer((current) => ({ ...current, [id]: false }));
  }

  function removeVolunteerRole(id, role) {
    setVolunteerActionStatus("");
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    const nextAssignedRoles = getVolunteerAssignedRoles(volunteer).filter(
      (assignedRole) => assignedRole !== role,
    );

    persistVolunteerPatch(id, buildVolunteerAssignmentPatch(volunteer, nextAssignedRoles));
  }

  function updateVolunteerAssignedTeamRole(id, assignedRole, teamRole) {
    setVolunteerActionStatus("");
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    const assignedRoles = getVolunteerAssignedRoles(volunteer);
    const nextTeamRoleAssignments = {
      ...getVolunteerTeamRoleAssignments(volunteer, assignedRoles),
      [assignedRole]: teamRole,
    };
    const primaryRole = assignedRoles[0] || "";

    persistVolunteerPatch(id, {
      teamRoleAssignments: nextTeamRoleAssignments,
      teamRole: primaryRole ? nextTeamRoleAssignments[primaryRole] || "Bénévole" : "Bénévole",
    });
  }

  function toggleRolePicker(id) {
    setRolePickerOpenByVolunteer((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function togglePrimaryRoleEditor(id) {
    setPrimaryRoleEditorOpenByVolunteer((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function toggleStatusEditor(id) {
    setStatusEditorOpenByVolunteer((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function updateVolunteerStatus(id, nextStatus) {
    setVolunteerActionStatus("");
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    if (nextStatus === "Annulé" || nextStatus === "Candidature reçue") {
      persistVolunteerPatch(id, {
        workflowStatus: nextStatus,
        assignedRole: "",
        assignedRoles: [],
        teamRole: "Bénévole",
        teamRoleAssignments: {},
      });
      return;
    }

    persistVolunteerPatch(id, { workflowStatus: nextStatus });
  }

  async function markVolunteerInformed(id) {
    setVolunteerActionStatus("");
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;
    if (!getVolunteerAssignedRoles(volunteer).length) {
      setVolunteerActionStatus("Attribue d'abord un rôle au bénévole avant de l'informer.");
      return;
    }

    const nextVolunteer = {
      ...volunteer,
      workflowStatus: "Informé",
      teamEmailSent: true,
      assignmentStatus: volunteer.assignmentStatus || "Proposé",
    };

    try {
      await Promise.all([
        syncVolunteerAssignmentsToTeamConfiguration(nextVolunteer),
        syncVolunteerAssignmentToUserProfile(nextVolunteer),
        volunteer.email
          ? enqueueTransactionalMail(
              buildVolunteerRoleAssignmentMail({
                email: volunteer.email,
                firstName: volunteer.firstName,
                assignedRole: nextVolunteer.assignedRole,
                teamRole: nextVolunteer.teamRole,
              }),
            )
          : Promise.resolve(),
      ]);

      await persistVolunteerPatch(id, { workflowStatus: "Informé", teamEmailSent: true });
      setVolunteerActionStatus(`Le mail d'affectation a été préparé pour ${volunteer.firstName} ${volunteer.lastName}.`);
    } catch (error) {
      console.error("Impossible d'informer le bénévole.", error);
      setVolunteerActionStatus("L'envoi du mail ou la publication de l'affectation a échoué.");
    }
  }

  function updateSupportTask(id, slot, task) {
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    persistVolunteerPatch(id, {
      supportTasks: {
        ...(volunteer.supportTasks ?? {}),
        [slot]: task,
      },
    });
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Gestion des bénévoles</h1>
          <p>
            Tableau de travail pour relire les candidatures, attribuer un poste et distinguer la
            présence meeting du dimanche de l'aide autour de l'événement.
          </p>
        </div>
      </section>
      {volunteerApplicationsError ? <p className="status-note">{volunteerApplicationsError}</p> : null}
      {volunteerApplicationsLoading ? <p className="status-note">Chargement des candidatures bénévoles...</p> : null}
      {volunteerActionStatus ? <p className="status-note">{volunteerActionStatus}</p> : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span>Total bénévoles</span>
          <strong>{volunteers.length}</strong>
        </article>
        <article className="metric-card metric-card--warn">
          <span>Candidatures à traiter</span>
          <strong>
            {volunteers.filter((volunteer) => volunteer.workflowStatus !== "Confirmé").length}
          </strong>
        </article>
        <article className="metric-card metric-card--accent">
          <span>Affectés à un poste</span>
          <strong>
            {volunteers.filter((volunteer) => volunteer.workflowStatus === "Affecté").length}
          </strong>
        </article>
        <article className="metric-card metric-card--danger">
          <span>Confirmés</span>
          <strong>
            {volunteers.filter((volunteer) => volunteer.workflowStatus === "Confirmé").length}
          </strong>
        </article>
      </section>

      <Panel
        title={
          activeVolunteerView === "meeting"
            ? "Bénévoles - meeting"
            : activeVolunteerView === "assigned-posts"
              ? "Tous les postes attribués"
              : "Aide autour du meeting"
        }
        subtitle={
          activeVolunteerView === "meeting"
            ? "Filtrez les candidatures puis affectez directement chaque personne au bon rôle."
            : activeVolunteerView === "assigned-posts"
              ? "Vue compacte de type tableur avec une ligne par poste attribué pour filtrer, relire et ajuster rapidement les affectations."
              : "Suivez ici les personnes disponibles avant ou après le meeting pour le montage, la préparation ou l'aide logistique."
        }
      >
        <div className="admin-subtabs">
          <button
            className={`admin-subtab ${activeVolunteerView === "meeting" ? "admin-subtab--active" : ""}`}
            type="button"
            onClick={() => setActiveVolunteerView("meeting")}
          >
            Bénévoles - meeting ({filteredVolunteers.length})
          </button>
          <button
            className={`admin-subtab ${activeVolunteerView === "assigned-posts" ? "admin-subtab--active" : ""}`}
            type="button"
            onClick={() => setActiveVolunteerView("assigned-posts")}
          >
            Postes attribués (
            {compactAssignmentGroups.reduce((total, group) => total + group.members.length, 0)})
          </button>
          <button
            className={`admin-subtab ${activeVolunteerView === "support" ? "admin-subtab--active" : ""}`}
            type="button"
            onClick={() => setActiveVolunteerView("support")}
          >
            Aide autour du meeting ({supportVolunteers.length})
          </button>
        </div>

        <div className="admin-toolbar">
          <label className="field">
            <span>Recherche</span>
            <input
              placeholder="Nom, email, rôle..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Statut candidature</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>Tous</option>
              {volunteerWorkflowStatusOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          {activeVolunteerView === "assigned-posts" ? (
            <>
              <label className="field">
                <span>Poste attribué</span>
                <select value={assignedRoleFilter} onChange={(event) => setAssignedRoleFilter(event.target.value)}>
                  <option>Tous</option>
                  {compactRoleOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Rôle dans l'équipe</span>
                <select value={teamRoleFilter} onChange={(event) => setTeamRoleFilter(event.target.value)}>
                  <option>Tous</option>
                  {compactTeamRoleOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Mail équipe</span>
                <select value={mailFilter} onChange={(event) => setMailFilter(event.target.value)}>
                  <option>Tous</option>
                  <option>À informer</option>
                  <option>Informés</option>
                </select>
              </label>
            </>
          ) : null}
        </div>

        {selectedVolunteer ? (
          <div className="volunteer-detail-card">
            <div className="volunteer-detail-card__head">
              <div className="table-stack">
                <p className="eyebrow">Fiche bénévole</p>
                <h3>
                  {selectedVolunteer.firstName} {selectedVolunteer.lastName} ({selectedVolunteer.age} ans)
                </h3>
                <span className={getWorkflowStatusClass(selectedVolunteer.workflowStatus)}>
                  {selectedVolunteer.workflowStatus}
                </span>
              </div>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setSelectedVolunteerId(null)}
              >
                Fermer
              </button>
            </div>

            <div className="volunteer-detail-grid">
              <div>
                <strong>Contact</strong>
                <p>{selectedVolunteer.email}</p>
                <p>{selectedVolunteer.phone}</p>
              </div>
              <div>
                <strong>Langues</strong>
                <p>{selectedVolunteer.languages.join(", ")}</p>
              </div>
              <div>
                <strong>Rôle meeting</strong>
                <p>{getVolunteerAssignedRoles(selectedVolunteer).join(", ") || "Non attribué"}</p>
              </div>
              <div>
                <strong>Rôle dans l'équipe</strong>
                <p>
                  {getVolunteerAssignedRoles(selectedVolunteer)
                    .map(
                      (assignedRole) =>
                        `${assignedRole}: ${getVolunteerTeamRoleForAssignedRole(selectedVolunteer, assignedRole)}`,
                    )
                    .join(", ") || "Non attribué"}
                </p>
              </div>
              <div>
                <strong>Meeting dimanche</strong>
                <p>{selectedVolunteer.sundayAvailability}</p>
              </div>
              <div>
                <strong>Aide autour du meeting</strong>
                <p>{selectedVolunteer.supportAvailability}</p>
              </div>
            </div>

            <div className="volunteer-detail-notes">
              <strong>Notes</strong>
              <p>{selectedVolunteer.notes}</p>
            </div>
          </div>
        ) : null}

        {activeVolunteerView === "meeting" ? (
          <>
            {!hideUnassignedBlock ? (
              <div className="section-stack">
                <div className="section-intro">
                  <h3>Candidatures reçues non affectées</h3>
                  <p>
                    Ces bénévoles ont reçu le mail automatique de confirmation de candidature et de
                    création de compte. L'étape suivante consiste à les affecter en interne.
                  </p>
                </div>

                <div className="table-wrap">
                  <table className="data-table data-table--admin">
                    <thead>
                      <tr>
                        <th>Bénévole</th>
                        <th>Coordonnées</th>
                        <th>Langues</th>
                        <th>Statut</th>
                        <th>Rôle à attribuer</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unassignedApplications.map((volunteer) => (
                        <tr key={volunteer.id}>
                          <td>
                            <div className="table-stack">
                              <button
                                className="name-link-button"
                                type="button"
                                onClick={() => setSelectedVolunteerId(volunteer.id)}
                              >
                                {volunteer.firstName} {volunteer.lastName} ({volunteer.age} ans)
                              </button>
                              <span className={getWorkflowStatusClass(volunteer.workflowStatus)}>
                                {volunteer.workflowStatus}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="table-stack">
                              <span>{volunteer.email}</span>
                              <span>{volunteer.phone}</span>
                            </div>
                          </td>
                          <td>{volunteer.languages.join(", ")}</td>
                          <td>{volunteer.accountEmailSent ? "Compte + mail envoyés" : "À envoyer"}</td>
                          <td>
                            <select
                              value={getPrimaryAssignedRole(volunteer)}
                              onChange={(event) => assignVolunteer(volunteer.id, event.target.value)}
                            >
                              <option value="">Choisir un rôle</option>
                              {roleOptions.map((option) => (
                                <option key={option}>{option}</option>
                              ))}
                            </select>
                          </td>
                          <td>{volunteer.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="section-stack">
              <div className="section-intro">
                <h3>Bénévoles affectés ou en cours d'information</h3>
                <p>
                  En interne, l'affectation ne déclenche rien et le statut passe en jaune. Une fois
                  l'équipe complète, vous pouvez envoyer le mail manuellement à tout le groupe ou à une
                  seule personne.
                </p>
              </div>

              <div className="table-wrap">
                <table className="data-table data-table--admin">
                  <thead>
                    <tr>
                      <th>Bénévole</th>
                      <th>Coordonnées</th>
                      <th>Langues</th>
                      <th>Statut</th>
                      <th>Rôle attribué</th>
                      <th>Rôle dans l'équipe</th>
                      <th>Action mail</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedVolunteers.map((volunteer) => (
                      <tr key={volunteer.id}>
                        <td>
                          <div className="table-stack">
                            <button
                              className="name-link-button"
                              type="button"
                              onClick={() => setSelectedVolunteerId(volunteer.id)}
                            >
                              {volunteer.firstName} {volunteer.lastName} ({volunteer.age} ans)
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="table-stack">
                            <span>{volunteer.email}</span>
                            <span>{volunteer.phone}</span>
                          </div>
                        </td>
                        <td>{volunteer.languages.join(", ")}</td>
                        <td>
                          <div className="status-cell">
                            {!statusEditorOpenByVolunteer[volunteer.id] ? (
                              <div className="inline-status-display">
                                <span className={getWorkflowStatusClass(volunteer.workflowStatus)}>
                                  {volunteer.workflowStatus}
                                </span>
                                <button
                                  className="inline-role-display__button"
                                  type="button"
                                  onClick={() => toggleStatusEditor(volunteer.id)}
                                  aria-label={`Modifier le statut de ${volunteer.firstName} ${volunteer.lastName}`}
                                >
                                  ↻
                                </button>
                              </div>
                            ) : (
                              <select
                                value={volunteer.workflowStatus}
                                onChange={(event) => {
                                  updateVolunteerStatus(volunteer.id, event.target.value);
                                  setStatusEditorOpenByVolunteer((current) => ({
                                    ...current,
                                    [volunteer.id]: false,
                                  }));
                                }}
                                onBlur={() =>
                                  setStatusEditorOpenByVolunteer((current) => ({
                                    ...current,
                                    [volunteer.id]: false,
                                  }))
                                }
                              >
                                {volunteerWorkflowStatusOptions.map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="role-assignment-cell">
                            <div className="role-assignment-cell__top">
                              {getPrimaryAssignedRole(volunteer) && !primaryRoleEditorOpenByVolunteer[volunteer.id] ? (
                                <div className="inline-role-display">
                                  <strong>{getPrimaryAssignedRole(volunteer)}</strong>
                                  <button
                                    className="inline-role-display__button"
                                    type="button"
                                    disabled={volunteer.workflowStatus === "Annulé"}
                                    onClick={() => togglePrimaryRoleEditor(volunteer.id)}
                                    aria-label={`Changer le rôle principal de ${volunteer.firstName} ${volunteer.lastName}`}
                                  >
                                    ↻
                                  </button>
                                  {roleOptions.filter((option) => !getVolunteerAssignedRoles(volunteer).includes(option))
                                    .length > 0 && !rolePickerOpenByVolunteer[volunteer.id] ? (
                                    <button
                                      className="inline-add-role__button"
                                      type="button"
                                      disabled={volunteer.workflowStatus === "Annulé"}
                                      onClick={() => toggleRolePicker(volunteer.id)}
                                      aria-label={`Ajouter un rôle à ${volunteer.firstName} ${volunteer.lastName}`}
                                    >
                                      +
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <select
                                  value={getPrimaryAssignedRole(volunteer)}
                                  disabled={volunteer.workflowStatus === "Annulé"}
                                  onChange={(event) => {
                                    assignVolunteer(volunteer.id, event.target.value);
                                    setPrimaryRoleEditorOpenByVolunteer((current) => ({
                                      ...current,
                                      [volunteer.id]: false,
                                    }));
                                  }}
                                  onBlur={() =>
                                    setPrimaryRoleEditorOpenByVolunteer((current) => ({
                                      ...current,
                                      [volunteer.id]: false,
                                    }))
                                  }
                                >
                                  <option value="">Aucun</option>
                                  {roleOptions.map((option) => (
                                    <option key={option}>{option}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                            {getSecondaryAssignedRoles(volunteer).length > 0 ? (
                              <div className="team-subrole-list">
                                {getSecondaryAssignedRoles(volunteer).map((assignedRole) => (
                                  <button
                                    key={`${volunteer.id}-${assignedRole}`}
                                    className="team-subrole-chip"
                                    type="button"
                                    onClick={() => removeVolunteerRole(volunteer.id, assignedRole)}
                                  >
                                    {assignedRole} ×
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            {roleOptions.filter((option) => !getVolunteerAssignedRoles(volunteer).includes(option))
                              .length > 0 ? (
                              <div className="inline-add-role">
                                {rolePickerOpenByVolunteer[volunteer.id] ? (
                                  <select
                                    autoFocus
                                    defaultValue=""
                                    disabled={volunteer.workflowStatus === "Annulé"}
                                    onChange={(event) => addVolunteerRole(volunteer.id, event.target.value)}
                                    onBlur={() =>
                                      setRolePickerOpenByVolunteer((current) => ({
                                        ...current,
                                        [volunteer.id]: false,
                                      }))
                                    }
                                  >
                                    <option value="">Ajouter un rôle</option>
                                    {roleOptions
                                      .filter((option) => !getVolunteerAssignedRoles(volunteer).includes(option))
                                      .map((option) => (
                                        <option key={`${volunteer.id}-extra-${option}`}>{option}</option>
                                      ))}
                                  </select>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="table-stack">
                            {getVolunteerAssignedRoles(volunteer).map((assignedRole) => (
                              <label key={`${volunteer.id}-${assignedRole}-team-role`} className="support-task-row">
                                <span>{assignedRole}</span>
                                <select
                                  value={getVolunteerTeamRoleForAssignedRole(volunteer, assignedRole)}
                                  onChange={(event) =>
                                    updateVolunteerAssignedTeamRole(
                                      volunteer.id,
                                      assignedRole,
                                      event.target.value,
                                    )
                                  }
                                >
                                  {getVolunteerTeamRoleOptions(volunteer, assignedRole).map((teamRole) => (
                                    <option key={`${volunteer.id}-${assignedRole}-team-role-${teamRole}`}>
                                      {teamRole}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="button button--secondary"
                              type="button"
                              onClick={() => markVolunteerInformed(volunteer.id)}
                            >
                              Informer le bénévole
                            </button>
                            <span>{volunteer.teamEmailSent ? "Déjà informé" : "À informer"}</span>
                          </div>
                        </td>
                        <td>{volunteer.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : activeVolunteerView === "assigned-posts" ? (
          <div className="section-stack">
            <div className="section-intro">
              <h3>Vue compacte des affectations</h3>
              <p>
                Chaque bloc correspond à un rôle avec le besoin, le nombre déjà attribué et le
                manque restant, puis les bénévoles affectés triés par nom de famille.
              </p>
            </div>

            <div className="table-wrap table-wrap--compact">
              <table className="data-table data-table--admin data-table--compact">
                <thead>
                  <tr>
                    <th>Rôle / Bénévole</th>
                    <th>Besoin</th>
                    <th>Attribués</th>
                    <th>Manque</th>
                    <th>Poste</th>
                    <th>Rôle équipe</th>
                    <th>Statut</th>
                    <th>Mail</th>
                    <th>Dimanche</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {compactAssignmentGroups.map((group) => (
                    <Fragment key={group.roleName}>
                      <tr className="compact-group-row">
                        <td>
                          <strong>{group.roleName}</strong>
                        </td>
                        <td>{group.neededCount}</td>
                        <td>{group.assignedCount}</td>
                        <td>{group.missingCount}</td>
                        <td colSpan={6}>
                          {group.missingCount > 0
                            ? `${group.missingCount} personne(s) encore à trouver`
                            : "Équipe complète"}
                        </td>
                      </tr>
                      {group.members.map((volunteer) => (
                        <tr key={`${group.roleName}-${volunteer.id}`}>
                          <td>
                            <div className="compact-volunteer-cell">
                              <button
                                className="name-link-button"
                                type="button"
                                onClick={() => setSelectedVolunteerId(volunteer.id)}
                              >
                                {volunteer.lastName} {volunteer.firstName}
                              </button>
                              <span>{volunteer.age} ans</span>
                            </div>
                          </td>
                          <td />
                          <td />
                          <td />
                          <td>{group.roleName}</td>
                          <td>{getVolunteerTeamRoleForAssignedRole(volunteer, group.roleName)}</td>
                          <td>{volunteer.workflowStatus}</td>
                          <td>{volunteer.teamEmailSent ? "Informé" : "À informer"}</td>
                          <td>{volunteer.sundayAvailability}</td>
                          <td>{volunteer.notes}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="section-stack">
            <div className="section-intro">
              <h3>Bénévoles disponibles autour du meeting</h3>
              <p>
                Cette vue regroupe les disponibilités complémentaires avant et après le meeting. Une
                même personne peut être disponible sur plusieurs créneaux.
              </p>
            </div>

            <div className="table-wrap">
              <table className="data-table data-table--admin">
                <thead>
                  <tr>
                    <th>Bénévole</th>
                    <th>Coordonnées</th>
                    <th>Langues</th>
                    <th>Statut</th>
                    <th>Rôle meeting</th>
                    <th>Disponibilités complémentaires</th>
                    <th>Tâches par disponibilité</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {supportVolunteers.map((volunteer) => (
                    <tr key={volunteer.id}>
                      <td>
                        <div className="table-stack">
                          <button
                            className="name-link-button"
                            type="button"
                            onClick={() => setSelectedVolunteerId(volunteer.id)}
                          >
                            {volunteer.firstName} {volunteer.lastName} ({volunteer.age} ans)
                          </button>
                          <span className={getWorkflowStatusClass(volunteer.workflowStatus)}>
                            {volunteer.workflowStatus}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-stack">
                          <span>{volunteer.email}</span>
                          <span>{volunteer.phone}</span>
                        </div>
                      </td>
                      <td>{volunteer.languages.join(", ")}</td>
                      <td>{volunteer.workflowStatus}</td>
                      <td>{volunteer.assignedRole || "Non attribué"}</td>
                      <td>
                        <div className="support-slot-list">
                          {volunteer.supportAvailability.split(",").map((slot) => (
                            <span key={`${volunteer.id}-${slot.trim()}`} className="support-slot-tag">
                              {slot.trim()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="support-task-grid">
                          {volunteer.supportAvailability.split(",").map((slot) => {
                            const normalizedSlot = slot.trim();

                            return (
                              <label key={`${volunteer.id}-task-${normalizedSlot}`} className="support-task-row">
                                <span>{normalizedSlot}</span>
                                <select
                                  value={volunteer.supportTasks?.[normalizedSlot] ?? ""}
                                  onChange={(event) =>
                                    updateSupportTask(volunteer.id, normalizedSlot, event.target.value)
                                  }
                                >
                                  <option value="">Choisir une tâche</option>
                                  {supportTaskOptions.map((option) => (
                                    <option key={option}>{option}</option>
                                  ))}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      </td>
                      <td>{volunteer.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function TeamsPage() {
  const {
    applications: volunteerApplications,
    loading: volunteerApplicationsLoading,
    error: volunteerApplicationsError,
  } = useVolunteerApplicationsList(true);
  const [roles, setRoles] = useState(defaultTeamRoles);
  const [selectedRoleId, setSelectedRoleId] = useState(defaultTeamRoles[0]?.id ?? "");
  const [activeTeamTab, setActiveTeamTab] = useState("configuration");
  const [memberSearch, setMemberSearch] = useState("");
  const [teamAssignments, setTeamAssignments] = useState(defaultTeamAssignments);
  const [supportTasks, setSupportTasks] = useState(() => normalizeTeamConfigurationPayload({}).supportTasks);
  const [subRoleDraft, setSubRoleDraft] = useState("");
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsStatus, setTeamsStatus] = useState("");
  const lastPersistedTeamsRef = useRef("");
  const teamsReadyRef = useRef(false);

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const availableVolunteers = useMemo(
    () => volunteerApplications.map((application) => mapVolunteerApplicationToAdminVolunteer(application)),
    [volunteerApplications],
  );

  useEffect(() => {
    if (!availableVolunteers.length) return;

    const volunteerByIdentity = new Map();

    availableVolunteers.forEach((volunteer) => {
      const stableId = getVolunteerStableId(volunteer);
      const fullName = `${volunteer.firstName} ${volunteer.lastName}`.trim().toLowerCase();
      const email = String(volunteer.email || "").trim().toLowerCase();

      [stableId, email, fullName]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
        .forEach((value) => volunteerByIdentity.set(value, volunteer));
    });

    setTeamAssignments((current) => {
      let hasChanges = false;
      const nextAssignments = current
        .map((member) => {
          const matchedVolunteer =
            volunteerByIdentity.get(String(member.id || "").trim().toLowerCase()) ||
            volunteerByIdentity.get(String(member.email || "").trim().toLowerCase()) ||
            volunteerByIdentity.get(`${member.firstName} ${member.lastName}`.trim().toLowerCase());

          if (!matchedVolunteer) {
            if (isLegacySeedAssignment(member)) {
              hasChanges = true;
              return null;
            }

            return member;
          }

          const stableId = getVolunteerStableId(matchedVolunteer);
          const nextMember = {
            ...member,
            assignmentEntryId:
              member.assignmentEntryId ||
              (stableId && member.assignedRoleId ? `${stableId}::${member.assignedRoleId}` : ""),
            id: stableId,
            firstName: matchedVolunteer.firstName,
            lastName: matchedVolunteer.lastName,
            email: matchedVolunteer.email,
            phone: matchedVolunteer.phone,
            languages: matchedVolunteer.languages,
            workflowStatus: matchedVolunteer.workflowStatus,
          };

          if (JSON.stringify(nextMember) !== JSON.stringify(member)) {
            hasChanges = true;
          }

          return nextMember;
        })
        .filter(Boolean);

      return hasChanges ? nextAssignments : current;
    });
  }, [availableVolunteers]);

  useEffect(() => {
    const teamsConfigurationRef = doc(db, ...TEAM_CONFIGURATION_DOC_PATH);

    const unsubscribe = onSnapshot(
      teamsConfigurationRef,
      (snapshot) => {
        const nextData = snapshot.exists()
          ? normalizeTeamConfigurationPayload(snapshot.data())
          : {
              roles: defaultTeamRoles,
              teamAssignments: defaultTeamAssignments,
              supportTasks: normalizeTeamConfigurationPayload({}).supportTasks,
            };
        const serializedPayload = JSON.stringify(nextData);

        lastPersistedTeamsRef.current = serializedPayload;
        teamsReadyRef.current = true;
        setRoles(nextData.roles);
        setTeamAssignments(nextData.teamAssignments);
        setSupportTasks(nextData.supportTasks);
        setSelectedRoleId((current) =>
          nextData.roles.some((role) => role.id === current) ? current : nextData.roles[0]?.id ?? "",
        );
        setTeamsLoading(false);
        setTeamsStatus("");
      },
      () => {
        teamsReadyRef.current = true;
        setTeamsLoading(false);
        setTeamsStatus("Impossible de synchroniser les équipes pour le moment.");
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!teamsReadyRef.current) return;

    const payload = {
      roles,
      teamAssignments,
      supportTasks,
    };
    const serializedPayload = JSON.stringify(payload);

    if (serializedPayload === lastPersistedTeamsRef.current) {
      return;
    }

    let cancelled = false;

    setTeamsStatus("Enregistrement des équipes...");

    setDoc(
      doc(db, ...TEAM_CONFIGURATION_DOC_PATH),
      {
        ...payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
      .then(() => {
        if (cancelled) return;
        lastPersistedTeamsRef.current = serializedPayload;
        setTeamsStatus("Équipes enregistrées.");
      })
      .catch(() => {
        if (cancelled) return;
        setTeamsStatus("L'enregistrement des équipes a échoué. Réessayez dans un instant.");
      });

    return () => {
      cancelled = true;
    };
  }, [roles, teamAssignments, supportTasks]);

  const roleStats = useMemo(
    () =>
      roles.map((role) => {
        const members = teamAssignments.filter((member) => member.assignedRoleId === role.id);
        const leaders = members.filter((member) => member.teamRole === "Chef d'équipe").length;
        const replacements = members.filter((member) => member.teamRole === "Remplaçant").length;
        const activeMembers = members.filter((member) => member.teamRole !== "Remplaçant").length;
        const remaining = Math.max(role.neededCount - activeMembers, 0);
        const leadGap = Math.max(role.expectedLeadCount - leaders, 0);

        return {
          roleName: role.roleName,
          neededCount: role.neededCount,
          expectedLeadCount: role.expectedLeadCount,
          activeMembers,
          leaders,
          replacements,
          remaining,
          leadGap,
          status:
            remaining === 0 && leadGap === 0
              ? "Objectif idéal atteint"
              : `${remaining} pers. et ${leadGap} chef(s) manquants à l'idéal`,
        };
      }),
    [roles, teamAssignments],
  );

  const selectedRoleMembers = useMemo(
    () => teamAssignments.filter((member) => member.assignedRoleId === selectedRole?.id),
    [selectedRole, teamAssignments],
  );

  const selectedRoleSubRoleCounts = useMemo(() => {
    if (!selectedRole) return [];

    return selectedRole.subRoles
      .map((subRole) => ({
        subRole,
        count: selectedRoleMembers.filter((member) => member.teamRole === subRole).length,
      }))
      .filter((item) => item.count > 0);
  }, [selectedRole, selectedRoleMembers]);

  const candidateResults = useMemo(() => {
    if (!selectedRole) {
      return [];
    }

    const normalizedSearch = memberSearch.trim().toLowerCase();

    return availableVolunteers
      .filter((volunteer) => {
        const haystack = `${volunteer.firstName} ${volunteer.lastName} ${volunteer.email}`.toLowerCase();
        return normalizedSearch ? haystack.includes(normalizedSearch) : true;
      })
      .filter(
        (volunteer) =>
          !selectedRoleMembers.some((member) => member.id === getVolunteerStableId(volunteer)),
      )
      .slice(0, 6);
  }, [availableVolunteers, memberSearch, selectedRole, selectedRoleMembers]);

  const roleSpecificVolunteerOptions = useMemo(
    () =>
      availableVolunteers.filter(
        (volunteer) => !selectedRoleMembers.some((member) => member.id === getVolunteerStableId(volunteer)),
      ),
    [availableVolunteers, selectedRoleMembers],
  );

  function updateRole(field, value) {
    setRoles((current) =>
      current.map((role) =>
        role.id === selectedRole.id ? { ...role, [field]: value } : role,
      ),
    );
  }

  function updateRoleName(value) {
    setRoles((current) =>
      current.map((role) => (role.id === selectedRole.id ? { ...role, roleName: value } : role)),
    );
    setTeamAssignments((current) =>
      current.map((member) =>
        member.assignedRoleId === selectedRole.id ? { ...member, assignedRole: value } : member,
      ),
    );
  }

  function toggleRoleLanguage(language) {
    const languages = selectedRole.requiredLanguages.includes(language)
      ? selectedRole.requiredLanguages.filter((item) => item !== language)
      : [...selectedRole.requiredLanguages, language];

    updateRole("requiredLanguages", languages);
  }

  function updateRoleShiftBoundary(boundary, value) {
    const [start = "", end = ""] = String(selectedRole.shiftTime || "").split(" - ");
    const nextShiftTime = boundary === "start" ? `${value} - ${end}` : `${start} - ${value}`;
    updateRole("shiftTime", nextShiftTime.trim());
  }

  function updateMemberRole(assignmentEntryId, teamRole) {
    setTeamAssignments((current) =>
      current.map((member) =>
        member.assignmentEntryId === assignmentEntryId ? { ...member, teamRole } : member,
      ),
    );
  }

  function addSubRole() {
    const nextSubRole = subRoleDraft.trim();

    if (!selectedRole || !nextSubRole) return;
    if (defaultTeamRoleOptions.some((roleOption) => roleOption.toLowerCase() === nextSubRole.toLowerCase())) {
      return;
    }
    if (selectedRole.subRoles.some((subRole) => subRole.toLowerCase() === nextSubRole.toLowerCase())) {
      return;
    }

    updateRole("subRoles", [...selectedRole.subRoles, nextSubRole]);
    setSubRoleDraft("");
  }

  function removeSubRole(subRoleToRemove) {
    if (!selectedRole) return;

    updateRole(
      "subRoles",
      selectedRole.subRoles.filter((subRole) => subRole !== subRoleToRemove),
    );
  }

  function addRole() {
    const existingNames = new Set(roles.map((role) => role.roleName.trim().toLowerCase()));
    let suffix = roles.length + 1;
    let roleName = `Nouvelle équipe ${suffix}`;

    while (existingNames.has(roleName.trim().toLowerCase())) {
      suffix += 1;
      roleName = `Nouvelle équipe ${suffix}`;
    }

    const nextRole = {
      id: `role-${Date.now()}`,
      roleName,
      neededCount: 1,
      expectedLeadCount: 1,
      requiredLanguages: [],
      briefingTime: "",
      setupTime: "",
      shiftTime: "",
      leaderName: "",
      leaderContact: "",
      allowLeaderDocuments: false,
      teamInfo: "",
      teamInfoPlaceholder: "Décrivez ici les consignes, missions et informations utiles pour cette équipe.",
      documents: [],
      subRoles: [],
    };

    setRoles((current) => [...current, nextRole]);
    setSelectedRoleId(nextRole.id);
    setMemberSearch("");
  }

  function addMemberToSelectedRole(volunteer) {
    const volunteerId = getVolunteerStableId(volunteer);
    if (!volunteerId) return;

    setTeamAssignments((current) => {
      const existingMember = current.find(
        (member) => member.id === volunteerId && member.assignedRoleId === selectedRole.id,
      );

      if (existingMember) {
        return current;
      }

      return [
        ...current,
        {
          assignmentEntryId: `${volunteerId}::${selectedRole.id}`,
          id: volunteerId,
          firstName: volunteer.firstName,
          lastName: volunteer.lastName,
          email: volunteer.email,
          phone: volunteer.phone,
          languages: volunteer.languages,
          workflowStatus: volunteer.workflowStatus,
          assignedRoleId: selectedRole.id,
          assignedRole: selectedRole.roleName,
          teamRole: "Bénévole",
        },
      ];
    });
    setMemberSearch("");
  }

  function removeMemberFromSelectedRole(assignmentEntryId) {
    setTeamAssignments((current) =>
      current.filter((member) => member.assignmentEntryId !== assignmentEntryId),
    );
  }

  function addSupportTask() {
    setSupportTasks((current) => [
      ...current,
      {
        id: `support-task-${Date.now()}`,
        day: "Vendredi",
        startTime: "",
        endTime: "",
        taskLabel: supportTaskOptions[0] || "",
      },
    ]);
  }

  function updateSupportTaskConfig(taskId, field, value) {
    setSupportTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, [field]: value } : task)),
    );
  }

  function removeSupportTask(taskId) {
    setSupportTasks((current) => current.filter((task) => task.id !== taskId));
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Gestion des équipes</h1>
          <p>
            Paramétrez ici chaque rôle opérationnel: besoin, langues, horaires et informations à
            transmettre à l'équipe.
          </p>
        </div>
      </section>
      {volunteerApplicationsError ? <p className="status-note">{volunteerApplicationsError}</p> : null}
      <div className="admin-subtabs">
        <button
          className={`admin-subtab ${activeTeamTab === "configuration" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveTeamTab("configuration")}
        >
          Paramétrage & composition
        </button>
        <button
          className={`admin-subtab ${activeTeamTab === "overview" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveTeamTab("overview")}
        >
          Récapitulatif équipes
        </button>
        <button
          className={`admin-subtab ${activeTeamTab === "support" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveTeamTab("support")}
        >
          Autour du meeting
        </button>
      </div>

      {activeTeamTab === "configuration" ? (
        selectedRole ? (
          <section className="admin-stack">
            {teamsLoading || volunteerApplicationsLoading ? (
              <p className="status-note">Chargement des équipes...</p>
            ) : null}
            {teamsStatus ? <p className="status-note">{teamsStatus}</p> : null}
            <div className="admin-toolbar">
              <div className="team-toolbar-main">
                <label className="field">
                  <span>Équipe</span>
                  <select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.roleName}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button button--primary" type="button" onClick={addRole}>
                  Ajouter une équipe
                </button>
              </div>

              <div className="team-selection-summary" aria-live="polite">
                <div className="team-summary-pill">
                  <strong>{selectedRole.neededCount}</strong>
                  <span>Personnes attendues</span>
                </div>
                <div className="team-summary-pill">
                  <strong>{selectedRole.expectedLeadCount}</strong>
                  <span>Chefs attendus</span>
                </div>
                <div className="team-summary-pill">
                  <strong>{selectedRoleMembers.length}</strong>
                  <span>Déjà affectées</span>
                </div>
                <div className="team-summary-pill">
                  <strong>{Math.max(selectedRole.neededCount - selectedRoleMembers.length, 0)}</strong>
                  <span>Écart à l'idéal</span>
                </div>
              </div>
            </div>

            <Panel
              title="Équipes disponibles"
              subtitle="Choisissez l'équipe à configurer depuis cette liste ou le menu déroulant."
            >
              <div className="role-chip-grid">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    className={`role-chip ${selectedRoleId === role.id ? "role-chip--active" : ""}`}
                    type="button"
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <strong>{role.roleName}</strong>
                    <span>
                      {role.neededCount} pers. idéales • {role.expectedLeadCount} chef(s)
                    </span>
                  </button>
                ))}
              </div>
            </Panel>

            <div className="admin-stack">
              <Panel
                title="Paramétrage des affectations"
                subtitle="Définissez ici les volumes idéaux, les sous-rôles, les langues attendues et les horaires d'équipe."
              >
                <div className="field-grid">
                  <AuthFormField label="Nom du rôle">
                    <input
                      value={selectedRole.roleName}
                      onChange={(event) => updateRoleName(event.target.value)}
                    />
                  </AuthFormField>
                  <AuthFormField label="Nombre de personnes attendues (idéal)">
                    <input
                      type="number"
                      min="0"
                      value={selectedRole.neededCount}
                      onChange={(event) => updateRole("neededCount", Number(event.target.value))}
                    />
                  </AuthFormField>
                  <AuthFormField label="Nombre de chefs d'équipe attendus (idéal)">
                    <input
                      type="number"
                      min="0"
                      value={selectedRole.expectedLeadCount}
                      onChange={(event) => updateRole("expectedLeadCount", Number(event.target.value))}
                    />
                  </AuthFormField>
                </div>

                <div className="field">
                  <span>Sous-rôles dans l'équipe</span>
                  <div className="team-subrole-editor">
                    <input
                      placeholder="Ex. Responsable matériel"
                      value={subRoleDraft}
                      onChange={(event) => setSubRoleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSubRole();
                        }
                      }}
                    />
                    <button className="button button--secondary" type="button" onClick={addSubRole}>
                      Ajouter le sous-rôle
                    </button>
                  </div>
                  <small>
                    Ces nombres et sous-rôles servent de repère idéal uniquement. Ils ne bloquent aucune affectation.
                  </small>
                  <div className="team-subrole-list">
                    {selectedRole.subRoles.length > 0 ? (
                      selectedRole.subRoles.map((subRole) => (
                        <button
                          key={`${selectedRole.id}-${subRole}`}
                          className="team-subrole-chip"
                          type="button"
                          onClick={() => removeSubRole(subRole)}
                        >
                          {subRole} ×
                        </button>
                      ))
                    ) : (
                      <span className="team-subrole-empty">Aucun sous-rôle défini pour l'instant.</span>
                    )}
                  </div>
                </div>

                <div className="field">
                  <span>Conditions de langue</span>
                  <div className="choice-grid choice-grid--2">
                    {["Français", "Anglais", "Allemand", "Luxembourgeois"].map((language) => (
                      <label key={language} className="selection-card selection-card--compact">
                        <input
                          checked={selectedRole.requiredLanguages.includes(language)}
                          type="checkbox"
                          onChange={() => toggleRoleLanguage(language)}
                        />
                        <div>
                          <strong>{language}</strong>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="field-grid">
                  <AuthFormField label="Horaire du briefing">
                    <input
                      type="time"
                      value={selectedRole.briefingTime}
                      onChange={(event) => updateRole("briefingTime", event.target.value)}
                    />
                  </AuthFormField>
                  <AuthFormField label="Horaire de mise en place">
                    <input
                      type="time"
                      value={selectedRole.setupTime}
                      onChange={(event) => updateRole("setupTime", event.target.value)}
                    />
                  </AuthFormField>
                </div>

                <div className="field-grid">
                  <AuthFormField label="Début du poste">
                    <input
                      type="time"
                      value={String(selectedRole.shiftTime || "").split(" - ")[0] || ""}
                      onChange={(event) => updateRoleShiftBoundary("start", event.target.value)}
                    />
                  </AuthFormField>
                  <AuthFormField label="Fin du poste">
                    <input
                      type="time"
                      value={String(selectedRole.shiftTime || "").split(" - ")[1] || ""}
                      onChange={(event) => updateRoleShiftBoundary("end", event.target.value)}
                    />
                  </AuthFormField>
                </div>

                <AuthFormField label="Information générale pour l'équipe">
                  <textarea
                    rows="4"
                    value={selectedRole.teamInfo}
                    placeholder={selectedRole.teamInfoPlaceholder || "Informations générales pour l'équipe"}
                    onChange={(event) => updateRole("teamInfo", event.target.value)}
                  />
                </AuthFormField>

                <div className="admin-preview">
                  <div>
                    <strong>Résumé du rôle</strong>
                    <p>{selectedRole.roleName}</p>
                  </div>
                  <div>
                    <strong>Objectif idéal</strong>
                    <p>
                      {selectedRole.neededCount} personnes dont {selectedRole.expectedLeadCount} chef(s)
                      d'équipe
                    </p>
                  </div>
                  <div>
                    <strong>Langues</strong>
                    <p>{selectedRole.requiredLanguages.join(", ") || "Aucune condition"}</p>
                  </div>
                  <div>
                    <strong>Horaires</strong>
                    <p>
                      Briefing {selectedRole.briefingTime}, mise en place {selectedRole.setupTime},
                      poste {selectedRole.shiftTime}
                    </p>
                  </div>
                  <div>
                    <strong>Informations équipe</strong>
                    <p>{selectedRole.teamInfo || selectedRole.teamInfoPlaceholder || "Non renseigné"}</p>
                  </div>
                  <div>
                    <strong>Sous-rôles</strong>
                    <p>{selectedRole.subRoles.join(", ") || "Aucun sous-rôle"}</p>
                  </div>
                </div>
              </Panel>

              <Panel
                title={`Composition actuelle - ${selectedRole.roleName}`}
                subtitle="Chefs d'équipe, bénévoles, remplaçants et sous-rôles déjà affectés à cette équipe."
              >
                <div className="team-composition-summary">
                  <div className="team-summary-pill">
                    <strong>{selectedRoleMembers.length}</strong>
                    <span>Total affectés</span>
                  </div>
                  <div className="team-summary-pill">
                    <strong>
                      {selectedRoleMembers.filter((member) => member.teamRole === "Chef d'équipe").length}
                    </strong>
                    <span>Chefs réels</span>
                  </div>
                  <div className="team-summary-pill">
                    <strong>
                      {selectedRoleMembers.filter((member) => member.teamRole === "Bénévole").length}
                    </strong>
                    <span>Bénévoles</span>
                  </div>
                  <div className="team-summary-pill">
                    <strong>
                      {selectedRoleMembers.filter((member) => member.teamRole === "Remplaçant").length}
                    </strong>
                    <span>Remplaçants</span>
                  </div>
                </div>

                {selectedRoleSubRoleCounts.length > 0 ? (
                  <div className="team-subrole-stats">
                    {selectedRoleSubRoleCounts.map((item) => (
                      <div key={`${selectedRole.id}-stat-${item.subRole}`} className="team-summary-pill">
                        <strong>{item.count}</strong>
                        <span>{item.subRole}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <label className="field">
                  <span>Rechercher quelqu'un à ajouter</span>
                  <input
                    placeholder="Nom ou email"
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                  />
                </label>

                <div className="team-candidate-list">
                  {candidateResults.map((volunteer) => (
                    <div key={volunteer.id} className="team-candidate-row">
                      <div className="table-stack">
                        <strong>
                          {volunteer.firstName} {volunteer.lastName}
                        </strong>
                        <span>{volunteer.email}</span>
                      </div>
                      <button
                        className="button button--secondary"
                        type="button"
                        onClick={() => addMemberToSelectedRole(volunteer)}
                      >
                        Ajouter
                      </button>
                    </div>
                  ))}
                </div>

                {candidateResults.length === 0 && roleSpecificVolunteerOptions.length > 0 ? (
                  <p className="panel-note">
                    Aucun nouveau résultat pour cette recherche. Les personnes déjà dans cette équipe restent exclues, mais
                    elles peuvent maintenant être affectées ailleurs sans écrasement.
                  </p>
                ) : null}

                <div className="table-wrap">
                  <table className="data-table data-table--admin">
                    <thead>
                      <tr>
                        <th>Membre</th>
                        <th>Coordonnées</th>
                        <th>Langues</th>
                        <th>Statut candidature</th>
                        <th>Rôle dans l'équipe</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRoleMembers.map((member) => (
                        <tr key={member.assignmentEntryId || `${member.id}-${member.assignedRoleId}`}>
                          <td>
                            <div className="table-stack">
                              <strong>
                                {member.firstName} {member.lastName}
                              </strong>
                              <span className={getWorkflowStatusClass(member.workflowStatus)}>
                                {member.workflowStatus}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="table-stack">
                              <span>{member.email}</span>
                              <span>{member.phone}</span>
                            </div>
                          </td>
                          <td>{member.languages.join(", ")}</td>
                          <td>{member.workflowStatus}</td>
                          <td>
                            <select
                              value={member.teamRole}
                              onChange={(event) => updateMemberRole(member.assignmentEntryId, event.target.value)}
                            >
                              {getAvailableTeamRoles(selectedRole, [member.teamRole]).map((teamRole) => (
                                <option key={`${member.assignmentEntryId}-${teamRole}`}>{teamRole}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              className="button button--secondary"
                              type="button"
                              onClick={() => removeMemberFromSelectedRole(member.assignmentEntryId)}
                            >
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </section>
        ) : null
      ) : activeTeamTab === "overview" ? (
        <section>
          <Panel
            title="Récapitulatif des équipes"
            subtitle="Vue rapide des objectifs idéaux, des personnes déjà affectées et des écarts restants."
          >
            <DataTable
              columns={[
                { key: "roleName", label: "Equipe" },
                { key: "neededCount", label: "Pers. idéales" },
                { key: "expectedLeadCount", label: "Chefs idéaux" },
                { key: "activeMembers", label: "Affectés" },
                { key: "leaders", label: "Chefs réels" },
                { key: "replacements", label: "Remplaçants" },
                { key: "remaining", label: "Écart pers." },
                { key: "leadGap", label: "Écart chefs" },
                { key: "status", label: "Statut" },
              ]}
              rows={roleStats}
            />
          </Panel>
        </section>
      ) : (
        <section className="admin-stack">
          {teamsLoading ? <p className="status-note">Chargement des tâches autour du meeting...</p> : null}
          {teamsStatus ? <p className="status-note">{teamsStatus}</p> : null}
          <Panel
            title="Tâches autour du meeting"
            subtitle="Paramétrez ici les créneaux de support avant, pendant ou après le meeting : jour, plage horaire et tâche."
          >
            <div className="support-config-toolbar">
              <button className="button button--primary" type="button" onClick={addSupportTask}>
                Ajouter un créneau
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table data-table--admin support-config-table">
                <thead>
                  <tr>
                    <th>Jour</th>
                    <th>Début</th>
                    <th>Fin</th>
                    <th>Intitulé de la tâche</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {supportTasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <select
                          value={task.day}
                          onChange={(event) => updateSupportTaskConfig(task.id, "day", event.target.value)}
                        >
                          <option value="">Choisir</option>
                          {supportTaskDayOptions.map((day) => (
                            <option key={`${task.id}-${day}`}>{day}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="time"
                          value={task.startTime}
                          onChange={(event) => updateSupportTaskConfig(task.id, "startTime", event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          value={task.endTime}
                          onChange={(event) => updateSupportTaskConfig(task.id, "endTime", event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          list={`support-task-suggestions-${task.id}`}
                          value={task.taskLabel}
                          placeholder="Décrire la tâche"
                          onChange={(event) => updateSupportTaskConfig(task.id, "taskLabel", event.target.value)}
                        />
                        <datalist id={`support-task-suggestions-${task.id}`}>
                          {supportTaskOptions.map((option) => (
                            <option key={`${task.id}-${option}`} value={option} />
                          ))}
                        </datalist>
                      </td>
                      <td>
                        <button
                          className="button button--secondary"
                          type="button"
                          onClick={() => removeSupportTask(task.id)}
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      )}
    </div>
  );
}

function AssignmentsPage() {
  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Affectations</h1>
          <p>Base d'un ecran dense type Excel, pour filtrer, modifier en masse et voir les manques.</p>
        </div>
      </section>
      <Panel title="Affectations operationnelles">
        <DataTable
          columns={[
            { key: "team", label: "Equipe" },
            { key: "role", label: "Role" },
            { key: "person", label: "Nom" },
            { key: "shift", label: "Creneau" },
            { key: "status", label: "Statut" },
            { key: "accreditation", label: "Accreditation" },
          ]}
          rows={assignmentRows}
        />
      </Panel>
    </div>
  );
}

function RoleManagementPage() {
  const { currentUser, userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const hasAdminRole = roles.includes("admin");
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedRoleGroup, setSelectedRoleGroup] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState("");
  const normalizedSearch = search.trim().toLowerCase();

  useEffect(() => {
    if (!hasAdminRole) {
      setUsers([]);
      setLoading(false);
      return undefined;
    }

    const searchTokens = buildSearchPrefixes(search).slice(0, 10);
    const shouldSearch = searchTokens.length > 0;

    if (!shouldSearch && !selectedRoleGroup) {
      setUsers([]);
      setLoading(false);
      return undefined;
    }

    let isCancelled = false;
    setLoading(true);

    async function loadUsers() {
      try {
        const usersRef = collection(db, "users");
        const usersQuery = shouldSearch
          ? query(usersRef, where("searchTokens", "array-contains-any", searchTokens), limit(50))
          : query(usersRef, where("userTypes", "array-contains", selectedRoleGroup), limit(100));
        const snapshot = await getDocs(usersQuery);
        const docsToBackfill = snapshot.docs.filter((userSnapshot) => {
          const data = userSnapshot.data();
          return JSON.stringify(data.searchTokens || []) !== JSON.stringify(buildUserSearchTokens(data));
        });

        if (docsToBackfill.length) {
          await Promise.all(
            docsToBackfill.map((userSnapshot) =>
              updateDoc(doc(db, "users", userSnapshot.id), {
                searchTokens: buildUserSearchTokens(userSnapshot.data()),
                updatedAt: serverTimestamp(),
              }),
            ),
          );
        }

        const nextUsers = snapshot.docs
          .map((userSnapshot) => {
            const data = userSnapshot.data();

            return {
              id: userSnapshot.id,
              email: data.email || "",
              firstName: data.firstName || "",
              lastName: data.lastName || "",
              accountStatus: data.accountStatus || "active",
              userTypes: (() => {
                const nextRoles = extractRolesFromProfile(data);
                return nextRoles.length ? nextRoles : ["benevole"];
              })(),
            };
          })
          .filter((user) => {
            const matchesRoleGroup = selectedRoleGroup
              ? user.userTypes.includes(selectedRoleGroup)
              : true;
            if (!matchesRoleGroup) return false;
            if (!normalizedSearch) return true;

            const haystack = normalizeSearchValue(
              [user.firstName, user.lastName, user.email].join(" "),
            );
            return normalizedSearch
              .split(/\s+/)
              .filter(Boolean)
              .every((term) => haystack.includes(normalizeSearchValue(term)));
          })
          .sort((left, right) => {
            const leftName = `${left.firstName} ${left.lastName}`.trim() || left.email;
            const rightName = `${right.firstName} ${right.lastName}`.trim() || right.email;
            return leftName.localeCompare(rightName, "fr");
          });

        if (isCancelled) return;

        setUsers(nextUsers);
        setLoading(false);
      } catch {
        if (isCancelled) return;
        setStatusMessage("Impossible de charger la liste des utilisateurs.");
        setLoading(false);
      }
    }

    const timeoutId = window.setTimeout(loadUsers, shouldSearch ? 250 : 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [hasAdminRole, normalizedSearch, search, selectedRoleGroup]);

  const loadedUserSummary = useMemo(
    () => ({
      adminCount: users.filter((user) => user.userTypes.includes("admin")).length,
      managerCount: users.filter((user) => user.userTypes.includes("gestionnaire")).length,
      leadCount: users.filter((user) => user.userTypes.includes("chef_equipe")).length,
    }),
    [users],
  );

  function toggleUserRole(userId, roleValue) {
    setUsers((current) =>
      current.map((user) => {
        if (user.id !== userId) return user;

        const hasRole = user.userTypes.includes(roleValue);
        const nextRoles = hasRole
          ? user.userTypes.filter((role) => role !== roleValue)
          : [...user.userTypes, roleValue];

        return {
          ...user,
          userTypes: nextRoles.length ? nextRoles : ["benevole"],
        };
      }),
    );
  }

  async function saveUserRoles(user) {
    if (user.id === currentUser?.uid && !user.userTypes.includes("admin")) {
      setStatusMessage("Tu ne peux pas retirer ton propre rôle admin depuis cet écran.");
      return;
    }

    setSavingUserId(user.id);
    setStatusMessage("");

    try {
      await updateDoc(doc(db, "users", user.id), {
        userTypes: user.userTypes,
        searchTokens: buildUserSearchTokens(user),
        updatedAt: serverTimestamp(),
      });
      setStatusMessage(`Rôles mis à jour pour ${getDisplayName(user, user.email)}.`);
    } catch {
      setStatusMessage("La mise à jour des rôles a échoué.");
    } finally {
      setSavingUserId("");
    }
  }

  if (!hasAdminRole) {
    return (
      <div className="page">
        <section className="page-header">
          <div>
            <p className="eyebrow">Administration</p>
            <h1>Rôles plateforme</h1>
            <p>Cette page est réservée aux administrateurs.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Rôles plateforme</h1>
          <p>Assigne les accès admin, gestionnaire, chef d'équipe, bénévole et parent U14.</p>
        </div>
      </section>

      <section className="panel-grid panel-grid--2">
        <Panel
          title="Vue d'ensemble"
          subtitle="Les résultats affichés dépendent du groupe de rôle choisi et/ou de la recherche."
        >
          <ul className="compact-list">
            <li>{users.length} compte(s) utilisateur chargé(s)</li>
            <li>{loadedUserSummary.adminCount} administrateur(s)</li>
            <li>{loadedUserSummary.managerCount} gestionnaire(s)</li>
            <li>{loadedUserSummary.leadCount} chef(s) d'équipe</li>
          </ul>
        </Panel>

        <Panel title="Recherche" subtitle="Recherche par nom, prénom, mail et filtre par groupe de rôle.">
          <AuthFormField label="Groupe de rôle">
            <select value={selectedRoleGroup} onChange={(event) => setSelectedRoleGroup(event.target.value)}>
              <option value="">Sélectionner un groupe</option>
              {platformRoleOptions.map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </option>
              ))}
            </select>
          </AuthFormField>
          <AuthFormField label="Rechercher une personne">
            <input
              placeholder="Nom, prénom ou mail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </AuthFormField>
          {!selectedRoleGroup && !normalizedSearch ? (
            <p className="panel-note">
              Sélectionne un groupe de rôle ou saisis au moins 2 caractères pour lancer une recherche.
            </p>
          ) : null}
          {statusMessage ? <p className="panel-note">{statusMessage}</p> : null}
        </Panel>
      </section>

      <Panel title="Gestion des accès" subtitle="Les changements prennent effet après sauvegarde de la ligne.">
        {loading ? <p className="panel-note">Chargement des utilisateurs...</p> : null}
        {!loading && !users.length ? (
          <p className="panel-note">Aucun utilisateur ne correspond aux filtres actuels.</p>
        ) : null}
        <div className="table-wrap">
          <table className="data-table data-table--admin">
            <thead>
              <tr>
                <th>Personne</th>
                <th>Email</th>
                <th>Statut</th>
                <th>Rôles</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{getDisplayName(user, user.email)}</td>
                  <td>{user.email || "Non renseigné"}</td>
                  <td>{user.accountStatus}</td>
                  <td>
                    <div className="choice-grid choice-grid--2">
                      {platformRoleOptions.map((roleOption) => (
                        <label key={`${user.id}-${roleOption.value}`} className="selection-card selection-card--compact">
                          <input
                            checked={user.userTypes.includes(roleOption.value)}
                            type="checkbox"
                            onChange={() => toggleUserRole(user.id, roleOption.value)}
                          />
                          <div>
                            <strong>{roleOption.label}</strong>
                          </div>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button
                      className="button button--primary"
                      type="button"
                      disabled={savingUserId === user.id}
                      onClick={() => saveUserRoles(user)}
                    >
                      {savingUserId === user.id ? "Sauvegarde..." : "Sauvegarder"}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan="5">Aucun utilisateur ne correspond aux filtres actuels.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="panel-note">
          Rôles actuels : {platformRoleOptions.map((role) => getRoleLabel(role.value)).join(", ")}.
        </p>
      </Panel>
    </div>
  );
}

function DocumentsPage() {
  const emptyDocumentForm = {
    title: "",
    reference: "",
    scope: "global",
    teams: [],
    selectedTeam: "",
  };
  const [documents, setDocuments] = useState([]);
  const [documentForm, setDocumentForm] = useState(emptyDocumentForm);
  const [editingDocumentId, setEditingDocumentId] = useState(null);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentStatus, setDocumentStatus] = useState("");
  const [isSubmittingDocument, setIsSubmittingDocument] = useState(false);

  const teamOptions = roleConfigurationSeed.map((role) => role.roleName);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "documents"),
      (snapshot) => {
        const nextDocuments = snapshot.docs
          .map(mapStoredDocument)
          .sort((left, right) => right.createdAtMs - left.createdAtMs);

        setDocuments(nextDocuments);
        setDocumentsLoading(false);
      },
      () => {
        setDocumentStatus("Impossible de charger les documents publiés pour le moment.");
        setDocumentsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  function handleDocumentFormChange(event) {
    const { name, value } = event.target;
    setDocumentForm((current) => ({ ...current, [name]: value }));
  }

  function addDocumentTeam() {
    if (!documentForm.selectedTeam) return;
    setDocumentForm((current) => ({
      ...current,
      teams: current.teams.includes(current.selectedTeam)
        ? current.teams
        : [...current.teams, current.selectedTeam],
      selectedTeam: "",
    }));
  }

  function removeDocumentTeam(teamName) {
    setDocumentForm((current) => ({
      ...current,
      teams: current.teams.filter((team) => team !== teamName),
    }));
  }

  async function addDocument(event) {
    event.preventDefault();
    if (!documentForm.title.trim()) return;
    if (documentForm.scope === "teams" && documentForm.teams.length === 0) return;
    if (!documentForm.reference.trim()) {
      setDocumentStatus("Ajoutez un lien de consultation avant d'enregistrer.");
      return;
    }

    const existingDocument = documents.find((document) => document.id === editingDocumentId);
    const trimmedReference = documentForm.reference.trim();

    setIsSubmittingDocument(true);
    setDocumentStatus("Enregistrement du document...");

    try {
      const documentPayload = {
        title: documentForm.title.trim(),
        reference: trimmedReference || existingDocument?.reference || "",
        fileName: existingDocument?.fileName || "",
        filePath: "",
        fileUrl: "",
        scope: documentForm.scope,
        teams: documentForm.scope === "global" ? [] : documentForm.teams,
        visibility:
          documentForm.scope === "global" ? "Tous les utilisateurs concernés" : "Équipes ciblées",
        updatedAt: serverTimestamp(),
      };

      if (editingDocumentId) {
        await updateDoc(doc(db, "documents", editingDocumentId), documentPayload);

        setDocumentStatus("Document mis à jour et consultable.");
      } else {
        await addDoc(collection(db, "documents"), {
          ...documentPayload,
          createdAt: serverTimestamp(),
        });

        setDocumentStatus("Document ajouté et publié.");
      }

      setDocumentForm(emptyDocumentForm);
      setEditingDocumentId(null);
    } catch (error) {
      setDocumentStatus(getDocumentUploadErrorMessage(error));
    } finally {
      setIsSubmittingDocument(false);
    }
  }

  function editDocument(document) {
    setEditingDocumentId(document.id);
    setDocumentForm({
      title: document.title,
      reference: document.reference,
      scope: document.scope,
      teams: document.teams,
      selectedTeam: "",
    });
  }

  async function deleteDocument(documentId) {
    const documentToDelete = documents.find((document) => document.id === documentId);
    if (!documentToDelete) return;
    if (!window.confirm(`Supprimer "${documentToDelete.title}" ?`)) return;

    try {
      await deleteDoc(doc(db, "documents", documentId));
      setDocumentStatus("Document supprimé.");
    } catch {
      setDocumentStatus("La suppression du document a échoué.");
    }

    if (editingDocumentId === documentId) {
      setEditingDocumentId(null);
      setDocumentForm(emptyDocumentForm);
    }
  }

  function cancelDocumentEdition() {
    setEditingDocumentId(null);
    setDocumentForm(emptyDocumentForm);
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Documents</p>
          <h1>Espace documentaire</h1>
          <p>Depots admin, visibilite par equipe et diffusion automatique aux affectes.</p>
        </div>
      </section>
      {documentStatus ? <p className="panel-note">{documentStatus}</p> : null}
      <section className="panel-grid panel-grid--2">
        <Panel
          title={editingDocumentId ? "Modifier un document" : "Ajouter un document"}
          subtitle="Choisissez si le document doit être visible par tout le monde ou seulement par une ou plusieurs équipes."
        >
          <form className="section-stack" onSubmit={addDocument}>
            <AuthFormField label="Titre du document">
              <input
                name="title"
                required
                placeholder="Briefing accueil, plan d'accès, feuille de route..."
                value={documentForm.title}
                onChange={handleDocumentFormChange}
              />
            </AuthFormField>

            <AuthFormField label="Lien de consultation">
              <div className="document-source-stack">
                <input
                  name="reference"
                  required
                  placeholder="Collez un lien si le document est déjà hébergé ailleurs"
                  value={documentForm.reference}
                  onChange={handleDocumentFormChange}
                />
                <small>
                  Pour le moment, les documents sont publiés via un lien externe. Vous pourrez
                  réactiver l'upload PDF plus tard si vous activez Firebase Storage.
                </small>
              </div>
            </AuthFormField>

            <div className="field">
              <span>Diffusion</span>
              <div className="choice-grid choice-grid--2">
                <label className="selection-card selection-card--compact">
                  <input
                    checked={documentForm.scope === "global"}
                    name="scope"
                    type="radio"
                    value="global"
                    onChange={handleDocumentFormChange}
                  />
                  <div>
                    <strong>Tout le monde</strong>
                  </div>
                </label>
                <label className="selection-card selection-card--compact">
                  <input
                    checked={documentForm.scope === "teams"}
                    name="scope"
                    type="radio"
                    value="teams"
                    onChange={handleDocumentFormChange}
                  />
                  <div>
                    <strong>Équipes ciblées</strong>
                  </div>
                </label>
              </div>
            </div>

            {documentForm.scope === "teams" ? (
              <div className="field">
                <span>Équipes concernées</span>
                <div className="document-team-picker">
                  <select
                    name="selectedTeam"
                    value={documentForm.selectedTeam}
                    onChange={handleDocumentFormChange}
                  >
                    <option value="">Choisir une équipe</option>
                    {teamOptions
                      .filter((team) => !documentForm.teams.includes(team))
                      .map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                  </select>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={addDocumentTeam}
                    disabled={!documentForm.selectedTeam}
                  >
                    Ajouter l'équipe
                  </button>
                </div>
                {documentForm.teams.length > 0 ? (
                  <div className="document-tag-list">
                    {documentForm.teams.map((team) => (
                      <button
                        key={`selected-${team}`}
                        className="document-tag document-tag--removable"
                        type="button"
                        onClick={() => removeDocumentTeam(team)}
                      >
                        {team} ×
                      </button>
                    ))}
                  </div>
                ) : (
                  <small>Aucune équipe sélectionnée pour le moment.</small>
                )}
              </div>
            ) : null}

            <div className="table-actions table-actions--inline">
              <button className="button button--primary" disabled={isSubmittingDocument} type="submit">
                {isSubmittingDocument
                  ? "Enregistrement..."
                  : editingDocumentId
                    ? "Enregistrer les modifications"
                    : "Ajouter le document"}
              </button>
              {editingDocumentId ? (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={cancelDocumentEdition}
                >
                  Annuler
                </button>
              ) : null}
            </div>
          </form>
        </Panel>

        <Panel
          title="Documents publiés"
          subtitle="Consultez les documents existants et leur périmètre de diffusion."
        >
          {documentsLoading ? <p className="panel-note">Chargement des documents...</p> : null}
          <div className="table-wrap">
            <table className="data-table data-table--admin">
              <thead>
                <tr>
                  <th>Titre</th>
                  <th>Périmètre</th>
                  <th>Équipes</th>
                  <th>Consultation</th>
                  <th>Actions admin</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td>{document.title}</td>
                    <td>{document.scope === "global" ? "Tout le monde" : "Équipes ciblées"}</td>
                    <td>
                      {document.scope === "global" ? (
                        "Toutes les équipes"
                      ) : (
                        <div className="document-tag-list">
                          {document.teams.map((team) => (
                            <span key={`${document.id}-${team}`} className="document-tag">
                              {team}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={!getDocumentConsultationUrl(document)}
                        onClick={() => {
                          const consultationUrl = getDocumentConsultationUrl(document);
                          if (!consultationUrl) {
                            setDocumentStatus("Ce document n'a pas encore de lien de consultation valide.");
                            return;
                          }
                          window.open(consultationUrl, "_blank", "noopener,noreferrer");
                        }}
                      >
                        {document.fileName || document.reference || "Ouvrir"}
                      </button>
                    </td>
                    <td>
                      <div className="table-actions table-actions--inline">
                        <button
                          className="button button--secondary"
                          type="button"
                          onClick={() => editDocument(document)}
                        >
                          Modifier
                        </button>
                        <button
                          className="button button--ghost-danger"
                          type="button"
                          onClick={() => deleteDocument(document.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!documentsLoading && documents.length === 0 ? (
                  <tr>
                    <td colSpan="5">Aucun document publié pour le moment.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function AccreditationsPage() {
  const { roles, teamAssignments, loading: teamsLoading, error: teamsError } = useTeamConfiguration();
  const {
    zones: storedZones,
    roleZoneAssignments: storedRoleZoneAssignments,
    volunteerOverrides: storedVolunteerOverrides,
    printHistory: storedPrintHistory,
    loading: accreditationLoading,
    error: accreditationError,
  } = useAccreditationConfiguration(roles);
  const [activeAccreditationTab, setActiveAccreditationTab] = useState("roles");
  const [isZoneLibraryExpanded, setIsZoneLibraryExpanded] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [accreditationStatus, setAccreditationStatus] = useState("");
  const [isSavingAccreditation, setIsSavingAccreditation] = useState(false);
  const [zones, setZones] = useState(accreditationZoneSeed);
  const [newZoneName, setNewZoneName] = useState("");
  const [roleZoneAssignments, setRoleZoneAssignments] = useState(() =>
    normalizeAccreditationConfigurationPayload({}, defaultTeamRoles).roleZoneAssignments,
  );
  const [printHistory, setPrintHistory] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [volunteerSearch, setVolunteerSearch] = useState("");
  const [volunteerOverrides, setVolunteerOverrides] = useState(volunteerAccreditationOverrideSeed);
  const sortedZones = useMemo(() => sortAccreditationZones(zones), [zones]);
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const volunteers = useMemo(() => buildAccreditationUsers(users, teamAssignments), [users, teamAssignments]);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState("");
  const selectedVolunteer = volunteers.find((volunteer) => volunteer.id === selectedVolunteerId) ?? volunteers[0];
  const badgeStatusCounts = Object.values(volunteerOverrides).reduce(
    (accumulator, override) => ({
      ...accumulator,
      [override.printStatus]: (accumulator[override.printStatus] ?? 0) + 1,
    }),
    {},
  );

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setUsers(
          snapshot.docs.map((userSnapshot) => ({
            id: userSnapshot.id,
            ...userSnapshot.data(),
          })),
        );
        setUsersLoading(false);
      },
      () => {
        setUsers([]);
        setUsersLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    setZones(storedZones);
  }, [storedZones]);

  useEffect(() => {
    setRoleZoneAssignments(storedRoleZoneAssignments);
  }, [storedRoleZoneAssignments]);

  useEffect(() => {
    setVolunteerOverrides(storedVolunteerOverrides);
  }, [storedVolunteerOverrides]);

  useEffect(() => {
    setPrintHistory(storedPrintHistory);
  }, [storedPrintHistory]);

  useEffect(() => {
    setSelectedRoleId((current) => (roles.some((role) => role.id === current) ? current : roles[0]?.id ?? ""));
  }, [roles]);

  useEffect(() => {
    setSelectedVolunteerId((current) =>
      current && volunteers.some((volunteer) => volunteer.id === current) ? current : volunteers[0]?.id ?? "",
    );
  }, [volunteers]);

  async function persistAccreditationConfiguration(nextConfiguration, successMessage) {
    setZones(nextConfiguration.zones);
    setRoleZoneAssignments(nextConfiguration.roleZoneAssignments);
    setVolunteerOverrides(nextConfiguration.volunteerOverrides);
    setPrintHistory(nextConfiguration.printHistory);
    setIsSavingAccreditation(true);

    try {
      await setDoc(
        doc(db, ...ACCREDITATION_CONFIGURATION_DOC_PATH),
        {
          ...nextConfiguration,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setAccreditationStatus(successMessage);
    } catch (error) {
      console.error("Impossible de sauvegarder la configuration des accréditations.", error);
      setAccreditationStatus("La sauvegarde des accréditations a échoué.");
    } finally {
      setIsSavingAccreditation(false);
    }
  }

  function getRoleZoneIds(roleId) {
    return roleZoneAssignments[roleId] ?? [];
  }

  function getRoleByName(roleName) {
    return roles.find(
      (role) => role.roleName.trim().toLowerCase() === String(roleName || "").trim().toLowerCase(),
    );
  }

  function getRoleZoneIdsByName(roleName) {
    return getRoleZoneIds(getRoleByName(roleName)?.id || "");
  }

  function getVolunteerOverride(volunteerId) {
    return volunteerOverrides[volunteerId] ?? {
      addZoneIds: [],
      removeZoneIds: [],
      printStatus: "Non-imprimé",
      badgeLabel: "",
      warningMessage: "",
      lastQueuedAt: null,
      lastPrintedAt: null,
      printedSnapshot: { roleLabel: "", roleNames: [], zoneIds: [] },
    };
  }

  function getFinalZoneIds(volunteer) {
    return getAccreditationFinalZoneIds({
      assignedRoles: normalizeSubRoles(volunteer?.assignedRoles || [volunteer?.assignedRole].filter(Boolean)),
      roles,
      zones: sortedZones,
      roleZoneAssignments,
      override: getVolunteerOverride(volunteer.id),
    });
  }

  function getFinalZoneLabels(volunteer) {
    return sortedZones
      .filter((zone) => getFinalZoneIds(volunteer).includes(zone.id))
      .map((zone) => formatZoneLabel(zone));
  }

  function getRoleTableLabel(volunteer) {
    const override = getVolunteerOverride(volunteer.id);
    const confirmedRoles = getConfirmedAccreditationRoleNames(volunteer);
    const confirmedRoleLabel = buildAccreditationRoleLabel(confirmedRoles);
    const badgeRoleLabel = getBadgeRoleLabel(volunteer, override);

    if (confirmedRoleLabel && badgeRoleLabel && badgeRoleLabel !== confirmedRoleLabel) {
      return `${confirmedRoleLabel} (${badgeRoleLabel})`;
    }

    return confirmedRoleLabel || (badgeRoleLabel ? `(${badgeRoleLabel})` : "En attente de confirmation");
  }

  function buildCurrentConfiguration(nextPartial = {}) {
    return {
      zones,
      roleZoneAssignments,
      volunteerOverrides,
      printHistory,
      ...nextPartial,
    };
  }

  function buildUpdatedVolunteerOverride(volunteer, patch, options = {}) {
    const existing = getVolunteerOverride(volunteer.id);
    const nextOverride = {
      ...existing,
      ...patch,
      printedSnapshot: {
        ...existing.printedSnapshot,
        ...(patch.printedSnapshot || {}),
      },
    };

    if (
      options.markAsModifiedAfterPrint &&
      existing.printStatus === "Imprimé"
    ) {
      nextOverride.printStatus = "Non-imprimé";
      nextOverride.warningMessage =
        "Attention modification : le contenu de cette accréditation a changé depuis la dernière impression.";
    }

    if (patch.printStatus === "Dans la file") {
      nextOverride.warningMessage = "";
      nextOverride.lastQueuedAt = new Date().toISOString();
    }

    if (patch.printStatus === "Imprimé") {
      nextOverride.warningMessage = "";
    }

    return nextOverride;
  }

  function updateZone(zoneId, field, value) {
    const nextZones = zones.map((zone) =>
      zone.id === zoneId
        ? {
            ...zone,
            [field]: field === "order" ? Math.max(1, Number(value) || 1) : value,
          }
        : zone,
    );
    persistAccreditationConfiguration(
      {
        zones: nextZones,
        roleZoneAssignments,
        volunteerOverrides,
        printHistory,
      },
      "Configuration des zones enregistrée.",
    );
  }

  function addZone() {
    if (!newZoneName.trim()) return;

    const nextOrder = Math.max(0, ...zones.map((zone) => zone.order)) + 1;
    const nextId = `zone-${Date.now()}`;

    const nextZones = [
      ...zones,
      {
        id: nextId,
        order: nextOrder,
        name: newZoneName.trim(),
      },
    ];
    persistAccreditationConfiguration(
      {
        zones: nextZones,
        roleZoneAssignments,
        volunteerOverrides,
        printHistory,
      },
      "Nouvelle zone ajoutée.",
    );
    setNewZoneName("");
  }

  function removeZone(zoneId) {
    const nextZones = zones.filter((zone) => zone.id !== zoneId);
    const nextRoleZoneAssignments = Object.fromEntries(
      Object.entries(roleZoneAssignments).map(([roleName, zoneIds]) => [
        roleName,
        zoneIds.filter((currentZoneId) => currentZoneId !== zoneId),
      ]),
    );
    const nextVolunteerOverrides = Object.fromEntries(
      Object.entries(volunteerOverrides).map(([volunteerId, override]) => [
        volunteerId,
        {
          ...override,
          addZoneIds: override.addZoneIds.filter((currentZoneId) => currentZoneId !== zoneId),
          removeZoneIds: override.removeZoneIds.filter((currentZoneId) => currentZoneId !== zoneId),
        },
      ]),
    );

    persistAccreditationConfiguration(
      {
        zones: nextZones,
        roleZoneAssignments: nextRoleZoneAssignments,
        volunteerOverrides: nextVolunteerOverrides,
        printHistory,
      },
      "Zone supprimée.",
    );
  }

  function toggleRoleZone(roleId, zoneId) {
    persistAccreditationConfiguration(
      {
        zones,
        roleZoneAssignments: {
          ...roleZoneAssignments,
          [roleId]: toggleIdInList(roleZoneAssignments[roleId] ?? [], zoneId),
        },
        volunteerOverrides,
        printHistory,
      },
      "Accès par rôle mis à jour.",
    );
  }

  function updateVolunteerOverride(volunteer, field, zoneId) {
    const nextOverride = buildUpdatedVolunteerOverride(
      volunteer,
      {
        [field]: toggleIdInList(getVolunteerOverride(volunteer.id)[field], zoneId),
      },
      { markAsModifiedAfterPrint: true },
    );

    persistAccreditationConfiguration(
      buildCurrentConfiguration({
        volunteerOverrides: {
          ...volunteerOverrides,
          [volunteer.id]: nextOverride,
        },
      }),
      "Ajustement individuel enregistré.",
    );
  }

  function updateVolunteerBadgeLabel(volunteer, badgeLabel) {
    const trimmedLabel = String(badgeLabel || "").trim();
    const existing = getVolunteerOverride(volunteer.id);
    if (trimmedLabel === existing.badgeLabel) return;

    const nextOverride = buildUpdatedVolunteerOverride(
      volunteer,
      { badgeLabel: trimmedLabel },
      { markAsModifiedAfterPrint: true },
    );

    persistAccreditationConfiguration(
      buildCurrentConfiguration({
        volunteerOverrides: {
          ...volunteerOverrides,
          [volunteer.id]: nextOverride,
        },
      }),
      "Libellé de l'accréditation mis à jour.",
    );
  }

  function updateVolunteerPrintStatus(volunteer, printStatus) {
    const printStatusPatch =
      printStatus === "Imprimé"
        ? {
            printStatus,
            lastPrintedAt: new Date().toISOString(),
            printedSnapshot: {
              roleLabel: getBadgeRoleLabel(volunteer, getVolunteerOverride(volunteer.id)),
              roleNames: normalizeSubRoles(volunteer.assignedRoles || [volunteer.assignedRole].filter(Boolean)),
              zoneIds: getFinalZoneIds(volunteer),
            },
          }
        : { printStatus };
    const nextOverride = buildUpdatedVolunteerOverride(volunteer, printStatusPatch);

    persistAccreditationConfiguration(
      buildCurrentConfiguration({
        volunteerOverrides: {
          ...volunteerOverrides,
          [volunteer.id]: nextOverride,
        },
      }),
      "Statut d'impression mis à jour.",
    );
  }

  function addVolunteerToPrintQueue(volunteer) {
    updateVolunteerPrintStatus(volunteer, "Dans la file");
  }

  function openPrintWindow(markup) {
    if (typeof window === "undefined") return;
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) return;
    printWindow.document.write(markup);
    printWindow.document.close();
  }

  async function finalizePrintQueue() {
    const queuedVolunteers = volunteers.filter(
      (volunteer) => getVolunteerOverride(volunteer.id).printStatus === "Dans la file",
    );
    if (!queuedVolunteers.length) return;

    const printedAt = new Date().toISOString();
    const badgeItems = queuedVolunteers.map((volunteer) => {
      const override = getVolunteerOverride(volunteer.id);
      const zoneIds = getFinalZoneIds(volunteer);
      return {
        volunteerId: volunteer.id,
        name: `${volunteer.firstName} ${volunteer.lastName}`.trim(),
        role: getBadgeRoleLabel(volunteer, override) || "Accreditation",
        roleNames: normalizeSubRoles(volunteer.assignedRoles || [volunteer.assignedRole].filter(Boolean)),
        zoneIds,
        zoneLabels: getFinalZoneLabels(volunteer),
      };
    });

    const historyEntries = badgeItems.map((item, index) => ({
      id: `${item.volunteerId}-${Date.now()}-${index}`,
      volunteerId: item.volunteerId,
      name: item.name,
      roleLabel: item.role,
      roleNames: item.roleNames,
      zoneLabels: item.zoneLabels,
      printedAt,
    }));

    const nextVolunteerOverrides = {
      ...volunteerOverrides,
    };

    badgeItems.forEach((item) => {
      const volunteer = queuedVolunteers.find((entry) => entry.id === item.volunteerId);
      const override = getVolunteerOverride(item.volunteerId);
      nextVolunteerOverrides[item.volunteerId] = buildUpdatedVolunteerOverride(volunteer, {
        printStatus: "Imprimé",
        lastPrintedAt: printedAt,
        printedSnapshot: {
          roleLabel: item.role,
          roleNames: item.roleNames,
          zoneIds: item.zoneIds,
        },
      });
      nextVolunteerOverrides[item.volunteerId].warningMessage = "";
    });

    await persistAccreditationConfiguration(
      buildCurrentConfiguration({
        volunteerOverrides: nextVolunteerOverrides,
        printHistory: [...historyEntries, ...printHistory],
      }),
      "Lot d'impression généré.",
    );

    openPrintWindow(buildBadgePrintMarkup(badgeItems));
    openPrintWindow(buildAccreditationPrintHistoryMarkup(historyEntries));
  }

  const selectedRoleZoneIds = selectedRole ? getRoleZoneIds(selectedRole.id) : [];
  const selectedVolunteerOverride = selectedVolunteer
    ? getVolunteerOverride(selectedVolunteer.id)
    : {
        addZoneIds: [],
        removeZoneIds: [],
        printStatus: "Non-imprimé",
        badgeLabel: "",
        warningMessage: "",
        lastQueuedAt: null,
        lastPrintedAt: null,
        printedSnapshot: { roleLabel: "", roleNames: [], zoneIds: [] },
      };
  const inheritedZoneIds = selectedVolunteer
    ? normalizeSubRoles(
        normalizeSubRoles(selectedVolunteer.assignedRoles || [selectedVolunteer.assignedRole].filter(Boolean)).flatMap(
          (assignedRole) => getRoleZoneIdsByName(assignedRole),
        ),
      )
    : [];
  const removableInheritedZones = sortedZones.filter((zone) => inheritedZoneIds.includes(zone.id));
  const addableZones = sortedZones.filter((zone) => !inheritedZoneIds.includes(zone.id));
  const filteredVolunteers = volunteers.filter((volunteer) => {
    const haystack = [
      volunteer.firstName,
      volunteer.lastName,
      volunteer.email,
      volunteer.assignedRole,
      ...(volunteer.assignedRoles || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(volunteerSearch.trim().toLowerCase());
  });
  const queuedVolunteers = volunteers.filter(
    (volunteer) => getVolunteerOverride(volunteer.id).printStatus === "Dans la file",
  );

  useEffect(() => {
    const printedUsersToReset = volunteers
      .map((volunteer) => {
        const override = getVolunteerOverride(volunteer.id);
        const snapshot = override.printedSnapshot;
        const snapshotExists =
          snapshot.roleLabel || snapshot.roleNames.length || snapshot.zoneIds.length;
        if (!snapshotExists || override.printStatus !== "Imprimé") return null;

        const currentRoleLabel = getBadgeRoleLabel(volunteer, override);
        const currentRoleNames = normalizeSubRoles(volunteer.assignedRoles || [volunteer.assignedRole].filter(Boolean));
        const currentZoneIds = getFinalZoneIds(volunteer);
        const rolesChanged =
          JSON.stringify(snapshot.roleNames) !== JSON.stringify(currentRoleNames);
        const roleLabelChanged = snapshot.roleLabel !== currentRoleLabel;
        const zonesChanged = JSON.stringify(snapshot.zoneIds) !== JSON.stringify(currentZoneIds);

        if (!rolesChanged && !roleLabelChanged && !zonesChanged) return null;

        return {
          volunteerId: volunteer.id,
          override: {
            ...override,
            printStatus: "Non-imprimé",
            warningMessage:
              "Attention modification : les rôles, zones ou le libellé badge ont changé depuis la dernière impression.",
          },
        };
      })
      .filter(Boolean);

    if (!printedUsersToReset.length) return;

    persistAccreditationConfiguration(
      buildCurrentConfiguration({
        volunteerOverrides: {
          ...volunteerOverrides,
          ...Object.fromEntries(printedUsersToReset.map((entry) => [entry.volunteerId, entry.override])),
        },
      }),
      "Certaines accréditations imprimées ont été repassées en non-imprimé après modification.",
    );
  }, [volunteers]);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Accreditations</p>
          <h1>Zones d'acces et statuts</h1>
          <p>Heritage par role, ajouts manuels, retraits manuels et suivi impression / remise.</p>
          {teamsLoading || accreditationLoading || usersLoading ? <p className="panel-note">Chargement en cours...</p> : null}
          {teamsError || accreditationError ? <p className="panel-note">{teamsError || accreditationError}</p> : null}
          {accreditationStatus ? <p className="panel-note">{accreditationStatus}</p> : null}
          {isSavingAccreditation ? <p className="panel-note">Sauvegarde des accréditations...</p> : null}
        </div>
      </section>
      <div className="admin-subtabs">
        <button
          className={`admin-subtab ${activeAccreditationTab === "roles" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveAccreditationTab("roles")}
        >
          Zones par role
        </button>
        <button
          className={`admin-subtab ${activeAccreditationTab === "people" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveAccreditationTab("people")}
        >
          Zones par personne
        </button>
        <button
          className={`admin-subtab ${activeAccreditationTab === "print" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveAccreditationTab("print")}
        >
          Impressions
        </button>
      </div>

      {activeAccreditationTab === "roles" ? (
        <>
          <Panel
            title="Bibliothèque des zones"
            subtitle="Gérez ici les zones d'accréditation : nom, ordre, ajout ou suppression."
            actions={
              <button
                className="button button--secondary button--small"
                type="button"
                onClick={() => setIsZoneLibraryExpanded((current) => !current)}
                aria-expanded={isZoneLibraryExpanded}
              >
                {isZoneLibraryExpanded ? "Replier" : "Déplier"}
              </button>
            }
          >
            {isZoneLibraryExpanded ? (
              <>
                <div className="accreditation-zone-list">
                  {sortedZones.map((zone) => (
                    <div key={zone.id} className="accreditation-zone-row">
                      <label className="field">
                        <span>Numéro</span>
                        <input
                          type="number"
                          min="1"
                          value={zone.order}
                          onChange={(event) => updateZone(zone.id, "order", event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Nom de la zone</span>
                        <input
                          value={zone.name}
                          onChange={(event) => updateZone(zone.id, "name", event.target.value)}
                        />
                      </label>
                      <button
                        className="button button--ghost-danger"
                        type="button"
                        onClick={() => removeZone(zone.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>

                <div className="accreditation-zone-add">
                  <label className="field">
                    <span>Nouvelle zone</span>
                    <input
                      placeholder="Ex: Media lounge"
                      value={newZoneName}
                      onChange={(event) => setNewZoneName(event.target.value)}
                    />
                  </label>
                  <button className="button button--secondary" type="button" onClick={addZone}>
                    Ajouter la zone
                  </button>
                </div>
              </>
            ) : (
              <div className="accreditation-zone-collapsed">
                <p className="panel-note">
                  {sortedZones.length} zone(s) disponibles. Dépliez la bibliothèque pour les modifier.
                </p>
              </div>
            )}
          </Panel>

          <section className="admin-split">
            <div className="admin-split__nav">
              {roles.map((role) => (
                <button
                  key={role.id}
                  className={`role-chip ${selectedRoleId === role.id ? "role-chip--active" : ""}`}
                  type="button"
                  onClick={() => setSelectedRoleId(role.id)}
                >
                  <strong>{role.roleName}</strong>
                  <span>{getRoleZoneIds(role.id).length} zone(s) par défaut</span>
                </button>
              ))}
            </div>

            {selectedRole ? (
              <div className="admin-stack">
                <Panel
                  title={`Zones par défaut - ${selectedRole.roleName}`}
                  subtitle="Cochez les accès qui doivent être donnés automatiquement à toute personne affectée à ce rôle."
                >
                  <div className="choice-grid choice-grid--2">
                    {sortedZones.map((zone) => (
                      <label key={zone.id} className="selection-card selection-card--compact">
                        <input
                          type="checkbox"
                          checked={selectedRoleZoneIds.includes(zone.id)}
                          onChange={() => toggleRoleZone(selectedRole.id, zone.id)}
                        />
                        <div>
                          <strong>{formatZoneLabel(zone)}</strong>
                          <p>Accès hérité automatiquement pour ce rôle</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </Panel>

                <Panel title="Résumé du rôle">
                  <div className="accreditation-tag-list">
                    {selectedRoleZoneIds.length ? (
                      sortedZones
                        .filter((zone) => selectedRoleZoneIds.includes(zone.id))
                        .map((zone) => (
                          <span key={zone.id} className="accreditation-tag accreditation-tag--active">
                            {formatZoneLabel(zone)}
                          </span>
                        ))
                    ) : (
                      <p className="panel-note">Aucune zone par défaut définie pour ce rôle.</p>
                    )}
                  </div>
                </Panel>
              </div>
            ) : null}
          </section>
        </>
      ) : activeAccreditationTab === "people" ? (
        <section className="admin-stack">
          <Panel
            title="Tableau des accréditations"
            subtitle="Cliquez sur le nom pour ouvrir le détail des zones héritées, ajoutées ou retirées."
          >
            <div className="admin-toolbar">
              <label className="field">
                <span>Rechercher une personne</span>
                <input
                  placeholder="Nom, email, rôle..."
                  value={volunteerSearch}
                  onChange={(event) => setVolunteerSearch(event.target.value)}
                />
              </label>
              <div className="accreditation-metrics">
                <ul className="compact-list">
                  <li>{badgeStatusCounts["Non-imprimé"] ?? 0} non imprimé(s)</li>
                  <li>{badgeStatusCounts["Dans la file"] ?? 0} dans la file</li>
                  <li>{badgeStatusCounts["Imprimé"] ?? 0} imprimé(s)</li>
                </ul>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table data-table--admin">
                <thead>
                  <tr>
                    <th>Personne</th>
                    <th>Rôle</th>
                    <th>Zones</th>
                    <th>Impression</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVolunteers.map((volunteer) => {
                    const override = getVolunteerOverride(volunteer.id);
                    const finalZoneLabels = getFinalZoneLabels(volunteer);

                    return (
                      <tr key={volunteer.id}>
                        <td>
                          <button
                            className="button button--secondary button--small"
                            type="button"
                            onClick={() => setSelectedVolunteerId(volunteer.id)}
                          >
                            {`${volunteer.firstName} ${volunteer.lastName}`.trim() || volunteer.email}
                          </button>
                        </td>
                        <td>{getRoleTableLabel(volunteer)}</td>
                        <td>{finalZoneLabels.join(", ") || "Aucune zone"}</td>
                        <td>
                          <span className={getAccreditationStatusClass(override.printStatus)}>{override.printStatus}</span>
                        </td>
                        <td>
                          <button
                            className="button button--secondary"
                            type="button"
                            onClick={() => addVolunteerToPrintQueue(volunteer)}
                            disabled={override.printStatus === "Dans la file"}
                          >
                            Ajouter aux impressions
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredVolunteers.length ? (
                    <tr>
                      <td colSpan="5">Aucune personne ne correspond à la recherche actuelle.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>

          {selectedVolunteer ? (
            <Panel
              title={`${selectedVolunteer.firstName} ${selectedVolunteer.lastName}`}
              subtitle="Zones héritées, ajustements manuels et libellé utilisé sur l'accréditation."
            >
              {selectedVolunteerOverride.warningMessage ? (
                <div className="accreditation-warning-panel">
                  <strong>Attention modification</strong>
                  <p>{selectedVolunteerOverride.warningMessage}</p>
                </div>
              ) : null}

              <div className="accreditation-person-summary">
                <div className="team-summary-pill">
                  <strong>{getRoleTableLabel(selectedVolunteer)}</strong>
                  <span>Rôle affiché</span>
                </div>
                <div className="team-summary-pill">
                  <strong>{selectedVolunteerOverride.printStatus}</strong>
                  <span>Statut impression</span>
                </div>
                <div className="team-summary-pill">
                  <strong>{getFinalZoneIds(selectedVolunteer).length}</strong>
                  <span>Zones finales</span>
                </div>
              </div>

              <div className="field-grid">
                <AuthFormField label="Texte affiché sur l'accréditation">
                  <input
                    value={selectedVolunteerOverride.badgeLabel}
                    placeholder={buildAccreditationRoleLabel(selectedVolunteer.assignedRoles)}
                    onChange={(event) => updateVolunteerBadgeLabel(selectedVolunteer, event.target.value)}
                  />
                </AuthFormField>
                <AuthFormField label="Statut d'impression">
                  <select
                    value={selectedVolunteerOverride.printStatus}
                    onChange={(event) => updateVolunteerPrintStatus(selectedVolunteer, event.target.value)}
                  >
                    {ACCREDITATION_PRINT_STATUS_OPTIONS.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </AuthFormField>
              </div>

              <div className="field-grid">
                <div className="accreditation-inline-panel">
                  <strong>Zones héritées</strong>
                  <div className="accreditation-tag-list">
                    {inheritedZoneIds.length ? (
                      sortedZones
                        .filter((zone) => inheritedZoneIds.includes(zone.id))
                        .map((zone) => <span key={zone.id} className="accreditation-tag">{formatZoneLabel(zone)}</span>)
                    ) : (
                      <p className="panel-note">Aucune zone héritée.</p>
                    )}
                  </div>
                </div>

                <div className="accreditation-inline-panel">
                  <strong>Zones ajoutées</strong>
                  <div className="accreditation-tag-list">
                    {selectedVolunteerOverride.addZoneIds.length ? (
                      sortedZones
                        .filter((zone) => selectedVolunteerOverride.addZoneIds.includes(zone.id))
                        .map((zone) => (
                          <span key={zone.id} className="accreditation-tag accreditation-tag--active">
                            {formatZoneLabel(zone)}
                          </span>
                        ))
                    ) : (
                      <p className="panel-note">Aucun ajout manuel.</p>
                    )}
                  </div>
                </div>

                <div className="accreditation-inline-panel">
                  <strong>Zones retirées</strong>
                  <div className="accreditation-tag-list">
                    {selectedVolunteerOverride.removeZoneIds.length ? (
                      sortedZones
                        .filter((zone) => selectedVolunteerOverride.removeZoneIds.includes(zone.id))
                        .map((zone) => <span key={zone.id} className="accreditation-tag">{formatZoneLabel(zone)}</span>)
                    ) : (
                      <p className="panel-note">Aucun retrait manuel.</p>
                    )}
                  </div>
                </div>
              </div>

              <Panel
                title="Ajustements individuels"
                subtitle="Ajoutez des accès supplémentaires ou retirez des accès hérités pour cette personne seulement."
              >
                <div className="field-grid">
                  <div className="field">
                    <span>Zones à ajouter</span>
                    <div className="choice-grid choice-grid--2">
                      {addableZones.length ? (
                        addableZones.map((zone) => (
                          <label key={zone.id} className="selection-card selection-card--compact">
                            <input
                              type="checkbox"
                              checked={selectedVolunteerOverride.addZoneIds.includes(zone.id)}
                              onChange={() => updateVolunteerOverride(selectedVolunteer, "addZoneIds", zone.id)}
                            />
                            <div>
                              <strong>{formatZoneLabel(zone)}</strong>
                              <p>Ajout manuel pour cette personne</p>
                            </div>
                          </label>
                        ))
                      ) : (
                        <p className="panel-note">Toutes les zones existantes sont déjà héritées par ce rôle.</p>
                      )}
                    </div>
                  </div>

                  <div className="field">
                    <span>Zones à retirer</span>
                    <div className="choice-grid choice-grid--2">
                      {removableInheritedZones.length ? (
                        removableInheritedZones.map((zone) => (
                          <label key={zone.id} className="selection-card selection-card--compact">
                            <input
                              type="checkbox"
                              checked={selectedVolunteerOverride.removeZoneIds.includes(zone.id)}
                              onChange={() => updateVolunteerOverride(selectedVolunteer, "removeZoneIds", zone.id)}
                            />
                            <div>
                              <strong>{formatZoneLabel(zone)}</strong>
                              <p>Retrait manuel de l'héritage du rôle</p>
                            </div>
                          </label>
                        ))
                      ) : (
                        <p className="panel-note">Aucune zone héritée à retirer pour cette personne.</p>
                      )}
                    </div>
                  </div>
                </div>
              </Panel>
            </Panel>
          ) : null}
        </section>
      ) : (
        <section className="panel-grid panel-grid--2">
          <Panel
            title="File d'impression"
            subtitle="Le lot génère deux sorties imprimables: badges et liste des impressions effectuées."
          >
            <div className="table-wrap">
              <table className="data-table data-table--admin">
                <thead>
                  <tr>
                    <th>Personne</th>
                    <th>Rôle badge</th>
                    <th>Zones</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queuedVolunteers.map((volunteer) => (
                    <tr key={`queue-${volunteer.id}`}>
                      <td>{`${volunteer.firstName} ${volunteer.lastName}`.trim() || volunteer.email}</td>
                      <td>{getBadgeRoleLabel(volunteer, getVolunteerOverride(volunteer.id)) || "-"}</td>
                      <td>{getFinalZoneLabels(volunteer).join(", ") || "Aucune zone"}</td>
                      <td>
                        <button
                          className="button button--ghost-danger"
                          type="button"
                          onClick={() => updateVolunteerPrintStatus(volunteer, "Non-imprimé")}
                        >
                          Retirer de la file
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!queuedVolunteers.length ? (
                    <tr>
                      <td colSpan="4">Aucune personne n'est actuellement dans la file d'impression.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="table-actions table-actions--inline">
              <button
                className="button button--primary"
                type="button"
                onClick={finalizePrintQueue}
                disabled={!queuedVolunteers.length}
              >
                Générer les 2 PDF ({queuedVolunteers.length})
              </button>
            </div>

            <div className="accreditation-print-note">
              Le premier document contient les badges à imprimer, le second la liste des badges imprimés pour le lot.
            </div>
          </Panel>

          <Panel
            title="Historique des impressions"
            subtitle="Suivi cumulatif des badges déjà générés."
          >
            <div className="table-wrap">
              <table className="data-table data-table--admin">
                <thead>
                  <tr>
                    <th>Personne</th>
                    <th>Rôle badge</th>
                    <th>Zones</th>
                    <th>Imprimé le</th>
                  </tr>
                </thead>
                <tbody>
                  {printHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.name || "-"}</td>
                      <td>{entry.roleLabel || "-"}</td>
                      <td>{entry.zoneLabels.join(", ") || "Aucune zone"}</td>
                      <td>{entry.printedAt ? formatDateTimeForDisplay(entry.printedAt) : "-"}</td>
                    </tr>
                  ))}
                  {!printHistory.length ? (
                    <tr>
                      <td colSpan="4">Aucune impression enregistrée pour le moment.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      )}
    </div>
  );
}

function U14Page() {
  const { requests, loading: requestsLoading, error: requestsError } = useU14RequestsList(true);
  const { children, loading: childrenLoading, error: childrenError } = useU14ChildrenList(true);
  const {
    entries: protectedEntries,
    loading: protectedEntriesLoading,
    error: protectedEntriesError,
  } = useProtectedU14Entries(true);
  const {
    preprogram: preprogramPracticalInfo,
    porte_panier: basketPracticalInfo,
    loading: practicalInfoLoading,
    error: practicalInfoError,
  } = useU14PracticalInfoConfiguration(true);
  const [selectedRaceCode, setSelectedRaceCode] = useState(U14_RACE_DEFINITIONS[0]?.code || "");
  const [activeU14Tab, setActiveU14Tab] = useState("preprogram");
  const [practicalInfoForm, setPracticalInfoForm] = useState({ preprogram: "", porte_panier: "" });
  const [requestSearch, setRequestSearch] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("Tous");
  const [requestRaceFilter, setRequestRaceFilter] = useState("Toutes");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [reservationForm, setReservationForm] = useState({
    raceCode: U14_RACE_DEFINITIONS[0]?.code || "",
    slotNumber: "1",
    firstName: "",
    lastName: "",
    club: "",
    bibNumber: "",
    parentEmail: "",
    inviteDeadline: "",
  });
  useEffect(() => {
    setPracticalInfoForm({
      preprogram: preprogramPracticalInfo,
      porte_panier: basketPracticalInfo,
    });
  }, [basketPracticalInfo, preprogramPracticalInfo]);
  const dataLoading = requestsLoading || childrenLoading || protectedEntriesLoading;
  const { requestRecords, raceSummaries } = useMemo(
    () => buildU14AllocationSnapshot({ requests, children, protectedEntries }),
    [children, protectedEntries, requests],
  );
  const selectedRaceSummary = raceSummaries.find((summary) => summary.code === selectedRaceCode) || raceSummaries[0] || null;
  const selectedRaceRequests = useMemo(
    () =>
      requestRecords
        .filter((request) => request.raceCode === selectedRaceCode && request.requestType !== "porte_panier")
        .sort((left, right) => {
          const leftStatus = normalizeComparableValue(left.status);
          const rightStatus = normalizeComparableValue(right.status);
          const statusPriority = {
            confirmed: 0,
            waitlisted: 1,
            submitted: 2,
            declined: 3,
            rejected: 4,
          };
          const priorityDifference =
            (statusPriority[leftStatus] ?? 99) - (statusPriority[rightStatus] ?? 99);
          if (priorityDifference !== 0) return priorityDifference;
          if (left.submittedAtMs !== right.submittedAtMs) return left.submittedAtMs - right.submittedAtMs;
          return left.childName.localeCompare(right.childName, "fr");
        }),
    [requestRecords, selectedRaceCode],
  );
  const filteredProtectedEntries = useMemo(
    () =>
      protectedEntries
        .filter((entry) => !selectedRaceCode || entry.raceCode === selectedRaceCode)
        .sort((left, right) => {
          if (left.raceCode !== right.raceCode) return left.raceCode.localeCompare(right.raceCode);
          return Number(left.slotNumber || 0) - Number(right.slotNumber || 0);
        }),
    [protectedEntries, selectedRaceCode],
  );
  const waitingRequests = useMemo(
    () =>
      requestRecords.filter(
        (request) =>
          request.raceCode === selectedRaceCode &&
          request.requestType !== "porte_panier" &&
          normalizeComparableValue(request.status) === "waitlisted",
      ),
    [requestRecords, selectedRaceCode],
  );
  const selectedRaceProtectedPendingEntries = useMemo(
    () =>
      filteredProtectedEntries.filter(
        (entry) =>
          !["matched", "released"].includes(normalizeComparableValue(entry.status)),
      ),
    [filteredProtectedEntries],
  );
  const basketRequests = useMemo(
    () =>
      requestRecords
        .filter((request) => request.requestType === "porte_panier")
        .sort((left, right) => left.submittedAtMs - right.submittedAtMs),
    [requestRecords],
  );
  const chronologicalRequests = useMemo(
    () =>
      [...requestRecords]
        .sort((left, right) => left.submittedAtMs - right.submittedAtMs)
        .map((request) => ({
          child: request.childName,
          type:
            request.requestType === "porte_panier"
              ? "Porte-panier"
              : request.requestType === "preprogram_ou_porte_panier"
                ? "Pré-programme ou porte-panier"
                : "Pré-programme",
          race: request.requestType === "porte_panier" ? "-" : request.raceLabel,
          parent: request.parentName,
          submittedAt: request.submittedAtMs ? formatDateTimeForDisplay(request.submittedAtMs) : "-",
          status: getU14WorkflowStatusLabel(request),
          position:
            normalizeComparableValue(request.status) === "confirmed"
              ? `Accepté${request.acceptedPosition ? ` (${request.acceptedPosition})` : ""}`
              : request.waitlistPosition
                ? `Attente ${request.waitlistPosition}`
                : "-",
          admin:
            normalizeComparableValue(request.adminApprovalStatus) === "approved"
              ? getAdminApprovalLabel(request.adminApprovalStatus)
              : "Validation admin requise",
        })),
    [requestRecords],
  );
  const filteredAdminRequests = useMemo(() => {
    const normalizedSearch = normalizeComparableValue(requestSearch);

    return requestRecords
      .filter((request) => request.requestType !== "porte_panier")
      .filter((request) => {
        if (requestStatusFilter === "Tous") return true;
        return getU14WorkflowStatusLabel(request) === requestStatusFilter;
      })
      .filter((request) => {
        if (requestRaceFilter === "Toutes") return true;
        return request.raceCode === requestRaceFilter;
      })
      .filter((request) => {
        if (!normalizedSearch) return true;

        const haystack = normalizeComparableValue(
          [
            request.childName,
            request.parentName,
            request.raceLabel,
            request.club,
            request.bibNumber,
            getU14WorkflowStatusLabel(request),
          ]
            .filter(Boolean)
            .join(" "),
        );

        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => left.raceCode.localeCompare(right.raceCode) || left.submittedAtMs - right.submittedAtMs);
  }, [requestRaceFilter, requestRecords, requestSearch, requestStatusFilter]);
  const slotSuggestionsById = useMemo(
    () =>
      filteredProtectedEntries.reduce((accumulator, entry) => {
        accumulator[entry.id] = requestRecords.filter((request) => doesProtectedSlotMatchRequest(entry, request));
        return accumulator;
      }, {}),
    [filteredProtectedEntries, requestRecords],
  );
  const selectedRaceTableRows = useMemo(() => {
    const protectedRows = selectedRaceProtectedPendingEntries.map((entry) => ({
      type: "Place protégée",
      child: `${entry.firstName || ""} ${entry.lastName || ""}`.trim() || `Place protégée ${entry.slotNumber || "?"}`,
      club: entry.club || "-",
      bib: entry.bibNumber || "-",
      status: getProtectedSlotStatusLabel(entry.status),
      position: `Réservée (${entry.slotNumber || "?"})`,
      parent: entry.parentEmail || "-",
      submittedAt: entry.createdAt ? formatDateTimeForDisplay(getTimestampMs(entry.createdAt)) : "-",
    }));

    const requestRows = selectedRaceRequests.map((request) => ({
      type: "Demande",
      child: request.childName,
      club: request.club || "-",
      bib: request.bibNumber || "-",
      status: formatU14RequestStatusLabel(request.status),
      position:
        normalizeComparableValue(request.status) === "confirmed"
          ? request.acceptedPosition
            ? `Accepté (${request.acceptedPosition})`
            : "Accepté"
          : normalizeComparableValue(request.status) === "waitlisted"
            ? `Attente ${request.waitlistPosition || request.queuePosition || "?"}`
            : "-",
      parent: request.parentName || "-",
      submittedAt: request.submittedAtMs
        ? formatDateTimeForDisplay(request.submittedAtMs)
        : "-",
    }));

    return [...protectedRows, ...requestRows];
  }, [selectedRaceProtectedPendingEntries, selectedRaceRequests]);

  function handleReservationFormChange(event) {
    const { name, value } = event.target;
    setReservationForm((current) => ({ ...current, [name]: value }));
  }

  async function handleCreateProtectedEntry(event) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");

    const raceEntries = protectedEntries.filter(
      (entry) => entry.raceCode === reservationForm.raceCode && isProtectedSlotActive(entry),
    );
    if (raceEntries.length >= U14_RESERVED_SLOTS_PER_RACE) {
      setErrorMessage("Cette catégorie a déjà ses 3 places protégées actives.");
      return;
    }

    setIsSaving(true);
    try {
      await addDoc(collection(db, U14_RESERVED_SLOTS_COLLECTION), {
        raceCode: reservationForm.raceCode,
        slotNumber: Number(reservationForm.slotNumber || 1),
        firstName: reservationForm.firstName.trim(),
        lastName: reservationForm.lastName.trim(),
        club: reservationForm.club.trim(),
        bibNumber: reservationForm.bibNumber.trim(),
        parentEmail: reservationForm.parentEmail.trim(),
        inviteDeadline: reservationForm.inviteDeadline || null,
        status: "invited",
        createdAt: serverTimestamp(),
      });

      if (reservationForm.parentEmail.trim()) {
        await enqueueTransactionalMail({
          type: "u14-protected-invitation",
          to: reservationForm.parentEmail.trim(),
          subject: "Votre enfant est pré-sélectionné pour le CMCM Luxembourg Indoor Meeting 2027",
          body: `Bonjour,\n\nVotre enfant ${reservationForm.firstName.trim()} ${reservationForm.lastName.trim()} est pré-sélectionné pour ${getU14RaceLabel(reservationForm.raceCode)}. Merci de compléter son inscription sur MyCLIM avant le ${formatDateForDisplay(reservationForm.inviteDeadline)}. Sans dossier complété avant cette date, nous ne pourrons pas garantir de conserver cette place protégée.\n`,
          metadata: {
            raceCode: reservationForm.raceCode,
            slotNumber: Number(reservationForm.slotNumber || 1),
            bibNumber: reservationForm.bibNumber.trim(),
          },
        });
      }

      setStatusMessage("Place protégée enregistrée et mail d'invitation placé dans la file d'envoi.");
      setReservationForm((current) => ({
        ...current,
        firstName: "",
        lastName: "",
        club: "",
        bibNumber: "",
        parentEmail: "",
        inviteDeadline: "",
      }));
    } catch {
      setErrorMessage("Impossible d'enregistrer cette place protégée pour le moment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMatchProtectedEntry(entry, request) {
    setErrorMessage("");
    setStatusMessage("");
    setIsSaving(true);

    try {
      await updateDoc(doc(db, U14_RESERVED_SLOTS_COLLECTION, entry.id), {
        status: "matched",
        matchedRequestId: request.id,
        matchedChildId: request.childId || "",
        matchedParentUserId: request.parentUserId || "",
        matchedAt: serverTimestamp(),
      });

      await syncU14RaceAllocations({
        requests,
        children,
        protectedEntries: protectedEntries.map((current) =>
          current.id === entry.id
            ? { ...current, status: "matched", matchedRequestId: request.id }
            : current,
        ),
      });
      setStatusMessage(`La place protégée ${entry.slotNumber} a été matchée avec ${request.childName}.`);
    } catch {
      setErrorMessage("Le matching a échoué.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReleaseProtectedEntry(entry) {
    setErrorMessage("");
    setStatusMessage("");
    setIsSaving(true);

    try {
      await updateDoc(doc(db, U14_RESERVED_SLOTS_COLLECTION, entry.id), {
        status: "released",
        matchedRequestId: null,
        matchedChildId: null,
        matchedParentUserId: null,
        releasedAt: serverTimestamp(),
      });

      const nextProtectedEntries = protectedEntries.map((current) =>
        current.id === entry.id
          ? { ...current, status: "released", matchedRequestId: null }
          : current,
      );
      await syncU14RaceAllocations({ requests, children, protectedEntries: nextProtectedEntries });
      setStatusMessage(`La place protégée ${entry.slotNumber} a été libérée.`);
    } catch {
      setErrorMessage("Impossible de libérer cette place protégée.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRecalculateAllocations() {
    setErrorMessage("");
    setStatusMessage("");
    setIsSaving(true);

    try {
      await syncU14RaceAllocations({ requests, children, protectedEntries });
      setStatusMessage("Les statuts, places acceptées et listes d'attente ont été recalculés.");
    } catch {
      setErrorMessage("Le recalcul automatique a échoué.");
    } finally {
      setIsSaving(false);
    }
  }

  async function approvePreprogramRequest(request) {
    await updateDoc(doc(db, "u14Requests", request.id), {
      adminApprovalStatus: "approved",
      parentDecisionRequired: true,
      parentDecisionStatus: "pending",
      adminApprovedAt: serverTimestamp(),
    });

    if (request.parentEmail) {
      await enqueueTransactionalMail(
        buildU14PreprogramAcceptanceMail({
          parentEmail: request.parentEmail,
          childName: request.childName,
          raceLabel: request.raceLabel,
        }),
      );
    }
  }

  async function handleApproveRequest(request) {
    setErrorMessage("");
    setStatusMessage("");
    setIsSaving(true);

    try {
      await approvePreprogramRequest(request);
      setStatusMessage(`Validation envoyée au parent de ${request.childName}.`);
    } catch {
      setErrorMessage("Impossible de valider cette demande pour le moment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleProcessRequest(request) {
    setErrorMessage("");
    setStatusMessage("");
    setIsSaving(true);

    try {
      const [requestsSnapshot, childrenSnapshot, protectedSnapshot] = await Promise.all([
        getDocs(collection(db, "u14Requests")),
        getDocs(collection(db, "u14Children")),
        getDocs(collection(db, U14_RESERVED_SLOTS_COLLECTION)),
      ]);

      const latestRequests = requestsSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      const latestChildren = childrenSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      const latestProtectedEntries = protectedSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));

      await syncU14RaceAllocations({
        requests: latestRequests,
        children: latestChildren,
        protectedEntries: latestProtectedEntries,
      });

      const refreshedRequestsSnapshot = await getDocs(collection(db, "u14Requests"));
      const refreshedRequests = refreshedRequestsSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      const refreshedRequest = refreshedRequests.find((entry) => entry.id === request.id);

      if (!refreshedRequest) {
        setErrorMessage("Impossible de retrouver cette demande après recalcul.");
        return;
      }

      const refreshedChild = latestChildren.find((child) => child.id === refreshedRequest.childId);
      const refreshedRecord = buildU14RequestRecord(refreshedRequest, refreshedChild);
      const refreshedStatus = normalizeComparableValue(refreshedRecord.status);
      const refreshedApproval = normalizeComparableValue(refreshedRecord.adminApprovalStatus);

      if (refreshedStatus === "confirmed" && refreshedApproval !== "approved") {
        await approvePreprogramRequest(refreshedRecord);
        setStatusMessage(`Validation envoyée au parent de ${refreshedRecord.childName}.`);
        return;
      }

      if (refreshedStatus === "waitlisted") {
        setStatusMessage(`${refreshedRecord.childName} est actuellement en liste d'attente. Aucune validation admin à envoyer pour le moment.`);
        return;
      }

      setStatusMessage(
        `${refreshedRecord.childName} est actuellement au statut "${formatU14RequestStatusLabel(refreshedRecord.status)}".`,
      );
    } catch {
      setErrorMessage("Impossible de traiter cette demande pour le moment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleApproveBasketRequest(request) {
    setErrorMessage("");
    setStatusMessage("");
    setIsSaving(true);

    try {
      await updateDoc(doc(db, "u14Requests", request.id), {
        status: "confirmed",
        allocationMode: "porte_panier",
        adminApprovalStatus: "approved",
        parentDecisionRequired: true,
        parentDecisionStatus: "pending",
        adminApprovedAt: serverTimestamp(),
      });

      if (request.parentEmail) {
        await enqueueTransactionalMail(
          buildU14BasketAcceptanceMail({
            parentEmail: request.parentEmail,
            childName: request.childName,
          }),
        );
      }

      setStatusMessage(`Acceptation porte-panier envoyée au parent de ${request.childName}.`);
    } catch {
      setErrorMessage("Impossible de valider cette demande porte-panier pour le moment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSavePracticalInfo(event) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setIsSaving(true);

    try {
      await setDoc(
        doc(db, ...U14_PRACTICAL_INFO_DOC_PATH),
        {
          preprogram: practicalInfoForm.preprogram.trim(),
          porte_panier: practicalInfoForm.porte_panier.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setStatusMessage("Les informations pratiques ont été enregistrées.");
    } catch {
      setErrorMessage("Impossible d'enregistrer les informations pratiques pour le moment.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Module Pré-programme</p>
          <h1>Pré-programme</h1>
          <p>Attribution des demandes pré-programme, gestion des places protégées et suivi des confirmations parents.</p>
        </div>
      </section>

      {requestsError || childrenError || protectedEntriesError ? (
        <p className="status-note">{requestsError || childrenError || protectedEntriesError}</p>
      ) : null}
      {statusMessage ? <p className="panel-note panel-note--success">{statusMessage}</p> : null}
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      {dataLoading ? <p className="status-note">Chargement du module Pré-programme...</p> : null}

      <div className="admin-subtabs" role="tablist" aria-label="Navigation du module Pré-programme">
        <button
          className={`admin-subtab ${activeU14Tab === "preprogram" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveU14Tab("preprogram")}
        >
          Pré-programme
        </button>
        <button
          className={`admin-subtab ${activeU14Tab === "protected" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveU14Tab("protected")}
        >
          Places protégées
        </button>
        <button
          className={`admin-subtab ${activeU14Tab === "basket" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveU14Tab("basket")}
        >
          Porte-panier ({basketRequests.length})
        </button>
        <button
          className={`admin-subtab ${activeU14Tab === "timeline" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveU14Tab("timeline")}
        >
          Chronologie
        </button>
        <button
          className={`admin-subtab ${activeU14Tab === "practical" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveU14Tab("practical")}
        >
          Infos pratiques
        </button>
      </div>

      {activeU14Tab === "preprogram" ? (
        <>
          <section className="u14-overview-grid">
            <Panel
              title="Répartition par course"
              subtitle="Choisissez une course. Le détail complet s'affiche à droite."
              actions={
                <button className="button button--secondary" disabled={isSaving || dataLoading} type="button" onClick={handleRecalculateAllocations}>
                  {isSaving ? "Mise à jour..." : "Recalculer les statuts"}
                </button>
              }
            >
              <div className="u14-race-grid">
                {raceSummaries.map((summary) => (
                  <button
                    key={summary.code}
                    className={`selection-card u14-race-card ${selectedRaceCode === summary.code ? "u14-race-card--active" : ""}`}
                    type="button"
                    onClick={() => {
                      setSelectedRaceCode(summary.code);
                      setReservationForm((current) => ({ ...current, raceCode: summary.code }));
                    }}
                  >
                    <div className="u14-race-card__head">
                      <strong>{summary.label}</strong>
                      <span className="u14-race-card__remaining">{summary.remainingPlaces} restante(s)</span>
                    </div>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel
              title="Tableau de la course sélectionnée"
              subtitle="Vue tableau avec les demandes et les places protégées en attente pour la course choisie."
            >
              <div className="notice-card notice-card--ok">
                <strong>{selectedRaceSummary?.label || "Course non définie"}</strong>
                <p>
                  {selectedRaceSummary?.totalPlaces || 0} place(s) au total, {selectedRaceSummary?.protectedPlaces || 0} protégée(s),{" "}
                  {selectedRaceSummary?.takenPlaces || 0} prise(s), {selectedRaceSummary?.remainingPlaces || 0} restante(s).
                </p>
              </div>

              <DataTable
                columns={[
                  { key: "type", label: "Type" },
                  { key: "child", label: "Enfant" },
                  { key: "club", label: "Club" },
                  { key: "bib", label: "Dossard" },
                  { key: "status", label: "Statut" },
                  { key: "position", label: "Position" },
                  { key: "parent", label: "Parent / contact" },
                  { key: "submittedAt", label: "Date" },
                ]}
                rows={
                  selectedRaceTableRows.length
                    ? selectedRaceTableRows
                    : [
                        {
                          type: "-",
                          child: "Aucun enfant sur cette course",
                          club: "-",
                          bib: "-",
                          status: "-",
                          position: "-",
                          parent: "-",
                          submittedAt: "-",
                        },
                      ]
                }
              />
            </Panel>
          </section>

          <Panel
            title="Demandes reçues"
            subtitle="Vue consolidée avec statut parent, position et mode d'attribution."
            actions={
              <button className="button button--secondary" disabled={isSaving || dataLoading} type="button" onClick={handleRecalculateAllocations}>
                {isSaving ? "Mise à jour..." : "Recalculer les statuts"}
              </button>
            }
          >
            <div className="admin-toolbar">
              <AuthFormField label="Rechercher une demande">
                <input
                  placeholder="Enfant, parent, course, club, dossard..."
                  type="search"
                  value={requestSearch}
                  onChange={(event) => setRequestSearch(event.target.value)}
                />
              </AuthFormField>
              <div className="team-toolbar-main">
                <AuthFormField label="Statut">
                  <select value={requestStatusFilter} onChange={(event) => setRequestStatusFilter(event.target.value)}>
                    <option value="Tous">Tous</option>
                    <option value="Demande enregistrée">Demande enregistrée</option>
                    <option value="Retenu">Retenu</option>
                    <option value="Validé">Validé</option>
                    <option value="Liste d'attente">Liste d'attente</option>
                    <option value="Désisté">Désisté</option>
                    <option value="Non retenue">Non retenue</option>
                  </select>
                </AuthFormField>
                <AuthFormField label="Course">
                  <select value={requestRaceFilter} onChange={(event) => setRequestRaceFilter(event.target.value)}>
                    <option value="Toutes">Toutes</option>
                    {U14_RACE_DEFINITIONS.map((definition) => (
                      <option key={definition.code} value={definition.code}>
                        {definition.label}
                      </option>
                    ))}
                  </select>
                </AuthFormField>
              </div>
            </div>

            <DataTable
              columns={[
                { key: "child", label: "Enfant" },
                { key: "race", label: "Course" },
                { key: "parent", label: "Responsable" },
                { key: "submittedAt", label: "Date / heure" },
                { key: "status", label: "Statut" },
                { key: "position", label: "Position" },
                { key: "admin", label: "Validation admin" },
                { key: "decision", label: "Réponse parent" },
                { key: "actions", label: "Action" },
              ]}
              rows={
                filteredAdminRequests.length
                  ? filteredAdminRequests.map((request) => ({
                        child: request.childName,
                        race: request.raceLabel,
                        parent: request.parentName,
                        submittedAt: request.submittedAtMs ? formatDateTimeForDisplay(request.submittedAtMs) : "-",
                        status: getU14WorkflowStatusLabel(request),
                        position:
                          normalizeComparableValue(request.status) === "confirmed"
                            ? `Accepté${request.acceptedPosition ? ` (${request.acceptedPosition})` : ""}`
                            : request.waitlistPosition
                              ? `Attente ${request.waitlistPosition}`
                              : "-",
                        admin:
                          normalizeComparableValue(request.adminApprovalStatus) === "approved"
                            ? getAdminApprovalLabel(request.adminApprovalStatus)
                            : "Validation admin requise",
                        decision:
                          normalizeComparableValue(request.adminApprovalStatus) === "approved"
                            ? getParentDecisionLabel(request.parentDecisionStatus)
                            : "En attente validation admin",
                        __rowClass:
                          normalizeComparableValue(request.status) === "declined" ||
                          normalizeComparableValue(request.parentDecisionStatus) === "declined"
                            ? "data-table__row--danger"
                            : normalizeComparableValue(request.adminApprovalStatus) === "approved" &&
                                normalizeComparableValue(request.parentDecisionStatus) === "confirmed"
                              ? "data-table__row--success"
                              : "",
                        actions:
                          normalizeComparableValue(request.adminApprovalStatus) !== "approved" &&
                          normalizeComparableValue(request.status) !== "declined" &&
                          normalizeComparableValue(request.status) !== "rejected" ? (
                            <button
                              className="button button--secondary"
                              type="button"
                              disabled={isSaving}
                              onClick={() =>
                                normalizeComparableValue(request.status) === "confirmed"
                                  ? handleApproveRequest(request)
                                  : handleProcessRequest(request)
                              }
                            >
                              {normalizeComparableValue(request.status) === "confirmed"
                                ? "Valider et envoyer"
                                : "Traiter la demande"}
                            </button>
                          ) : (
                            "-"
                          ),
                      }))
                  : [{ child: "Aucune demande", race: "-", parent: "-", submittedAt: "-", status: "-", position: "-", admin: "-", decision: "-", actions: "-" }]
              }
            />
          </Panel>
        </>
      ) : null}

      {activeU14Tab === "protected" ? (
        <Panel
          title="Gestion des places protégées"
          subtitle="Création, matching et suivi des places protégées sur la course sélectionnée."
        >
          <div className="notice-card notice-card--ok">
            <strong>{selectedRaceSummary?.label || "Course non définie"}</strong>
            <p>
              {filteredProtectedEntries.length} place(s) protégée(s) active(s), {waitingRequests.length} enfant(s)
              actuellement en liste d'attente sur cette course.
            </p>
          </div>

          <form className="profile-form" onSubmit={handleCreateProtectedEntry}>
            <div className="field-grid">
              <AuthFormField label="Catégorie / course">
                <select name="raceCode" value={reservationForm.raceCode} onChange={handleReservationFormChange}>
                  {U14_RACE_DEFINITIONS.map((definition) => (
                    <option key={definition.code} value={definition.code}>
                      {definition.label}
                    </option>
                  ))}
                </select>
              </AuthFormField>
              <AuthFormField label="Place protégée">
                <select name="slotNumber" value={reservationForm.slotNumber} onChange={handleReservationFormChange}>
                  {[1, 2, 3].map((slotNumber) => (
                    <option key={slotNumber} value={slotNumber}>
                      Place {slotNumber}
                    </option>
                  ))}
                </select>
              </AuthFormField>
            </div>
            <div className="field-grid">
              <AuthFormField label="Prénom enfant">
                <input name="firstName" required value={reservationForm.firstName} onChange={handleReservationFormChange} />
              </AuthFormField>
              <AuthFormField label="Nom enfant">
                <input name="lastName" required value={reservationForm.lastName} onChange={handleReservationFormChange} />
              </AuthFormField>
            </div>
            <div className="field-grid">
              <AuthFormField label="Club">
                <input name="club" required value={reservationForm.club} onChange={handleReservationFormChange} />
              </AuthFormField>
              <AuthFormField label="Dossard">
                <input name="bibNumber" required value={reservationForm.bibNumber} onChange={handleReservationFormChange} />
              </AuthFormField>
            </div>
            <div className="field-grid">
              <AuthFormField label="Email parent">
                <input name="parentEmail" required type="email" value={reservationForm.parentEmail} onChange={handleReservationFormChange} />
              </AuthFormField>
              <AuthFormField label="Date limite d'inscription">
                <input name="inviteDeadline" required type="date" value={reservationForm.inviteDeadline} onChange={handleReservationFormChange} />
              </AuthFormField>
            </div>
            <div className="profile-form__actions">
              <button className="button button--primary" disabled={isSaving} type="submit">
                {isSaving ? "Enregistrement..." : "Créer la place protégée"}
              </button>
            </div>
          </form>

          <DataTable
            columns={[
              { key: "slot", label: "Place" },
              { key: "child", label: "Enfant protégé" },
              { key: "status", label: "Statut" },
              { key: "match", label: "Meilleur matching" },
              { key: "actions", label: "Actions" },
            ]}
            rows={
              filteredProtectedEntries.length
                ? filteredProtectedEntries.map((entry) => {
                    const suggestions = slotSuggestionsById[entry.id] || [];
                    const firstSuggestion = suggestions[0] || null;

                    return {
                      slot: `Place ${entry.slotNumber}`,
                      child: `${entry.firstName || ""} ${entry.lastName || ""}`.trim(),
                      status: getProtectedSlotStatusLabel(entry.status),
                      match: firstSuggestion ? (
                        <div className="compact-list compact-list--actions">
                          <span>
                            {firstSuggestion.childName} - dossard {firstSuggestion.bibNumber || "?"}
                          </span>
                        </div>
                      ) : (
                        "Aucune inscription matchée"
                      ),
                      actions: (
                        <div className="table-actions">
                          {firstSuggestion && normalizeComparableValue(entry.status) !== "matched" ? (
                            <button
                              className="button button--secondary"
                              type="button"
                              onClick={() => handleMatchProtectedEntry(entry, firstSuggestion)}
                            >
                              Matcher
                            </button>
                          ) : null}
                          {normalizeComparableValue(entry.status) !== "released" ? (
                            <button
                              className="button button--secondary"
                              type="button"
                              onClick={() => handleReleaseProtectedEntry(entry)}
                            >
                              Libérer
                            </button>
                          ) : null}
                        </div>
                      ),
                    };
                  })
                : [{ slot: "Aucune place protégée", child: "-", status: "-", match: "-", actions: "-" }]
            }
          />

          <DataTable
            columns={[
              { key: "child", label: "Enfant en attente" },
              { key: "parent", label: "Responsable" },
              { key: "place", label: "Place attente" },
            ]}
            rows={
              waitingRequests.length
                ? waitingRequests.map((request) => ({
                    child: request.childName,
                    parent: request.parentName,
                    place: request.waitlistPosition || "-",
                  }))
                : [{ child: "Aucune attente sur cette course", parent: "-", place: "-" }]
            }
          />
        </Panel>
      ) : null}

      {activeU14Tab === "basket" ? (
        <Panel title="Demandes porte-panier" subtitle="Validation manuelle avec envoi du mail parent depuis la même file transactionnelle.">
          <DataTable
            columns={[
              { key: "child", label: "Enfant" },
              { key: "parent", label: "Responsable" },
              { key: "status", label: "Statut" },
              { key: "admin", label: "Validation admin" },
              { key: "decision", label: "Réponse parent" },
              { key: "actions", label: "Action" },
            ]}
            rows={
              basketRequests.length
                ? basketRequests.map((request) => ({
                    child: request.childName,
                    parent: request.parentName,
                    status: getU14WorkflowStatusLabel(request),
                    admin:
                      normalizeComparableValue(request.status) === "confirmed"
                        ? getAdminApprovalLabel(request.adminApprovalStatus)
                        : "Validation admin requise",
                    decision:
                      normalizeComparableValue(request.adminApprovalStatus) === "approved"
                        ? getParentDecisionLabel(request.parentDecisionStatus)
                        : "En attente validation admin",
                    actions:
                      normalizeComparableValue(request.adminApprovalStatus) !== "approved" ? (
                        <button
                          className="button button--secondary"
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleApproveBasketRequest(request)}
                        >
                          Valider porte-panier
                        </button>
                      ) : (
                        "-"
                      ),
                  }))
                : [{ child: "Aucune demande porte-panier", parent: "-", status: "-", admin: "-", decision: "-", actions: "-" }]
            }
          />
        </Panel>
      ) : null}

      {activeU14Tab === "timeline" ? (
        <Panel
          title="Toutes les demandes par ordre chronologique"
          subtitle="Vue globale de toutes les demandes avec date et heure de soumission."
        >
          <DataTable
            columns={[
              { key: "submittedAt", label: "Date / heure" },
              { key: "child", label: "Enfant" },
              { key: "type", label: "Type" },
              { key: "race", label: "Course" },
              { key: "parent", label: "Responsable" },
              { key: "status", label: "Statut" },
              { key: "position", label: "Position" },
              { key: "admin", label: "Validation admin" },
            ]}
            rows={
              chronologicalRequests.length
                ? chronologicalRequests
                : [{ submittedAt: "-", child: "Aucune demande", type: "-", race: "-", parent: "-", status: "-", position: "-", admin: "-" }]
            }
          />
        </Panel>
      ) : null}

      {activeU14Tab === "practical" ? (
        <Panel
          title="Informations pratiques"
          subtitle="Un texte par rôle. Il sera affiché dans l'espace parent une fois la demande validée."
        >
          {practicalInfoError ? <p className="form-error">{practicalInfoError}</p> : null}
          {practicalInfoLoading ? <p className="panel-note">Chargement des informations pratiques...</p> : null}
          <form className="profile-form" onSubmit={handleSavePracticalInfo}>
            <AuthFormField label="Texte Pré-programme">
              <textarea
                rows="6"
                value={practicalInfoForm.preprogram}
                onChange={(event) =>
                  setPracticalInfoForm((current) => ({ ...current, preprogram: event.target.value }))
                }
              />
            </AuthFormField>
            <AuthFormField label="Texte Porte-panier">
              <textarea
                rows="6"
                value={practicalInfoForm.porte_panier}
                onChange={(event) =>
                  setPracticalInfoForm((current) => ({ ...current, porte_panier: event.target.value }))
                }
              />
            </AuthFormField>
            <div className="profile-form__actions">
              <button className="button button--primary" disabled={isSaving} type="submit">
                {isSaving ? "Enregistrement..." : "Enregistrer les infos pratiques"}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}

function TeamPage() {
  const { currentUser, userProfile } = useAuth();
  const { roles, teamAssignments, loading, error } = useTeamConfiguration();
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [documentDraft, setDocumentDraft] = useState("");
  const userIdentitySet = useMemo(
    () => buildUserIdentitySet(userProfile, currentUser),
    [currentUser, userProfile],
  );
  const myAssignments = useMemo(
    () =>
      teamAssignments.filter((member) =>
        [
          member.id,
          member.email,
          `${member.firstName} ${member.lastName}`.trim(),
        ]
          .map((value) => String(value || "").trim().toLowerCase())
          .some((value) => value && userIdentitySet.has(value)),
      ),
    [teamAssignments, userIdentitySet],
  );
  const myLeadAssignments = useMemo(
    () => myAssignments.filter((assignment) => isTeamLeadAssignment(assignment)),
    [myAssignments],
  );
  const myLeadRoleIds = useMemo(
    () =>
      roles
        .filter((role) =>
          userIdentitySet.has(String(role.leaderName || "").trim().toLowerCase()) ||
          myLeadAssignments.some((assignment) => assignment.assignedRoleId === role.id),
        )
        .map((role) => role.id),
    [myLeadAssignments, roles, userIdentitySet],
  );
  const availableRoles = useMemo(() => {
    const visibleRoleIds = new Set([...myLeadAssignments.map((assignment) => assignment.assignedRoleId), ...myLeadRoleIds]);

    const scopedRoles = roles.filter((role) => visibleRoleIds.has(role.id));

    if (scopedRoles.length > 0) return scopedRoles;
    return [];
  }, [myLeadAssignments, myLeadRoleIds, roles]);

  useEffect(() => {
    setSelectedRoleId((current) =>
      availableRoles.some((role) => role.id === current) ? current : availableRoles[0]?.id ?? "",
    );
  }, [availableRoles]);

  const selectedRole = availableRoles.find((role) => role.id === selectedRoleId) ?? availableRoles[0];
  const selectedRoleMembers = useMemo(
    () => teamAssignments.filter((member) => member.assignedRoleId === selectedRole?.id),
    [selectedRole, teamAssignments],
  );
  const myAssignment = useMemo(
    () =>
      myLeadAssignments.find((assignment) => assignment.assignedRoleId === selectedRole?.id) ??
      myLeadAssignments[0] ??
      null,
    [myLeadAssignments, selectedRole],
  );
  const teamLeadCount = selectedRoleMembers.filter((member) => member.teamRole === "Chef d'équipe").length;
  const replacementCount = selectedRoleMembers.filter((member) => member.teamRole === "Remplaçant").length;
  const volunteerCount = selectedRoleMembers.filter((member) => member.teamRole !== "Remplaçant").length;
  const teamRows = selectedRoleMembers.map((member) => ({
    name: `${member.firstName} ${member.lastName}`.trim() || member.email || "Bénévole",
    mission: member.teamRole,
    contact: member.email || member.phone || "Contact non renseigné",
  }));

  function addDocument() {
    if (!documentDraft.trim()) return;
    setDocumentDraft("");
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Chef d'equipe</p>
          <h1>Mon équipe</h1>
          <p>Vue opérationnelle limitée à l'équipe dont la personne est responsable.</p>
        </div>
      </section>

      {error ? <p className="status-note">{error}</p> : null}
      {loading ? <p className="status-note">Chargement de l'équipe...</p> : null}

      {selectedRole ? (
        <>
          <div className="admin-toolbar">
            <label className="field">
              <span>Équipe</span>
              <select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>
                {availableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.roleName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section className="panel-grid panel-grid--2">
            <Panel title="Mon affectation" subtitle="Ce que je pilote personnellement sur cette équipe.">
              <dl className="detail-list">
                <div>
                  <dt>Fonction</dt>
                  <dd>{myAssignment?.teamRole || "Chef d'équipe"}</dd>
                </div>
                <div>
                  <dt>Équipe</dt>
                  <dd>{selectedRole.roleName}</dd>
                </div>
                <div>
                  <dt>Briefing</dt>
                  <dd>{selectedRole.briefingTime || "À confirmer"}</dd>
                </div>
                <div>
                  <dt>Créneau équipe</dt>
                  <dd>{selectedRole.shiftTime || "À confirmer"}</dd>
                </div>
              </dl>
            </Panel>

            <Panel title="Chef d'équipe">
              <dl className="detail-list">
                <div>
                  <dt>Nom</dt>
                  <dd>{selectedRole.leaderName}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{selectedRole.leaderContact}</dd>
                </div>
                <div>
                  <dt>Briefing</dt>
                  <dd>{selectedRole.briefingTime}</dd>
                </div>
                <div>
                  <dt>Horaire du poste</dt>
                  <dd>{selectedRole.shiftTime}</dd>
                </div>
              </dl>
            </Panel>

            <Panel title="Informations générales">
              <AuthFormField label="Message d'équipe">
                <textarea
                  rows="5"
                  value={selectedRole.teamInfo}
                  placeholder={selectedRole.teamInfoPlaceholder || "Informations générales pour l'équipe"}
                  readOnly
                />
              </AuthFormField>
            </Panel>
          </section>

          <Panel
            title="Documents équipe"
            subtitle="Le chef d'équipe ou l'admin peut importer, compléter et mettre à jour les documents utiles."
            actions={
              <div className="table-actions">
                <input
                  placeholder="Ajouter un document ou un lien"
                  value={documentDraft}
                  readOnly
                />
                <button className="button button--secondary" disabled type="button" onClick={addDocument}>
                  Bientôt disponible
                </button>
              </div>
            }
          >
            <div className="document-tag-list">
              {selectedRole.documents.map((document) => (
                <span key={document} className="document-tag">
                  {document}
                </span>
              ))}
            </div>
          </Panel>

          <Panel title="Membres affectés">
            <div className="team-selection-summary" aria-live="polite">
              <div className="team-summary-pill">
                <strong>{volunteerCount}</strong>
                <span>Membres actifs</span>
              </div>
              <div className="team-summary-pill">
                <strong>{teamLeadCount}</strong>
                <span>Chefs d'équipe</span>
              </div>
              <div className="team-summary-pill">
                <strong>{replacementCount}</strong>
                <span>Remplaçants</span>
              </div>
              <div className="team-summary-pill">
                <strong>{Math.max(selectedRole.neededCount - volunteerCount, 0)}</strong>
                <span>Postes à compléter</span>
              </div>
            </div>
            <DataTable
              columns={[
                { key: "name", label: "Nom" },
                { key: "mission", label: "Fonction" },
                { key: "contact", label: "Contact" },
              ]}
              rows={teamRows.length ? teamRows : [{ name: "Aucun membre affecté", mission: "-", contact: "-" }]}
            />
          </Panel>
        </>
      ) : (
        <Panel title="Mon équipe">
          <p className="panel-note">Aucune équipe n'est encore liée à ce profil.</p>
        </Panel>
      )}
    </div>
  );
}

function PresencePage() {
  const { currentUser, userProfile } = useAuth();
  const activeRoles = getActiveRoles(userProfile);
  const canManageAllTeams = activeRoles.includes("admin") || activeRoles.includes("gestionnaire");
  const { roles, teamAssignments, loading: teamsLoading, error: teamsError } = useTeamConfiguration();
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [departureDrafts, setDepartureDrafts] = useState({});
  const userIdentitySet = useMemo(
    () => buildUserIdentitySet(userProfile, currentUser),
    [currentUser, userProfile],
  );

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setUsers(
          snapshot.docs.map((userSnapshot) => ({
            id: userSnapshot.id,
            ...userSnapshot.data(),
          })),
        );
        setUsersLoading(false);
        setUsersError("");
      },
      () => {
        setUsers([]);
        setUsersLoading(false);
        setUsersError("Impossible de charger les présences pour le moment.");
      },
    );

    return unsubscribe;
  }, []);

  const allVolunteers = useMemo(() => buildAccreditationUsers(users, teamAssignments), [teamAssignments, users]);
  const myAssignments = useMemo(
    () =>
      teamAssignments.filter((member) =>
        [
          member.id,
          member.email,
          `${member.firstName} ${member.lastName}`.trim(),
        ]
          .map((value) => String(value || "").trim().toLowerCase())
          .some((value) => value && userIdentitySet.has(value)),
      ),
    [teamAssignments, userIdentitySet],
  );
  const myLeadAssignments = useMemo(
    () => myAssignments.filter((assignment) => isTeamLeadAssignment(assignment)),
    [myAssignments],
  );
  const myLeadRoleIds = useMemo(
    () =>
      roles
        .filter((role) =>
          userIdentitySet.has(String(role.leaderName || "").trim().toLowerCase()) ||
          myLeadAssignments.some((assignment) => assignment.assignedRoleId === role.id),
        )
        .map((role) => role.id),
    [myLeadAssignments, roles, userIdentitySet],
  );
  const availableRoles = useMemo(() => {
    if (canManageAllTeams) return roles;

    const visibleRoleIds = new Set([...myLeadAssignments.map((assignment) => assignment.assignedRoleId), ...myLeadRoleIds]);
    return roles.filter((role) => visibleRoleIds.has(role.id));
  }, [canManageAllTeams, myLeadAssignments, myLeadRoleIds, roles]);

  const effectiveSelectedRoleId =
    availableRoles.some((role) => role.id === selectedRoleId) ? selectedRoleId : availableRoles[0]?.id ?? "";
  const selectedRole = availableRoles.find((role) => role.id === effectiveSelectedRoleId) ?? availableRoles[0] ?? null;
  const visibleVolunteers = useMemo(() => {
    if (canManageAllTeams) return allVolunteers;

    const allowedRoleIds = new Set(availableRoles.map((role) => role.id));
    return allVolunteers.filter((volunteer) =>
      teamAssignments.some(
        (assignment) => assignment.id === volunteer.id && allowedRoleIds.has(assignment.assignedRoleId),
      ),
    );
  }, [allVolunteers, availableRoles, canManageAllTeams, teamAssignments]);

  const volunteersWithTeams = useMemo(
    () =>
      visibleVolunteers.map((volunteer) => {
        const assignments = teamAssignments.filter((assignment) => assignment.id === volunteer.id);
        const teamNames = normalizeSubRoles(assignments.map((assignment) => assignment.assignedRole).filter(Boolean));
        const scopedAssignments = selectedRole
          ? assignments.filter((assignment) => assignment.assignedRoleId === selectedRole.id)
          : assignments;
        const scopedTeamRole = scopedAssignments[0]?.teamRole || assignments[0]?.teamRole || volunteer.teamRole || "Bénévole";

        return {
          ...volunteer,
          presence: normalizePresenceRecord(volunteer.presence),
          teamNames,
          scopedTeamRole,
          primaryTeam: teamNames[0] || volunteer.assignedRole || "En attente",
        };
      }),
    [selectedRole, teamAssignments, visibleVolunteers],
  );

  const normalizedSearch = normalizeSearchValue(search);
  const filteredSearchResults = useMemo(() => {
    const searchBase = selectedRole
      ? volunteersWithTeams.filter((volunteer) => volunteer.teamNames.includes(selectedRole.roleName))
      : volunteersWithTeams;

    return searchBase
      .filter((volunteer) => {
        if (!normalizedSearch) return true;
        const haystack = normalizeSearchValue(
          [
            volunteer.firstName,
            volunteer.lastName,
            volunteer.email,
            volunteer.primaryTeam,
            ...(volunteer.teamNames || []),
          ].join(" "),
        );
        return normalizedSearch
          .split(/\s+/)
          .filter(Boolean)
          .every((term) => haystack.includes(term));
      })
      .slice(0, 12);
  }, [normalizedSearch, selectedRole, volunteersWithTeams]);

  const teamMembers = useMemo(() => {
    if (!selectedRole) return [];
    return volunteersWithTeams.filter((volunteer) => volunteer.teamNames.includes(selectedRole.roleName));
  }, [selectedRole, volunteersWithTeams]);

  const presentCount = volunteersWithTeams.filter((volunteer) => volunteer.presence.status === "present").length;
  const absentCount = Math.max(volunteersWithTeams.length - presentCount, 0);
  const lunchCount = volunteersWithTeams.filter((volunteer) => volunteer.presence.lunchCollectedAt).length;
  const completedCount = volunteersWithTeams.filter((volunteer) => volunteer.presence.missionCompletedAt).length;
  const selectedTeamPresentCount = teamMembers.filter((volunteer) => volunteer.presence.status === "present").length;

  async function updateVolunteerPresence(volunteer, patch, successMessage) {
    if (!volunteer?.id) return;

    const currentPresence = normalizePresenceRecord(volunteer.presence);
    const nextPresence = normalizePresenceRecord({
      ...currentPresence,
      ...patch,
    });

    setIsSaving(true);

    try {
      await setDoc(
        doc(db, "users", volunteer.id),
        {
          presence: nextPresence,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setStatusMessage(successMessage);
    } catch (error) {
      console.error("Impossible de mettre à jour la présence.", error);
      setStatusMessage("La mise à jour de présence a échoué.");
    } finally {
      setIsSaving(false);
    }
  }

  async function markVolunteerPresent(volunteer, withWelcomeKit = false) {
    const now = new Date().toISOString();
    const currentPresence = normalizePresenceRecord(volunteer.presence);

    await updateVolunteerPresence(
      volunteer,
      {
        status: "present",
        checkedInAt: currentPresence.checkedInAt || now,
        accreditationDeliveredAt:
          withWelcomeKit ? currentPresence.accreditationDeliveredAt || now : currentPresence.accreditationDeliveredAt,
        tshirtDeliveredAt: withWelcomeKit ? currentPresence.tshirtDeliveredAt || now : currentPresence.tshirtDeliveredAt,
      },
      withWelcomeKit
        ? `${volunteer.firstName} ${volunteer.lastName}`.trim() + " pointé(e), accréditation et tee-shirt remis."
        : `${volunteer.firstName} ${volunteer.lastName}`.trim() + " marqué(e) présent(e).",
    );
  }

  async function markVolunteerAbsent(volunteer) {
    await updateVolunteerPresence(
      volunteer,
      {
        status: "absent",
      },
      `${volunteer.firstName} ${volunteer.lastName}`.trim() + " repassé(e) absent(e).",
    );
  }

  async function togglePresenceStamp(volunteer, field, successMessage) {
    const currentPresence = normalizePresenceRecord(volunteer.presence);
    if (isPresenceLocked(currentPresence)) return;

    await updateVolunteerPresence(
      volunteer,
      {
        [field]: currentPresence[field] ? null : new Date().toISOString(),
      },
      successMessage,
    );
  }

  async function saveDepartureTime(volunteer, explicitValue) {
    const currentPresence = normalizePresenceRecord(volunteer.presence);
    if (isPresenceLocked(currentPresence)) return;

    const nextValue = String(explicitValue ?? departureDrafts[volunteer.id] ?? "").trim();
    setDepartureDrafts((current) => ({
      ...current,
      [volunteer.id]: nextValue,
    }));

    await updateVolunteerPresence(
      volunteer,
      {
        departureTime: nextValue,
        departureRecordedAt: nextValue ? new Date().toISOString() : null,
      },
      nextValue
        ? `Horaire de départ enregistré pour ${`${volunteer.firstName} ${volunteer.lastName}`.trim()}.`
        : `Horaire de départ supprimé pour ${`${volunteer.firstName} ${volunteer.lastName}`.trim()}.`,
    );
  }

  async function completeMission(volunteer) {
    const currentPresence = normalizePresenceRecord(volunteer.presence);
    if (isPresenceLocked(currentPresence)) return;

    await updateVolunteerPresence(
      volunteer,
      {
        missionCompletedAt: new Date().toISOString(),
        missionCompletedBy: currentUser?.uid || userProfile?.uid || "",
      },
      `Mission terminée pour ${`${volunteer.firstName} ${volunteer.lastName}`.trim()}. La fiche est maintenant verrouillée.`,
    );
  }

  function openCertificate(volunteer) {
    if (typeof window === "undefined") return;

    const roundedHours = getRoundedParticipationHours(volunteer.presence);
    if (!roundedHours) {
      setStatusMessage("Le certificat nécessite une arrivée et un horaire de départ cohérents.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1100,height=850");
    if (!printWindow) return;

    const markup = buildParticipationCertificateMarkup({
      fullName: `${volunteer.firstName} ${volunteer.lastName}`.trim(),
      teamName: selectedRole?.roleName || volunteer.primaryTeam,
      roleLabel: volunteer.scopedTeamRole,
      roundedHours,
    });

    printWindow.document.write(markup);
    printWindow.document.close();
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Jour J</p>
          <h1>Présences</h1>
          <p>Check-in guichet, suivi déjeuner, vue chef d'équipe et certificat de participation.</p>
          {teamsLoading || usersLoading ? <p className="panel-note">Chargement des présences...</p> : null}
          {teamsError || usersError ? <p className="panel-note">{teamsError || usersError}</p> : null}
          {statusMessage ? <p className="panel-note">{statusMessage}</p> : null}
          {isSaving ? <p className="panel-note">Sauvegarde en cours...</p> : null}
        </div>
      </section>

      <section className="metric-grid metric-grid--3">
        <article className="metric-card metric-card--accent">
          <span>Présents</span>
          <strong>{presentCount}</strong>
        </article>
        <article className="metric-card metric-card--warn">
          <span>Sandwichs récupérés</span>
          <strong>{lunchCount}</strong>
        </article>
        <article className="metric-card">
          <span>Missions terminées</span>
          <strong>{completedCount}</strong>
        </article>
      </section>

      <section className="panel-grid panel-grid--2">
        <Panel
          title="Accueil bénévoles"
          subtitle="Recherche rapide par nom ou prénom, puis pointage et remise du kit d'accueil."
          actions={
            <div className="table-actions">
              <input
                type="search"
                placeholder="Rechercher un nom ou un prénom"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          }
        >
          <div className="presence-search-grid">
            {filteredSearchResults.length ? (
              filteredSearchResults.map((volunteer) => {
                const locked = isPresenceLocked(volunteer.presence);

                return (
                  <article key={volunteer.id} className={`presence-person-card${locked ? " presence-person-card--locked" : ""}`}>
                    <div className="presence-person-card__head">
                      <div>
                        <h3>{`${volunteer.firstName} ${volunteer.lastName}`.trim() || volunteer.email}</h3>
                        <p>{volunteer.teamNames.join(", ") || "Sans équipe"} · {volunteer.scopedTeamRole}</p>
                      </div>
                      <span className={getPresenceStatusClass(volunteer.presence.status)}>
                        {getPresenceStatusLabel(volunteer.presence.status)}
                      </span>
                    </div>
                    <div className="presence-meta">
                      <span>Arrivée : {volunteer.presence.checkedInAt ? formatDateTimeForDisplay(volunteer.presence.checkedInAt) : "Non pointé"}</span>
                      <span>Badge : {volunteer.presence.accreditationDeliveredAt ? "Remis" : "À remettre"}</span>
                      <span>Tee-shirt : {volunteer.presence.tshirtDeliveredAt ? "Remis" : "À remettre"}</span>
                      <span>Sandwich : {volunteer.presence.lunchCollectedAt ? "Récupéré" : "Non récupéré"}</span>
                    </div>
                    <div className="presence-action-grid">
                      <button
                        className="button button--primary"
                        type="button"
                        disabled={locked}
                        onClick={() => markVolunteerPresent(volunteer, true)}
                      >
                        Arrivé + remise accueil
                      </button>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={locked}
                        onClick={() => markVolunteerPresent(volunteer)}
                      >
                        Présent
                      </button>
                      <button
                        className="button button--ghost"
                        type="button"
                        disabled={locked}
                        onClick={() => markVolunteerAbsent(volunteer)}
                      >
                        Absent
                      </button>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          togglePresenceStamp(
                            volunteer,
                            "accreditationDeliveredAt",
                            `Statut accréditation mis à jour pour ${`${volunteer.firstName} ${volunteer.lastName}`.trim()}.`,
                          )
                        }
                      >
                        {volunteer.presence.accreditationDeliveredAt ? "Retirer badge remis" : "Badge remis"}
                      </button>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          togglePresenceStamp(
                            volunteer,
                            "tshirtDeliveredAt",
                            `Statut tee-shirt mis à jour pour ${`${volunteer.firstName} ${volunteer.lastName}`.trim()}.`,
                          )
                        }
                      >
                        {volunteer.presence.tshirtDeliveredAt ? "Retirer tee-shirt remis" : "Tee-shirt remis"}
                      </button>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          togglePresenceStamp(
                            volunteer,
                            "lunchCollectedAt",
                            `Statut sandwich mis à jour pour ${`${volunteer.firstName} ${volunteer.lastName}`.trim()}.`,
                          )
                        }
                      >
                        {volunteer.presence.lunchCollectedAt ? "Annuler sandwich" : "Sandwich récupéré"}
                      </button>
                    </div>
                    {locked ? (
                      <p className="panel-note">
                        Mission terminée le {formatDateTimeForDisplay(volunteer.presence.missionCompletedAt)}. La fiche est verrouillée.
                      </p>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <p className="panel-note">
                {normalizedSearch ? "Aucun bénévole ne correspond à cette recherche." : "Commence par une recherche ou sélectionne une équipe."}
              </p>
            )}
          </div>
        </Panel>

        <Panel
          title="Vue chef d'équipe"
          subtitle="Présences de l'équipe, départs, verrouillage de mission et certificat."
          actions={
            availableRoles.length ? (
              <label className="field">
                <span>Équipe</span>
                <select value={effectiveSelectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>
                  {availableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.roleName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null
          }
        >
          {selectedRole ? (
            <>
              <div className="team-selection-summary" aria-live="polite">
                <div className="team-summary-pill">
                  <strong>{teamMembers.length}</strong>
                  <span>Membres visibles</span>
                </div>
                <div className="team-summary-pill">
                  <strong>{selectedTeamPresentCount}</strong>
                  <span>Présents</span>
                </div>
                <div className="team-summary-pill">
                  <strong>{Math.max(teamMembers.length - selectedTeamPresentCount, 0)}</strong>
                  <span>Absents</span>
                </div>
                <div className="team-summary-pill">
                  <strong>{teamMembers.filter((volunteer) => volunteer.presence.missionCompletedAt).length}</strong>
                  <span>Missions terminées</span>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table data-table--admin">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Présence</th>
                      <th>Départ</th>
                      <th>Sandwich</th>
                      <th>Mission</th>
                      <th>Certificat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.length ? (
                      teamMembers.map((volunteer) => {
                        const locked = isPresenceLocked(volunteer.presence);
                        const roundedHours = getRoundedParticipationHours(volunteer.presence);

                        return (
                          <tr key={volunteer.id} className={volunteer.presence.status === "present" ? "data-table__row--success" : ""}>
                            <td>
                              <div className="table-stack">
                                <strong>{`${volunteer.firstName} ${volunteer.lastName}`.trim() || volunteer.email}</strong>
                                <span>{volunteer.scopedTeamRole}</span>
                              </div>
                            </td>
                            <td>
                              <div className="table-actions">
                                <span className={getPresenceStatusClass(volunteer.presence.status)}>
                                  {getPresenceStatusLabel(volunteer.presence.status)}
                                </span>
                                <div className="table-actions--inline">
                                  <button
                                    className="button button--secondary"
                                    type="button"
                                    disabled={locked}
                                    onClick={() => markVolunteerPresent(volunteer)}
                                  >
                                    Présent
                                  </button>
                                  <button
                                    className="button button--ghost"
                                    type="button"
                                    disabled={locked}
                                    onClick={() => markVolunteerAbsent(volunteer)}
                                  >
                                    Absent
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="table-actions">
                                <input
                                  type="time"
                                  value={departureDrafts[volunteer.id] ?? volunteer.presence.departureTime ?? ""}
                                  disabled={locked}
                                  onChange={(event) =>
                                    setDepartureDrafts((current) => ({
                                      ...current,
                                      [volunteer.id]: event.target.value,
                                    }))
                                  }
                                  onBlur={(event) => saveDepartureTime(volunteer, event.target.value)}
                                />
                                <span>{formatTimeForDisplay(volunteer.presence.departureTime)}</span>
                              </div>
                            </td>
                            <td>
                              <button
                                className="button button--secondary"
                                type="button"
                                disabled={locked}
                                onClick={() =>
                                  togglePresenceStamp(
                                    volunteer,
                                    "lunchCollectedAt",
                                    `Statut sandwich mis à jour pour ${`${volunteer.firstName} ${volunteer.lastName}`.trim()}.`,
                                  )
                                }
                              >
                                {volunteer.presence.lunchCollectedAt ? "Récupéré" : "À pointer"}
                              </button>
                            </td>
                            <td>
                              <div className="table-actions">
                                <span>{locked ? `Terminée le ${formatDateTimeForDisplay(volunteer.presence.missionCompletedAt)}` : "En cours"}</span>
                                <button
                                  className="button button--primary"
                                  type="button"
                                  disabled={locked}
                                  onClick={() => completeMission(volunteer)}
                                >
                                  Mission terminée
                                </button>
                              </div>
                            </td>
                            <td>
                              <div className="table-actions">
                                <span>{roundedHours ? `${roundedHours} h` : "Non calculable"}</span>
                                <button
                                  className="button button--secondary"
                                  type="button"
                                  disabled={!roundedHours}
                                  onClick={() => openCertificate(volunteer)}
                                >
                                  Générer
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="6">Aucun membre rattaché à cette équipe.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="panel-note">
              {canManageAllTeams
                ? "Aucune équipe n'est configurée pour le moment."
                : "Aucune équipe chef d'équipe n'est liée à ce profil."}
            </p>
          )}
        </Panel>
      </section>

      <Panel title="Synthèse opérationnelle" subtitle="Point de situation du module présences.">
        <ul className="compact-list">
          <li>{presentCount} présent(s) enregistrés et {absentCount} absent(s) sur le périmètre visible.</li>
          <li>{lunchCount} sandwich(s) déjà distribués.</li>
          <li>{completedCount} mission(s) terminée(s) avec fiche verrouillée.</li>
          <li>Le certificat calcule les heures à partir de l'heure d'arrivée et du départ, arrondies au supérieur.</li>
        </ul>
      </Panel>
    </div>
  );
}

function MyAssignmentsPage() {
  const { currentUser, userProfile } = useAuth();
  const { roles, teamAssignments, loading, error } = useTeamConfiguration();
  const userIdentitySet = useMemo(
    () => buildUserIdentitySet(userProfile, currentUser),
    [currentUser, userProfile],
  );
  const assignedTeamNames = useMemo(() => getAssignedTeamNames(userProfile), [userProfile]);
  const myAssignments = useMemo(
    () =>
      teamAssignments.filter((member) =>
        [
          member.id,
          member.email,
          `${member.firstName} ${member.lastName}`.trim(),
        ]
          .map((value) => String(value || "").trim().toLowerCase())
          .some((value) => value && userIdentitySet.has(value)),
      ),
    [teamAssignments, userIdentitySet],
  );
  const fallbackProfileAssignment = useMemo(() => {
    if (!assignedTeamNames.length) return null;

    return {
      assignmentEntryId: "profile-fallback",
      assignedRole: assignedTeamNames[0],
      teamRole: userProfile?.teamRole || "Bénévole",
    };
  }, [assignedTeamNames, userProfile]);
  const fallbackAssignment =
    assignmentRows.find((assignment) => normalizeRole(assignment.team) === normalizeRole(userProfile?.assignedRole)) ??
    assignmentRows[0];
  const availableAssignments = myAssignments.length
    ? myAssignments
      : fallbackProfileAssignment
        ? [fallbackProfileAssignment]
        : [];
  const assignmentDetails = useMemo(
    () =>
      availableAssignments.map((assignment, index) => {
        const selectedRole =
          roles.find(
            (role) =>
              normalizeRole(role.id) === normalizeRole(assignment?.assignedRoleId) ||
              normalizeRole(role.roleName) ===
                normalizeRole(assignment?.assignedRole || fallbackAssignment.team),
          ) ?? null;
        const teamMembers = teamAssignments.filter((member) => member.assignedRoleId === selectedRole?.id);
        const leader = teamMembers.find((member) => member.teamRole === "Chef d'équipe") ?? null;
        const teamRows = teamMembers.map((member) => ({
          name: `${member.firstName} ${member.lastName}`.trim() || member.email || "Bénévole",
          role: member.teamRole,
          contact:
            member.teamRole === "Chef d'équipe"
              ? member.email || member.phone || "À demander"
              : "Visible via le briefing",
        }));

        return {
          key: assignment.assignmentEntryId || `${assignment.id || "assignment"}-${assignment.assignedRoleId || index}`,
          assignment,
          selectedRole,
          leader,
          teamRows,
        };
      }),
    [availableAssignments, fallbackAssignment.team, roles, teamAssignments],
  );

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Espace benevole</p>
          <h1>Mes affectations</h1>
          <p>Consulte ici ton poste dès qu'il te sera attribué, ainsi que les informations utiles pour bien te préparer.</p>
        </div>
      </section>
      {error ? <p className="status-note">{error}</p> : null}
      {loading ? <p className="status-note">Chargement de mes affectations...</p> : null}

      {assignmentDetails.length > 1 ? (
        <Panel title="Mes missions" subtitle="Toutes tes affectations bénévoles visibles au même endroit.">
          <div className="role-chip-grid">
            {assignmentDetails.map(({ key, assignment, selectedRole }) => (
              <div key={key} className="role-chip role-chip--active">
                <strong>{selectedRole?.roleName || assignment.assignedRole || "Affectation"}</strong>
                <span>{assignment.teamRole || "Bénévole"}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {assignmentDetails.length ? (
        <>
          {assignmentDetails.map(({ key, assignment, selectedRole, leader, teamRows }) => (
            <section key={key} className="assignment-group">
              <div className="assignment-group__header">
                <p className="assignment-group__eyebrow">Mission</p>
                <h2>{selectedRole?.roleName || assignment.assignedRole || "Affectation"}</h2>
                <p>
                  Toutes les informations ci-dessous concernent cette mission et vont ensemble.
                </p>
              </div>
              <section className="panel-grid panel-grid--2">
                <Panel
                  title={selectedRole?.roleName || assignment.assignedRole || "Ma mission"}
                  subtitle="Ce que je dois connaître pour ce poste."
                >
                  <dl className="detail-list">
                    <div>
                      <dt>Équipe</dt>
                      <dd>{selectedRole?.roleName || assignment.assignedRole || fallbackAssignment.team}</dd>
                    </div>
                    <div>
                      <dt>Fonction</dt>
                      <dd>{assignment.teamRole || userProfile?.teamRole || "Bénévole"}</dd>
                    </div>
                    <div>
                      <dt>Créneau</dt>
                      <dd>{userProfile?.shift || selectedRole?.shiftTime || fallbackAssignment.shift}</dd>
                    </div>
                    <div>
                      <dt>Statut</dt>
                      <dd>{userProfile?.assignmentStatus || fallbackAssignment.status}</dd>
                    </div>
                    <div>
                      <dt>Accès</dt>
                      <dd>{fallbackAssignment.accreditation}</dd>
                    </div>
                  </dl>
                </Panel>

                <Panel title="Repères équipe" subtitle="Vue lecture seule des informations de coordination.">
                  <dl className="detail-list">
                    <div>
                      <dt>Chef d'équipe</dt>
                      <dd>{leader ? `${leader.firstName} ${leader.lastName}`.trim() : selectedRole?.leaderName || "À confirmer"}</dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>{leader?.email || leader?.phone || selectedRole?.leaderContact || "À confirmer"}</dd>
                    </div>
                    <div>
                      <dt>Briefing</dt>
                      <dd>{selectedRole?.briefingTime || "À confirmer"}</dd>
                    </div>
                    <div>
                      <dt>Consignes</dt>
                      <dd>{selectedRole?.teamInfo || selectedRole?.teamInfoPlaceholder || "Les consignes seront partagées ici."}</dd>
                    </div>
                  </dl>
                </Panel>
              </section>

              <Panel
                title="Mon équipe"
                subtitle="Composition actuelle de l'équipe liée à cette affectation."
              >
                <DataTable
                  columns={[
                    { key: "name", label: "Nom" },
                    { key: "role", label: "Fonction" },
                    { key: "contact", label: "Contact" },
                  ]}
                  rows={
                    teamRows.length
                      ? teamRows
                      : [{ name: "Composition non disponible", role: "-", contact: "-" }]
                  }
                />
              </Panel>

              <Panel title="Documents d'équipe" subtitle="Documents utiles associés à cette affectation.">
                {selectedRole?.documents?.length ? (
                  <div className="document-tag-list">
                    {selectedRole.documents.map((document) => (
                      <span key={document} className="document-tag">
                        {document}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="panel-note">Aucun document d'équipe n'est encore publié pour cette affectation.</p>
                )}
              </Panel>
            </section>
          ))}
        </>
      ) : (
        <Panel
          title="Mes affectations"
          subtitle="Ton affectation n'est pas encore disponible pour le moment."
        >
          <p className="panel-note">
            Tu n'as pas encore de rôle attribué sur cette édition. Notre équipe finalise actuellement les affectations
            bénévoles et tu seras informé(e) de ton poste au plus tard le <strong>10 décembre</strong>.
          </p>
          <p className="panel-note">
            Dès qu'il sera confirmé, ton poste apparaîtra ici avec les informations utiles pour ta mission. Merci pour ta
            patience et pour ton engagement à nos côtés.
          </p>
        </Panel>
      )}
    </div>
  );
}

function MyDocumentsPage() {
  const { userProfile } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "documents"),
      (snapshot) => {
        const nextDocuments = snapshot.docs
          .map(mapStoredDocument)
          .sort((left, right) => right.createdAtMs - left.createdAtMs);

        setDocuments(nextDocuments);
        setDocumentsLoading(false);
      },
      () => {
        setDocumentsError("Impossible de récupérer les documents disponibles.");
        setDocumentsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const assignedTeams = useMemo(() => {
    const values = [
      userProfile?.assignedRole,
      userProfile?.teamName,
      ...(Array.isArray(userProfile?.assignedTeams) ? userProfile.assignedTeams : []),
    ].filter(Boolean);

    return [...new Set(values)];
  }, [userProfile]);

  const availableDocuments = useMemo(() => {
    return documents.filter((document) => {
      if (document.scope === "global" || document.teams.length === 0) return true;
      if (assignedTeams.length === 0) return false;
      return document.teams.some((team) => assignedTeams.includes(team));
    });
  }, [assignedTeams, documents]);

  const documentRows = useMemo(
    () =>
      availableDocuments.map((document) => ({
        title: document.title,
        team: document.scope === "global" ? "Global" : document.teams.join(", "),
        open: (
          <button
            className="button button--secondary"
            type="button"
            disabled={!getDocumentConsultationUrl(document)}
            onClick={() =>
              window.open(getDocumentConsultationUrl(document), "_blank", "noopener,noreferrer")
            }
          >
            {document.fileName || document.reference || "Ouvrir"}
          </button>
        ),
      })),
    [availableDocuments],
  );

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Espace benevole</p>
          <h1>Mes documents</h1>
          <p>Briefings, plans, procedures et infos utiles accessibles selon l'affectation.</p>
        </div>
      </section>
      {documentsError ? <p className="panel-note">{documentsError}</p> : null}
      <Panel title="Documents disponibles">
        {documentsLoading ? <p className="panel-note">Chargement des documents...</p> : null}
        <DataTable
          columns={[
            { key: "title", label: "Titre" },
            { key: "team", label: "Equipe" },
            { key: "open", label: "Consultation" },
          ]}
          rows={
            documentRows.length
              ? documentRows
              : [
                  {
                    title: assignedTeams.length
                      ? "Aucun document disponible"
                      : "Aucun document global disponible",
                    team: assignedTeams.join(", ") || "En attente d'affectation",
                    open: "-",
                  },
                ]
          }
        />
      </Panel>
    </div>
  );
}

function MyAccreditationPage() {
  const { currentUser, userProfile } = useAuth();
  const { roles, teamAssignments, loading: teamsLoading, error: teamsError } = useTeamConfiguration();
  const {
    zones,
    roleZoneAssignments,
    volunteerOverrides,
    loading: accreditationLoading,
    error: accreditationError,
  } = useAccreditationConfiguration(roles);
  const volunteer = useMemo(() => {
    const userId = String(currentUser?.uid || userProfile?.uid || "").trim();
    if (!userId) return null;

    const assignments = teamAssignments.filter((assignment) => assignment.id === userId);
    const assignedRoles = normalizeSubRoles(
      assignments.length
        ? assignments.map((assignment) => assignment.assignedRole)
        : Array.isArray(userProfile?.assignedTeams)
          ? userProfile.assignedTeams
          : userProfile?.assignedRole
            ? [userProfile.assignedRole]
            : [],
    );

    return {
      id: userId,
      assignedRoles,
      assignedRole: assignedRoles[0] || "",
      assignmentStatus: userProfile?.assignmentStatus || (assignedRoles.length ? "Proposé" : "En attente"),
      workflowStatus: userProfile?.workflowStatus || "",
      firstName: userProfile?.firstName || "",
      lastName: userProfile?.lastName || "",
    };
  }, [currentUser?.uid, teamAssignments, userProfile]);
  const override = volunteer ? volunteerOverrides[volunteer.id] ?? normalizeAccreditationOverride({}, new Set(zones.map((zone) => zone.id))) : null;
  const finalZoneLabels = useMemo(() => {
    if (!volunteer || !override) return [];

    const zoneIds = getAccreditationFinalZoneIds({
      assignedRoles: volunteer.assignedRoles,
      roles,
      zones,
      roleZoneAssignments,
      override,
    });

    return sortAccreditationZones(zones)
      .filter((zone) => zoneIds.includes(zone.id))
      .map((zone) => formatZoneLabel(zone));
  }, [override, roleZoneAssignments, roles, volunteer, zones]);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Espace benevole</p>
          <h1>Mon accreditation</h1>
          <p>Zones attribuées, rôle affiché sur le badge et statut d'impression.</p>
        </div>
      </section>
      <Panel title="Accès attribués">
        {teamsLoading || accreditationLoading ? (
          <p className="panel-note">Chargement de votre accréditation...</p>
        ) : teamsError || accreditationError ? (
          <p className="panel-note">{teamsError || accreditationError}</p>
        ) : !volunteer || !override ? (
          <p className="panel-note">Aucune accréditation n'est disponible pour le moment.</p>
        ) : (
          <ul className="compact-list">
            <li>Rôle badge: {getBadgeRoleLabel(volunteer, override) || "À définir"}</li>
            <li>Zones finales: {finalZoneLabels.join(", ") || "Aucune zone attribuée pour le moment"}</li>
            <li>Statut impression: {override.printStatus}</li>
            <li>Retrait prévu: accueil bénévoles, samedi 07:15</li>
          </ul>
        )}
      </Panel>
    </div>
  );
}

function MyChildrenPage() {
  const { addU14ChildRegistration, currentUser, userProfile } = useAuth();
  const { rows: parentRows, loading, error } = useParentU14Children(currentUser?.uid);
  const [childForm, setChildForm] = useState(createEmptyParentU14ChildForm);
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");
  const [isSubmittingChild, setIsSubmittingChild] = useState(false);
  const parentRequestSummary = useMemo(
    () => ({
      total: parentRows.length,
      pending: parentRows.filter((row) => normalizeComparableValue(row.status) === "demande enregistree").length,
      retained: parentRows.filter((row) => normalizeComparableValue(row.status) === "retenu").length,
      validated: parentRows.filter((row) => normalizeComparableValue(row.status) === "valide").length,
    }),
    [parentRows],
  );

  function handleChildFormChange(event) {
    const { name, type, checked, value } = event.target;

    setChildForm((current) => {
      const nextValue = type === "checkbox" ? checked : value;
      const nextCategory = name === "birthDate" ? getU14CategoryFromBirthDate(value) : current.category;
      const nextForm = {
        ...current,
        [name]: nextValue,
        ...(name === "birthDate" ? { category: nextCategory } : {}),
      };

      return {
        ...nextForm,
        requestedEvent: getValidRequestedEventForCategory(
          nextCategory,
          name === "requestedEvent" ? value : nextForm.requestedEvent,
        ),
      };
    });

    setStatusMessage("");
    setErrorMessage("");
  }

  async function handleAddChild(event) {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");

    if (!childForm.category) {
      setErrorMessage("Seuls les enfants U12 et U14 peuvent être ajoutés dans cet espace.");
      return;
    }

    if (!luxCompetitionClubs.includes(childForm.club) || !childForm.bibNumber.trim()) {
      setErrorMessage("Merci d'indiquer un club luxembourgeois autorisé et un numéro de licence.");
      return;
    }

    if (!getU14AllowedEvents(childForm.category).includes(childForm.requestedEvent) && childForm.requestType !== "porte_panier") {
      setErrorMessage("Pour la catégorie U12, seule l'épreuve du 60 m peut être demandée.");
      return;
    }

    if (!childForm.imageConsent) {
      setErrorMessage("L'autorisation image est obligatoire pour enregistrer un enfant.");
      return;
    }

    setIsSubmittingChild(true);

    try {
      await addU14ChildRegistration({
        ...childForm,
        parentFirstName: userProfile?.firstName || "",
        parentLastName: userProfile?.lastName || "",
        parentEmail: currentUser?.email || "",
        bibNumber: childForm.bibNumber.trim(),
        club: childForm.club,
        firstName: childForm.firstName.trim(),
        lastName: childForm.lastName.trim(),
        notes: childForm.notes.trim(),
      });

      await refreshU14Allocations();

      setChildForm(createEmptyParentU14ChildForm());
      setIsAddChildOpen(false);
      setStatusMessage("Enfant ajouté. La demande est maintenant visible dans le suivi.");
    } catch (submissionError) {
      setErrorMessage(getPreProgramSubmissionErrorMessage(submissionError));
    } finally {
      setIsSubmittingChild(false);
    }
  }

  async function refreshU14Allocations() {
    const [requestsSnapshot, childrenSnapshot, protectedSnapshot] = await Promise.all([
      getDocs(collection(db, "u14Requests")),
      getDocs(collection(db, "u14Children")),
      getDocs(collection(db, U14_RESERVED_SLOTS_COLLECTION)),
    ]);

    await syncU14RaceAllocations({
      requests: requestsSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
      children: childrenSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
      protectedEntries: protectedSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    });
  }

  async function handleConfirmAttendance(row) {
    if (!row.requestId) return;

    setBusyRequestId(row.requestId);
    setStatusMessage("");
    setErrorMessage("");

    try {
      await updateDoc(doc(db, "u14Requests", row.requestId), {
        parentDecisionStatus: "confirmed",
        parentDecisionAt: serverTimestamp(),
      });
      setStatusMessage(`${row.name} est maintenant confirmé.`);
    } catch {
      setErrorMessage("Impossible d'enregistrer votre confirmation pour le moment.");
    } finally {
      setBusyRequestId("");
    }
  }

  async function handleDeclineAttendance(row) {
    if (!row.requestId) return;
    if (!window.confirm(`Cette action est définitive. Êtes-vous sûr de vouloir vous désister pour ${row.name} ?`)) return;

    const withdrawalReason = window.prompt("Motif du désistement (facultatif)", "") || "";

    setBusyRequestId(row.requestId);
    setStatusMessage("");
    setErrorMessage("");

    try {
      await updateDoc(doc(db, "u14Requests", row.requestId), {
        status: "declined",
        parentDecisionStatus: "declined",
        parentDecisionAt: serverTimestamp(),
        withdrawalReason: withdrawalReason.trim(),
        acceptedPosition: null,
        waitlistPosition: null,
        queuePosition: null,
      });

      if (row.protectedSlotId) {
        await updateDoc(doc(db, U14_RESERVED_SLOTS_COLLECTION, row.protectedSlotId), {
          status: "released",
          matchedRequestId: null,
          matchedChildId: null,
          matchedParentUserId: null,
          releasedAt: serverTimestamp(),
        });
      }

      await refreshU14Allocations();

      const promotedRaceLabel = row.raceCode ? getU14RaceLabel(row.raceCode) : "sa course";
      if (currentUser?.email) {
        await enqueueTransactionalMail({
          type: "u14-decline-ack",
          to: currentUser.email,
          subject: "Votre désistement a bien été enregistré",
          body: `Bonjour,\n\nLe désistement pour ${row.name} a bien été enregistré. La place libérée sur ${promotedRaceLabel} est maintenant proposée au prochain enfant sur liste d'attente.\n`,
          metadata: {
            requestId: row.requestId,
            childId: row.childId,
            raceCode: row.raceCode,
          },
        });
      }

      setStatusMessage(`Le désistement de ${row.name} a été enregistré.`);
    } catch (error) {
      setErrorMessage("Impossible d'enregistrer ce désistement pour le moment.");
    } finally {
      setBusyRequestId("");
    }
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Parent U14</p>
          <h1>Mes enfants</h1>
          <p>Demandes, decisions, convocations et informations pratiques centralisees.</p>
        </div>
      </section>
      {error ? <p className="status-note">{error}</p> : null}
      {statusMessage ? <p className="panel-note panel-note--success">{statusMessage}</p> : null}
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      <section className="metric-grid metric-grid--3">
        <article className="metric-card">
          <span>Demandes suivies</span>
          <strong>{parentRequestSummary.total}</strong>
        </article>
        <article className="metric-card metric-card--warn">
          <span>En attente</span>
          <strong>{parentRequestSummary.pending}</strong>
        </article>
        <article className="metric-card metric-card--accent">
          <span>Retenues / validées</span>
          <strong>{parentRequestSummary.retained + parentRequestSummary.validated}</strong>
        </article>
      </section>
      <Panel title="Suivi des demandes">
        <DataTable
          columns={[
            { key: "name", label: "Enfant" },
            { key: "type", label: "Type" },
            { key: "status", label: "Statut" },
            { key: "submittedAt", label: "Demande faite le" },
            { key: "position", label: "Position" },
            { key: "schedule", label: "Info pratique" },
            { key: "actions", label: "Actions" },
          ]}
          rows={
            loading
              ? [{ name: "Chargement...", type: "-", status: "-", submittedAt: "-", position: "-", schedule: "-", actions: "-" }]
              : parentRows.length
                ? parentRows.map((row) => ({
                    ...row,
                    name: (
                      <div className="table-stack">
                        <strong>{row.name}</strong>
                      </div>
                    ),
                    type: <span className="parent-request-type">{row.type}</span>,
                    status: <span className={getU14ParentStatusPillClass(row.status)}>{row.status}</span>,
                    submittedAt: (
                      <div className="table-stack">
                        <strong>{row.submittedAt}</strong>
                      </div>
                    ),
                    position:
                      row.adminApprovalStatus === "approved" &&
                      (normalizeComparableValue(row.status) === "retenu" || normalizeComparableValue(row.status) === "valide")
                        ? (
                            <span className="status-pill status-pill--accent">
                              {row.acceptedPosition ? `Accepté - place ${row.acceptedPosition}` : "Accepté"}
                            </span>
                          )
                      : row.status === "Liste d'attente"
                          ? (
                              <span className="status-pill status-pill--warn">
                                {`Liste d'attente - place ${row.waitlistPosition || row.queuePosition || "?"}`}
                              </span>
                            )
                          : "-",
                    schedule: (
                      <div className="table-stack">
                        <strong>{row.schedule}</strong>
                        {row.practicalInfoText ? (
                          <span className="parent-request-practical">{row.practicalInfoText}</span>
                        ) : null}
                        {normalizeComparableValue(row.status) === "demande enregistree" &&
                        normalizeComparableValue(row.adminApprovalStatus) !== "approved" &&
                        normalizeComparableValue(row.requestType) !== "porte_panier" ? (
                          <span className="parent-request-note">Validation admin en cours</span>
                        ) : null}
                      </div>
                    ),
                    actions:
                      !row.requestId || normalizeComparableValue(row.status) === "desiste" ? (
                        "-"
                      ) : (
                        <div className="table-actions table-actions--inline parent-request-actions">
                          {normalizeComparableValue(row.adminApprovalStatus) === "approved" &&
                          row.adminApprovalStatus === "approved" &&
                          row.parentDecisionStatus !== "confirmed" ? (
                            <button
                              className="button button--secondary button--small"
                              type="button"
                              disabled={busyRequestId === row.requestId}
                              onClick={() => handleConfirmAttendance(row)}
                            >
                              Je confirme
                            </button>
                          ) : null}
                          {normalizeComparableValue(row.status) !== "desiste" ? (
                            <button
                              className="button button--ghost-danger button--small"
                              type="button"
                              disabled={busyRequestId === row.requestId}
                              onClick={() => handleDeclineAttendance(row)}
                            >
                              Se désister
                            </button>
                          ) : null}
                        </div>
                      ),
                  }))
                : [{ name: "Aucune demande liée à ce compte", type: "-", status: "-", submittedAt: "-", position: "-", schedule: "-", actions: "-" }]
          }
        />
      </Panel>
      <div className="panel-actions">
        <button className="button" type="button" onClick={() => setIsAddChildOpen((current) => !current)}>
          {isAddChildOpen ? "Replier l'ajout d'enfant" : "Ajouter un enfant"}
        </button>
      </div>
      {isAddChildOpen ? (
        <Panel
          title="Ajouter un enfant"
          subtitle="Permet de compléter votre dossier si le compte parent existe déjà ou si vous souhaitez ajouter un nouvel enfant après coup."
        >
          <form className="profile-form" onSubmit={handleAddChild}>
            <div className="panel-grid panel-grid--2">
              <AuthFormField label="Prénom">
                <input name="firstName" required value={childForm.firstName} onChange={handleChildFormChange} />
              </AuthFormField>
              <AuthFormField label="Nom">
                <input name="lastName" required value={childForm.lastName} onChange={handleChildFormChange} />
              </AuthFormField>
            </div>
            <div className="panel-grid panel-grid--2">
              <AuthFormField label="Date de naissance" hint="U12 = 2017/2016, U14 = 2015/2014 pour l'édition 2027.">
                <input
                  name="birthDate"
                  required
                  type="date"
                  value={childForm.birthDate}
                  onChange={handleChildFormChange}
                />
              </AuthFormField>
              <AuthFormField label="Catégorie attribuée">
                <input readOnly name="category" value={childForm.category} />
              </AuthFormField>
            </div>
            {childForm.birthDate && !childForm.category ? (
              <div className="notice-card notice-card--danger">
                <strong>Catégorie non éligible</strong>
                <p>Seuls les enfants U12 et U14 peuvent être ajoutés dans cet espace parent.</p>
              </div>
            ) : null}
            <div className="panel-grid panel-grid--2">
              <AuthFormField label="Genre">
                <select name="gender" required value={childForm.gender} onChange={handleChildFormChange}>
                  <option value="">Sélectionner</option>
                  <option value="fille">Fille</option>
                  <option value="garcon">Garcon</option>
                </select>
              </AuthFormField>
              <AuthFormField label="Club">
                <select name="club" required value={childForm.club} onChange={handleChildFormChange}>
                  <option value="">Sélectionner un club</option>
                  {luxCompetitionClubs.map((club) => (
                    <option key={club} value={club}>
                      {club}
                    </option>
                  ))}
                </select>
              </AuthFormField>
            </div>
            <div className="panel-grid panel-grid--2">
              <AuthFormField label="Numéro de licence">
                <input name="bibNumber" required value={childForm.bibNumber} onChange={handleChildFormChange} />
              </AuthFormField>
              <AuthFormField label="Type d'inscription souhaité">
                <select name="requestType" value={childForm.requestType} onChange={handleChildFormChange}>
                  <option value="preprogram">Pré-programme U12/U14</option>
                  <option value="porte_panier">Porte-panier</option>
                  <option value="preprogram_ou_porte_panier">Pré-programme ou porte-panier</option>
                </select>
              </AuthFormField>
            </div>
            {childForm.requestType !== "porte_panier" ? (
              <div className="panel-grid panel-grid--2">
                <AuthFormField label="Épreuve demandée">
                  <select name="requestedEvent" value={childForm.requestedEvent} onChange={handleChildFormChange}>
                    {getU14AllowedEvents(childForm.category).map((eventOption) => (
                      <option key={eventOption} value={eventOption}>
                        {eventOption}
                      </option>
                    ))}
                  </select>
                </AuthFormField>
                <AuthFormField label="Informations utiles">
                  <input name="notes" value={childForm.notes} onChange={handleChildFormChange} />
                </AuthFormField>
              </div>
            ) : (
              <AuthFormField label="Informations utiles">
                <input name="notes" value={childForm.notes} onChange={handleChildFormChange} />
              </AuthFormField>
            )}
            <label className="selection-card">
              <input
                checked={childForm.imageConsent}
                name="imageConsent"
                type="checkbox"
                onChange={handleChildFormChange}
              />
              <div>
                <strong>Autorisation image</strong>
                <p>Cette autorisation est requise pour enregistrer l'enfant dans le pré-programme.</p>
              </div>
            </label>
            <div className="panel-actions">
              <button className="button" type="submit" disabled={isSubmittingChild}>
                {isSubmittingChild ? "Enregistrement..." : "Ajouter cet enfant"}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}

function VolunteerProfilePage() {
  const { currentUser, userProfile } = useAuth();
  const { application: volunteerApplication, loading, error } = useVolunteerApplication(currentUser?.uid);
  const [formData, setFormData] = useState(createEmptyVolunteerProfileFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const volunteerAge = getAgeFromBirthDate(formData.birthDate);
  const isUnder14Volunteer = volunteerAge !== null && volunteerAge < 14;
  const isMinorVolunteer = volunteerAge !== null && volunteerAge >= 14 && volunteerAge < 18;

  useEffect(() => {
    setFormData(createVolunteerProfileFormData(volunteerApplication, userProfile));
  }, [userProfile, volunteerApplication]);

  function handleChange(event) {
    const { name, type, checked, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    setStatusMessage("");
    setErrorMessage("");
  }

  function toggleAvailabilityOption(option) {
    setFormData((current) => ({
      ...current,
      availability: current.availability.includes(option)
        ? current.availability.filter((item) => item !== option)
        : [...current.availability, option],
    }));
    setStatusMessage("");
    setErrorMessage("");
  }

  function toggleLanguageOption(option) {
    setFormData((current) => ({
      ...current,
      languages: current.languages.includes(option)
        ? current.languages.filter((item) => item !== option)
        : [...current.languages, option],
      otherLanguage:
        option === "Autre" && current.languages.includes(option) ? "" : current.otherLanguage,
    }));
    setStatusMessage("");
    setErrorMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!currentUser?.uid) return;

    if (!formData.meetingDayConfirmed) {
      setErrorMessage(
        "Merci de confirmer explicitement votre présence le dimanche 17/01/2027 avant d'envoyer votre candidature.",
      );
      return;
    }

    if (isUnder14Volunteer) {
      setErrorMessage(
        "Désolée, nous ne pouvons malheureusement pas prendre de bénévole de moins de 14 ans sauf pour le rôle de porte-panier dans la mesure des places disponibles.",
      );
      return;
    }

    if (!formData.imageConsent) {
      setErrorMessage(
        "La présence sur l'événement implique des prises de vue globales photo et vidéo. Sans accord sur ce point, nous ne pouvons malheureusement pas retenir votre candidature.",
      );
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    setErrorMessage("");

    const normalizedRoles = [
      ...new Set([...getActiveRoles(userProfile), "benevole"]),
    ];
    const { age, applicationStatus, legalGuardianRequired, applicationPayload } =
      buildVolunteerApplicationPayload({
        currentUser,
        formData,
        status: volunteerApplication?.status,
      });

    try {
      await setDoc(
        doc(db, "users", currentUser.uid),
        {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          phone: formData.phone.trim(),
          birthDate: formData.birthDate,
          age,
          accountStatus: applicationStatus,
          isMinorVolunteer: legalGuardianRequired,
          legalGuardianRequired,
          userTypes: normalizedRoles,
          searchTokens: buildUserSearchTokens({
            firstName: formData.firstName.trim(),
            lastName: formData.lastName.trim(),
            email: currentUser.email || "",
          }),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      if (volunteerApplication?.id) {
        await updateDoc(doc(db, "volunteerApplications", volunteerApplication.id), applicationPayload);
      } else {
        await addDoc(collection(db, "volunteerApplications"), {
          ...applicationPayload,
          submittedAt: serverTimestamp(),
        });
      }

      setStatusMessage(
        volunteerApplication?.id
          ? "Dossier bénévole mis à jour."
          : "Dossier bénévole créé. Le module bénévole est maintenant actif sur ce compte.",
      );
    } catch {
      setErrorMessage("La sauvegarde du dossier bénévole a échoué.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Espace bénévole</p>
          <h1>{volunteerApplication ? "Mon dossier bénévole" : "Devenir bénévole"}</h1>
          <p>
            {volunteerApplication
              ? "Retrouve ici tes réponses de candidature et garde ton dossier bénévole à jour."
              : "Ajoute le parcours bénévole à ton compte actuel sans recréer un second accès."}
          </p>
        </div>
        {volunteerApplication ? (
          <div className="status-cluster">
            <span className="status-pill status-pill--accent">
              {volunteerApplication.status || "candidature_recue"}
            </span>
          </div>
        ) : null}
      </section>

      <section className="panel-grid panel-grid--2">
        <Panel title="Situation du dossier">
          <dl className="detail-list">
            <div>
              <dt>Compte utilisé</dt>
              <dd>{currentUser?.email}</dd>
            </div>
            <div>
              <dt>Statut bénévole</dt>
              <dd>{volunteerApplication?.status || "Non démarré"}</dd>
            </div>
            <div>
              <dt>Rôle actif</dt>
              <dd>{getActiveRoles(userProfile).map(getRoleLabel).join(", ")}</dd>
            </div>
          </dl>
          {error ? <p className="panel-note">{error}</p> : null}
          {loading ? <p className="panel-note">Chargement du dossier bénévole...</p> : null}
        </Panel>

        <Panel title="Ce que permet ce module">
          <ul className="compact-list">
            <li>Créer un dossier bénévole sur le même compte que le module parent</li>
            <li>Retrouver ensuite les affectations, documents et accréditations bénévoles</li>
            <li>Mettre à jour certaines informations de candidature si besoin</li>
          </ul>
        </Panel>
      </section>

      <Panel title="Mes informations bénévoles" subtitle="Ces réponses servent au traitement de ta candidature et aux affectations.">
        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="panel-grid panel-grid--2">
            <AuthFormField label="Prénom">
              <input name="firstName" onChange={handleChange} required value={formData.firstName} />
            </AuthFormField>
            <AuthFormField label="Nom">
              <input name="lastName" onChange={handleChange} required value={formData.lastName} />
            </AuthFormField>
          </div>

          <div className="panel-grid panel-grid--2">
            <AuthFormField label="Email">
              <input disabled value={currentUser?.email || ""} />
            </AuthFormField>
            <AuthFormField label="Téléphone">
              <PhoneInput name="phone" onChange={handleChange} required value={formData.phone} />
            </AuthFormField>
          </div>

          <div className="panel-grid panel-grid--2">
            <AuthFormField label="Date de naissance">
              <input name="birthDate" onChange={handleChange} required type="date" value={formData.birthDate} />
            </AuthFormField>
            <AuthFormField label="Genre">
              <select name="gender" onChange={handleChange} value={formData.gender}>
                <option value="">Sélectionner</option>
                <option value="femme">Femme</option>
                <option value="homme">Homme</option>
                <option value="autre">Autre</option>
              </select>
            </AuthFormField>
          </div>

          {volunteerAge !== null ? (
            <div className={`notice-card${isUnder14Volunteer ? " notice-card--danger" : isMinorVolunteer ? " notice-card--warn" : " notice-card--ok"}`}>
              <strong>
                {isUnder14Volunteer
                  ? "Moins de 14 ans"
                  : isMinorVolunteer
                    ? "Bénévole mineur"
                    : "Candidature adulte"}
              </strong>
              <p>
                {isUnder14Volunteer
                  ? "Désolée, nous ne pouvons malheureusement pas prendre de bénévole de moins de 14 ans sauf pour le rôle de porte-panier dans la mesure des places disponibles."
                  : isMinorVolunteer
                    ? "Votre date de naissance indique un bénévole mineur. Un contact de responsable légal est obligatoire et devra valider l'autorisation par email."
                    : "Vous pouvez poursuivre la candidature bénévole normale."}
              </p>
              {isUnder14Volunteer ? (
                <div className="auth-links">
                  <NavLink className="button button--secondary button-link" to="/pre-programme">
                    Créer un compte parent
                  </NavLink>
                </div>
              ) : null}
            </div>
          ) : null}

          {isMinorVolunteer ? (
            <section className="minor-guardian-card">
              <div className="form-section-head">
                <p className="eyebrow">Responsable légal</p>
                <h3>Validation obligatoire pour les 14-17 ans</h3>
              </div>
              <div className="panel-grid panel-grid--2">
                <AuthFormField label="Prénom du responsable légal">
                  <input
                    name="guardianFirstName"
                    onChange={handleChange}
                    required={isMinorVolunteer}
                    value={formData.guardianFirstName}
                  />
                </AuthFormField>
                <AuthFormField label="Nom du responsable légal">
                  <input
                    name="guardianLastName"
                    onChange={handleChange}
                    required={isMinorVolunteer}
                    value={formData.guardianLastName}
                  />
                </AuthFormField>
              </div>
              <div className="panel-grid panel-grid--2">
                <AuthFormField label="Email du responsable légal">
                  <input
                    name="guardianEmail"
                    onChange={handleChange}
                    required={isMinorVolunteer}
                    type="email"
                    value={formData.guardianEmail}
                  />
                </AuthFormField>
                <AuthFormField label="Téléphone du responsable légal">
                  <PhoneInput
                    name="guardianPhone"
                    onChange={handleChange}
                    required={isMinorVolunteer}
                    value={formData.guardianPhone}
                  />
                </AuthFormField>
              </div>
            </section>
          ) : null}

          <div className="panel-grid panel-grid--2">
            <div className="language-card">
              <div className="form-section-head">
                <p className="eyebrow">Langues</p>
                <h3>Quelles langues parlez-vous ?</h3>
              </div>
              <div className="choice-grid">
                {VOLUNTEER_LANGUAGE_OPTIONS.map((option) => (
                  <label key={option} className="selection-card selection-card--compact">
                    <input
                      checked={formData.languages.includes(option)}
                      type="checkbox"
                      onChange={() => toggleLanguageOption(option)}
                    />
                    <div>
                      <strong>{option}</strong>
                    </div>
                  </label>
                ))}
              </div>
              {formData.languages.includes("Autre") ? (
                <AuthFormField label="Autre langue">
                  <input name="otherLanguage" onChange={handleChange} value={formData.otherLanguage} />
                </AuthFormField>
              ) : null}
            </div>
            <div className="lunex-card">
              <div className="form-section-head">
                <p className="eyebrow">LUNEX</p>
                <h3>Êtes-vous étudiant LUNEX ?</h3>
              </div>
              <div className="lunex-choice-row">
                <label className="selection-card selection-card--inline">
                  <input
                    checked={formData.lunexStudent === "oui"}
                    name="lunexStudent"
                    onChange={handleChange}
                    type="radio"
                    value="oui"
                  />
                  <div>
                    <strong>Oui</strong>
                  </div>
                </label>
                <label className="selection-card selection-card--inline">
                  <input
                    checked={formData.lunexStudent === "non"}
                    name="lunexStudent"
                    onChange={handleChange}
                    type="radio"
                    value="non"
                  />
                  <div>
                    <strong>Non</strong>
                  </div>
                </label>
              </div>
              {formData.lunexStudent === "oui" ? (
                <AuthFormField label="Programme LUNEX">
                  <input name="lunexProgram" onChange={handleChange} value={formData.lunexProgram} />
                </AuthFormField>
              ) : null}
            </div>
          </div>

          <div className="panel-grid panel-grid--2">
            <AuthFormField label="Taille t-shirt">
              <select name="tshirtSize" onChange={handleChange} value={formData.tshirtSize}>
                <option>S</option>
                <option>M</option>
                <option>L</option>
                <option>XL</option>
              </select>
            </AuthFormField>
            <div />
          </div>

          <AuthFormField label="Profession / occupation">
            <input name="occupation" onChange={handleChange} value={formData.occupation} />
          </AuthFormField>
          <AuthFormField label="Expérience précédente au CMCM">
            <textarea name="cmcmExperience" onChange={handleChange} rows="3" value={formData.cmcmExperience} />
          </AuthFormField>
          <AuthFormField label="Autre expérience bénévole">
            <textarea
              name="volunteerExperience"
              onChange={handleChange}
              rows="3"
              value={formData.volunteerExperience}
            />
          </AuthFormField>
          <div className="availability-card">
            <div className="form-section-head">
              <p className="eyebrow">Disponibilités</p>
              <h3>Quand pouvez-vous être présent(e) ?</h3>
            </div>
            <p className="availability-lead">
              Les briefings du matin sont obligatoires. Pour le meeting, nous avons besoin de
              bénévoles disponibles le dimanche 17/01/2027 de 9h30 à 19h00. Les horaires exacts
              seront confirmés plus tard, mais cette amplitude doit être considérée comme
              indispensable pour le jour du meeting. Toute aide avant l'événement est la bienvenue,
              et nous serions particulièrement reconnaissants pour les aides disponibles le lundi.
            </p>
            <div className="notice-card notice-card--warn">
              <strong>Dimanche 17/01/2027 obligatoire</strong>
              <p>
                Disponibilité requise pour le briefing, la collation avant le meeting, l'ouverture
                des portes à 13h00 et la compétition de 16h à 19h00.
              </p>
            </div>
            <label className="selection-card availability-confirm-card">
              <input
                checked={formData.meetingDayConfirmed}
                name="meetingDayConfirmed"
                onChange={handleChange}
                type="checkbox"
              />
              <div>
                <strong>Je confirme être disponible le dimanche 17/01/2027</strong>
                <p>
                  J'ai bien compris que ma présence de 9h30 à 19h00 environ, briefing compris, est
                  indispensable pour le jour du meeting.
                </p>
              </div>
            </label>
            <p className="availability-subnote">
              Vous pouvez aussi nous indiquer ci-dessous si vous êtes disponible pour aider avant
              le meeting ou lors du rangement du lundi.
            </p>
            <div className="availability-options">
              {VOLUNTEER_SUPPORT_AVAILABILITY_OPTIONS.map((option) => (
                <label key={option} className="selection-card">
                  <input
                    checked={formData.availability.includes(option)}
                    type="checkbox"
                    onChange={() => toggleAvailabilityOption(option)}
                  />
                  <div>
                    <strong>{option}</strong>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <AuthFormField label="Préférences de mission" hint="Ex: transport, accueil, warm-up">
            <input
              name="missionPreferences"
              onChange={handleChange}
              value={formData.missionPreferences}
            />
          </AuthFormField>
          <AuthFormField label="Informations sécurité / santé">
            <textarea
              name="healthSafetyInfo"
              onChange={handleChange}
              rows="3"
              value={formData.healthSafetyInfo}
            />
          </AuthFormField>

          <div className="selection-card-group">
            <label className="selection-card">
              <input
                checked={formData.certificateNeeded}
                name="certificateNeeded"
                onChange={handleChange}
                type="checkbox"
              />
              <div>
                <strong>Certificat bénévole</strong>
                <p>Je souhaite recevoir un certificat après l'événement.</p>
              </div>
            </label>
            <label className="selection-card">
              <input
                checked={formData.retainForNextYear}
                name="retainForNextYear"
                onChange={handleChange}
                type="checkbox"
              />
              <div>
                <strong>Édition suivante</strong>
                <p>J'accepte d'être recontacté pour la prochaine édition.</p>
              </div>
            </label>
            <label className="selection-card">
              <input checked={formData.imageConsent} name="imageConsent" onChange={handleChange} type="checkbox" />
              <div>
                <strong>Droit à l'image</strong>
                <p>
                  La présence sur l'événement implique des prises de vue photo et vidéo dans les
                  espaces du meeting. Sans accord sur ce point, nous ne pourrons malheureusement
                  pas retenir votre participation.
                </p>
              </div>
            </label>
          </div>

          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
          {statusMessage ? <p className="panel-note panel-note--success">{statusMessage}</p> : null}

          <div className="profile-form__actions">
            <button className="button button--primary" disabled={isSaving || loading} type="submit">
              {isSaving ? "Sauvegarde..." : volunteerApplication ? "Mettre à jour le dossier" : "Activer le parcours bénévole"}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function ProfilePage() {
  const { currentUser, userProfile } = useAuth();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    nextPassword: "",
    confirmPassword: "",
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordStatusMessage, setPasswordStatusMessage] = useState("");
  const [passwordErrorMessage, setPasswordErrorMessage] = useState("");

  useEffect(() => {
    setFormData({
      firstName: userProfile?.firstName || "",
      lastName: userProfile?.lastName || "",
      phone: userProfile?.phone || "",
    });
  }, [userProfile]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
    setStatusMessage("");
    setErrorMessage("");
  }

  function handlePasswordChange(event) {
    const { name, value } = event.target;
    setPasswordForm((current) => ({
      ...current,
      [name]: value,
    }));
    setPasswordStatusMessage("");
    setPasswordErrorMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!currentUser?.uid) return;

    setIsSaving(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim(),
        updatedAt: serverTimestamp(),
      });
      setStatusMessage("Profil mis à jour.");
    } catch {
      setErrorMessage("La mise à jour du profil a échoué.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (!currentUser?.email) return;

    if (!passwordForm.currentPassword || !passwordForm.nextPassword || !passwordForm.confirmPassword) {
      setPasswordErrorMessage("Complète les trois champs pour changer le mot de passe.");
      return;
    }

    if (passwordForm.nextPassword.length < 6) {
      setPasswordErrorMessage("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setPasswordErrorMessage("La confirmation du nouveau mot de passe ne correspond pas.");
      return;
    }

    setIsSavingPassword(true);
    setPasswordStatusMessage("");
    setPasswordErrorMessage("");

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, passwordForm.currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, passwordForm.nextPassword);
      setPasswordForm({
        currentPassword: "",
        nextPassword: "",
        confirmPassword: "",
      });
      setPasswordStatusMessage("Mot de passe mis à jour.");
    } catch (error) {
      if (error?.code === "auth/invalid-credential" || error?.code === "auth/wrong-password") {
        setPasswordErrorMessage("Le mot de passe actuel est incorrect.");
      } else {
        setPasswordErrorMessage("La mise à jour du mot de passe a échoué.");
      }
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Profil</p>
          <h1>Mon compte</h1>
          <p>Centralise ton identité, tes coordonnées et les informations essentielles de ton accès MyCLIM.</p>
        </div>
      </section>
      <section>
        <Panel title="Identité" subtitle="Ces informations alimentent ton espace personnel et les vues admin.">
          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="panel-grid panel-grid--2">
              <AuthFormField label="Prénom">
                <input name="firstName" onChange={handleChange} value={formData.firstName} />
              </AuthFormField>
              <AuthFormField label="Nom">
                <input name="lastName" onChange={handleChange} value={formData.lastName} />
              </AuthFormField>
            </div>
            <div className="panel-grid panel-grid--2">
              <AuthFormField label="Email" hint="L'adresse de connexion n'est pas modifiable ici.">
                <input disabled value={currentUser?.email || ""} />
              </AuthFormField>
              <AuthFormField label="Téléphone">
                <PhoneInput name="phone" onChange={handleChange} value={formData.phone} />
              </AuthFormField>
            </div>
            {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
            {statusMessage ? <p className="panel-note panel-note--success">{statusMessage}</p> : null}
            <div className="profile-form__actions">
              <button className="button button--primary" disabled={isSaving} type="submit">
                {isSaving ? "Sauvegarde..." : "Enregistrer"}
              </button>
            </div>
          </form>
        </Panel>
      </section>

      <Panel
        title="Sécurité"
        subtitle="Change ton mot de passe si nécessaire. Firebase demandera une réauthentification avec le mot de passe actuel."
      >
        <form className="profile-form" onSubmit={handlePasswordSubmit}>
          <div className="panel-grid panel-grid--2">
            <AuthFormField label="Mot de passe actuel">
              <input
                name="currentPassword"
                onChange={handlePasswordChange}
                type="password"
                value={passwordForm.currentPassword}
              />
            </AuthFormField>
            <div />
          </div>
          <div className="panel-grid panel-grid--2">
            <AuthFormField label="Nouveau mot de passe">
              <input
                name="nextPassword"
                onChange={handlePasswordChange}
                type="password"
                value={passwordForm.nextPassword}
              />
            </AuthFormField>
            <AuthFormField label="Confirmer le nouveau mot de passe">
              <input
                name="confirmPassword"
                onChange={handlePasswordChange}
                type="password"
                value={passwordForm.confirmPassword}
              />
            </AuthFormField>
          </div>
          {passwordErrorMessage ? <p className="form-error">{passwordErrorMessage}</p> : null}
          {passwordStatusMessage ? (
            <p className="panel-note panel-note--success">{passwordStatusMessage}</p>
          ) : null}
          <div className="profile-form__actions">
            <button className="button button--primary" disabled={isSavingPassword} type="submit">
              {isSavingPassword ? "Mise à jour..." : "Changer le mot de passe"}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicHomePage />} />
          <Route path="/benevoles" element={<VolunteerAccessPage />} />
          <Route path="/pre-programme" element={<U14AccessPage />} />
          <Route path="/vip" element={<VipAccessPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/volunteer-apply" element={<VolunteerApplyPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<DashboardHome />} />
              <Route element={<RequireRouteAccess allowedRoles={["admin"]} />}>
                <Route path="benevoles" element={<VolunteersPage />} />
                <Route path="roles" element={<RoleManagementPage />} />
                <Route path="postes" element={<TeamsPage />} />
                <Route path="accreditations" element={<AccreditationsPage />} />
                <Route path="u14" element={<U14Page />} />
              </Route>
              <Route element={<RequireRouteAccess allowedRoles={["admin", "gestionnaire"]} />}>
                <Route path="documents" element={<DocumentsPage />} />
              </Route>
              <Route element={<RequireRouteAccess allowedRoles={["admin", "gestionnaire", "chef_equipe"]} />}>
                <Route path="equipe" element={<TeamPage />} />
                <Route path="presences" element={<PresencePage />} />
              </Route>
              <Route element={<RequireRouteAccess allowedRoles={["admin", "benevole", "chef_equipe"]} />}>
                <Route path="mon-dossier-benevole" element={<VolunteerProfilePage />} />
                <Route path="mes-affectations" element={<MyAssignmentsPage />} />
                <Route path="mon-accreditation" element={<MyAccreditationPage />} />
                <Route path="mes-documents" element={<MyDocumentsPage />} />
              </Route>
              <Route element={<RequireRouteAccess allowedRoles={["admin", "parent_u14"]} />}>
                <Route path="mes-enfants" element={<MyChildrenPage />} />
              </Route>
              <Route path="profil" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}
