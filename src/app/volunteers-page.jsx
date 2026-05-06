import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { arrayUnion, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getWorkflowStatusClass } from "./common-helpers";
import {
  TEAM_CONFIGURATION_DOC_PATH,
  VOLUNTEER_ALERT_LOG_DOC_PATH,
  supportTaskOptions,
  volunteerWorkflowStatusOptions,
} from "./seed-data";
import { mapVolunteerApplicationToAdminVolunteer } from "./volunteer-helpers";
import { useVolunteerAlertLog, useVolunteerApplicationsList } from "./volunteer-hooks";
import { defaultTeamRoles, getAvailableTeamRoles, normalizeSubRoles, normalizeTeamConfigurationPayload } from "./team-config";
import { db } from "../services/firebase";

const DEFAULT_LIST_PAGE_SIZE = 10;

function VolunteersPage(props) {
  const {
    loadMailQueueModule,
    Panel,
    syncVolunteerAssignmentToUserProfile,
    syncVolunteerAssignmentsToTeamConfiguration,
  } = props;
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
  const [volunteerActionStatus, setVolunteerActionStatus] = useState(null);
  const [selectedVolunteerIds, setSelectedVolunteerIds] = useState(() => new Set());
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [visibleListCountByKey, setVisibleListCountByKey] = useState({});
  const {
    applications: volunteerApplications,
    loading: volunteerApplicationsLoading,
    error: volunteerApplicationsError,
  } = useVolunteerApplicationsList(true);
  const {
    entries: volunteerAlertEntries,
    loading: volunteerAlertLogLoading,
    error: volunteerAlertLogError,
  } = useVolunteerAlertLog(true);

  function clearVolunteerActionStatus() {
    setVolunteerActionStatus(null);
  }

  function setVolunteerInfoStatus(message) {
    setVolunteerActionStatus({ tone: "info", message });
  }

  function setVolunteerErrorStatus(message, detail = "") {
    setVolunteerActionStatus({ tone: "error", message, detail });
  }

  function getActionErrorDetail(error) {
    const rawMessage = String(error?.message || error?.code || "").trim();
    if (!rawMessage) {
      return "Aucun détail technique supplémentaire n'a été renvoyé.";
    }

    if (rawMessage.toLowerCase().includes("permission")) {
      return "Accès refusé par Firebase. Vérifie les règles Firestore ou les droits du compte connecté.";
    }

    if (rawMessage.toLowerCase().includes("network")) {
      return "Erreur réseau pendant la synchronisation avec Firebase.";
    }

    return rawMessage;
  }

  function getVisibleListItems(listKey, items) {
    const visibleCount = visibleListCountByKey[listKey] ?? DEFAULT_LIST_PAGE_SIZE;
    return items.slice(0, visibleCount);
  }

  function canShowMoreListItems(listKey, items) {
    const visibleCount = visibleListCountByKey[listKey] ?? DEFAULT_LIST_PAGE_SIZE;
    return items.length > visibleCount;
  }

  function showMoreListItems(listKey) {
    setVisibleListCountByKey((current) => ({
      ...current,
      [listKey]: (current[listKey] ?? DEFAULT_LIST_PAGE_SIZE) + DEFAULT_LIST_PAGE_SIZE,
    }));
  }

  const roleOptions = useMemo(
    () => teamRoleConfigs.map((role) => role.roleName),
    [teamRoleConfigs],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setVolunteers(volunteerApplications.map((application) => mapVolunteerApplicationToAdminVolunteer(application)));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [volunteerApplications]);

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

  const getVolunteerAssignedRoles = useCallback((volunteer) => {
    return normalizeSubRoles(
      Array.isArray(volunteer.assignedRoles)
        ? volunteer.assignedRoles
        : volunteer.assignedRole
          ? [volunteer.assignedRole]
          : [],
    );
  }, []);

  const getPrimaryAssignedRole = useCallback(
    (volunteer) => getVolunteerAssignedRoles(volunteer)[0] || "",
    [getVolunteerAssignedRoles],
  );

  const getSecondaryAssignedRoles = useCallback(
    (volunteer) => getVolunteerAssignedRoles(volunteer).slice(1),
    [getVolunteerAssignedRoles],
  );

  const getVolunteerTeamRoleAssignments = useCallback(
    (volunteer, assignedRoles = getVolunteerAssignedRoles(volunteer)) => {
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
    },
    [getVolunteerAssignedRoles],
  );

  const getVolunteerTeamRoleForAssignedRole = useCallback(
    (volunteer, assignedRole) => getVolunteerTeamRoleAssignments(volunteer)[assignedRole] || "Bénévole",
    [getVolunteerTeamRoleAssignments],
  );

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
      teamEmailSent: false,
    };
  }

  function buildVolunteerAlertEntry(volunteer, reason, alertType = "withdrawal") {
    const previousRoles = getVolunteerAssignedRoles(volunteer);
    return {
      id: `volunteer-alert-${volunteer.id}-${Date.now()}`,
      volunteerId: volunteer.id,
      volunteerName: `${volunteer.firstName} ${volunteer.lastName}`.trim(),
      volunteerEmail: volunteer.email || "",
      previousRoles,
      previousTeamRoleAssignments: getVolunteerTeamRoleAssignments(volunteer, previousRoles),
      previousWorkflowStatus: volunteer.workflowStatus || "",
      alertType,
      reason: String(reason || "").trim(),
      createdAt: new Date().toISOString(),
    };
  }

  async function appendVolunteerAlertEntry(entry) {
    try {
      await setDoc(
        doc(db, ...VOLUNTEER_ALERT_LOG_DOC_PATH),
        {
          entries: arrayUnion(entry),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      console.error("Impossible d'enregistrer l'alerte bénévole.", error);
    }
  }

  async function persistVolunteerPatchWithAlerts(id, patch, options = {}) {
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    const previousRoles = getVolunteerAssignedRoles(volunteer);
    const nextAssignedRoles = normalizeSubRoles(
      Array.isArray(patch?.assignedRoles)
        ? patch.assignedRoles
        : patch?.assignedRole
          ? [patch.assignedRole]
          : previousRoles,
    );
    const nextWorkflowStatus = String(patch?.workflowStatus || volunteer.workflowStatus || "").trim();
    const shouldCreateAlert =
      previousRoles.length > 0 &&
      (
        nextWorkflowStatus === "Annulé" ||
        (previousRoles.length > 0 && nextAssignedRoles.length === 0)
      );

    if (shouldCreateAlert) {
      const alertReason =
        options.alertReason ||
        (nextWorkflowStatus === "Annulé"
          ? "Bénévole retiré des affectations."
          : "Dernière affectation retirée.");
      await appendVolunteerAlertEntry(
        buildVolunteerAlertEntry(
          volunteer,
          alertReason,
          nextWorkflowStatus === "Annulé" ? "withdrawal" : "assignment_removed",
        ),
      );
    }

    await persistVolunteerPatch(id, patch);
  }

  function buildNextVolunteerState(volunteer, patch) {
    return {
      ...volunteer,
      ...patch,
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
  }, [getVolunteerAssignedRoles, search, statusFilter, volunteers]);

  const compactRoleOptions = useMemo(() => {
    return [...new Set(volunteers.flatMap((volunteer) => getVolunteerAssignedRoles(volunteer)))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [getVolunteerAssignedRoles, volunteers]);

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
  }, [getVolunteerAssignedRoles, getVolunteerTeamRoleForAssignedRole, volunteers]);

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
  }, [
    assignedRoleFilter,
    filteredVolunteers,
    getVolunteerAssignedRoles,
    getVolunteerTeamRoleForAssignedRole,
    mailFilter,
    teamRoleConfigs,
    teamRoleFilter,
  ]);

  const unassignedApplications = filteredVolunteers.filter(
    (volunteer) => volunteer.workflowStatus === "Candidature reçue" && getVolunteerAssignedRoles(volunteer).length === 0,
  );

  const assignedVolunteerCount = volunteers.filter(
    (volunteer) => getVolunteerAssignedRoles(volunteer).length > 0,
  ).length;

  const assignedVolunteers = filteredVolunteers.filter(
    (volunteer) => volunteer.workflowStatus !== "Candidature reçue" || getVolunteerAssignedRoles(volunteer).length > 0,
  );
  const hideUnassignedBlock = search.trim() !== "" || statusFilter !== "Tous";

  const supportVolunteers = filteredVolunteers.filter(
    (volunteer) =>
      volunteer.supportAvailability &&
      volunteer.supportAvailability !== "Pas d'aide complémentaire indiquée",
  );
  const filteredVolunteerAlertEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return volunteerAlertEntries.filter((entry) => {
      if (!normalizedSearch) return true;
      const haystack = [
        entry.volunteerName,
        entry.volunteerEmail,
        ...(entry.previousRoles || []),
        ...Object.values(entry.previousTeamRoleAssignments || {}),
        entry.reason,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [search, volunteerAlertEntries]);

  const effectiveSelectedVolunteerId =
    selectedVolunteerId && volunteers.some((volunteer) => volunteer.id === selectedVolunteerId)
      ? selectedVolunteerId
      : null;
  const selectedVolunteer =
    volunteers.find((volunteer) => volunteer.id === effectiveSelectedVolunteerId) ?? null;
  const visibleUnassignedApplications = getVisibleListItems("unassigned-applications", unassignedApplications);
  const visibleAssignedVolunteers = getVisibleListItems("assigned-volunteers", assignedVolunteers);
  const visibleCompactAssignmentGroups = getVisibleListItems("compact-assignment-groups", compactAssignmentGroups);
  const visibleVolunteerAlertEntries = getVisibleListItems("volunteer-alerts", filteredVolunteerAlertEntries);
  const visibleSupportVolunteers = getVisibleListItems("support-volunteers", supportVolunteers);

  async function persistVolunteerPatch(id, patch) {
    const volunteer = volunteers.find((entry) => entry.id === id);
    const nextVolunteer = volunteer ? buildNextVolunteerState(volunteer, patch) : null;

    setVolunteers((current) =>
      current.map((volunteer) => (volunteer.id === id ? { ...volunteer, ...patch } : volunteer)),
    );

    try {
      await updateDoc(doc(db, "volunteerApplications", id), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      return nextVolunteer;
    } catch (error) {
      console.error("Impossible de mettre à jour la candidature bénévole.", error);
      throw error;
    }
  }

  async function syncVolunteerInternalAssignmentState(nextVolunteer, options = {}) {
    if (!nextVolunteer) return;

    try {
      await Promise.all([
        syncVolunteerAssignmentsToTeamConfiguration(nextVolunteer),
        syncVolunteerAssignmentToUserProfile(nextVolunteer),
      ]);
    } catch (error) {
      console.error("Impossible de synchroniser l'affectation interne du bénévole.", error);
      setVolunteerErrorStatus(
        options.message ||
          "L'affectation a bien ete enregistree, mais la synchronisation interne complementaire a echoue.",
        getActionErrorDetail(error),
      );
    }
  }

  async function persistVolunteerPatchAndSync(id, patch, options = {}) {
    try {
      const nextVolunteer = await persistVolunteerPatch(id, patch);
      await syncVolunteerInternalAssignmentState(nextVolunteer, options);
      return nextVolunteer;
    } catch (error) {
      setVolunteerErrorStatus(
        options.persistenceErrorMessage || "La mise a jour du benevole a echoue.",
        getActionErrorDetail(error),
      );
      return null;
    }
  }

  async function persistVolunteerPatchWithAlertsAndSync(id, patch, options = {}) {
    try {
      await persistVolunteerPatchWithAlerts(id, patch, options);
      const volunteer = volunteers.find((entry) => entry.id === id);
      const nextVolunteer = volunteer ? buildNextVolunteerState(volunteer, patch) : null;
      await syncVolunteerInternalAssignmentState(nextVolunteer, options);
      return nextVolunteer;
    } catch (error) {
      setVolunteerErrorStatus(
        options.persistenceErrorMessage || "La mise a jour du benevole a echoue.",
        getActionErrorDetail(error),
      );
      return null;
    }
  }

  async function assignVolunteer(id, role) {
    clearVolunteerActionStatus();
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    const currentRoles = getVolunteerAssignedRoles(volunteer);
    const secondaryRoles = currentRoles.slice(1).filter((assignedRole) => assignedRole !== role);
    const nextAssignedRoles = role ? [role, ...secondaryRoles] : [];
    await persistVolunteerPatchWithAlertsAndSync(id, buildVolunteerAssignmentPatch(volunteer, nextAssignedRoles), {
      alertReason: "Affectation retirée depuis la vue bénévoles.",
      message:
        "L'affectation a bien ete mise a jour, mais la synchronisation interne complete a echoue.",
      persistenceErrorMessage: "Impossible d'enregistrer la nouvelle affectation du benevole.",
    });
  }

  async function addVolunteerRole(id, role) {
    if (!role) return;
    clearVolunteerActionStatus();

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

    await persistVolunteerPatchAndSync(id, buildVolunteerAssignmentPatch(volunteer, [...currentRoles, role]), {
      message:
        "Le role supplementaire a ete enregistre, mais la synchronisation interne complete a echoue.",
      persistenceErrorMessage: "Impossible d'ajouter ce role au benevole.",
    });
    setRolePickerOpenByVolunteer((current) => ({ ...current, [id]: false }));
  }

  async function removeVolunteerRole(id, role) {
    clearVolunteerActionStatus();
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    const nextAssignedRoles = getVolunteerAssignedRoles(volunteer).filter(
      (assignedRole) => assignedRole !== role,
    );

    await persistVolunteerPatchWithAlertsAndSync(id, buildVolunteerAssignmentPatch(volunteer, nextAssignedRoles), {
      alertReason: `Retrait du poste ${role}.`,
      message:
        "Le retrait de poste a bien ete enregistre, mais la synchronisation interne complete a echoue.",
      persistenceErrorMessage: "Impossible de retirer ce poste du benevole.",
    });
  }

  async function updateVolunteerAssignedTeamRole(id, assignedRole, teamRole) {
    clearVolunteerActionStatus();
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    const assignedRoles = getVolunteerAssignedRoles(volunteer);
    const nextTeamRoleAssignments = {
      ...getVolunteerTeamRoleAssignments(volunteer, assignedRoles),
      [assignedRole]: teamRole,
    };
    const primaryRole = assignedRoles[0] || "";

    await persistVolunteerPatchAndSync(id, {
      teamRoleAssignments: nextTeamRoleAssignments,
      teamRole: primaryRole ? nextTeamRoleAssignments[primaryRole] || "Bénévole" : "Bénévole",
    }, {
      message:
        "Le role dans l'equipe a bien ete mis a jour, mais la synchronisation interne complete a echoue.",
      persistenceErrorMessage: "Impossible de mettre a jour le role d'equipe du benevole.",
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

  async function updateVolunteerStatus(id, nextStatus) {
    clearVolunteerActionStatus();
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;

    if (nextStatus === "Annulé" || nextStatus === "Candidature reçue") {
      await persistVolunteerPatchWithAlertsAndSync(id, {
        workflowStatus: nextStatus,
        assignedRole: "",
        assignedRoles: [],
        teamRole: "Bénévole",
        teamRoleAssignments: {},
      }, {
        alertReason:
          nextStatus === "Annulé"
            ? "Bénévole marqué comme désisté / annulé."
            : "Bénévole repassé sans affectation active.",
        message:
          "Le statut a bien ete mis a jour, mais la synchronisation interne complete a echoue.",
        persistenceErrorMessage: "Impossible de mettre a jour le statut du benevole.",
      });
      return;
    }

    if (nextStatus === "Affecté") {
      await persistVolunteerPatchAndSync(id, { workflowStatus: nextStatus, teamEmailSent: false }, {
        message:
          "Le statut a bien ete mis a jour, mais la synchronisation interne complete a echoue.",
        persistenceErrorMessage: "Impossible de mettre a jour le statut du benevole.",
      });
      return;
    }

    await persistVolunteerPatchAndSync(id, { workflowStatus: nextStatus }, {
      message:
        "Le statut a bien ete mis a jour, mais la synchronisation interne complete a echoue.",
      persistenceErrorMessage: "Impossible de mettre a jour le statut du benevole.",
    });
  }

  async function markVolunteerInformed(id) {
    clearVolunteerActionStatus();
    const volunteer = volunteers.find((entry) => entry.id === id);
    if (!volunteer) return;
    if (!getVolunteerAssignedRoles(volunteer).length) {
      setVolunteerErrorStatus("Attribue d'abord un rôle au bénévole avant de l'informer.");
      return;
    }

    const internallyAssignedVolunteer = {
      ...volunteer,
      workflowStatus: volunteer.workflowStatus === "Annulé" ? "Annulé" : "Affecté",
      teamEmailSent: false,
      assignmentStatus: volunteer.assignmentStatus || "Proposé",
    };

    const nextVolunteer = {
      ...volunteer,
      workflowStatus: "Informé",
      teamEmailSent: true,
      assignmentStatus: volunteer.assignmentStatus || "Proposé",
    };

    let mailSent = false;

    try {
      const { buildVolunteerRoleAssignmentMail, enqueueTransactionalMail } = await loadMailQueueModule();
      await syncVolunteerInternalAssignmentState(internallyAssignedVolunteer, {
        message:
          "L'affectation est enregistree, mais la synchronisation interne complete a echoue avant l'envoi du mail.",
      });

      if (volunteer.email) {
        await enqueueTransactionalMail(
          buildVolunteerRoleAssignmentMail({
            email: volunteer.email,
            firstName: volunteer.firstName,
            assignedRole: nextVolunteer.assignedRole,
            teamRole: nextVolunteer.teamRole,
          }),
        );
        mailSent = true;
      }

      const persistedVolunteer = await persistVolunteerPatchAndSync(
        id,
        { workflowStatus: "Informé", teamEmailSent: true },
        {
          message:
            "Le mail est parti, mais la mise a jour finale du statut d'information n'a pas pu etre synchronisee partout.",
          persistenceErrorMessage: "Le mail est parti, mais l'enregistrement final du statut a echoue.",
        },
      );
      if (persistedVolunteer) {
        setVolunteerInfoStatus(`Le mail d'affectation a été préparé pour ${volunteer.firstName} ${volunteer.lastName}.`);
      }
    } catch (error) {
      console.error("Impossible d'informer le bénévole.", error);
      const detail = getActionErrorDetail(error);
      setVolunteerErrorStatus(
        mailSent
          ? `Le mail a bien été envoyé à ${volunteer.firstName} ${volunteer.lastName}, mais la synchronisation interne a échoué.`
          : "L'affectation interne est bien conservee, mais le mail n'a pas pu etre envoye dans cet environnement local.",
        detail,
      );
    }
  }

  function volunteerNeedsInforming(volunteer) {
    return getVolunteerAssignedRoles(volunteer).length > 0 && !volunteer.teamEmailSent;
  }

  async function sendBulkInformMails() {
    const toSend = assignedVolunteers.filter((v) => selectedVolunteerIds.has(v.id));
    if (!toSend.length) return;

    setIsSendingBulk(true);
    clearVolunteerActionStatus();
    let successCount = 0;
    let failCount = 0;
    const errorDetails = [];

    for (const volunteer of toSend) {
      try {
        const { buildVolunteerRoleAssignmentMail, enqueueTransactionalMail } = await loadMailQueueModule();
        const internallyAssignedVolunteer = {
          ...volunteer,
          workflowStatus: volunteer.workflowStatus === "Annulé" ? "Annulé" : "Affecté",
          teamEmailSent: false,
          assignmentStatus: volunteer.assignmentStatus || "Proposé",
        };
        const nextVolunteer = {
          ...volunteer,
          workflowStatus: "Informé",
          teamEmailSent: true,
          assignmentStatus: volunteer.assignmentStatus || "Proposé",
        };
        await syncVolunteerInternalAssignmentState(internallyAssignedVolunteer, {
          message:
            "Certaines affectations ont bien ete enregistrees, mais leur synchronisation interne complete a echoue.",
        });
        if (volunteer.email) {
          await enqueueTransactionalMail(
            buildVolunteerRoleAssignmentMail({
              email: volunteer.email,
              firstName: volunteer.firstName,
              assignedRole: nextVolunteer.assignedRole,
              teamRole: nextVolunteer.teamRole,
            }),
          );
        }
        const persistedVolunteer = await persistVolunteerPatchAndSync(
          volunteer.id,
          { workflowStatus: "Informé", teamEmailSent: true },
          {
            message:
              "Le mail est parti, mais la mise a jour finale du statut d'information n'a pas pu etre synchronisee partout.",
            persistenceErrorMessage: "Le mail est parti, mais l'enregistrement final du statut a echoue.",
          },
        );
        if (persistedVolunteer) {
          successCount += 1;
        } else {
          failCount += 1;
        }
      } catch (error) {
        failCount += 1;
        errorDetails.push(`${volunteer.firstName} ${volunteer.lastName}`.trim() + `: ${getActionErrorDetail(error)}`);
      }
    }

    if (failCount) {
      setVolunteerErrorStatus(
        `${successCount} mail(s) envoyé(s), ${failCount} échec(s).`,
        errorDetails.join(" | "),
      );
    } else {
      setVolunteerInfoStatus(
      failCount
        ? `${successCount} mail(s) envoyé(s), ${failCount} échec(s).`
        : `${successCount} mail(s) envoyé(s) avec succès.`,
      );
    }
    setSelectedVolunteerIds(new Set());
    setIsSendingBulk(false);
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
      {volunteerApplicationsError ? <p className="status-note status-note--error">{volunteerApplicationsError}</p> : null}
      {volunteerAlertLogError ? <p className="status-note status-note--error">{volunteerAlertLogError}</p> : null}
      {volunteerApplicationsLoading ? <p className="status-note">Chargement des candidatures bénévoles...</p> : null}
      {volunteerAlertLogLoading ? <p className="status-note">Chargement des alertes bénévoles...</p> : null}
      {volunteerActionStatus ? (
        <div className={`status-note ${volunteerActionStatus.tone === "error" ? "status-note--error" : "status-note--success"}`}>
          <strong>{volunteerActionStatus.message}</strong>
          {volunteerActionStatus.detail ? <div className="status-note__detail">{volunteerActionStatus.detail}</div> : null}
        </div>
      ) : null}

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
            {assignedVolunteerCount}
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
              : activeVolunteerView === "alerts"
                ? "Alertes affectations"
              : "Aide autour du meeting"
        }
        subtitle={
          activeVolunteerView === "meeting"
            ? "Filtrez les candidatures puis affectez directement chaque personne au bon rôle."
            : activeVolunteerView === "assigned-posts"
              ? "Vue compacte de type tableur avec une ligne par poste attribué pour filtrer, relire et ajuster rapidement les affectations."
              : activeVolunteerView === "alerts"
                ? "Historique des désistements, retraits d'affectation et badges à surveiller côté opérationnel."
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
          <button
            className={`admin-subtab ${activeVolunteerView === "alerts" ? "admin-subtab--active" : ""}`}
            type="button"
            onClick={() => setActiveVolunteerView("alerts")}
          >
            Alertes ({filteredVolunteerAlertEntries.length})
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
                      {visibleUnassignedApplications.map((volunteer) => (
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
                {canShowMoreListItems("unassigned-applications", unassignedApplications) ? (
                  <div className="list-progressive-actions">
                    <button
                      className="button button--secondary button--small"
                      type="button"
                      onClick={() => showMoreListItems("unassigned-applications")}
                    >
                      Afficher 10 de plus
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="section-stack">
              <div className="section-intro">
                <h3>Bénévoles affectés ou en cours d'information</h3>
                <p>
                  L'affectation interne est enregistree tout de suite. Le mail reste une etape de
                  notification separee : tant qu'il n'est pas parti, la personne reste simplement a informer.
                </p>
              </div>

              <div className="bulk-mail-bar">
                <div className="bulk-mail-bar__selectors">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => setSelectedVolunteerIds(new Set(assignedVolunteers.map((v) => v.id)))}
                  >
                    Tout sélectionner
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => setSelectedVolunteerIds(new Set(assignedVolunteers.filter(volunteerNeedsInforming).map((v) => v.id)))}
                  >
                    Sélectionner à informer
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => setSelectedVolunteerIds(new Set())}
                  >
                    Désélectionner tout
                  </button>
                </div>
                {selectedVolunteerIds.size > 0 ? (
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={isSendingBulk}
                    onClick={sendBulkInformMails}
                  >
                    {isSendingBulk
                      ? "Envoi en cours..."
                      : `Envoyer aux ${selectedVolunteerIds.size} sélectionné(s)`}
                  </button>
                ) : null}
              </div>

              <div className="table-wrap">
                <table className="data-table data-table--admin">
                  <thead>
                    <tr>
                      <th style={{ width: "32px" }} />
                      <th>Bénévole</th>
                      <th>Coordonnées</th>
                      <th>Langues</th>
                      <th>Statut</th>
                      <th>Rôle attribué</th>
                      <th>Rôle dans l'équipe</th>
                      <th>Mail</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAssignedVolunteers.map((volunteer) => {
                      const hasRole = getVolunteerAssignedRoles(volunteer).length > 0;
                      const needsInfo = hasRole && !volunteer.teamEmailSent;
                      return (
                      <tr key={volunteer.id} className={selectedVolunteerIds.has(volunteer.id) ? "row--selected" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedVolunteerIds.has(volunteer.id)}
                            onChange={(event) => {
                              setSelectedVolunteerIds((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(volunteer.id);
                                else next.delete(volunteer.id);
                                return next;
                              });
                            }}
                          />
                        </td>
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
                          {hasRole ? (
                            <button
                              className={`mail-send-button ${needsInfo ? "mail-send-button--active" : "mail-send-button--done"}`}
                              type="button"
                              title={needsInfo ? "Envoyer le mail d'affectation" : "Déjà informé — cliquer pour ré-envoyer"}
                              onClick={() => markVolunteerInformed(volunteer.id)}
                            >
                              {needsInfo ? "✉ Envoyer" : "✓ Ré-envoyer"}
                            </button>
                          ) : (
                            <span className="mail-send-button mail-send-button--disabled">Aucun poste</span>
                          )}
                        </td>
                        <td>{volunteer.notes}</td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
              {canShowMoreListItems("assigned-volunteers", assignedVolunteers) ? (
                <div className="list-progressive-actions">
                  <button
                    className="button button--secondary button--small"
                    type="button"
                    onClick={() => showMoreListItems("assigned-volunteers")}
                  >
                    Afficher 10 de plus
                  </button>
                </div>
              ) : null}
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
                  {visibleCompactAssignmentGroups.map((group) => (
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
            {canShowMoreListItems("compact-assignment-groups", compactAssignmentGroups) ? (
              <div className="list-progressive-actions">
                <button
                  className="button button--secondary button--small"
                  type="button"
                  onClick={() => showMoreListItems("compact-assignment-groups")}
                >
                  Afficher 10 de plus
                </button>
              </div>
            ) : null}
          </div>
        ) : activeVolunteerView === "alerts" ? (
          <div className="section-stack">
            <div className="section-intro">
              <h3>Historique des retraits et désistements</h3>
              <p>
                Chaque entrée conserve l'affectation initiale au moment du retrait pour permettre aux
                gestionnaires de suivre les postes à remplacer et les badges potentiellement déjà imprimés.
              </p>
            </div>

            <div className="table-wrap">
              <table className="data-table data-table--admin">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bénévole</th>
                    <th>Postes initiaux</th>
                    <th>Rôles équipe</th>
                    <th>Statut avant retrait</th>
                    <th>Type d'alerte</th>
                    <th>Motif</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleVolunteerAlertEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString("fr-FR") : "-"}</td>
                      <td>
                        <div className="table-stack">
                          <strong>{entry.volunteerName || "-"}</strong>
                          <span>{entry.volunteerEmail || "Sans e-mail"}</span>
                        </div>
                      </td>
                      <td>{entry.previousRoles.join(", ") || "Aucun poste"}</td>
                      <td>
                        {Object.entries(entry.previousTeamRoleAssignments || {})
                          .map(([roleName, teamRole]) => `${roleName}: ${teamRole}`)
                          .join(", ") || "Aucun"}
                      </td>
                      <td>
                        <span className={getWorkflowStatusClass(entry.previousWorkflowStatus)}>
                          {entry.previousWorkflowStatus || "Inconnu"}
                        </span>
                      </td>
                      <td>{entry.alertType === "withdrawal" ? "Désistement / annulation" : "Retrait d'affectation"}</td>
                      <td>{entry.reason || "—"}</td>
                    </tr>
                  ))}
                  {!filteredVolunteerAlertEntries.length ? (
                    <tr>
                      <td colSpan="7">Aucune alerte d'affectation enregistrée pour le moment.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {canShowMoreListItems("volunteer-alerts", filteredVolunteerAlertEntries) ? (
              <div className="list-progressive-actions">
                <button
                  className="button button--secondary button--small"
                  type="button"
                  onClick={() => showMoreListItems("volunteer-alerts")}
                >
                  Afficher 10 de plus
                </button>
              </div>
            ) : null}
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
                  {visibleSupportVolunteers.map((volunteer) => (
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
            {canShowMoreListItems("support-volunteers", supportVolunteers) ? (
              <div className="list-progressive-actions">
                <button
                  className="button button--secondary button--small"
                  type="button"
                  onClick={() => showMoreListItems("support-volunteers")}
                >
                  Afficher 10 de plus
                </button>
              </div>
            ) : null}
          </div>
        )}
      </Panel>
    </div>
  );
}

export { VolunteersPage };
