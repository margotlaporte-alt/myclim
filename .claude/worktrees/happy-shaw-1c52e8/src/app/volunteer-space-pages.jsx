import { useCallback, useMemo } from "react";
import { buildUserIdentitySet, getAssignedTeamNames } from "./common-helpers";
import { useTeamConfiguration } from "./config-hooks";
import { useDocumentsCollection } from "./documents-hooks";
import { buildParticipationCertificateMarkup, getRoundedParticipationHours, normalizePresenceRecord } from "./presence-helpers";
import { assignmentRows } from "./seed-data";
import { normalizeRole } from "./utils";
import { useAuth } from "../context/auth-context";

function MyAssignmentsPage(props) {
  const { DataTable, Panel } = props;
  const { currentUser, userProfile } = useAuth();
  const { roles, teamAssignments, loading, error } = useTeamConfiguration();
  const userIdentitySet = useMemo(
    () => buildUserIdentitySet(userProfile, currentUser),
    [buildUserIdentitySet, currentUser, userProfile],
  );
  const assignedTeamNames = useMemo(() => getAssignedTeamNames(userProfile), [getAssignedTeamNames, userProfile]);
  const myAssignments = useMemo(
    () =>
      teamAssignments.filter((member) =>
        [member.id, member.email, `${member.firstName} ${member.lastName}`.trim()]
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
  const availableAssignments = useMemo(() => {
    if (myAssignments.length) return myAssignments;
    return fallbackProfileAssignment ? [fallbackProfileAssignment] : [];
  }, [fallbackProfileAssignment, myAssignments]);
  const assignmentDetails = useMemo(
    () =>
      availableAssignments.map((assignment, index) => {
        const selectedRole =
          roles.find(
            (role) =>
              normalizeRole(role.id) === normalizeRole(assignment?.assignedRoleId) ||
              normalizeRole(role.roleName) === normalizeRole(assignment?.assignedRole || fallbackAssignment.team),
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

              <Panel title="Mon équipe" subtitle="Composition actuelle de l'équipe liée à cette affectation.">
                <DataTable
                  columns={[
                    { key: "name", label: "Nom" },
                    { key: "role", label: "Fonction" },
                    { key: "contact", label: "Contact" },
                  ]}
                  rows={teamRows.length ? teamRows : [{ name: "Composition non disponible", role: "-", contact: "-" }]}
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
        <Panel title="Mes affectations" subtitle="Ton affectation n'est pas encore disponible pour le moment.">
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

function MyDocumentsPage(props) {
  const { DataTable, Panel, getDocumentConsultationUrl, getTimestampMs, signatory } = props;
  const { userProfile } = useAuth();
  const { documents, loading: documentsLoading, error: documentsError } = useDocumentsCollection(true);

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
  const participationHours = useMemo(
    () => getRoundedParticipationHours(userProfile?.presence, getTimestampMs),
    [getTimestampMs, userProfile?.presence],
  );
  const canGenerateCertificate = participationHours > 0;

  const openParticipationCertificate = useCallback(() => {
    if (typeof window === "undefined" || !canGenerateCertificate) return;

    const printWindow = window.open("", "_blank", "width=1100,height=850");
    if (!printWindow) return;

    const markup = buildParticipationCertificateMarkup({
      fullName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim() || userProfile?.email || "Volunteer",
      teamName: assignedTeams[0] || "Volunteer Team",
      roleLabel: userProfile?.teamRole || "Volunteer",
      roundedHours: participationHours,
      signatory,
    });

    printWindow.document.write(markup);
    printWindow.document.close();
  }, [assignedTeams, canGenerateCertificate, participationHours, signatory, userProfile]);

  const documentRows = useMemo(
    () => {
      const rows = availableDocuments.map((document) => ({
        title: document.title,
        team: document.scope === "global" ? "Global" : document.teams.join(", "),
        open: (
          <button
            className="button button--secondary"
            type="button"
            disabled={!getDocumentConsultationUrl(document)}
            onClick={() => window.open(getDocumentConsultationUrl(document), "_blank", "noopener,noreferrer")}
          >
            {document.fileName || document.reference || "Ouvrir"}
          </button>
        ),
      }));

      rows.unshift({
        title: "Certificate of Participation",
        team: assignedTeams[0] || "Volunteer Team",
        open: (
          <button
            className="button button--secondary"
            type="button"
            disabled={!canGenerateCertificate}
            onClick={openParticipationCertificate}
          >
            {canGenerateCertificate ? "Generate" : "Not available yet"}
          </button>
        ),
      });

      return rows;
    },
    [
      assignedTeams,
      availableDocuments,
      canGenerateCertificate,
      getDocumentConsultationUrl,
      openParticipationCertificate,
    ],
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
                    title: assignedTeams.length ? "Aucun document disponible" : "Aucun document global disponible",
                    team: assignedTeams.join(", ") || "En attente d'affectation",
                    open: "-",
                  },
                ]
          }
        />
        <p className="panel-note">
          {canGenerateCertificate
            ? "Your participation certificate is now available. You can generate it whenever you need it."
            : "Your participation certificate will become available after your departure has been recorded by your team lead or by the welcome desk."}
        </p>
      </Panel>
    </div>
  );
}

export { MyAssignmentsPage, MyDocumentsPage };
