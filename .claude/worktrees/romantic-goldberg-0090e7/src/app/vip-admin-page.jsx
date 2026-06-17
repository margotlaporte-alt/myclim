import { Fragment, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { recordMatchesEdition, useActiveEdition } from "./edition";
import { AuthFormField, PhoneInput } from "./form-components";
import vipImport2027 from "./vip-import-2027.json";
import {
  VIP_INVITATION_CATEGORY_SUGGESTIONS,
  VIP_PICKUP_POINT_OPTIONS,
  buildVipFullName,
  buildVipPortalId,
  buildVipRegistrationPayload,
  createEmptyVipAdminRegistrationData,
  createEmptyVipInvitationData,
  createEmptyVipPartnerPortalData,
  findMatchingVipInvitation,
  findMatchingVipRegistration,
  getVipTourChoiceLabel,
  normalizeVipComparableValue,
} from "./vip-helpers";

function mapVipInvitation(snapshot) {
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

function mapVipPublicRegistration(snapshot) {
  return {
    id: snapshot.id,
    sourceCollection: "vipPublicRegistrations",
    sourceType: "public_form",
    ...snapshot.data(),
  };
}

function mapVipPartnerRegistration(snapshot) {
  const pathSegments = snapshot.ref.path.split("/");
  return {
    id: snapshot.id,
    portalId: pathSegments[1] || "",
    sourceCollection: "vipPartnerPortals",
    sourceType: "partner_portal",
    ...snapshot.data(),
  };
}

function mapVipAdminRegistration(snapshot) {
  return {
    id: snapshot.id,
    sourceCollection: "vipAdminRegistrations",
    sourceType: snapshot.data()?.source || "admin_manual",
    ...snapshot.data(),
  };
}

function mapVipPartnerPortal(snapshot) {
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

function getRegistrationDocumentRef(registration) {
  if (registration.sourceCollection === "vipInvitations") {
    return doc(db, "vipInvitations", registration.id);
  }

  if (registration.sourceCollection === "vipPublicRegistrations") {
    return doc(db, "vipPublicRegistrations", registration.id);
  }

  if (registration.sourceCollection === "vipPartnerPortals") {
    return doc(db, "vipPartnerPortals", registration.portalId, "entries", registration.id);
  }

  return doc(db, "vipAdminRegistrations", registration.id);
}

function formatMailStatus(status) {
  switch (String(status || "").trim().toLowerCase()) {
    case "sent":
      return "Envoyé";
    default:
      return "Non envoyé";
  }
}

function formatBadgeStatus(status) {
  switch (String(status || "").trim().toLowerCase()) {
    case "en_file":
      return "En file";
    case "imprime":
      return "Imprimé";
    default:
      return "Non imprimé";
  }
}

function formatRegistrationSource(sourceType) {
  switch (String(sourceType || "").trim()) {
    case "public_form":
      return "Formulaire public";
    case "partner_portal":
      return "Portail partenaire";
    case "forced_from_invitation":
      return "Inscription forcée";
    case "admin_manual":
      return "Ajout admin";
    default:
      return "VIP";
  }
}

function matchesVipSearch(record, search) {
  const normalizedSearch = normalizeVipComparableValue(search);
  if (!normalizedSearch) return true;

  const haystack = [
    record.firstName,
    record.lastName,
    record.organization,
    record.email,
    record.category,
    record.notes,
  ]
    .map((value) => normalizeVipComparableValue(value))
    .join(" ");

  return haystack.includes(normalizedSearch);
}

function getInvitationCurrentEditionValue(invitation, activeEditionId) {
  const invitedByEdition =
    invitation?.invitedByEdition &&
    typeof invitation.invitedByEdition === "object" &&
    !Array.isArray(invitation.invitedByEdition)
      ? invitation.invitedByEdition
      : {};

  const directValue = invitedByEdition?.[activeEditionId];
  if (String(directValue || "").trim()) {
    return String(directValue).trim().toLowerCase() === "non" ? "non" : "oui";
  }

  if (String(activeEditionId || "").trim() === "2027" && String(invitation?.invitedFor2027 || "").trim()) {
    return String(invitation.invitedFor2027).trim().toLowerCase() === "non" ? "non" : "oui";
  }

  return "non";
}

function isInvitationArchived(invitation) {
  return Boolean(invitation?.archivedAt || invitation?.isArchived);
}

function getImportedInvitationEditionValue(invitation, activeEditionId) {
  const importedEditionId = String(vipImport2027?.metadata?.editionId || "").trim();
  const fallbackValue = String(invitation?.invitedFor2027 || "").trim().toLowerCase() === "non" ? "non" : "oui";

  if (importedEditionId && String(activeEditionId || "").trim() !== importedEditionId) {
    return "non";
  }

  return fallbackValue;
}

function buildVipPartnerPortalUrl(portalId) {
  const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  return `${origin}/vip/orga/${portalId}`;
}

function VipAdminPage({ Panel, loadMailQueueModule }) {
  const { activeEditionId, activeEditionLabel, loading: editionLoading } = useActiveEdition(true);
  const [activeVipTab, setActiveVipTab] = useState("invitations");
  const [partnerPortals, setPartnerPortals] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [publicRegistrations, setPublicRegistrations] = useState([]);
  const [partnerRegistrations, setPartnerRegistrations] = useState([]);
  const [adminRegistrations, setAdminRegistrations] = useState([]);
  const [invitationForm, setInvitationForm] = useState(() => createEmptyVipInvitationData());
  const [editingInvitationForm, setEditingInvitationForm] = useState(() => createEmptyVipInvitationData());
  const [registrationForm, setRegistrationForm] = useState(() => createEmptyVipAdminRegistrationData());
  const [partnerPortalForm, setPartnerPortalForm] = useState(() => createEmptyVipPartnerPortalData());
  const [editingInvitationId, setEditingInvitationId] = useState("");
  const [editingPartnerPortalId, setEditingPartnerPortalId] = useState("");
  const [invitationSearch, setInvitationSearch] = useState("");
  const [invitationArchiveFilter, setInvitationArchiveFilter] = useState("actifs");
  const [invitationMailFilter, setInvitationMailFilter] = useState("tous");
  const [registrationSearch, setRegistrationSearch] = useState("");
  const [registrationSourceFilter, setRegistrationSourceFilter] = useState("tous");
  const [registrationBadgeFilter, setRegistrationBadgeFilter] = useState("tous");
  const [selectedInvitationIds, setSelectedInvitationIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const allRegistrations = useMemo(
    () =>
      [...publicRegistrations, ...partnerRegistrations, ...adminRegistrations].sort((left, right) => {
        const leftMs = left?.submittedAt?.toMillis?.() || left?.createdAt?.toMillis?.() || 0;
        const rightMs = right?.submittedAt?.toMillis?.() || right?.createdAt?.toMillis?.() || 0;
        return rightMs - leftMs;
      }),
    [adminRegistrations, partnerRegistrations, publicRegistrations],
  );

  useEffect(() => {
    setRegistrationForm(createEmptyVipAdminRegistrationData());
    setInvitationForm(createEmptyVipInvitationData());
    setEditingInvitationForm(createEmptyVipInvitationData());
    setPartnerPortalForm(createEmptyVipPartnerPortalData());
    setEditingInvitationId("");
    setEditingPartnerPortalId("");
    setSelectedInvitationIds(new Set());
  }, [activeEditionId]);

  useEffect(() => {
    if (editionLoading) return undefined;

    let loadedCount = 0;
    function markLoaded() {
      loadedCount += 1;
      if (loadedCount >= 5) {
        setLoading(false);
      }
    }

    const unsubPartnerPortals = onSnapshot(
      collection(db, "vipPartnerPortals"),
      (snapshot) => {
        setPartnerPortals(snapshot.docs.map(mapVipPartnerPortal));
        markLoaded();
      },
      (snapshotError) => {
        console.error("Unable to load VIP partner portals", snapshotError);
        setPartnerPortals([]);
        setError("Impossible de charger les portails partenaires VIP.");
        markLoaded();
      },
    );

    const unsubInvitations = onSnapshot(
      collection(db, "vipInvitations"),
      (snapshot) => {
        setInvitations(snapshot.docs.map(mapVipInvitation));
        markLoaded();
      },
      (snapshotError) => {
        console.error("Unable to load VIP invitations", snapshotError);
        setInvitations([]);
        setError("Impossible de charger les invitations VIP.");
        markLoaded();
      },
    );

    const unsubPublic = onSnapshot(
      collection(db, "vipPublicRegistrations"),
      (snapshot) => {
        setPublicRegistrations(
          snapshot.docs
            .map(mapVipPublicRegistration)
            .filter((entry) => recordMatchesEdition(entry, activeEditionId)),
        );
        markLoaded();
      },
      (snapshotError) => {
        console.error("Unable to load VIP public registrations", snapshotError);
        setPublicRegistrations([]);
        setError("Impossible de charger les inscriptions VIP publiques.");
        markLoaded();
      },
    );

    const unsubPartner = onSnapshot(
      collectionGroup(db, "entries"),
      (snapshot) => {
        setPartnerRegistrations(
          snapshot.docs
            .filter((entry) => entry.ref.path.startsWith("vipPartnerPortals/"))
            .map(mapVipPartnerRegistration)
            .filter((entry) => recordMatchesEdition(entry, activeEditionId)),
        );
        markLoaded();
      },
      (snapshotError) => {
        console.error("Unable to load VIP partner registrations", snapshotError);
        setPartnerRegistrations([]);
        setError("Impossible de charger les listes VIP partenaires.");
        markLoaded();
      },
    );

    const unsubAdmin = onSnapshot(
      collection(db, "vipAdminRegistrations"),
      (snapshot) => {
        setAdminRegistrations(
          snapshot.docs
            .map(mapVipAdminRegistration)
            .filter((entry) => recordMatchesEdition(entry, activeEditionId)),
        );
        markLoaded();
      },
      (snapshotError) => {
        console.error("Unable to load VIP admin registrations", snapshotError);
        setAdminRegistrations([]);
        setError("Impossible de charger les inscriptions VIP ajoutées côté admin.");
        markLoaded();
      },
    );

    return () => {
      unsubPartnerPortals();
      unsubInvitations();
      unsubPublic();
      unsubPartner();
      unsubAdmin();
    };
  }, [activeEditionId, editionLoading]);

  function handleInvitationChange(event) {
    const { name, value } = event.target;
    setInvitationForm((current) => ({ ...current, [name]: value }));
  }

  function handleRegistrationChange(event) {
    const { name, value } = event.target;
    setRegistrationForm((current) => ({ ...current, [name]: value }));
  }

  function handlePartnerPortalChange(event) {
    const { name, value } = event.target;
    setPartnerPortalForm((current) => ({ ...current, [name]: value }));
  }

  function handleEditingInvitationChange(event) {
    const { name, value } = event.target;
    setEditingInvitationForm((current) => ({ ...current, [name]: value }));
  }

  async function handleImportBaseInvitations() {
    setError("");
    setStatusMessage("");

    try {
      let createdCount = 0;

      for (const importedInvitation of vipImport2027.invitations) {
        const existingInvitation = findMatchingVipInvitation(invitations, importedInvitation);
        if (existingInvitation) {
          continue;
        }

        await addDoc(collection(db, "vipInvitations"), {
          ...importedInvitation,
          invitationMailLanguage: importedInvitation.invitationMailLanguage || "fr",
          invitedByEdition: {
            [activeEditionId]: getImportedInvitationEditionValue(importedInvitation, activeEditionId),
          },
          invitedFor2027: null,
          archivedAt: null,
          archivedReason: "",
          invitationMailStatus: "not_sent",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        createdCount += 1;
      }

      setStatusMessage(
        createdCount > 0
          ? `${createdCount} invitation(s) importée(s) dans la base globale depuis vos deux fichiers Excel.`
          : "La base issue de vos fichiers Excel est déjà présente dans l'espace invitations.",
      );
    } catch (importError) {
      console.error("VIP import failed", importError);
      setError("Impossible d'importer la base d'invitations.");
    }
  }

  async function handleInvitationSubmit(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

  const payload = {
      firstName: invitationForm.firstName,
      lastName: invitationForm.lastName,
      organization: invitationForm.organization,
      email: String(invitationForm.email || "").trim().toLowerCase(),
      category: invitationForm.category,
      invitationMailLanguage: invitationForm.invitationMailLanguage || "fr",
      mailGreetingLabel: invitationForm.mailGreetingLabel,
      notes: invitationForm.notes,
      [`invitedByEdition.${activeEditionId}`]: invitationForm.invitedThisEdition,
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "vipInvitations"), {
        ...payload,
        archivedAt: null,
        archivedReason: "",
        invitationMailStatus: "not_sent",
        createdAt: serverTimestamp(),
      });
      setStatusMessage("Invitation VIP ajoutée.");

      setInvitationForm(createEmptyVipInvitationData());
    } catch (submissionError) {
      console.error("VIP invitation save failed", submissionError);
      setError("Impossible d'enregistrer cette invitation VIP.");
    }
  }

  async function handleEditingInvitationSubmit(event) {
    event.preventDefault();
    if (!editingInvitationId) return;

    setError("");
    setStatusMessage("");

    const payload = {
      firstName: editingInvitationForm.firstName,
      lastName: editingInvitationForm.lastName,
      organization: editingInvitationForm.organization,
      email: String(editingInvitationForm.email || "").trim().toLowerCase(),
      category: editingInvitationForm.category,
      invitationMailLanguage: editingInvitationForm.invitationMailLanguage || "fr",
      mailGreetingLabel: editingInvitationForm.mailGreetingLabel,
      notes: editingInvitationForm.notes,
      [`invitedByEdition.${activeEditionId}`]: editingInvitationForm.invitedThisEdition,
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, "vipInvitations", editingInvitationId), payload);
      setStatusMessage("Invitation VIP mise à jour.");
      setEditingInvitationId("");
      setEditingInvitationForm(createEmptyVipInvitationData());
    } catch (submissionError) {
      console.error("VIP invitation update failed", submissionError);
      setError("Impossible d'enregistrer cette invitation VIP.");
    }
  }

  function startEditingInvitation(invitation) {
    setEditingInvitationId(invitation.id);
    setEditingInvitationForm({
      firstName: invitation.firstName || "",
      lastName: invitation.lastName || "",
      email: invitation.email || "",
      organization: invitation.organization || "",
      category: invitation.category || "Partenaire",
      invitationMailLanguage: invitation.invitationMailLanguage || "fr",
      mailGreetingLabel: invitation.mailGreetingLabel || "",
      invitedThisEdition: getInvitationCurrentEditionValue(invitation, activeEditionId),
      notes: invitation.notes || "",
    });
  }

  function cancelEditingInvitation() {
    setEditingInvitationId("");
    setEditingInvitationForm(createEmptyVipInvitationData());
  }

  function startEditingPartnerPortal(portal) {
    setEditingPartnerPortalId(portal.id);
    setPartnerPortalForm({
      portalId: portal.id,
      organizationName: portal.organizationName || "",
      contactName: portal.contactName || "",
      contactPhone: portal.contactPhone || "",
      contactEmail: portal.contactEmail || "",
      accessPassword: portal.accessPassword || "",
      notes: portal.notes || "",
    });
  }

  function cancelEditingPartnerPortal() {
    setEditingPartnerPortalId("");
    setPartnerPortalForm(createEmptyVipPartnerPortalData());
  }

  async function handlePartnerPortalSubmit(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    const resolvedPortalId = buildVipPortalId(partnerPortalForm.portalId || partnerPortalForm.organizationName);
    if (!resolvedPortalId) {
      setError("Merci de renseigner une organisation ou un identifiant de portail.");
      return;
    }

    const payload = {
      organizationName: partnerPortalForm.organizationName,
      contactName: partnerPortalForm.contactName,
      contactPhone: partnerPortalForm.contactPhone,
      contactEmail: String(partnerPortalForm.contactEmail || "").trim().toLowerCase(),
      accessPassword: partnerPortalForm.accessPassword,
      notes: partnerPortalForm.notes,
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(
        doc(db, "vipPartnerPortals", editingPartnerPortalId || resolvedPortalId),
        {
          ...payload,
          createdAt: editingPartnerPortalId ? partnerPortals.find((portal) => portal.id === editingPartnerPortalId)?.createdAt || serverTimestamp() : serverTimestamp(),
        },
        { merge: true },
      );

      setStatusMessage(editingPartnerPortalId ? "Portail partenaire mis à jour." : "Portail partenaire créé.");
      setPartnerPortalForm(createEmptyVipPartnerPortalData());
      setEditingPartnerPortalId("");
    } catch (submissionError) {
      console.error("VIP partner portal save failed", submissionError);
      setError("Impossible d'enregistrer ce portail partenaire.");
    }
  }

  async function handleSendInvitation(invitation) {
    setError("");
    setStatusMessage("");

    if (!String(invitation.email || "").trim()) {
      setError("Impossible d'envoyer une invitation sans adresse e-mail.");
      return;
    }

    try {
      const { buildVipInvitationMail, enqueueTransactionalMail } = await loadMailQueueModule();
      await enqueueTransactionalMail(
        buildVipInvitationMail({
          category: invitation.category,
          email: invitation.email,
          firstName: invitation.firstName,
          greetingLabel: invitation.mailGreetingLabel,
          invitationUrl: `${window.location.origin}/vip`,
          language: invitation.invitationMailLanguage,
          lastName: invitation.lastName,
          organization: invitation.organization,
        }),
      );
      await updateDoc(doc(db, "vipInvitations", invitation.id), {
        invitationMailStatus: "sent",
        invitationSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStatusMessage(`Invitation envoyée à ${invitation.email}.`);
    } catch (mailError) {
      console.error("VIP invitation mail failed", mailError);
      setError(mailError?.message || "Impossible d'envoyer l'invitation VIP.");
    }
  }

  function toggleInvitationSelection(invitationId) {
    setSelectedInvitationIds((current) => {
      const next = new Set(current);
      if (next.has(invitationId)) {
        next.delete(invitationId);
      } else {
        next.add(invitationId);
      }
      return next;
    });
  }

  function handleSelectAllFilteredInvitations() {
    setSelectedInvitationIds(new Set(filteredInvitationRows.map((invitation) => invitation.id)));
  }

  function handleClearInvitationSelection() {
    setSelectedInvitationIds(new Set());
  }

  async function handleSendSelectedInvitations() {
    setError("");
    setStatusMessage("");

    const selectedInvitations = filteredInvitationRows.filter((invitation) => selectedInvitationIds.has(invitation.id));
    const invitationsWithEmail = selectedInvitations.filter((invitation) => String(invitation.email || "").trim());

    if (!invitationsWithEmail.length) {
      setError("Aucune invitation sélectionnée avec une adresse e-mail exploitable.");
      return;
    }

    try {
      const { buildVipInvitationMail, enqueueTransactionalMail } = await loadMailQueueModule();

      for (const invitation of invitationsWithEmail) {
        await enqueueTransactionalMail(
          buildVipInvitationMail({
            category: invitation.category,
            email: invitation.email,
            firstName: invitation.firstName,
            greetingLabel: invitation.mailGreetingLabel,
            invitationUrl: `${window.location.origin}/vip`,
            language: invitation.invitationMailLanguage,
            lastName: invitation.lastName,
            organization: invitation.organization,
          }),
        );

        await updateDoc(doc(db, "vipInvitations", invitation.id), {
          invitationMailStatus: "sent",
          invitationSentAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setStatusMessage(`${invitationsWithEmail.length} invitation(s) envoyée(s).`);
      setSelectedInvitationIds(new Set());
    } catch (mailError) {
      console.error("VIP bulk invitation mail failed", mailError);
      setError(mailError?.message || "Impossible d'envoyer les invitations sélectionnées.");
    }
  }

  async function handleForceRegistration(invitation) {
    setError("");
    setStatusMessage("");

    try {
      const matchedRegistration = findMatchingVipRegistration(allRegistrations, invitation);

      if (!matchedRegistration) {
        const registrationRef = await addDoc(collection(db, "vipAdminRegistrations"), {
          editionId: activeEditionId,
          source: "forced_from_invitation",
          forcedFromInvitationId: invitation.id,
          firstName: invitation.firstName || "",
          lastName: invitation.lastName || "",
          email: String(invitation.email || "").trim().toLowerCase(),
          organization: invitation.organization || "",
          vipTourChoice: "none",
          pickupPoint: "Accueil VIP",
          badgePrintStatus: "non_imprime",
          registrationStatus: "forced",
          notes: invitation.notes || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await updateDoc(doc(db, "vipInvitations", invitation.id), {
          forcedRegistrationId: registrationRef.id,
          updatedAt: serverTimestamp(),
        });
      }

      setStatusMessage("Inscription forcée enregistrée côté admin.");
    } catch (registrationError) {
      console.error("Force VIP registration failed", registrationError);
      setError("Impossible de forcer cette inscription VIP.");
    }
  }

  async function handleToggleArchiveInvitation(invitation) {
    setError("");
    setStatusMessage("");

    try {
      const nextArchived = !isInvitationArchived(invitation);
      await updateDoc(doc(db, "vipInvitations", invitation.id), {
        archivedAt: nextArchived ? serverTimestamp() : null,
        archivedReason: nextArchived ? "Archivage manuel" : "",
        updatedAt: serverTimestamp(),
      });
      setStatusMessage(nextArchived ? "Invitation archivée." : "Invitation réactivée.");
    } catch (archiveError) {
      console.error("VIP invitation archive failed", archiveError);
      setError("Impossible de modifier l'état d'archive de cette invitation.");
    }
  }

  async function handleRegistrationSubmit(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    try {
      await addDoc(
        collection(db, "vipAdminRegistrations"),
        buildVipRegistrationPayload(registrationForm, {
          editionId: activeEditionId,
          source: "admin_manual",
          pickupPoint: registrationForm.pickupPoint || "Accueil VIP",
          badgePrintStatus: registrationForm.badgePrintStatus || "non_imprime",
          registrationStatus: registrationForm.registrationStatus || "confirmed",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
      setRegistrationForm(createEmptyVipAdminRegistrationData());
      setStatusMessage("Inscrit VIP ajouté côté admin.");
    } catch (submissionError) {
      console.error("VIP admin manual registration failed", submissionError);
      setError("Impossible d'ajouter cet inscrit VIP.");
    }
  }

  async function handleRegistrationFieldUpdate(registration, patch) {
    setError("");
    setStatusMessage("");

    try {
      await updateDoc(getRegistrationDocumentRef(registration), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (updateError) {
      console.error("VIP registration update failed", updateError);
      setError("Impossible de mettre à jour cet inscrit VIP.");
    }
  }

  const invitationRows = useMemo(
    () =>
      invitations
        .slice()
        .sort((left, right) => buildVipFullName(left).localeCompare(buildVipFullName(right), "fr"))
        .map((invitation) => ({
          ...invitation,
          invitedThisEdition: getInvitationCurrentEditionValue(invitation, activeEditionId),
          archived: isInvitationArchived(invitation),
          matchedRegistration: findMatchingVipRegistration(allRegistrations, invitation),
        })),
    [activeEditionId, allRegistrations, invitations],
  );

  const filteredInvitationRows = useMemo(
    () =>
      invitationRows.filter((invitation) => {
        if (!matchesVipSearch(invitation, invitationSearch)) return false;

        if (invitationArchiveFilter === "actifs" && invitation.archived) return false;
        if (invitationArchiveFilter === "archives" && !invitation.archived) return false;

        if (invitationMailFilter === "envoyes" && invitation.invitationMailStatus !== "sent") return false;
        if (invitationMailFilter === "non_envoyes" && invitation.invitationMailStatus === "sent") return false;

        return true;
      }),
    [invitationArchiveFilter, invitationMailFilter, invitationRows, invitationSearch],
  );

  const registrationRows = useMemo(
    () =>
      allRegistrations.map((registration) => ({
        ...registration,
        matchedInvitation: findMatchingVipInvitation(invitations, registration),
      })),
    [allRegistrations, invitations],
  );

  const filteredRegistrationRows = useMemo(
    () =>
      registrationRows.filter((registration) => {
        if (
          !matchesVipSearch(
            {
              ...registration,
              category: registration.matchedInvitation?.category || "",
              notes: registration.matchedInvitation?.notes || registration.notes || "",
            },
            registrationSearch,
          )
        ) {
          return false;
        }

        if (registrationSourceFilter !== "tous" && registration.sourceType !== registrationSourceFilter) return false;
        if (registrationBadgeFilter !== "tous" && (registration.badgePrintStatus || "non_imprime") !== registrationBadgeFilter) return false;

        return true;
      }),
    [registrationBadgeFilter, registrationRows, registrationSearch, registrationSourceFilter],
  );

  const selectedFilteredInvitationCount = useMemo(
    () => filteredInvitationRows.filter((invitation) => selectedInvitationIds.has(invitation.id)).length,
    [filteredInvitationRows, selectedInvitationIds],
  );

  const partnerPortalRows = useMemo(
    () =>
      partnerPortals
        .slice()
        .sort((left, right) =>
          String(left.organizationName || left.id || "").localeCompare(String(right.organizationName || right.id || ""), "fr"),
        )
        .map((portal) => ({
          ...portal,
          portalUrl: buildVipPartnerPortalUrl(portal.id),
        })),
    [partnerPortals],
  );

  return (
    <div className="stacked-entry">
      <Panel
        title="VIP"
        subtitle={`Invitations, inscriptions et suivi accréditations VIP pour ${activeEditionLabel}.`}
      >
        <div className="vip-admin-stats">
          <article className="vip-admin-stat-card">
            <strong>{invitationRows.length}</strong>
            <span>Invitation(s) VIP</span>
          </article>
          <article className="vip-admin-stat-card">
            <strong>{registrationRows.length}</strong>
            <span>Inscription(s) VIP</span>
          </article>
          <article className="vip-admin-stat-card">
            <strong>{registrationRows.filter((row) => row.badgePrintStatus === "en_file").length}</strong>
            <span>Accréditations en file</span>
          </article>
          <article className="vip-admin-stat-card">
            <strong>{registrationRows.filter((row) => row.badgePrintStatus === "imprime").length}</strong>
            <span>Accréditations imprimées</span>
          </article>
        </div>
        {editionLoading || loading ? <p>Chargement du module VIP...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {statusMessage ? <p className="panel-note panel-note--success">{statusMessage}</p> : null}
        <p className="panel-note">
          Base d'import préparée depuis <strong>{vipImport2027.metadata.recordCount}</strong> invités dédoublonnés,
          sans accompagnants, à partir de vos deux fichiers 2026. La fiche invitation reste globale, et seul
          l'indicateur annuel suit l'édition active.
        </p>
      </Panel>
      <div className="admin-subtabs" role="tablist" aria-label="Navigation du module VIP">
        <button
          className={`admin-subtab ${activeVipTab === "invitations" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveVipTab("invitations")}
        >
          Invitations
        </button>
        <button
          className={`admin-subtab ${activeVipTab === "registrations" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveVipTab("registrations")}
        >
          Inscrits VIP
        </button>
        <button
          className={`admin-subtab ${activeVipTab === "partner-portals" ? "admin-subtab--active" : ""}`}
          type="button"
          onClick={() => setActiveVipTab("partner-portals")}
        >
          Portails partenaires
        </button>
      </div>

      {activeVipTab === "invitations" ? (
        <>
          <Panel
            title="Ajouter une invitation"
            subtitle="La fiche contact est globale. Seul « invité cette année » dépend de l'édition active."
          >
            <form className="auth-form auth-form--compact vip-admin-form vip-admin-form--inline" onSubmit={handleInvitationSubmit}>
              <AuthFormField label="Prénom" required>
                <input name="firstName" required value={invitationForm.firstName} onChange={handleInvitationChange} />
              </AuthFormField>
              <AuthFormField label="Nom" required>
                <input name="lastName" required value={invitationForm.lastName} onChange={handleInvitationChange} />
              </AuthFormField>
              <AuthFormField label="E-mail">
                <input name="email" type="email" value={invitationForm.email} onChange={handleInvitationChange} />
              </AuthFormField>
              <AuthFormField label="Organisation">
                <input name="organization" value={invitationForm.organization} onChange={handleInvitationChange} />
              </AuthFormField>
              <AuthFormField label="Catégorie" required hint="Texte libre possible, avec suggestions.">
                <input
                  list="vip-invitation-category-suggestions"
                  name="category"
                  required
                  value={invitationForm.category}
                  onChange={handleInvitationChange}
                />
              </AuthFormField>
              <AuthFormField label="Langue du mail" required>
                <select
                  name="invitationMailLanguage"
                  value={invitationForm.invitationMailLanguage}
                  onChange={handleInvitationChange}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </AuthFormField>
              <AuthFormField label="Intitulé mail" hint='Ex.: "Cher Comité directeur" si aucun prénom/nom.'>
                <input
                  name="mailGreetingLabel"
                  placeholder="Cher Comité directeur"
                  value={invitationForm.mailGreetingLabel}
                  onChange={handleInvitationChange}
                />
              </AuthFormField>
              <AuthFormField label="Invité cette année" required>
                <select name="invitedThisEdition" value={invitationForm.invitedThisEdition} onChange={handleInvitationChange}>
                  <option value="oui">Oui</option>
                  <option value="non">Non</option>
                </select>
              </AuthFormField>
              <AuthFormField className="vip-admin-form__wide" label="Remarques">
                <input name="notes" value={invitationForm.notes} onChange={handleInvitationChange} />
              </AuthFormField>
              <datalist id="vip-invitation-category-suggestions">
                {VIP_INVITATION_CATEGORY_SUGGESTIONS.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <div className="panel-actions vip-admin-form__actions">
                <button className="button button--primary" type="submit">
                  Ajouter à la liste d'invitation
                </button>
              </div>
            </form>
          </Panel>

          <Panel
            title="Liste d'invitation"
            subtitle="Base globale des invités VIP, avec archivage et indicateur propre à l'édition active."
          >
            <div className="vip-admin-filters">
              <input
                type="search"
                placeholder="Rechercher un nom, une organisation, un e-mail..."
                value={invitationSearch}
                onChange={(event) => setInvitationSearch(event.target.value)}
              />
              <select value={invitationArchiveFilter} onChange={(event) => setInvitationArchiveFilter(event.target.value)}>
                <option value="actifs">Actifs</option>
                <option value="archives">Archivés</option>
                <option value="tous">Tous</option>
              </select>
              <select value={invitationMailFilter} onChange={(event) => setInvitationMailFilter(event.target.value)}>
                <option value="tous">Tous les mails</option>
                <option value="non_envoyes">Non envoyés</option>
                <option value="envoyes">Envoyés</option>
              </select>
            </div>
            <div className="vip-admin-bulkbar">
              <label className="vip-admin-checkbox">
                <input
                  type="checkbox"
                  checked={filteredInvitationRows.length > 0 && selectedFilteredInvitationCount === filteredInvitationRows.length}
                  onChange={(event) =>
                    event.target.checked ? handleSelectAllFilteredInvitations() : handleClearInvitationSelection()
                  }
                />
                <span>Tout cocher</span>
              </label>
              <span className="panel-note">{selectedFilteredInvitationCount} sélectionné(s)</span>
              <button className="button button--secondary" type="button" onClick={handleClearInvitationSelection}>
                Tout décocher
              </button>
              <button className="button button--primary" type="button" onClick={handleSendSelectedInvitations}>
                Envoyer le mail aux sélectionnés
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table data-table--vip data-table--vip-invitations">
                <thead>
                  <tr>
                    <th className="vip-table-checkbox-col">Sel.</th>
                    <th>Invité</th>
                    <th>Contact</th>
                    <th>Statut</th>
                    <th>Matching</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvitationRows.map((invitation) => (
                    <Fragment key={invitation.id}>
                      <tr key={invitation.id}>
                        <td className="vip-table-checkbox-col">
                          <label className="vip-admin-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedInvitationIds.has(invitation.id)}
                              onChange={() => toggleInvitationSelection(invitation.id)}
                            />
                          </label>
                        </td>
                        <td>
                          <div className="table-stack table-stack--tight">
                            <strong>{buildVipFullName(invitation) || "—"}</strong>
                            <span>{invitation.organization || "—"}</span>
                            <span className="vip-table-muted">
                              {invitation.category || "—"} · {invitation.invitationMailLanguage === "en" ? "EN" : "FR"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="table-stack table-stack--tight">
                            <span>{invitation.email || "—"}</span>
                          </div>
                        </td>
                        <td>
                          <div className="table-stack table-stack--tight">
                            <label className="vip-table-inline-select">
                              <span className="vip-table-label">Cette année</span>
                              <select
                                value={invitation.invitedThisEdition || "non"}
                                onChange={(event) =>
                                  handleRegistrationFieldUpdate(
                                    { sourceCollection: "vipInvitations", id: invitation.id },
                                    { [`invitedByEdition.${activeEditionId}`]: event.target.value },
                                  )
                                }
                              >
                                <option value="oui">Oui</option>
                                <option value="non">Non</option>
                              </select>
                            </label>
                            <span className="vip-table-muted">{invitation.archived ? "Archivé" : "Actif"}</span>
                            <span className="vip-table-muted">{formatMailStatus(invitation.invitationMailStatus)}</span>
                          </div>
                        </td>
                        <td>
                          <span>{invitation.matchedRegistration ? formatRegistrationSource(invitation.matchedRegistration.sourceType) : "À rapprocher"}</span>
                        </td>
                        <td>
                          <div className="vip-admin-actions vip-admin-actions--compact">
                            <button className="button button--secondary" type="button" onClick={() => startEditingInvitation(invitation)}>
                              Modifier
                            </button>
                            <button className="button button--secondary" type="button" onClick={() => handleForceRegistration(invitation)}>
                              Forcer
                            </button>
                            <button className="button button--secondary" type="button" onClick={() => handleToggleArchiveInvitation(invitation)}>
                              {invitation.archived ? "Réactiver" : "Archiver"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingInvitationId === invitation.id ? (
                        <tr className="vip-inline-editor-row">
                          <td colSpan="6">
                            <form className="vip-inline-editor" onSubmit={handleEditingInvitationSubmit}>
                              <input name="firstName" required placeholder="Prénom" value={editingInvitationForm.firstName} onChange={handleEditingInvitationChange} />
                              <input name="lastName" required placeholder="Nom" value={editingInvitationForm.lastName} onChange={handleEditingInvitationChange} />
                              <input name="email" type="email" placeholder="E-mail" value={editingInvitationForm.email} onChange={handleEditingInvitationChange} />
                              <input
                                name="organization"
                                placeholder="Organisation"
                                value={editingInvitationForm.organization}
                                onChange={handleEditingInvitationChange}
                              />
                              <input
                                list="vip-invitation-category-suggestions"
                                name="category"
                                required
                                placeholder="Catégorie"
                                value={editingInvitationForm.category}
                                onChange={handleEditingInvitationChange}
                              />
                              <select
                                name="invitationMailLanguage"
                                value={editingInvitationForm.invitationMailLanguage}
                                onChange={handleEditingInvitationChange}
                              >
                                <option value="fr">Français</option>
                                <option value="en">English</option>
                              </select>
                              <input
                                name="mailGreetingLabel"
                                placeholder="Intitulé mail"
                                value={editingInvitationForm.mailGreetingLabel}
                                onChange={handleEditingInvitationChange}
                              />
                              <select
                                name="invitedThisEdition"
                                value={editingInvitationForm.invitedThisEdition}
                                onChange={handleEditingInvitationChange}
                              >
                                <option value="oui">Invité cette année: oui</option>
                                <option value="non">Invité cette année: non</option>
                              </select>
                              <input name="notes" placeholder="Remarques" value={editingInvitationForm.notes} onChange={handleEditingInvitationChange} />
                              <div className="vip-inline-editor__actions">
                                <button className="button button--primary" type="submit">
                                  Enregistrer
                                </button>
                                <button className="button button--secondary" type="button" onClick={cancelEditingInvitation}>
                                  Annuler
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                  {filteredInvitationRows.length === 0 ? (
                    <tr>
                      <td colSpan="6">Aucune invitation VIP enregistrée.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : activeVipTab === "registrations" ? (
        <>
          <Panel
            title="Ajouter un inscrit VIP"
            subtitle="Ajout manuel côté admin, ou préparation d'une inscription hors formulaire."
          >
            <form className="auth-form auth-form--compact vip-admin-form vip-admin-form--inline" onSubmit={handleRegistrationSubmit}>
              <AuthFormField label="Prénom" required>
                <input name="firstName" required value={registrationForm.firstName} onChange={handleRegistrationChange} />
              </AuthFormField>
              <AuthFormField label="Nom" required>
                <input name="lastName" required value={registrationForm.lastName} onChange={handleRegistrationChange} />
              </AuthFormField>
              <AuthFormField label="Organisation" required>
                <input name="organization" required value={registrationForm.organization} onChange={handleRegistrationChange} />
              </AuthFormField>
              <AuthFormField label="E-mail">
                <input name="email" type="email" value={registrationForm.email} onChange={handleRegistrationChange} />
              </AuthFormField>
              <AuthFormField className="vip-admin-form__phone" label="Téléphone">
                <PhoneInput name="phone" value={registrationForm.phone} onChange={handleRegistrationChange} />
              </AuthFormField>
              <AuthFormField label="Point de retrait" required>
                <select name="pickupPoint" value={registrationForm.pickupPoint} onChange={handleRegistrationChange}>
                  {VIP_PICKUP_POINT_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </AuthFormField>
              <AuthFormField className="vip-admin-form__wide" label="Remarques">
                <input name="notes" value={registrationForm.notes} onChange={handleRegistrationChange} />
              </AuthFormField>
              <div className="panel-actions vip-admin-form__actions">
                <button className="button button--primary" type="submit">
                  Ajouter à la liste des inscrits
                </button>
              </div>
            </form>
          </Panel>

          <Panel
            title="Liste des inscrits"
            subtitle="Retours du formulaire public, listes partenaires et ajouts admin avec suivi impression et point de retrait."
          >
            <div className="vip-admin-filters">
              <input
                type="search"
                placeholder="Rechercher un nom, une organisation, un e-mail..."
                value={registrationSearch}
                onChange={(event) => setRegistrationSearch(event.target.value)}
              />
              <select value={registrationSourceFilter} onChange={(event) => setRegistrationSourceFilter(event.target.value)}>
                <option value="tous">Toutes les sources</option>
                <option value="public_form">Formulaire public</option>
                <option value="partner_portal">Portail partenaire</option>
                <option value="forced_from_invitation">Inscription forcée</option>
                <option value="admin_manual">Ajout admin</option>
              </select>
              <select value={registrationBadgeFilter} onChange={(event) => setRegistrationBadgeFilter(event.target.value)}>
                <option value="tous">Toutes les accréditations</option>
                <option value="non_imprime">Non imprimé</option>
                <option value="en_file">En file</option>
                <option value="imprime">Imprimé</option>
              </select>
            </div>
            <div className="table-wrap">
              <table className="data-table data-table--vip">
                <thead>
                  <tr>
                    <th>Inscrit</th>
                    <th>Source / Matching</th>
                    <th>Tour VIP</th>
                    <th>Accréditation</th>
                    <th>Retrait</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegistrationRows.map((registration) => (
                    <tr key={`${registration.sourceCollection}-${registration.id}`}>
                      <td>
                        <div className="table-stack table-stack--tight">
                          <strong>{buildVipFullName(registration) || "—"}</strong>
                          <span>{registration.email || "—"}</span>
                          <span className="vip-table-muted">{registration.organization || "—"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="table-stack table-stack--tight">
                          <span>{formatRegistrationSource(registration.sourceType)}</span>
                          <span className="vip-table-muted">
                            {registration.matchedInvitation
                              ? `${buildVipFullName(registration.matchedInvitation)} (${registration.matchedInvitation.category || "VIP"})`
                              : "Aucun match"}
                          </span>
                        </div>
                      </td>
                      <td>{getVipTourChoiceLabel(registration.vipTourChoice)}</td>
                      <td>
                        <div className="vip-admin-inline-field">
                          <select
                            value={registration.badgePrintStatus || "non_imprime"}
                            onChange={(event) =>
                              handleRegistrationFieldUpdate(registration, { badgePrintStatus: event.target.value })
                            }
                          >
                            <option value="non_imprime">Non imprimé</option>
                            <option value="en_file">En file</option>
                            <option value="imprime">Imprimé</option>
                          </select>
                          <span className="panel-note">{formatBadgeStatus(registration.badgePrintStatus)}</span>
                        </div>
                      </td>
                      <td>
                        <select
                          value={registration.pickupPoint || "Accueil VIP"}
                          onChange={(event) =>
                            handleRegistrationFieldUpdate(registration, { pickupPoint: event.target.value })
                          }
                        >
                          {VIP_PICKUP_POINT_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {filteredRegistrationRows.length === 0 ? (
                    <tr>
                      <td colSpan="5">Aucune inscription VIP reçue pour cette édition.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <>
          <Panel
            title={editingPartnerPortalId ? "Modifier un portail partenaire" : "Créer un portail partenaire"}
            subtitle="Un lien dédié par organisation, avec contact et mot de passe optionnel."
          >
            <form className="auth-form auth-form--compact vip-admin-form vip-admin-form--inline" onSubmit={handlePartnerPortalSubmit}>
              <AuthFormField label="Organisation" required>
                <input name="organizationName" required value={partnerPortalForm.organizationName} onChange={handlePartnerPortalChange} />
              </AuthFormField>
              <AuthFormField label="Slug / URL" hint="Laissez vide pour le générer depuis l'organisation.">
                <input
                  name="portalId"
                  disabled={Boolean(editingPartnerPortalId)}
                  placeholder="ex: cmcm-partenaires"
                  value={partnerPortalForm.portalId}
                  onChange={handlePartnerPortalChange}
                />
              </AuthFormField>
              <AuthFormField label="Contact" required>
                <input name="contactName" required value={partnerPortalForm.contactName} onChange={handlePartnerPortalChange} />
              </AuthFormField>
              <AuthFormField label="E-mail contact">
                <input name="contactEmail" type="email" value={partnerPortalForm.contactEmail} onChange={handlePartnerPortalChange} />
              </AuthFormField>
              <AuthFormField className="vip-admin-form__phone" label="Téléphone contact">
                <PhoneInput name="contactPhone" value={partnerPortalForm.contactPhone} onChange={handlePartnerPortalChange} />
              </AuthFormField>
              <AuthFormField label="Mot de passe" hint="Optionnel. Restera simple, comme un code d'accès.">
                <input name="accessPassword" type="text" value={partnerPortalForm.accessPassword} onChange={handlePartnerPortalChange} />
              </AuthFormField>
              <AuthFormField className="vip-admin-form__wide" label="Remarques">
                <input name="notes" value={partnerPortalForm.notes} onChange={handlePartnerPortalChange} />
              </AuthFormField>
              <div className="panel-actions vip-admin-form__actions">
                <button className="button button--primary" type="submit">
                  {editingPartnerPortalId ? "Enregistrer le portail" : "Créer le portail"}
                </button>
                {editingPartnerPortalId ? (
                  <button className="button button--secondary" type="button" onClick={cancelEditingPartnerPortal}>
                    Annuler
                  </button>
                ) : null}
              </div>
            </form>
          </Panel>

          <Panel
            title="Liste des portails partenaires"
            subtitle="Coordonnées, accès et lien direct vers chaque page de gestion partenaire."
          >
            <div className="table-wrap">
              <table className="data-table data-table--vip">
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th>Contact</th>
                    <th>Accès</th>
                    <th>URL</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerPortalRows.map((portal) => (
                    <tr key={portal.id}>
                      <td>
                        <div className="table-stack table-stack--tight">
                          <strong>{portal.organizationName || portal.id}</strong>
                          <span className="vip-table-muted">{portal.id}</span>
                        </div>
                      </td>
                      <td>
                        <div className="table-stack table-stack--tight">
                          <span>{portal.contactName || "—"}</span>
                          <span className="vip-table-muted">{portal.contactEmail || "—"}</span>
                          <span className="vip-table-muted">{portal.contactPhone || "—"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="table-stack table-stack--tight">
                          <span>{portal.accessPassword ? "Protégé par mot de passe" : "Lien seul"}</span>
                          <span className="vip-table-muted">{portal.notes || "—"}</span>
                        </div>
                      </td>
                      <td>
                        <a href={portal.portalUrl} target="_blank" rel="noreferrer">
                          {portal.portalUrl}
                        </a>
                      </td>
                      <td>
                        <div className="vip-admin-actions vip-admin-actions--compact">
                          <button className="button button--secondary" type="button" onClick={() => startEditingPartnerPortal(portal)}>
                            Modifier
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {partnerPortalRows.length === 0 ? (
                    <tr>
                      <td colSpan="5">Aucun portail partenaire configuré.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

export { VipAdminPage };
