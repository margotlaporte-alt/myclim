import { useEffect, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { NavLink } from "react-router-dom";
import { useActiveEdition } from "./edition";
import { AuthFormField, PhoneInput } from "./form-components";
import {
  buildVolunteerApplicationPayload,
  createEmptyVolunteerProfileFormData,
  createVolunteerProfileFormData,
  getRoleLabel,
} from "./volunteer-helpers";
import { useVolunteerApplication } from "./volunteer-hooks";
import { VOLUNTEER_LANGUAGE_OPTIONS, buildUserSearchTokens, getAgeFromBirthDate } from "./utils";
import { getActiveRoles } from "./navigation";
import { useAuth } from "../context/auth-context";
import { auth, db } from "../services/firebase";

function VolunteerProfilePage(props) {
  const {
    Panel,
    VOLUNTEER_SUPPORT_AVAILABILITY_OPTIONS,
    loadMailQueueModule,
  } = props;
  const { currentUser, userProfile } = useAuth();
  const { application: volunteerApplication, loading, error } = useVolunteerApplication(currentUser?.uid);
  const { activeEditionId, activeEditionLabel } = useActiveEdition(Boolean(currentUser?.uid));
  const [formData, setFormData] = useState(createEmptyVolunteerProfileFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const volunteerAge = getAgeFromBirthDate(formData.birthDate);
  const isUnder14Volunteer = volunteerAge !== null && volunteerAge < 14;
  const isMinorVolunteer = volunteerAge !== null && volunteerAge >= 14 && volunteerAge < 18;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setFormData(createVolunteerProfileFormData(volunteerApplication, userProfile));
    }, 0);

    return () => window.clearTimeout(timeoutId);
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
          editionId: activeEditionId,
          ...applicationPayload,
          submittedAt: serverTimestamp(),
        });
      }

      setStatusMessage(
        volunteerApplication?.id
          ? "Dossier bénévole mis à jour."
          : "Dossier bénévole créé. Le module bénévole est maintenant actif sur ce compte.",
      );

      try {
        const { buildVolunteerModuleCompletedMail, enqueueTransactionalMail } = await loadMailQueueModule();
        await enqueueTransactionalMail(
          buildVolunteerModuleCompletedMail({
            email: currentUser.email,
            firstName: formData.firstName,
            missionPreferences: applicationPayload.missionPreferences,
            availability: applicationPayload.availability,
            status: applicationStatus,
          }),
        );
      } catch (mailError) {
        console.error("Volunteer module email could not be sent", mailError);
      }
    } catch (saveError) {
      console.error("Volunteer module save failed", saveError);
      setErrorMessage(
        `La sauvegarde du dossier bénévole a échoué. ${saveError?.message ? `(${saveError.message})` : ""}`.trim(),
      );
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
              <dt>Édition active</dt>
              <dd>{activeEditionLabel}</dd>
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

function ProfilePage(props) {
  const { Panel } = props;
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
    const timeoutId = window.setTimeout(() => {
      setFormData({
        firstName: userProfile?.firstName || "",
        lastName: userProfile?.lastName || "",
        phone: userProfile?.phone || "",
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
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

export { ProfilePage, VolunteerProfilePage };
