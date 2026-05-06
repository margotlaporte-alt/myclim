import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth-context";
import preprogrammeHomeImage from "../assets/preprogramme-home.jpg";
import portePanierHomeImage from "../assets/porte-panier-home.jpg";
import { AuthFormField, AuthLayout, PhoneInput } from "./form-components";
import { isPreprogramOpenForEdition, useActiveEdition } from "./edition";
import { useLanguage } from "./language-context";
import {
  VOLUNTEER_LANGUAGE_OPTIONS,
  getAgeFromBirthDate,
  getU14CategoryFromBirthDate,
  readRememberMePreference,
} from "./utils";
import {
  getPreProgramSubmissionErrorMessage,
  getU14AllowedEvents,
  getValidRequestedEventForCategory,
  luxCompetitionClubs,
} from "./u14";

const REMEMBER_ME_STORAGE_KEY = "myclim-remember-me";
const VOLUNTEER_SUPPORT_AVAILABILITY_OPTIONS = [
  "Avant-meeting - vendredi matin",
  "Avant-meeting - vendredi après-midi",
  "Avant-meeting - samedi matin",
  "Avant-meeting - samedi après-midi",
  "Après-meeting - lundi 9h-12h",
];

function LoginPage() {
  const { login, requestPasswordReset } = useAuth();
  const { t } = useLanguage();
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
      setError(t("loginError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setStatusMessage("");

    if (!String(email || "").trim()) {
      setError(t("loginResetEmailRequired"));
      return;
    }

    setIsResetSubmitting(true);

    try {
      await requestPasswordReset(email);
      setStatusMessage(t("loginResetSuccess"));
    } catch {
      setError(t("loginResetError"));
    } finally {
      setIsResetSubmitting(false);
    }
  }

  return (
    <AuthLayout title={t("loginPageTitle")} subtitle={t("loginPageSubtitle")}>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">{t("loginEyebrow")}</p>
          <h2>{t("loginHeading")}</h2>
        </div>
        <AuthFormField label={t("loginEmailLabel")}>
          <input autoComplete="email" placeholder="prenom.nom@email.com" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </AuthFormField>
        <AuthFormField label={t("loginPasswordLabel")}>
          <input autoComplete="current-password" placeholder="••••••••" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </AuthFormField>
        <div className="auth-links">
          <button className="button button--secondary" type="button" disabled={isResetSubmitting} onClick={handleForgotPassword}>
            {isResetSubmitting ? t("loginForgotPasswordLoading") : t("loginForgotPassword")}
          </button>
        </div>
        <label className="selection-card selection-card--compact">
          <input checked={rememberMe} type="checkbox" onChange={(event) => setRememberMe(event.target.checked)} />
          <div>
            <strong>{t("loginRememberMe")}</strong>
            <p>{t("loginRememberMeDescription")}</p>
          </div>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {statusMessage ? <p className="panel-note panel-note--success">{statusMessage}</p> : null}
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? t("loginLoading") : t("loginButton")}
        </button>
        <div className="auth-links">
          <NavLink to="/benevoles">{t("loginVolunteerLink")}</NavLink>
          <NavLink to="/pre-programme">{t("loginPreprogramLink")}</NavLink>
        </div>
      </form>
    </AuthLayout>
  );
}

