import { useMemo, useState } from "react";
import { buildUserIdentitySet, isTeamLeadAssignment } from "./common-helpers";
import { useTeamConfiguration } from "./config-hooks";
import { useAuth } from "../context/auth-context";

function TeamPage(props) {
  const { AuthFormField, DataTable, Panel } = props;
  const { currentUser, userProfile } = useAuth();
  const { roles, teamAssignments, loading, error } = useTeamConfiguration();
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [documentDraft, setDocumentDraft] = useState("");

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
  const myLeadAssignments = useMemo(
    () => myAssignments.filter((assignment) => isTeamLeadAssignment(assignment)),
    [isTeamLeadAssignment, myAssignments],
  );
  const myLeadRoleIds = useMemo(
    () =>
      roles
        .filter(
          (role) =>
            userIdentitySet.has(String(role.leaderName || "").trim().toLowerCase()) ||
            myLeadAssignments.some((assignment) => assignment.assignedRoleId === role.id),
        )
        .map((role) => role.id),
    [myLeadAssignments, roles, userIdentitySet],
  );
  const availableRoles = useMemo(() => {
    const visibleRoleIds = new Set([
      ...myLeadAssignments.map((assignment) => assignment.assignedRoleId),
      ...myLeadRoleIds,
    ]);
    return roles.filter((role) => visibleRoleIds.has(role.id));
  }, [myLeadAssignments, myLeadRoleIds, roles]);

  const effectiveSelectedRoleId =
    availableRoles.some((role) => role.id === selectedRoleId) ? selectedRoleId : availableRoles[0]?.id ?? "";
  const selectedRole = availableRoles.find((role) => role.id === effectiveSelectedRoleId) ?? availableRoles[0];
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

export { TeamPage };
