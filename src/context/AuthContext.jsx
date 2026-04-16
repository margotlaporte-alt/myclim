import { createContext, useContext, useEffect, useState } from "react";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../services/firebase";
import {
  buildPreProgramAccountCreatedMail,
  buildVolunteerAccountCreatedMail,
  enqueueTransactionalMail,
} from "../services/mailQueue";

const AuthContext = createContext();

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function extractUserTypes(profileData = {}) {
  const collectedRoles = [
    ...(Array.isArray(profileData.userTypes) ? profileData.userTypes : []),
    ...(Array.isArray(profileData.roles) ? profileData.roles : []),
    profileData.userType,
    profileData.role,
    profileData.isAdmin ? "admin" : "",
    profileData.isManager ? "gestionnaire" : "",
    profileData.isTeamLead ? "chef_equipe" : "",
    profileData.isParentU14 ? "parent_u14" : "",
    profileData.isVolunteer ? "benevole" : "",
  ]
    .map(normalizeRole)
    .filter(Boolean);

  return [...new Set(collectedRoles)];
}

function calculateAgeFromBirthDate(dateString) {
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

function getAgeBracket(age) {
  if (age === null) return "";
  if (age < 14) return "u14";
  if (age < 16) return "u16";
  if (age < 18) return "u18";
  return "18+";
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

function buildUserSearchTokens(profileData = {}, emailFallback = "") {
  const fullName = [profileData.firstName, profileData.lastName].filter(Boolean).join(" ");

  return [
    ...new Set(
      [profileData.firstName, profileData.lastName, profileData.email, emailFallback, fullName]
        .flatMap((value) => buildSearchPrefixes(value))
        .filter(Boolean),
    ),
  ];
}

function buildBaseProfile(user, profileData = {}) {
  const userTypes = extractUserTypes({ ...profileData, email: profileData.email || user.email });

  return {
    uid: user.uid,
    firstName: profileData.firstName || "",
    lastName: profileData.lastName || "",
    email: user.email,
    phone: profileData.phone || "",
    userTypes: userTypes.length ? userTypes : ["benevole"],
    accountStatus: profileData.accountStatus || "active",
    searchTokens: buildUserSearchTokens(profileData, user.email),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function createRegistrationStepError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  return error;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserProfile = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      try {
        if (!user) {
          unsubscribeUserProfile();
          setUserProfile(null);
          setLoading(false);
          return;
        }

        setLoading(true);

        const userRef = doc(db, "users", user.uid);
        unsubscribeUserProfile();
        unsubscribeUserProfile = onSnapshot(
          userRef,
          async (userSnapshot) => {
            if (userSnapshot.exists()) {
              const profileData = userSnapshot.data();
              const normalizedUserTypes = extractUserTypes(profileData);
              const normalizedProfile = {
                id: userSnapshot.id,
                ...profileData,
                userTypes: normalizedUserTypes.length ? normalizedUserTypes : ["benevole"],
              };

              if (
                (normalizedUserTypes.length &&
                  JSON.stringify(profileData.userTypes || []) !== JSON.stringify(normalizedUserTypes)) ||
                JSON.stringify(profileData.searchTokens || []) !==
                  JSON.stringify(buildUserSearchTokens(profileData, user.email))
              ) {
                try {
                  const normalizedSearchTokens = buildUserSearchTokens(profileData, user.email);
                  await setDoc(
                    userRef,
                    {
                      userTypes: normalizedUserTypes,
                      searchTokens: normalizedSearchTokens,
                      updatedAt: serverTimestamp(),
                    },
                    { merge: true },
                  );
                } catch (migrationError) {
                  console.warn("Unable to persist normalized user roles", migrationError);
                }
              }

              setUserProfile(normalizedProfile);
              setLoading(false);
            } else {
              const fallbackProfile = buildBaseProfile(user, {});
              await setDoc(userRef, fallbackProfile, { merge: true });
              setUserProfile({ id: user.uid, ...fallbackProfile, createdAt: null, updatedAt: null });
              setLoading(false);
            }
          },
          (error) => {
            console.error("Failed to restore auth session", error);
            setUserProfile({
              id: user.uid,
              uid: user.uid,
              email: user.email,
              firstName: "",
              lastName: "",
              phone: "",
              userTypes: ["benevole"],
              accountStatus: "active",
              createdAt: null,
              updatedAt: null,
            });
            setLoading(false);
          },
        );
      } catch (error) {
        console.error("Failed to restore auth session", error);
        if (user) {
          setUserProfile({
            id: user.uid,
            uid: user.uid,
            email: user.email,
            firstName: "",
            lastName: "",
            phone: "",
            userTypes: ["benevole"],
            accountStatus: "active",
              createdAt: null,
              updatedAt: null,
            });
        } else {
          setUserProfile(null);
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeUserProfile();
      unsubscribeAuth();
    };
  }, []);

  async function register(email, password, profileData = {}) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const baseProfile = buildBaseProfile(credential.user, profileData);

    await setDoc(doc(db, "users", credential.user.uid), baseProfile, { merge: true });

    return credential;
  }

  async function login(email, password, rememberMe = true) {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
  }

  async function requestPasswordReset(email) {
    const normalizedEmail = String(email || "").trim();
    if (!normalizedEmail) {
      throw new Error("missing-email");
    }

    try {
      const requestReset = httpsCallable(functions, "requestPasswordReset");
      await requestReset({ email: normalizedEmail });
    } catch (error) {
      console.warn("Falling back to Firebase Auth password reset email", error);

      try {
        await sendPasswordResetEmail(auth, normalizedEmail);
        return;
      } catch (fallbackError) {
        console.error("Password reset email fallback failed", fallbackError);
      }

      throw error;
    }
  }

  async function createVolunteerApplication(formData) {
    const age = calculateAgeFromBirthDate(formData.birthDate);

    if (age !== null && age < 14) {
      throw new Error("underage-volunteer");
    }

    const legalGuardianRequired = age !== null && age < 18;
    const applicationStatus = legalGuardianRequired
      ? "pending_guardian_approval"
      : "candidature_recue";

    const credential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);

    const userProfileData = buildBaseProfile(credential.user, {
      firstName: formData.firstName,
      lastName: formData.lastName,
      phone: formData.phone,
      accountStatus: applicationStatus,
      userTypes: ["benevole"],
      birthDate: formData.birthDate,
      age,
      isMinorVolunteer: legalGuardianRequired,
      legalGuardianRequired,
    });

    try {
      await setDoc(doc(db, "users", credential.user.uid), userProfileData, { merge: true });
    } catch (error) {
      throw createRegistrationStepError(
        "volunteer/users-write-failed",
        "Le compte a été créé, mais l'enregistrement du profil bénévole dans Firestore a échoué.",
        error,
      );
    }

    try {
      await addDoc(collection(db, "volunteerApplications"), {
        uid: credential.user.uid,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        gender: formData.gender,
        birthDate: formData.birthDate,
        age,
        languages: Array.isArray(formData.languages)
          ? [
              ...formData.languages,
              ...(formData.otherLanguage ? [formData.otherLanguage.trim()] : []),
            ].filter(Boolean)
          : String(formData.languages || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
        tshirtSize: formData.tshirtSize,
        ageBracket: getAgeBracket(age),
        lunexStudent: formData.lunexStudent,
        lunexProgram: formData.lunexProgram,
        occupation: formData.occupation,
        cmcmExperience: formData.cmcmExperience,
        volunteerExperience: formData.volunteerExperience,
        healthSafetyInfo: formData.healthSafetyInfo,
        certificateNeeded: formData.certificateNeeded,
        retainForNextYear: formData.retainForNextYear,
        imageConsent: formData.imageConsent,
        availability: [
          ...(formData.meetingDayConfirmed
            ? ["Meeting - dimanche 17/01/2027 9h30-19h00 (obligatoire)"]
            : []),
          ...(Array.isArray(formData.availability)
            ? formData.availability
            : String(formData.availability || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)),
        ],
        missionPreferences: formData.missionPreferences
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        legalGuardianRequired,
        legalGuardian: legalGuardianRequired
          ? {
              firstName: formData.guardianFirstName,
              lastName: formData.guardianLastName,
              email: formData.guardianEmail,
              phone: formData.guardianPhone,
              status: "pending",
            }
          : null,
        status: applicationStatus,
        submittedAt: serverTimestamp(),
      });
    } catch (error) {
      throw createRegistrationStepError(
        "volunteer/application-write-failed",
        "Le compte a été créé, mais l'enregistrement de la candidature bénévole dans Firestore a échoué.",
        error,
      );
    }

    try {
      await enqueueTransactionalMail(
        buildVolunteerAccountCreatedMail({
          firstName: formData.firstName,
          email: formData.email,
        }),
      );
    } catch (mailError) {
      console.error("Volunteer account email could not be sent", mailError);
    }

    return credential;
  }

  async function createU14PreProgramRegistration(formData) {
    const credential = await createUserWithEmailAndPassword(auth, formData.parentEmail, formData.password);

    const parentProfile = buildBaseProfile(credential.user, {
      firstName: formData.parentFirstName,
      lastName: formData.parentLastName,
      phone: formData.parentPhone,
      accountStatus: "pre_programme_recu",
      userTypes: ["parent_u14"],
    });

    try {
      await setDoc(doc(db, "users", credential.user.uid), parentProfile, { merge: true });
    } catch (error) {
      throw createRegistrationStepError(
        "preprogram/users-write-failed",
        "Le compte a été créé, mais l'enregistrement du profil parent dans Firestore a échoué.",
        error,
      );
    }

    const children = formData.children.filter(
      (child) =>
        child.firstName &&
        child.lastName &&
        child.birthDate &&
        child.category &&
        (child.requestType === "porte_panier" || child.requestedEvent),
    );

    for (const child of children) {
      let childRef;

      try {
        childRef = await addDoc(collection(db, "u14Children"), {
          parentUserId: credential.user.uid,
          firstName: child.firstName,
          lastName: child.lastName,
          birthDate: child.birthDate,
          birthYear: new Date(child.birthDate).getFullYear(),
          category: child.category,
          club: child.club,
          bibNumber: child.bibNumber,
          gender: child.gender,
          imageConsent: child.imageConsent,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        throw createRegistrationStepError(
          "preprogram/child-write-failed",
          `Le compte a été créé, mais l'enregistrement de la fiche enfant \"${child.firstName} ${child.lastName}\" a échoué.`,
          error,
        );
      }

      try {
        await addDoc(collection(db, "u14Requests"), {
          childId: childRef.id,
          parentUserId: credential.user.uid,
          parentFirstName: formData.parentFirstName,
          parentLastName: formData.parentLastName,
          parentEmail: formData.parentEmail,
          requestType: child.requestType,
          requestedEvent: child.requestType === "porte_panier" ? null : child.requestedEvent,
          raceCode:
            child.requestType === "porte_panier"
              ? ""
              : `${String(child.category || "").trim().toUpperCase()}${
                  String(child.gender || "").trim().toLowerCase().startsWith("f") ? "F" : "M"
                }${String(child.requestedEvent || "").includes("1000") ? "1000" : "60"}`,
          childFirstName: child.firstName,
          childLastName: child.lastName,
          category: child.category,
          club: child.club,
          bibNumber: child.bibNumber,
          gender: child.gender,
          status: "submitted",
          notes: child.notes,
          submittedAt: serverTimestamp(),
        });
      } catch (error) {
        throw createRegistrationStepError(
          "preprogram/request-write-failed",
          `Le compte a été créé, mais l'enregistrement de la demande pour \"${child.firstName} ${child.lastName}\" a échoué.`,
          error,
        );
      }
    }

    try {
      await enqueueTransactionalMail(
        buildPreProgramAccountCreatedMail({
          parentFirstName: formData.parentFirstName,
          parentEmail: formData.parentEmail,
          children,
        }),
      );
    } catch (mailError) {
      console.error("Pre-program account email could not be sent", mailError);
    }

    return credential;
  }

  async function addU14ChildRegistration(formData) {
    const parentUserId = auth.currentUser?.uid;

    if (!parentUserId) {
      throw createRegistrationStepError(
        "preprogram/not-authenticated",
        "Vous devez être connecté pour ajouter un enfant.",
      );
    }

    let childRef;

    try {
      childRef = await addDoc(collection(db, "u14Children"), {
        parentUserId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        birthDate: formData.birthDate,
        birthYear: new Date(formData.birthDate).getFullYear(),
        category: formData.category,
        club: formData.club,
        bibNumber: formData.bibNumber,
        gender: formData.gender,
        imageConsent: formData.imageConsent,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      throw createRegistrationStepError(
        "preprogram/child-write-failed",
        `L'enregistrement de la fiche enfant \"${formData.firstName} ${formData.lastName}\" a échoué.`,
        error,
      );
    }

    try {
      await addDoc(collection(db, "u14Requests"), {
        childId: childRef.id,
        parentUserId,
        parentFirstName: formData.parentFirstName,
        parentLastName: formData.parentLastName,
        parentEmail: formData.parentEmail,
        requestType: formData.requestType,
        requestedEvent: formData.requestType === "porte_panier" ? null : formData.requestedEvent,
        raceCode:
          formData.requestType === "porte_panier"
            ? ""
            : `${String(formData.category || "").trim().toUpperCase()}${
                String(formData.gender || "").trim().toLowerCase().startsWith("f") ? "F" : "M"
              }${String(formData.requestedEvent || "").includes("1000") ? "1000" : "60"}`,
        childFirstName: formData.firstName,
        childLastName: formData.lastName,
        category: formData.category,
        club: formData.club,
        bibNumber: formData.bibNumber,
        gender: formData.gender,
        status: "submitted",
        notes: formData.notes,
        submittedAt: serverTimestamp(),
      });
    } catch (error) {
      throw createRegistrationStepError(
        "preprogram/request-write-failed",
        `L'enregistrement de la demande pour \"${formData.firstName} ${formData.lastName}\" a échoué.`,
        error,
      );
    }
  }

  return (
    <AuthContext.Provider
      value={{
        addU14ChildRegistration,
        createU14PreProgramRegistration,
        createVolunteerApplication,
        currentUser,
        loading,
        login,
        logout,
        requestPasswordReset,
        register,
        userProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