function VolunteerAccessPage() {
  const { login, createVolunteerApplication } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberLogin] = useState(readRememberMePreference);
  const [loginError, setLoginError] = useState("");
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [applicationError, setApplicationError] = useState("");
  const [isApplicationSubmitting, setIsApplicationSubmitting] = useState(false);
  const [formData, setFormData] = useState({ firstName: "", lastName: "", gender: "", email: "", phone: "", password: "", confirmPassword: "", birthDate: "", languages: [], otherLanguage: "", tshirtSize: "M", lunexStudent: "non", lunexProgram: "", occupation: "", cmcmExperience: "", volunteerExperience: "", healthSafetyInfo: "", retainForNextYear: true, imageConsent: false, availability: [], meetingDayConfirmed: false, missionPreferences: "", guardianFirstName: "", guardianLastName: "", guardianEmail: "", guardianPhone: "" });
  const volunteerAge = getAgeFromBirthDate(formData.birthDate);
  const isUnder14Volunteer = volunteerAge !== null && volunteerAge < 14;
  const isMinorVolunteer = volunteerAge !== null && volunteerAge >= 14 && volunteerAge < 18;

  async function handleLoginSubmit(event) { event.preventDefault(); setLoginError(""); setIsLoginSubmitting(true); try { await login(loginEmail, loginPassword, rememberLogin); navigate("/app"); } catch { setLoginError("Connexion impossible. Vérifiez votre email et votre mot de passe."); } finally { setIsLoginSubmitting(false); } }
  function handleApplicationChange(event) { const { name, type, checked, value } = event.target; setFormData((current) => ({ ...current, [name]: type === "checkbox" ? checked : value })); }
  function toggleAvailabilityOption(option) { setFormData((current) => ({ ...current, availability: current.availability.includes(option) ? current.availability.filter((item) => item !== option) : [...current.availability, option] })); }
  function toggleLanguageOption(option) { setFormData((current) => ({ ...current, languages: current.languages.includes(option) ? current.languages.filter((item) => item !== option) : [...current.languages, option], otherLanguage: option === "Autre" && current.languages.includes(option) ? "" : current.otherLanguage })); }

  async function handleApplicationSubmit(event) {
    event.preventDefault(); setApplicationError("");
    if (formData.password !== formData.confirmPassword) { setApplicationError("Les deux mots de passe ne correspondent pas."); return; }
    if (!formData.meetingDayConfirmed) { setApplicationError("Merci de confirmer explicitement votre présence le dimanche 17/01/2027 avant d'envoyer votre candidature."); return; }
    if (!formData.imageConsent) { setApplicationError("La présence sur l'événement implique des prises de vue globales photo et vidéo. Sans accord sur ce point, nous ne pouvons malheureusement pas retenir votre candidature."); return; }
    if (isUnder14Volunteer) { setApplicationError("Désolée, nous ne pouvons malheureusement pas prendre de bénévole de moins de 14 ans sauf pour le rôle de porte-panier dans la mesure des places disponibles."); return; }
    setIsApplicationSubmitting(true);
    try { await createVolunteerApplication(formData); navigate("/app"); }
    catch (submissionError) {
      if (submissionError?.code === "auth/email-already-in-use") setApplicationError("Un compte existe déjà avec cette adresse email.");
      else if (submissionError?.code === "auth/invalid-email") setApplicationError("L'adresse email indiquée n'est pas valide.");
      else if (submissionError?.code === "auth/weak-password") setApplicationError("Le mot de passe doit contenir au moins 6 caractères.");
      else if (submissionError?.code === "volunteer/users-write-failed" || submissionError?.code === "volunteer/application-write-failed") setApplicationError(submissionError.message);
      else setApplicationError("La candidature n'a pas pu être enregistrée. Vérifiez les champs obligatoires ou utilisez un autre email si un compte existe déjà.");
    } finally { setIsApplicationSubmitting(false); }
  }

  const loginHeader = (
    <form className="login-inline" onSubmit={handleLoginSubmit}>
      <AuthFormField label="Email"><input autoComplete="email" placeholder="prenom.nom@email.com" type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></AuthFormField>
      <AuthFormField label="Mot de passe"><input autoComplete="current-password" placeholder="••••••••" type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></AuthFormField>
      <button className="button button--secondary" disabled={isLoginSubmitting} type="submit">{isLoginSubmitting ? "Connexion..." : "Se connecter"}</button>
      {loginError ? <p className="form-error" style={{ margin: 0 }}>{loginError}</p> : null}
    </form>
  );

  return (
    <AuthLayout title={t("volunteerPageTitle")} subtitle={t("volunteerPageSubtitle")} headerContent={loginHeader}>
      <div className="stacked-entry">
        <section className="entry-card">
          <div className="entry-card__header"><div><p className="eyebrow">{t("volunteerApplyEyebrow")}</p><h2>{t("volunteerApplyTitle")}</h2></div></div>
          <form className="auth-form auth-form--long" onSubmit={handleApplicationSubmit}>
            <div className="field-grid"><AuthFormField label="Prénom"><input name="firstName" required value={formData.firstName} onChange={handleApplicationChange} /></AuthFormField><AuthFormField label="Nom"><input name="lastName" required value={formData.lastName} onChange={handleApplicationChange} /></AuthFormField></div>
            <div className="field-grid"><AuthFormField label="Genre"><select name="gender" value={formData.gender} onChange={handleApplicationChange}><option value="">Sélectionner</option><option value="femme">Femme</option><option value="homme">Homme</option><option value="autre">Autre</option></select></AuthFormField><AuthFormField label="Taille t-shirt"><select name="tshirtSize" value={formData.tshirtSize} onChange={handleApplicationChange}><option>S</option><option>M</option><option>L</option><option>XL</option></select></AuthFormField></div>
            <div className="field-grid"><AuthFormField label="Email"><input name="email" required type="email" value={formData.email} onChange={handleApplicationChange} /></AuthFormField><AuthFormField label="Téléphone"><PhoneInput name="phone" required value={formData.phone} onChange={handleApplicationChange} /></AuthFormField></div>
            <div className="field-grid"><AuthFormField label="Mot de passe"><input name="password" required type="password" value={formData.password} onChange={handleApplicationChange} /></AuthFormField><AuthFormField label="Confirmer le mot de passe"><input name="confirmPassword" required type="password" value={formData.confirmPassword} onChange={handleApplicationChange} /></AuthFormField></div>
            <div className="field-grid"><AuthFormField label="Date de naissance"><input name="birthDate" required type="date" value={formData.birthDate} onChange={handleApplicationChange} /></AuthFormField></div>
            {volunteerAge !== null ? <div className={`notice-card${isUnder14Volunteer ? " notice-card--danger" : isMinorVolunteer ? " notice-card--warn" : " notice-card--ok"}`}><strong>{isUnder14Volunteer ? "Moins de 14 ans" : isMinorVolunteer ? "Bénévole mineur" : "Candidature adulte"}</strong><p>{isUnder14Volunteer ? "Désolée, nous ne pouvons malheureusement pas prendre de bénévole de moins de 14 ans sauf pour le rôle de porte-panier dans la mesure des places disponibles." : isMinorVolunteer ? "Votre date de naissance indique un bénévole mineur. Un contact de responsable légal est obligatoire et devra valider l'autorisation par email." : "Vous pouvez poursuivre la candidature bénévole normale."}</p>{isUnder14Volunteer ? <div className="auth-links"><NavLink className="button button--secondary button-link" to="/pre-programme">Créer un compte parent</NavLink></div> : null}</div> : null}
            {isMinorVolunteer ? <section className="minor-guardian-card"><div className="form-section-head"><p className="eyebrow">Responsable légal</p><h3>Validation obligatoire pour les 14-17 ans</h3></div><div className="field-grid"><AuthFormField label="Prénom du responsable légal"><input name="guardianFirstName" required={isMinorVolunteer} value={formData.guardianFirstName} onChange={handleApplicationChange} /></AuthFormField><AuthFormField label="Nom du responsable légal"><input name="guardianLastName" required={isMinorVolunteer} value={formData.guardianLastName} onChange={handleApplicationChange} /></AuthFormField></div><div className="field-grid"><AuthFormField label="Email du responsable légal"><input name="guardianEmail" required={isMinorVolunteer} type="email" value={formData.guardianEmail} onChange={handleApplicationChange} /></AuthFormField><AuthFormField label="Téléphone du responsable légal"><PhoneInput name="guardianPhone" required={isMinorVolunteer} value={formData.guardianPhone} onChange={handleApplicationChange} /></AuthFormField></div></section> : null}
            <div className="field-grid"><div className="language-card"><div className="form-section-head"><p className="eyebrow">Langues</p><h3>Quelles langues parlez-vous ?</h3></div><div className="choice-grid">{VOLUNTEER_LANGUAGE_OPTIONS.map((option) => (<label key={option} className="selection-card selection-card--compact"><input checked={formData.languages.includes(option)} type="checkbox" onChange={() => toggleLanguageOption(option)} /><div><strong>{option}</strong></div></label>))}</div>{formData.languages.includes("Autre") ? <AuthFormField label="Autre langue"><input name="otherLanguage" value={formData.otherLanguage} onChange={handleApplicationChange} /></AuthFormField> : null}</div><div className="lunex-card"><div className="form-section-head"><p className="eyebrow">LUNEX</p><h3>Êtes-vous étudiant LUNEX ?</h3></div><div className="lunex-choice-row"><label className="selection-card selection-card--inline"><input checked={formData.lunexStudent === "oui"} name="lunexStudent" type="radio" value="oui" onChange={handleApplicationChange} /><div><strong>Oui</strong></div></label><label className="selection-card selection-card--inline"><input checked={formData.lunexStudent === "non"} name="lunexStudent" type="radio" value="non" onChange={handleApplicationChange} /><div><strong>Non</strong></div></label></div>{formData.lunexStudent === "oui" ? <AuthFormField label="Programme LUNEX"><input name="lunexProgram" value={formData.lunexProgram} onChange={handleApplicationChange} /></AuthFormField> : null}</div></div>
            <AuthFormField label="Profession / occupation"><input name="occupation" value={formData.occupation} onChange={handleApplicationChange} /></AuthFormField>
            <AuthFormField label="Expérience précédente au CMCM"><textarea name="cmcmExperience" rows="3" value={formData.cmcmExperience} onChange={handleApplicationChange} /></AuthFormField>
            <AuthFormField label="Autre expérience bénévole"><textarea name="volunteerExperience" rows="3" value={formData.volunteerExperience} onChange={handleApplicationChange} /></AuthFormField>
            <div className="availability-card"><div className="form-section-head"><p className="eyebrow">Disponibilités</p><h3>Quand pouvez-vous être présent(e) ?</h3></div><p className="availability-lead">Les briefings du matin sont obligatoires. Pour le meeting, nous avons besoin de bénévoles disponibles le dimanche 17/01/2027 de 9h30 à 19h00. Les horaires exacts seront confirmés plus tard, mais cette amplitude doit être considérée comme indispensable pour le jour du meeting. Toute aide avant l'événement est la bienvenue, et nous serions particulièrement reconnaissants pour les aides disponibles le lundi.</p><div className="notice-card notice-card--warn"><strong>Dimanche 17/01/2027 obligatoire</strong><p>Disponibilité requise pour le briefing, la collation avant le meeting, l'ouverture des portes à 13h00 et la compétition de 16h à 19h00.</p></div><label className="selection-card availability-confirm-card"><input checked={formData.meetingDayConfirmed} name="meetingDayConfirmed" type="checkbox" onChange={handleApplicationChange} /><div><strong>Je confirme être disponible le dimanche 17/01/2027</strong><p>J'ai bien compris que ma présence de 9h30 à 19h00 environ, briefing compris, est indispensable pour le jour du meeting.</p></div></label><p className="availability-subnote">Vous pouvez aussi nous indiquer ci-dessous si vous êtes disponible pour aider avant le meeting ou lors du rangement du lundi.</p><div className="availability-options">{VOLUNTEER_SUPPORT_AVAILABILITY_OPTIONS.map((option) => (<label key={option} className="selection-card"><input checked={formData.availability.includes(option)} type="checkbox" onChange={() => toggleAvailabilityOption(option)} /><div><strong>{option}</strong></div></label>))}</div></div>
            <AuthFormField label="Préférences de mission" hint="Ex: transport, aéroport, warm-up"><input name="missionPreferences" placeholder="Transport, aéroport, warm-up" value={formData.missionPreferences} onChange={handleApplicationChange} /></AuthFormField>
            <AuthFormField label="Informations sécurité / santé"><textarea name="healthSafetyInfo" rows="3" value={formData.healthSafetyInfo} onChange={handleApplicationChange} /></AuthFormField>
            <div className="selection-card-group"><label className="selection-card"><input checked={formData.retainForNextYear} name="retainForNextYear" onChange={handleApplicationChange} type="checkbox" /><div><strong>Édition suivante</strong><p>J'accepte d'être recontacté pour la prochaine édition.</p></div></label><label className="selection-card"><input checked={formData.imageConsent} name="imageConsent" onChange={handleApplicationChange} type="checkbox" /><div><strong>Droit à l'image</strong><p>La présence sur l'événement implique des prises de vue photo et vidéo dans les espaces du meeting. Sans accord sur ce point, nous ne pourrons malheureusement pas retenir votre participation.</p></div></label></div>
            {applicationError ? <p className="form-error">{applicationError}</p> : null}
            <button className="button button--primary" disabled={isApplicationSubmitting} type="submit">{isApplicationSubmitting ? "Envoi..." : "Envoyer ma candidature"}</button>
          </form>
        </section>
      </div>
    </AuthLayout>
  );
}

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", wantsVolunteerModule: true, wantsParentModule: false });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  function handleChange(event) { const { name, type, checked, value } = event.target; setFormData((current) => ({ ...current, [name]: type === "checkbox" ? checked : value })); }
  async function handleSubmit(event) { event.preventDefault(); setError(""); setIsSubmitting(true); const userTypes = []; if (formData.wantsVolunteerModule) userTypes.push("benevole"); if (formData.wantsParentModule) userTypes.push("parent_u14"); try { await register(formData.email, formData.password, { firstName: formData.firstName, lastName: formData.lastName, phone: formData.phone, userTypes: userTypes.length ? userTypes : ["benevole"] }); navigate("/app"); } catch { setError("Creation de compte impossible. Cet email est peut-etre deja utilise."); } finally { setIsSubmitting(false); } }
  return (
    <AuthLayout title="Creer un compte unique et activer les bons modules" subtitle="Cree ton acces personnel puis active l'espace benevole, l'espace parent U14, ou les deux selon ton besoin." sideCard={<><h3>Creation de compte</h3><p>Ce parcours est ideal si tu veux d'abord ouvrir ton espace puis completer les modules tranquillement ensuite.</p></>}>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div><p className="eyebrow">Creation de compte</p><h2>Ouvrir mon espace</h2></div>
        <div className="field-grid"><AuthFormField label="Prenom"><input name="firstName" value={formData.firstName} onChange={handleChange} /></AuthFormField><AuthFormField label="Nom"><input name="lastName" value={formData.lastName} onChange={handleChange} /></AuthFormField></div>
        <AuthFormField label="Email"><input name="email" type="email" value={formData.email} onChange={handleChange} /></AuthFormField>
        <div className="field-grid"><AuthFormField label="Telephone"><PhoneInput name="phone" value={formData.phone} onChange={handleChange} /></AuthFormField><AuthFormField label="Mot de passe"><input name="password" type="password" autoComplete="new-password" value={formData.password} onChange={handleChange} /></AuthFormField></div>
        <div className="selection-card-group"><label className="selection-card"><input checked={formData.wantsVolunteerModule} name="wantsVolunteerModule" onChange={handleChange} type="checkbox" /><div><strong>Module benevole</strong><p>Profil, disponibilites, affectations, documents et accreditation.</p></div></label><label className="selection-card"><input checked={formData.wantsParentModule} name="wantsParentModule" onChange={handleChange} type="checkbox" /><div><strong>Module parent / U14</strong><p>Ajout des enfants, demandes U14, statuts et convocations.</p></div></label></div>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="button button--primary" disabled={isSubmitting} type="submit">{isSubmitting ? "Creation..." : "Creer mon compte"}</button>
        <div className="auth-links"><NavLink to="/login">J'ai deja un compte</NavLink><NavLink to="/volunteer-apply">Je veux candidater directement</NavLink></div>
      </form>
    </AuthLayout>
  );
}

