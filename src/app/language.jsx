import { useEffect, useMemo, useState } from "react";
import { LanguageContext, useLanguage } from "./language-context";
const LANGUAGE_STORAGE_KEY = "myclim-language";
const supportedLanguages = ["en", "fr", "de"];

const messages = {
  en: {
    myclim: "MyCLIM",
    returnHome: "Back to home",
    loginPageTitle: "MyCLIM Volunteer Space",
    loginPageSubtitle: "Sign in to view your assignments, documents, accreditation, and all useful meeting information.",
    loginEyebrow: "Sign in",
    loginHeading: "Access MyCLIM",
    loginEmailLabel: "Email",
    loginPasswordLabel: "Password",
    loginForgotPassword: "Forgot password",
    loginForgotPasswordLoading: "Sending...",
    loginRememberMe: "Remember me",
    loginRememberMeDescription: "Stay signed in on this device after closing the browser.",
    loginButton: "Sign in",
    loginLoading: "Signing in...",
    loginError: "Sign in failed. Please check your email and password.",
    loginResetSuccess: "If an account exists for this address, a reset email has just been sent.",
    loginResetError: "Unable to send the reset email at this time.",
    loginResetEmailRequired: "Please enter your email address first to receive the reset link.",
    loginVolunteerLink: "Become a volunteer",
    loginPreprogramLink: "Register a child for the pre-programme",
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
    loginPageTitle: "Espace bénévoles MyCLIM",
    loginPageSubtitle: "Connectez-vous pour retrouver vos affectations, vos documents, votre accréditation et toutes les informations utiles du meeting.",
    loginEyebrow: "Connexion",
    loginHeading: "Accéder à MyCLIM",
    loginEmailLabel: "Email",
    loginPasswordLabel: "Mot de passe",
    loginForgotPassword: "Mot de passe oublié",
    loginForgotPasswordLoading: "Envoi...",
    loginRememberMe: "Se souvenir de moi",
    loginRememberMeDescription: "Rester connecté sur cet appareil après fermeture du navigateur.",
    loginButton: "Se connecter",
    loginLoading: "Connexion...",
    loginError: "Connexion impossible. Vérifiez votre email et votre mot de passe.",
    loginResetSuccess: "Si un compte existe pour cette adresse, un email de réinitialisation vient d'être envoyé.",
    loginResetError: "Impossible d'envoyer le mail de réinitialisation pour le moment.",
    loginResetEmailRequired: "Indiquez d'abord votre adresse email pour recevoir le lien de réinitialisation.",
    loginVolunteerLink: "Devenir bénévole",
    loginPreprogramLink: "Inscrire un enfant au pré-programme",
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
    loginPageTitle: "MyCLIM Freiwilligenbereich",
    loginPageSubtitle: "Melden Sie sich an, um Ihre Einsätze, Dokumente, Akkreditierung und alle nützlichen Meeting-Informationen abzurufen.",
    loginEyebrow: "Anmeldung",
    loginHeading: "Zugang zu MyCLIM",
    loginEmailLabel: "E-Mail",
    loginPasswordLabel: "Passwort",
    loginForgotPassword: "Passwort vergessen",
    loginForgotPasswordLoading: "Wird gesendet...",
    loginRememberMe: "Angemeldet bleiben",
    loginRememberMeDescription: "Nach dem Schließen des Browsers auf diesem Gerät angemeldet bleiben.",
    loginButton: "Anmelden",
    loginLoading: "Anmelden...",
    loginError: "Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre E-Mail und Ihr Passwort.",
    loginResetSuccess: "Falls ein Konto für diese Adresse existiert, wurde soeben eine Zurücksetzen-E-Mail gesendet.",
    loginResetError: "Die Zurücksetzen-E-Mail konnte derzeit nicht gesendet werden.",
    loginResetEmailRequired: "Bitte geben Sie zuerst Ihre E-Mail-Adresse ein, um den Zurücksetzen-Link zu erhalten.",
    loginVolunteerLink: "Freiwilliger werden",
    loginPreprogramLink: "Ein Kind für das Vorprogramm anmelden",
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

export { LanguageProvider, LanguageSwitch };
