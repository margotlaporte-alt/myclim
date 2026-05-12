import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { collection, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { useAuth } from "../context/auth-context";
import {
  ACTIVE_EDITION_DOC_PATH,
  getEditionLabel,
  normalizeEditionId,
  useActiveEdition,
} from "./edition";
import { buildAthletePortalNavigation, buildNavigationFromRoles, getActiveRoles, getPrimaryRole } from "./navigation";
import { canAccessAthletePortal, canImportAthletes, useAthletePortalSettings } from "./athlete-portal-hooks";
import { useTeamConfiguration } from "./config-hooks";
import { useDocumentsCollection } from "./documents-hooks";
import { useVolunteerApplication, useVolunteerApplicationsList } from "./volunteer-hooks";
import { useParentU14Children, useU14RequestsList } from "./u14-hooks";
import { buildUserIdentitySet, formatVolunteerApplicationStatus, isTeamLeadAssignment } from "./common-helpers";
import { ACCREDITATION_CONFIGURATION_DOC_PATH, TEAM_CONFIGURATION_DOC_PATH } from "./seed-data";
import { getDisplayName, normalizeRole } from "./utils";
import { db } from "../services/firebase";

function flattenNavigationItems(items) {
  return items.flatMap((item) => (item.type === "section" ? item.links : [item]));
}

function NavIcon({ icon }) {
  const paths = {
    dashboard: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z",
    users: "M7.5 12a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm9 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM3.5 19a4.5 4.5 0 0 1 8.96 0zm9 0a4 4 0 0 1 7.5-1.8V19z",
    check: "M5 12.5 9.2 16.7 19 7.5",
    spark: "m12 3 2.2 4.8L19 10l-4.8 2.2L12 17l-2.2-4.8L5 10l4.8-2.2z",
    folder: "M3.5 7.5a2 2 0 0 1 2-2H10l2 2h6.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
    ticket: "M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z",
    shield: "M12 3 19 6v5c0 5-3.4 8-7 10-3.6-2-7-5-7-10V6z",
    profile: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0",
    badge: "M12 3 6 5.5v6.2c0 4.1 2.4 7 6 9.3 3.6-2.3 6-5.2 6-9.3V5.5z",
    pin: "M12 21s-5.5-5.7-5.5-10A5.5 5.5 0 1 1 17.5 11C17.5 15.3 12 21 12 21Zm0-7.5a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5Z",
    child: "M12 7.2a2.7 2.7 0 1 0-2.7-2.7A2.7 2.7 0 0 0 12 7.2Zm-4.8 12.3v-4.2a3.2 3.2 0 0 1 3.2-3.2h3.2a3.2 3.2 0 0 1 3.2 3.2v4.2M8.5 10l-2 2.2m9-2.2 2 2.2",
    grid: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  };

  return (
    <span aria-hidden="true" className="nav-link__icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[icon] || paths.folder} />
      </svg>
    </span>
  );
}

function AppShell(props) {
  const { cmcmLogo } = props;
  const { currentUser, logout, userProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const roles = getActiveRoles(userProfile);
  const { activeEditionLabel } = useActiveEdition();
  const { settings: portalSettings, loading: portalSettingsLoading } = useAthletePortalSettings();
  const isAthletePortal = location.pathname.startsWith("/app/athlete-portal");
  const [preferredViewAsRole, setPreferredViewAsRole] = useState(() => getPrimaryRole(userProfile));
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth > 1100,
  );
  const primaryRole = getPrimaryRole(userProfile);
  const viewAsRole = roles.includes("admin")
    ? (roles.includes(preferredViewAsRole) ? preferredViewAsRole : primaryRole)
    : primaryRole;
  const effectiveRoles = useMemo(() => {
    if (!roles.includes("admin")) return roles;
    if (viewAsRole === "admin") return roles;
    return [viewAsRole];
  }, [roles, viewAsRole]);

  const portalCanImport = useMemo(() => canImportAthletes(roles, portalSettings), [roles, portalSettings]);
  const mainNavigation = useMemo(() => {
    const nav = buildNavigationFromRoles(effectiveRoles);
    if (!portalSettingsLoading && canAccessAthletePortal(roles, portalSettings)) {
      const portalLink = { to: "/app/athlete-portal", label: "Athlete Portal", icon: "spark" };
      if (Array.isArray(nav)) {
        const lastSection = nav[nav.length - 1];
        if (lastSection?.type === "section") {
          lastSection.links = [portalLink, ...lastSection.links];
        } else {
          nav.splice(nav.length - 1, 0, portalLink);
        }
      }
    }
    return nav;
  }, [effectiveRoles, roles, portalSettings, portalSettingsLoading]);

  const portalNavigation = useMemo(
    () => buildAthletePortalNavigation(roles, portalSettings, { canImport: portalCanImport }),
    [roles, portalSettings, portalCanImport],
  );

  const navigation = isAthletePortal ? portalNavigation : mainNavigation;
  const flatNavigation = useMemo(() => flattenNavigationItems(navigation), [navigation]);
  const displayName = getDisplayName(userProfile, currentUser?.email);
  const currentRouteLabel = useMemo(
    () =>
      flatNavigation.find((item) => item.to === location.pathname)?.label ||
      flatNavigation.find((item) => item.to !== "/app" && location.pathname.startsWith(item.to))?.label ||
      "Menu",
    [flatNavigation, location.pathname],
  );

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
      const timeoutId = window.setTimeout(() => {
        setIsSidebarOpen(false);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
    return undefined;
  }, [location.pathname]);

  useEffect(() => {
    if (!location.state?.accessDeniedMessage) return;

    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  function handleViewAsChange(nextRole) {
    setPreferredViewAsRole(nextRole);

    const defaultRouteByRole = {
      admin: "/app",
      gestionnaire: "/app/benevoles",
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
      <aside className={`sidebar${isSidebarOpen ? " sidebar--open" : ""}${isAthletePortal ? " sidebar--portal" : ""}`}>
        <div className="sidebar-header">
          {isAthletePortal ? (
            <div className="sidebar-brand">
              <div className="sidebar-brand-lockup">
                <div className="sidebar-brand-logo-shell sidebar-brand-logo-shell--portal">
                  <img alt="Logo CMCM Luxembourg Indoor Meeting" className="sidebar-brand-logo" src={cmcmLogo} />
                </div>
                <div className="sidebar-brand-copy">
                  <h2>Athlete Portal</h2>
                  <p className="sidebar-brand-tagline sidebar-brand-tagline--portal">CLIM {activeEditionLabel}</p>
                </div>
              </div>
              <NavLink
                className="button button--ghost button--small sidebar-portal-back"
                to="/app"
              >
                ← Back to MyCLIM
              </NavLink>
            </div>
          ) : (
            <div className="sidebar-brand">
              <a href="/" className="sidebar-brand-lockup sidebar-brand-lockup--link" title="Retour au site public">
                <div className="sidebar-brand-logo-shell">
                  <img alt="Logo CMCM Luxembourg Indoor Meeting" className="sidebar-brand-logo" src={cmcmLogo} />
                </div>
                <div className="sidebar-brand-copy">
                  <h2>MyCLIM</h2>
                </div>
              </a>
              <p className="sidebar-brand-tagline">Plateforme équipes et accès meeting.</p>
            </div>
          )}
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
            {navigation.map((item) =>
              item.type === "section" ? (
                <section key={item.title} className="sidebar-nav-section" aria-label={item.title}>
                  <p className="sidebar-nav-section__title">{item.title}</p>
                  <div className="sidebar-nav-section__links">
                    {item.links.map((link) => (
                      <NavLink
                        key={link.to}
                        className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}
                        to={link.to}
                        end={link.to === "/app"}
                      >
                        <span className="nav-link__label">
                          <NavIcon icon={link.icon} />
                          <span>{link.label}</span>
                        </span>
                        <span aria-hidden="true" className="nav-link__chevron">
                          ›
                        </span>
                      </NavLink>
                    ))}
                  </div>
                </section>
              ) : (
                <NavLink
                  key={item.to}
                  className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}
                  to={item.to}
                  end={item.to === "/app"}
                >
                  <span className="nav-link__label">
                    <NavIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </span>
                  <span aria-hidden="true" className="nav-link__chevron">
                    ›
                  </span>
                </NavLink>
              ),
            )}
          </nav>
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-footer__identity">
            <strong>{displayName}</strong>
            <p>{currentUser?.email}</p>
            <p>Édition active: {activeEditionLabel}</p>
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
          <span className="shell-mobile-bar__route">{currentRouteLabel}</span>
        </div>
        {roles.includes("admin") && !isAthletePortal ? (
          <div className="content-toolbar">
            <label className="view-switcher">
              <span>Voir comme</span>
              <select value={viewAsRole} onChange={(event) => handleViewAsChange(event.target.value)}>
                {roles.includes("admin") ? <option value="admin">Administrateur</option> : null}
                {roles.includes("chef_equipe") ? <option value="chef_equipe">Chef d'équipe</option> : null}
                {roles.includes("benevole") ? <option value="benevole">Bénévole</option> : null}
                {roles.includes("parent_u14") ? <option value="parent_u14">Parent U14</option> : null}
              </select>
            </label>
            {viewAsRole === "admin" ? (
              <p className="content-toolbar__hint">Vue admin simplifiee: un menu par domaine, sans melanger les parcours.</p>
            ) : null}
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

function DashboardHome(props) {
  const { Panel } = props;
  const { currentUser, userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const {
    activeEditionId,
    activeEditionLabel,
    loading: editionLoading,
    preprogramOpeningByEdition,
    preprogramOpeningDate,
  } = useActiveEdition();
  const outletContext = useOutletContext() ?? {};
  const activeRole = outletContext.activeRole || getPrimaryRole(userProfile);
  const [editionDraft, setEditionDraft] = useState(activeEditionId);
  const [preprogramOpeningDraft, setPreprogramOpeningDraft] = useState("");
  const [editionSaveStatus, setEditionSaveStatus] = useState("");

  useEffect(() => {
    setEditionDraft(activeEditionId);
  }, [activeEditionId]);

  useEffect(() => {
    setPreprogramOpeningDraft(
      preprogramOpeningDate && !Number.isNaN(preprogramOpeningDate.getTime())
        ? formatDateTimeLocalValue(preprogramOpeningDate)
        : "",
    );
  }, [preprogramOpeningDate]);
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
  const shouldPromptParentToVolunteer = roles.includes("parent_u14") && !volunteerApplication;
  const userIdentitySet = useMemo(
    () => buildUserIdentitySet(userProfile, currentUser),
    [buildUserIdentitySet, currentUser, userProfile],
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
    [isTeamLeadAssignment, myAssignments],
  );
  const myLeadAssignments = useMemo(
    () => myAssignments.filter((assignment) => isTeamLeadAssignment(assignment)),
    [isTeamLeadAssignment, myAssignments],
  );
  const myLeadRoleIds = useMemo(
    () =>
      teamRoles
        .filter(
          (role) =>
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
  const myTeamRoles = useMemo(() => teamRoles.filter((role) => myRoleIds.includes(role.id)), [myRoleIds, teamRoles]);
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
    () => u14Requests.filter((request) => String(request.status || "").trim().toLowerCase() === "submitted").length,
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
        (accumulator, role) => accumulator + teamAssignments.filter((member) => member.assignedRoleId === role.id).length,
        0,
      ),
    [ledRoles, teamAssignments],
  );
  const nextVolunteerRole = myTeamRoles[0] ?? null;
  const volunteerAssignmentSummary =
    nextVolunteerRole?.roleName || userProfile?.assignedRole || "Aucune affectation confirmée pour l'instant";
  const volunteerShiftSummary = userProfile?.shift || nextVolunteerRole?.shiftTime || "Créneau à confirmer";
  const volunteerBriefingSummary = nextVolunteerRole?.briefingTime || "Briefing à confirmer";
  const parentConfirmedCount = parentRequestRows.filter((child) => child.status === "Confirmée").length;
  const parentPendingCount = parentRequestRows.filter((child) => child.status !== "Confirmée").length;
  const adminDataLoading = teamsLoading || volunteerApplicationsLoading || documentsLoading || u14RequestsLoading;
  const volunteerDataLoading = teamsLoading || documentsLoading;
  const leadDataLoading = teamsLoading || documentsLoading;

  async function handleEditionSwitch(event) {
    event.preventDefault();

    const nextEditionId = normalizeEditionId(editionDraft);
    setEditionSaveStatus("Sauvegarde de l'édition en cours...");

    try {
      if (nextEditionId !== activeEditionId) {
        await archiveCurrentEditionData(activeEditionId);
        await resetEditionScopedData();
        await restoreEditionScopedData(nextEditionId);
      }

      await setDoc(
        doc(db, ...ACTIVE_EDITION_DOC_PATH),
        {
          activeEdition: nextEditionId,
          preprogramOpeningByEdition: {
            ...preprogramOpeningByEdition,
            [nextEditionId]: preprogramOpeningDraft ? new Date(preprogramOpeningDraft).toISOString() : null,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setEditionSaveStatus(`Édition active mise à jour: ${getEditionLabel(nextEditionId)}.`);
    } catch (error) {
      console.error("Unable to switch active edition", error);
      setEditionSaveStatus("La bascule d'édition a échoué.");
    }
  }

  async function resetEditionScopedData() {
    const usersSnapshot = await getDocs(collection(db, "users"));
    const batch = writeBatch(db);

    usersSnapshot.docs.forEach((userSnapshot) => {
      const userData = userSnapshot.data();
      const normalizedUserTypes = Array.isArray(userData?.userTypes) ? userData.userTypes : [];
      const isAdminProfile = normalizedUserTypes.includes("admin");

      batch.set(
        doc(db, "users", userSnapshot.id),
        {
          assignedRole: deleteField(),
          assignedTeams: [],
          assignmentStatus: "En attente",
          teamEmailSent: false,
          teamRole: deleteField(),
          teamRoleAssignments: {},
          updatedAt: serverTimestamp(),
          ...(isAdminProfile ? {} : {}),
        },
        { merge: true },
      );
    });

    batch.set(
      doc(db, "appSettings", "teamsConfiguration"),
      {
        teamAssignments: [],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    batch.set(
      doc(db, "appSettings", "accreditationConfiguration"),
      {
        volunteerOverrides: {},
        badgeStorageLocations: {},
        printHistory: [],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await batch.commit();
  }

  async function archiveCurrentEditionData(editionId) {
    const normalizedEditionId = normalizeEditionId(editionId);
    const [usersSnapshot, teamsSnapshot, accreditationSnapshot] = await Promise.all([
      getDocs(collection(db, "users")),
      getDoc(doc(db, ...TEAM_CONFIGURATION_DOC_PATH)),
      getDoc(doc(db, ...ACCREDITATION_CONFIGURATION_DOC_PATH)),
    ]);

    const userAssignmentSnapshots = usersSnapshot.docs
      .map((userSnapshot) => {
        const userData = userSnapshot.data();
        const assignedTeams = Array.isArray(userData?.assignedTeams) ? userData.assignedTeams : [];
        const teamRoleAssignments =
          userData?.teamRoleAssignments && typeof userData.teamRoleAssignments === "object"
            ? userData.teamRoleAssignments
            : {};

        const hasAssignmentData =
          assignedTeams.length > 0 ||
          String(userData?.assignedRole || "").trim() ||
          Object.keys(teamRoleAssignments).length > 0;

        if (!hasAssignmentData) return null;

        return {
          userId: userSnapshot.id,
          uid: String(userData?.uid || userSnapshot.id || "").trim(),
          firstName: String(userData?.firstName || ""),
          lastName: String(userData?.lastName || ""),
          email: String(userData?.email || ""),
          userTypes: Array.isArray(userData?.userTypes) ? userData.userTypes : [],
          assignedRole: String(userData?.assignedRole || ""),
          assignedTeams,
          assignmentStatus: String(userData?.assignmentStatus || ""),
          teamRole: String(userData?.teamRole || ""),
          teamRoleAssignments,
        };
      })
      .filter(Boolean);

    const teamsData = teamsSnapshot.exists() ? teamsSnapshot.data() : {};
    const accreditationData = accreditationSnapshot.exists() ? accreditationSnapshot.data() : {};

    await setDoc(
      doc(db, "editionArchives", normalizedEditionId),
      {
        editionId: normalizedEditionId,
        archivedAt: serverTimestamp(),
        teamConfigurationSnapshot: {
          roles: Array.isArray(teamsData?.roles) ? teamsData.roles : [],
          teamAssignments: Array.isArray(teamsData?.teamAssignments) ? teamsData.teamAssignments : [],
          supportTasks: Array.isArray(teamsData?.supportTasks) ? teamsData.supportTasks : [],
        },
        accreditationSnapshot: {
          volunteerOverrides:
            accreditationData?.volunteerOverrides && typeof accreditationData.volunteerOverrides === "object"
              ? accreditationData.volunteerOverrides
              : {},
          badgeStorageLocations:
            accreditationData?.badgeStorageLocations && typeof accreditationData.badgeStorageLocations === "object"
              ? accreditationData.badgeStorageLocations
              : {},
          printHistory: Array.isArray(accreditationData?.printHistory) ? accreditationData.printHistory : [],
        },
        userAssignmentSnapshots,
      },
      { merge: true },
    );
  }

  async function restoreEditionScopedData(editionId) {
    const normalizedEditionId = normalizeEditionId(editionId);
    const archiveSnapshot = await getDoc(doc(db, "editionArchives", normalizedEditionId));

    if (!archiveSnapshot.exists()) return;

    const archiveData = archiveSnapshot.data() || {};
    const userAssignmentSnapshots = Array.isArray(archiveData?.userAssignmentSnapshots)
      ? archiveData.userAssignmentSnapshots
      : [];
    const teamConfigurationSnapshot =
      archiveData?.teamConfigurationSnapshot && typeof archiveData.teamConfigurationSnapshot === "object"
        ? archiveData.teamConfigurationSnapshot
        : {};
    const accreditationSnapshot =
      archiveData?.accreditationSnapshot && typeof archiveData.accreditationSnapshot === "object"
        ? archiveData.accreditationSnapshot
        : {};
    const batch = writeBatch(db);

    userAssignmentSnapshots.forEach((userSnapshot) => {
      const userId = String(userSnapshot?.userId || userSnapshot?.uid || "").trim();
      if (!userId) return;

      batch.set(
        doc(db, "users", userId),
        {
          assignedRole: String(userSnapshot?.assignedRole || "").trim() || deleteField(),
          assignedTeams: Array.isArray(userSnapshot?.assignedTeams) ? userSnapshot.assignedTeams : [],
          assignmentStatus: String(userSnapshot?.assignmentStatus || "").trim() || "En attente",
          teamRole: String(userSnapshot?.teamRole || "").trim() || deleteField(),
          teamRoleAssignments:
            userSnapshot?.teamRoleAssignments && typeof userSnapshot.teamRoleAssignments === "object"
              ? userSnapshot.teamRoleAssignments
              : {},
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });

    batch.set(
      doc(db, ...TEAM_CONFIGURATION_DOC_PATH),
      {
        roles: Array.isArray(teamConfigurationSnapshot?.roles) ? teamConfigurationSnapshot.roles : [],
        teamAssignments: Array.isArray(teamConfigurationSnapshot?.teamAssignments)
          ? teamConfigurationSnapshot.teamAssignments
          : [],
        supportTasks: Array.isArray(teamConfigurationSnapshot?.supportTasks) ? teamConfigurationSnapshot.supportTasks : [],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    batch.set(
      doc(db, ...ACCREDITATION_CONFIGURATION_DOC_PATH),
      {
        volunteerOverrides:
          accreditationSnapshot?.volunteerOverrides && typeof accreditationSnapshot.volunteerOverrides === "object"
            ? accreditationSnapshot.volunteerOverrides
            : {},
        badgeStorageLocations:
          accreditationSnapshot?.badgeStorageLocations &&
          typeof accreditationSnapshot.badgeStorageLocations === "object"
            ? accreditationSnapshot.badgeStorageLocations
            : {},
        printHistory: Array.isArray(accreditationSnapshot?.printHistory) ? accreditationSnapshot.printHistory : [],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await batch.commit();
  }

  function renderRoleSummary() {
    if (activeRole === "admin") {
      return (
        <section className="panel-grid panel-grid--2">
          <Panel title="Mes priorités" subtitle="Les décisions et actions de pilotage à prendre aujourd'hui.">
            <ul className="compact-list">
              <li>{adminDataLoading ? "Chargement des candidatures bénévoles..." : `${pendingApplicationsCount} candidatures bénévoles à traiter`}</li>
              <li>{adminDataLoading ? "Chargement de la composition des équipes..." : `${incompleteTeamsCount} équipes encore incomplètes à sécuriser`}</li>
              <li>{documentsLoading ? "Chargement des documents..." : `${documents.length} document(s) publiés à relire ou diffuser`}</li>
              <li>{u14RequestsLoading ? "Chargement des demandes U14..." : `${submittedU14RequestsCount} demande(s) d'inscription au pré-programme reçue(s) à suivre`}</li>
            </ul>
          </Panel>
          <Panel title="Accès rapides" subtitle="Entrées directes vers les modules de pilotage.">
            <div className="dashboard-action-grid">
              <NavLink className="button button--secondary button-link" to="/app/benevoles">Gérer les bénévoles</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/roles">Gérer les rôles</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/postes">Ajuster les équipes</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/accreditations">Produire les badges</NavLink>
            </div>
          </Panel>
        </section>
      );
    }

    if (activeRole === "benevole") {
      return (
        <section className="panel-grid panel-grid--2">
          <Panel title="Mes priorités" subtitle="L'essentiel pour être prêt le jour du meeting.">
            <ul className="compact-list">
              <li>{volunteerDataLoading ? "Chargement de ton affectation..." : `Affectation actuelle: ${volunteerAssignmentSummary}`}</li>
              <li>Créneau prévu: {volunteerShiftSummary}</li>
              <li>Statut du dossier bénévole: {formatVolunteerApplicationStatus(volunteerApplication?.status)}</li>
              <li>{documentsLoading ? "Chargement des documents de mission..." : `${myDocumentsCount} document(s) disponible(s) pour tes équipes`}</li>
              <li>Briefing: {volunteerBriefingSummary}</li>
              <li>Après ta mission, pense à signaler ton départ à ton responsable pour débloquer ton certificat.</li>
            </ul>
          </Panel>
          <Panel title="Accès rapides" subtitle="Retrouve tes écrans bénévoles en un clic.">
            <div className="dashboard-action-grid">
              <NavLink className="button button--secondary button-link" to="/app/mes-affectations">Mes affectations</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/mes-documents">Mes documents</NavLink>
            </div>
          </Panel>
        </section>
      );
    }

    if (activeRole === "gestionnaire") {
      return (
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
              <NavLink className="button button--secondary button-link" to="/app/benevoles">Bénévoles</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/accreditations">Accréditations</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/presences">Présences</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/u14">Pré-programme</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/documents">Documents</NavLink>
            </div>
          </Panel>
        </section>
      );
    }

    if (activeRole === "parent_u14") {
      return (
        <section className="panel-grid panel-grid--2">
          <Panel title="Mes priorités" subtitle="Les prochains éléments à suivre pour mes enfants.">
            <ul className="compact-list">
              {parentRowsLoading ? <li>Chargement des demandes U14...</li> : null}
              {!parentRowsLoading && parentRequestRows.length === 0 ? <li>Aucune demande U14 liée à ce compte pour l'instant.</li> : null}
              {!parentRowsLoading && parentRequestRows.map((child) => (
                <li key={child.id}>{child.name}: {child.status} - {child.schedule}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="Accès rapides" subtitle="Tout le suivi parent centralisé dans un seul espace.">
            <div className="dashboard-action-grid">
              <NavLink className="button button--secondary button-link" to="/app/mes-enfants">Mes enfants</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/profil">Mon profil</NavLink>
            </div>
            {!parentRowsLoading && parentRequestRows.length > 0 ? (
              <p className="panel-note">{parentConfirmedCount} demande(s) confirmée(s), {parentPendingCount} encore en attente.</p>
            ) : null}
          </Panel>
        </section>
      );
    }

    if (activeRole === "chef_equipe") {
      return (
        <section className="panel-grid panel-grid--2">
          <Panel title="Mes priorités" subtitle="Ce qu'il faut suivre pour faire tourner l'équipe.">
            <ul className="compact-list">
              <li>{leadDataLoading ? "Chargement de tes équipes..." : totalOpenPositions > 0 ? `${totalOpenPositions} poste(s) encore ouvert(s) sur ${ledRoles.map((role) => role.roleName).join(", ")}` : "Toutes tes équipes ont atteint leur effectif prévu"}</li>
              <li>{leadDataLoading ? "Chargement des affectations..." : `${totalLeadMembers} membre(s) actuellement rattaché(s) à tes équipes`}</li>
              <li>{documentsLoading ? "Chargement des documents d'équipe..." : `${leadDocumentsCount} document(s) d'équipe déjà disponibles`}</li>
              <li>{leadDataLoading ? "Chargement des remplaçants..." : `${totalReplacements} remplaçant(s) actuellement identifié(s)`}</li>
              <li>Avant qu'un bénévole parte, pense à pointer son départ pour rendre son certificat disponible.</li>
            </ul>
          </Panel>
          <Panel title="Accès rapides" subtitle="Les outils de coordination chef d'équipe.">
            <div className="dashboard-action-grid">
              <NavLink className="button button--secondary button-link" to="/app/equipe">Mon équipe</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/presences">Présences</NavLink>
              <NavLink className="button button--secondary button-link" to="/app/mes-documents">Documents</NavLink>
            </div>
          </Panel>
        </section>
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
          <p>Ton compte centralise tes modules actifs et ouvre les bons parcours selon ton profil.</p>
        </div>
      </section>

      {activeRole === "admin" ? (
        <section className="panel-grid panel-grid--2">
          <Panel
            title="Édition active"
            subtitle="Les nouvelles candidatures bénévoles et pré-programme sont rattachées à cette édition."
          >
            <form className="profile-form" onSubmit={handleEditionSwitch}>
              <AuthEditionField
                activeEditionLabel={activeEditionLabel}
                editionDraft={editionDraft}
                editionLoading={editionLoading}
                onEditionDraftChange={setEditionDraft}
                preprogramOpeningDraft={preprogramOpeningDraft}
                onPreprogramOpeningDraftChange={setPreprogramOpeningDraft}
              />
              <div className="dashboard-action-grid">
                <button className="button button--primary" disabled={editionLoading} type="submit">
                  Changer d'édition
                </button>
                <button className="button button--secondary" type="button" onClick={() => setEditionDraft("test")}>
                  Passer sur test
                </button>
                <button className="button button--secondary" type="button" onClick={() => setEditionDraft("2027")}>
                  Préparer 2027
                </button>
              </div>
              {editionSaveStatus ? <p className="panel-note">{editionSaveStatus}</p> : null}
            </form>
          </Panel>
          <Panel title="Effet de la bascule" subtitle="Ce que la plateforme fera immédiatement après changement.">
            <ul className="compact-list">
              <li>Les comptes existants restent intacts dans `users`.</li>
              <li>Le module bénévole redevient vide pour la nouvelle édition tant qu'un nouveau dossier n'est pas rempli.</li>
              <li>Les inscriptions pré-programme repartent de zéro sur la nouvelle édition.</li>
              <li>Les données des anciennes éditions restent conservées en base et peuvent être consultées en rebasculant.</li>
            </ul>
          </Panel>
        </section>
      ) : null}

      <article className="info-card install-app-card">
        <h3>Ajoute MyCLIM à ton téléphone</h3>
        <p>Garde MyCLIM sous la main comme une vraie appli, directement depuis l'écran d'accueil.</p>
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
        <p className="install-app-note">Tu pourras lancer MyCLIM en un clic, comme une application classique.</p>
      </article>

      {renderRoleSummary()}

      {volunteerApplication ? (
        <section className="panel-grid panel-grid--2">
          <Panel
            title="Mon dossier bénévole"
            subtitle="Retrouve ici l'état de ta candidature et les informations transmises."
            actions={<NavLink className="button button--primary button-link" to="/app/mon-dossier-benevole">Ouvrir mon dossier</NavLink>}
          >
            <ul className="compact-list">
              <li>Statut: {volunteerApplication.status || "Candidature reçue"}</li>
              <li>Préférences: {Array.isArray(volunteerApplication.missionPreferences) && volunteerApplication.missionPreferences.length ? volunteerApplication.missionPreferences.join(", ") : "À compléter"}</li>
              <li>Disponibilités: {Array.isArray(volunteerApplication.availability) && volunteerApplication.availability.length ? volunteerApplication.availability.join(", ") : "À compléter"}</li>
            </ul>
          </Panel>
          <article className="info-card">
            <h3>Ce que tu peux faire ici</h3>
            <p>Relire ta candidature, compléter certaines réponses et garder tes informations bénévoles à jour sans recréer un compte.</p>
          </article>
        </section>
      ) : null}

      {shouldPromptParentToVolunteer ? (
        <section className="panel-grid panel-grid--2">
          <Panel
            title="Envie de rejoindre aussi les bénévoles ?"
            subtitle="Ton espace parent reste actif, et tu peux ajouter le parcours bénévole sur le même compte."
            actions={<NavLink className="button button--primary button-link" to="/app/mon-dossier-benevole">Devenir bénévole</NavLink>}
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

function AuthEditionField(props) {
  const {
    activeEditionLabel,
    editionDraft,
    editionLoading,
    onEditionDraftChange,
    preprogramOpeningDraft,
    onPreprogramOpeningDraftChange,
  } = props;

  return (
    <>
      <label className="field">
        <span>Identifiant d'édition</span>
        <input
          disabled={editionLoading}
          onChange={(event) => onEditionDraftChange(event.target.value)}
          placeholder="test ou 2027"
          value={editionDraft}
        />
      </label>
      <p className="panel-note">
        Édition actuellement visible dans l'application: {editionLoading ? "Chargement..." : activeEditionLabel}
      </p>
      <label className="field">
        <span>Ouverture pré-programme</span>
        <input
          disabled={editionLoading}
          onChange={(event) => onPreprogramOpeningDraftChange(event.target.value)}
          type="datetime-local"
          value={preprogramOpeningDraft}
        />
      </label>
    </>
  );
}

function formatDateTimeLocalValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export { AppShell, DashboardHome };