function U14AccessPage() {
  const { createU14PreProgramRegistration } = useAuth();
  const { t } = useLanguage();
  const { activeEditionId, preprogramOpeningByEdition, preprogramOpeningDate } = useActiveEdition();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [includeSecondChild, setIncludeSecondChild] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ parentFirstName: "", parentLastName: "", parentEmail: "", parentPhone: "", password: "", confirmPassword: "", children: [{ firstName: "", lastName: "", birthDate: "", category: "", club: "", bibNumber: "", gender: "", requestType: "preprogram", requestedEvent: "60 m", notes: "", imageConsent: false }, { firstName: "", lastName: "", birthDate: "", category: "", club: "", bibNumber: "", gender: "", requestType: "preprogram", requestedEvent: "60 m", notes: "", imageConsent: false }] });
  const isPreprogramOpen = isPreprogramOpenForEdition(
    activeEditionId,
    now,
    typeof window !== "undefined" ? window.location.hostname : "",
    preprogramOpeningByEdition,
  );
  useEffect(() => { if (isPreprogramOpen) return undefined; const interval = window.setInterval(() => { setNow(Date.now()); }, 30000); return () => window.clearInterval(interval); }, [isPreprogramOpen]);
  function handleParentChange(event) { const { name, value } = event.target; setFormData((current) => ({ ...current, [name]: value })); }
  function handleChildChange(index, event) { const { name, type, checked, value } = event.target; setFormData((current) => ({ ...current, children: current.children.map((child, childIndex) => childIndex === index ? { ...(() => { const nextValue = type === "checkbox" ? checked : value; const nextCategory = name === "birthDate" ? getU14CategoryFromBirthDate(value) : child.category; const nextChild = { ...child, [name]: nextValue, ...(name === "birthDate" ? { category: nextCategory } : {}) }; return { ...nextChild, requestedEvent: getValidRequestedEventForCategory(nextCategory, name === "requestedEvent" ? value : nextChild.requestedEvent) }; })() } : child) })); }
  async function handleSubmit(event) { event.preventDefault(); setError(""); if (formData.password !== formData.confirmPassword) { setError("Les deux mots de passe ne correspondent pas."); return; } const children = includeSecondChild ? formData.children : [formData.children[0]]; if (children.some((child) => child.firstName && child.lastName && child.birthDate && !getU14CategoryFromBirthDate(child.birthDate))) { setError("Pour l'édition 2027, seuls les enfants nés en 2017/2016 (U12) et 2015/2014 (U14) peuvent être inscrits ici."); return; } if (children.some((child) => child.firstName && child.lastName && child.birthDate && (!luxCompetitionClubs.includes(child.club) || !child.bibNumber.trim()))) { setError("Pour toute demande, y compris porte-panier, merci d'indiquer un club luxembourgeois autorisé et le numéro de licence de l'enfant."); return; } if (children.some((child) => child.firstName && child.lastName && child.birthDate && child.requestType !== "porte_panier" && !getU14AllowedEvents(child.category).includes(child.requestedEvent))) { setError("Pour la catégorie U12, seule l'épreuve du 60 m peut être demandée."); return; } if (children.some((child) => child.firstName && child.lastName && child.birthDate && !child.imageConsent)) { setError("La participation au meeting implique des prises de vue photo et vidéo dans les espaces de l'événement. Sans cet accord, nous ne pourrons malheureusement pas confirmer l'inscription de l'enfant."); return; } setIsSubmitting(true); try { await createU14PreProgramRegistration({ ...formData, children }); navigate("/app"); } catch (submissionError) { setError(getPreProgramSubmissionErrorMessage(submissionError)); } finally { setIsSubmitting(false); } }
  if (!isPreprogramOpen) {
    return <AuthLayout title={t("preprogramPageTitle")} subtitle={t("preprogramPageSubtitle")}><div className="placeholder-card placeholder-card--u14"><div className="u14-closed-layout"><div className="u14-closed-layout__content"><div className="u14-hero__copy"><p className="eyebrow">{t("preprogramIntroEyebrow")}</p><h2>{t("preprogramClosedTitle")}</h2><p>{t("preprogramClosedDescription")}</p><p className="panel-note">Édition active: {activeEditionId === "test" ? "test" : activeEditionId}{preprogramOpeningDate ? ` - ouverture le ${preprogramOpeningDate.toLocaleString("fr-LU")}` : ""}</p></div><div className="feature-card-grid"><div className="mini-feature"><strong>{t("preprogramClosedCardTitle")}</strong><span>{t("preprogramClosedCardBody")}</span></div><div className="mini-feature"><strong>{t("preprogramClosedTimingTitle")}</strong><span>{t("preprogramClosedTimingBody")}</span></div></div></div><div className="u14-closed-layout__aside"><div className="u14-hero__media"><div className="u14-hero__image u14-hero__image--large"><img alt="Pré-programme U12/U14" src={preprogrammeHomeImage} /></div><div className="u14-hero__image u14-hero__image--small"><img alt="Porte-paniers" src={portePanierHomeImage} /></div></div></div></div></div></AuthLayout>;
  }
  return <AuthLayout title={t("preprogramPageTitle")} subtitle={t("preprogramPageSubtitle")}><form className="auth-form auth-form--long u14-form" onSubmit={handleSubmit}><div className="u14-intro-card"><div className="u14-hero"><div className="u14-hero__copy"><p className="eyebrow">{t("preprogramIntroEyebrow")}</p><h2>{t("preprogramIntroTitle")}</h2><p>{t("preprogramIntroDescription")}</p></div><div className="u14-hero__media"><div className="u14-hero__image u14-hero__image--large"><img alt="Pré-programme U12/U14" src={preprogrammeHomeImage} /></div><div className="u14-hero__image u14-hero__image--small"><img alt="Porte-paniers" src={portePanierHomeImage} /></div></div></div></div><div className="notice-card"><strong>{t("preprogramClosedCardTitle")}</strong><p>{t("preprogramClosedCardBody")}</p></div><div className="notice-card notice-card--warn"><strong>Courses U12/U14 réservées aux licenciés luxembourgeois</strong><p>Les courses U12/U14 sont réservées aux licenciés luxembourgeois des clubs suivants : CAB, CAD, CAPA, CSL, CELTIC, LIAL, CAEG, CAFOLA, CAS, Karibu, Trispeed, RBUAP, CSN Clervaux, Triathlon Luxembourg et Team X3M Snooze.</p></div><section className="form-section-card"><div className="form-section-head"><p className="eyebrow">Bloc 1</p><h3>Informations parentales</h3></div><div className="field-grid"><AuthFormField label="Prénom du parent"><input name="parentFirstName" required value={formData.parentFirstName} onChange={handleParentChange} /></AuthFormField><AuthFormField label="Nom du parent"><input name="parentLastName" required value={formData.parentLastName} onChange={handleParentChange} /></AuthFormField></div><div className="field-grid"><AuthFormField label="Email du parent"><input name="parentEmail" required type="email" value={formData.parentEmail} onChange={handleParentChange} /></AuthFormField><AuthFormField label="Téléphone du parent"><PhoneInput name="parentPhone" required value={formData.parentPhone} onChange={handleParentChange} /></AuthFormField></div><div className="field-grid"><AuthFormField label="Mot de passe" hint="Ce mot de passe servira pour vous reconnecter à l'espace parent après l'inscription."><input name="password" required type="password" value={formData.password} onChange={handleParentChange} /></AuthFormField><AuthFormField label="Confirmer le mot de passe"><input name="confirmPassword" required type="password" value={formData.confirmPassword} onChange={handleParentChange} /></AuthFormField></div></section>{[0, ...(includeSecondChild ? [1] : [])].map((childIndex) => (<section key={childIndex} className="form-section-card"><div className="form-section-head"><p className="eyebrow">Bloc {childIndex + 2}</p><h3>{childIndex === 0 ? "Premier enfant" : "Deuxième enfant"}</h3></div><div className="field-grid"><AuthFormField label="Prénom de l'enfant"><input name="firstName" required value={formData.children[childIndex].firstName} onChange={(event) => handleChildChange(childIndex, event)} /></AuthFormField><AuthFormField label="Nom de l'enfant"><input name="lastName" required value={formData.children[childIndex].lastName} onChange={(event) => handleChildChange(childIndex, event)} /></AuthFormField></div><div className="field-grid"><AuthFormField label="Date de naissance" hint="Pour le CMCM Luxembourg Indoor Meeting 2027 : U12 = 2017/2016, U14 = 2015/2014."><input name="birthDate" required type="date" value={formData.children[childIndex].birthDate} onChange={(event) => handleChildChange(childIndex, event)} /></AuthFormField><AuthFormField label="Catégorie attribuée"><input readOnly name="category" placeholder="Calculée automatiquement" required value={formData.children[childIndex].category} /></AuthFormField></div>{formData.children[childIndex].birthDate && !formData.children[childIndex].category ? <div className="notice-card notice-card--danger"><strong>Catégorie non éligible</strong><p>Pour cette page, l'enfant doit être né en 2017 ou 2016 pour la catégorie U12, ou en 2015 ou 2014 pour la catégorie U14.</p></div> : null}<div className="field-grid"><AuthFormField label="Genre"><select name="gender" value={formData.children[childIndex].gender} onChange={(event) => handleChildChange(childIndex, event)}><option value="">Sélectionner</option><option value="fille">Fille</option><option value="garcon">Garcon</option></select></AuthFormField><AuthFormField label="Club" hint="Obligatoire pour toute demande, y compris porte-panier. Choisissez un club luxembourgeois autorisé."><select name="club" required value={formData.children[childIndex].club} onChange={(event) => handleChildChange(childIndex, event)}><option value="">Sélectionner un club</option>{luxCompetitionClubs.map((club) => (<option key={club} value={club}>{club}</option>))}</select></AuthFormField></div><AuthFormField label="Numéro de licence" hint="Obligatoire pour toute demande, y compris porte-panier."><input name="bibNumber" required placeholder="Ex: 245" value={formData.children[childIndex].bibNumber} onChange={(event) => handleChildChange(childIndex, event)} /></AuthFormField><AuthFormField label="Type d'inscription souhaité" hint="Choisissez le Pré-programme, le rôle de porte-panier, ou une demande flexible selon les places disponibles."><select name="requestType" value={formData.children[childIndex].requestType} onChange={(event) => handleChildChange(childIndex, event)}><option value="preprogram">Pré-programme U12/U14</option><option value="porte_panier">Porte-panier</option><option value="preprogram_ou_porte_panier">Pré-programme ou porte-panier</option></select></AuthFormField>{formData.children[childIndex].requestType !== "porte_panier" ? <AuthFormField label="Épreuve demandée" hint="Une seule épreuve par enfant. Le 1000 m est réservé à la catégorie U14."><select name="requestedEvent" value={formData.children[childIndex].requestedEvent} onChange={(event) => handleChildChange(childIndex, event)}>{getU14AllowedEvents(formData.children[childIndex].category).map((eventOption) => (<option key={eventOption} value={eventOption}>{eventOption}</option>))}</select></AuthFormField> : <div className="notice-card notice-card--ok"><strong>Porte-panier</strong><p>Cette demande concerne le rôle de porte-panier. Une licence reste obligatoire et l'organisation reviendra vers vous avec les modalités selon les places disponibles.</p></div>}<AuthFormField label="Informations utiles"><textarea name="notes" rows="3" placeholder="Informations complémentaires, préférences ou remarques si nécessaire" value={formData.children[childIndex].notes} onChange={(event) => handleChildChange(childIndex, event)} /></AuthFormField><label className="selection-card"><input checked={formData.children[childIndex].imageConsent} name="imageConsent" type="checkbox" onChange={(event) => handleChildChange(childIndex, event)} /><div><strong>Autorisation image</strong><p>La participation implique des prises de vue photo et vidéo dans les espaces du meeting. Sans cet accord, nous ne pourrons malheureusement pas confirmer l'inscription de votre enfant.</p></div></label></section>))}<button className="button button--secondary" type="button" onClick={() => setIncludeSecondChild((current) => !current)}>{includeSecondChild ? "Retirer le second enfant" : "Ajouter un deuxième enfant"}</button>{error ? <p className="form-error">{error}</p> : null}<div className="u14-submit-bar"><div><strong>Le compte parent sera créé automatiquement.</strong><p>Vous pourrez ensuite retrouver dans MyCLIM les statuts, décisions et informations pratiques pour le Pré-programme ou le porte-panier.</p></div><button className="button button--primary" disabled={isSubmitting} type="submit">{isSubmitting ? "Envoi en cours..." : "Envoyer l'inscription"}</button></div></form></AuthLayout>;
}

function VipAccessPage() {
  return <AuthLayout title="Inscription VIP" subtitle="Cette page sera l'entree dediee aux invitations et inscriptions VIP du CMCM Luxembourg Indoor Meeting." sideCard={<><h3>Module VIP</h3><p>Le formulaire d'inscription VIP sera ajoute plus tard. On garde deja une entree separee pour structurer le parcours public.</p><div className="auth-links auth-links--stack"><NavLink to="/">Retour a l'accueil</NavLink></div></>}><div className="placeholder-card"><p className="eyebrow">A venir</p><h2>Page VIP en preparation</h2><p>Le parcours VIP sera branche ici avec le formulaire, la confirmation d'inscription et les informations pratiques.</p><div className="auth-links"><NavLink to="/">Retour accueil</NavLink></div></div></AuthLayout>;
}

function VolunteerApplyPage() {
  const { createVolunteerApplication } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ firstName: "", lastName: "", gender: "", email: "", phone: "", password: "", languages: "Francais, Anglais", tshirtSize: "M", ageBracket: "18+", lunexStudent: "non", lunexProgram: "", occupation: "", cmcmExperience: "", volunteerExperience: "", healthSafetyInfo: "", retainForNextYear: true, imageConsent: false, availability: "", missionPreferences: "" });
  function handleChange(event) { const { name, type, checked, value } = event.target; setFormData((current) => ({ ...current, [name]: type === "checkbox" ? checked : value })); }
  async function handleSubmit(event) { event.preventDefault(); setError(""); setIsSubmitting(true); try { await createVolunteerApplication(formData); navigate("/app"); } catch { setError("La candidature n'a pas pu etre enregistree. Verifie les champs obligatoires ou un compte existant sur cet email."); } finally { setIsSubmitting(false); } }
  return <AuthLayout title="Candidature benevole avec creation de compte integree" subtitle="Un seul formulaire pour creer ton compte et envoyer ta candidature benevole au CMCM Luxembourg Indoor Meeting." sideCard={<><h3>Inscription benevole</h3><p>Si tu veux aller droit au but, cette entree est la plus simple: tu completes ton profil et ta demande est enregistree en une fois.</p></>}><form className="auth-form auth-form--long" onSubmit={handleSubmit}><div><p className="eyebrow">Inscription benevole</p><h2>Je candidate pour le meeting</h2></div><div className="field-grid"><AuthFormField label="Prenom"><input name="firstName" required value={formData.firstName} onChange={handleChange} /></AuthFormField><AuthFormField label="Nom"><input name="lastName" required value={formData.lastName} onChange={handleChange} /></AuthFormField></div><div className="field-grid"><AuthFormField label="Genre"><select name="gender" value={formData.gender} onChange={handleChange}><option value="">Selectionner</option><option value="femme">Femme</option><option value="homme">Homme</option><option value="autre">Autre</option></select></AuthFormField><AuthFormField label="Taille t-shirt"><select name="tshirtSize" value={formData.tshirtSize} onChange={handleChange}><option>S</option><option>M</option><option>L</option><option>XL</option></select></AuthFormField></div><div className="field-grid"><AuthFormField label="Email"><input name="email" required type="email" value={formData.email} onChange={handleChange} /></AuthFormField><AuthFormField label="Telephone"><PhoneInput name="phone" required value={formData.phone} onChange={handleChange} /></AuthFormField></div><div className="field-grid"><AuthFormField label="Mot de passe"><input name="password" required type="password" value={formData.password} onChange={handleChange} /></AuthFormField><AuthFormField label="Tranche d'age"><select name="ageBracket" value={formData.ageBracket} onChange={handleChange}><option value="u16">U16</option><option value="u18">U18</option><option value="18+">18+</option></select></AuthFormField></div><div className="field-grid"><AuthFormField label="Langues" hint="Separees par des virgules"><input name="languages" value={formData.languages} onChange={handleChange} /></AuthFormField><AuthFormField label="Etudiant LUNEX"><select name="lunexStudent" value={formData.lunexStudent} onChange={handleChange}><option value="non">Non</option><option value="oui">Oui</option></select></AuthFormField></div><AuthFormField label="Programme LUNEX si applicable"><input name="lunexProgram" value={formData.lunexProgram} onChange={handleChange} /></AuthFormField><AuthFormField label="Profession / occupation"><input name="occupation" value={formData.occupation} onChange={handleChange} /></AuthFormField><AuthFormField label="Experience precedente au CMCM"><textarea name="cmcmExperience" rows="3" value={formData.cmcmExperience} onChange={handleChange} /></AuthFormField><AuthFormField label="Autre experience benevole"><textarea name="volunteerExperience" rows="3" value={formData.volunteerExperience} onChange={handleChange} /></AuthFormField><AuthFormField label="Disponibilites globales"><textarea name="availability" rows="3" placeholder="Vendredi soir, samedi toute la journee..." value={formData.availability} onChange={handleChange} /></AuthFormField><AuthFormField label="Preferences de mission" hint="Ex: transport, aeroport, warm-up"><input name="missionPreferences" placeholder="Transport, aeroport, warm-up" value={formData.missionPreferences} onChange={handleChange} /></AuthFormField><AuthFormField label="Informations securite / sante"><textarea name="healthSafetyInfo" rows="3" value={formData.healthSafetyInfo} onChange={handleChange} /></AuthFormField><div className="selection-card-group"><label className="selection-card"><input checked={formData.retainForNextYear} name="retainForNextYear" onChange={handleChange} type="checkbox" /><div><strong>Edition suivante</strong><p>J'accepte d'etre recontacte pour la prochaine edition.</p></div></label><label className="selection-card"><input checked={formData.imageConsent} name="imageConsent" onChange={handleChange} type="checkbox" /><div><strong>Droit a l'image</strong><p>La presence sur l'evenement implique des prises de vue photo et video dans les espaces du meeting. Sans accord sur ce point, nous ne pourrons malheureusement pas retenir votre participation.</p></div></label></div>{error ? <p className="form-error">{error}</p> : null}<button className="button button--primary" disabled={isSubmitting} type="submit">{isSubmitting ? "Envoi..." : "Envoyer ma candidature"}</button><div className="auth-links"><NavLink to="/login">J'ai deja un compte</NavLink><NavLink to="/register">Je prefere creer un compte d'abord</NavLink></div></form></AuthLayout>;
}

export { LoginPage, RegisterPage, U14AccessPage, VipAccessPage, VolunteerAccessPage, VolunteerApplyPage };
