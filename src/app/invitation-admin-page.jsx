import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { platformRoleOptions } from "./seed-data";

function getAppBaseUrl() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://myclim.netlify.app";
}

const ROLE_LABEL = Object.fromEntries(platformRoleOptions.map((r) => [r.value, r.label]));
const STATUS_LABEL = { pending: "En attente", accepted: "Acceptée", cancelled: "Annulée" };
const STATUS_COLOR = { pending: "#f59e0b", accepted: "#16a34a", cancelled: "#6b7280" };

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ── Create invitation form ──────────────────────────────── */
function InviteForm({ onSaved, onCancel }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roles, setRoles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function toggleRole(value) {
    setRoles((prev) => prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) { setError("L'adresse e-mail est requise."); return; }
    if (roles.length === 0) { setError("Sélectionnez au moins un module."); return; }
    setSaving(true);
    setError("");

    try {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invitationRef = doc(collection(db, "invitations"));

      await setDoc(invitationRef, {
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        roles,
        roleLabels: roles.map((r) => ROLE_LABEL[r] || r),
        token,
        status: "pending",
        createdAt: serverTimestamp(),
        expiresAt,
      });

      const activationUrl = `${getAppBaseUrl()}/invite?token=${token}`;

      // Send invitation email via mail function
      const { enqueueTransactionalMail, buildInvitationMail } = await import("../services/mailQueue");
      await enqueueTransactionalMail(buildInvitationMail({
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        roles: roles.map((r) => ROLE_LABEL[r] || r),
        activationUrl,
      }));

      setSent(true);
      setTimeout(() => { onSaved(); }, 1500);
    } catch (e) {
      setError(e.message || "Erreur lors de l'envoi.");
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = { fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#546770", display: "block", marginBottom: 6 };
  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", fontSize: "0.9rem", fontFamily: "inherit", boxSizing: "border-box" };

  if (sent) {
    return (
      <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 16, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>✅</div>
        <p style={{ fontWeight: 700, color: "#16a34a" }}>Invitation envoyée à {email}</p>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 16, padding: 32, maxWidth: 560 }}>
      <h3 style={{ margin: "0 0 24px 0", fontSize: "1rem", fontWeight: 700 }}>Nouvelle invitation</h3>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={labelStyle}>Adresse e-mail *</label>
          <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@example.com" required />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Prénom</label>
            <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Prénom" />
          </div>
          <div>
            <label style={labelStyle}>Nom</label>
            <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nom" />
          </div>
        </div>

        <div>
          <label style={{ ...labelStyle, marginBottom: 12 }}>Modules &amp; accès *</label>
          <div style={{ display: "grid", gap: 8 }}>
            {platformRoleOptions.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${roles.includes(opt.value) ? "#1066cc" : "rgba(0,0,0,0.12)"}`,
                  background: roles.includes(opt.value) ? "#f0f5ff" : "#fafafa",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={roles.includes(opt.value)}
                  onChange={() => toggleRole(opt.value)}
                  style={{ width: 16, height: 16, accentColor: "#1066cc" }}
                />
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{opt.label}</div>
                  <div style={{ fontSize: "0.78rem", color: "#546770" }}>{getRoleDescription(opt.value)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: "#fff0f0", border: "1px solid #f87171", borderRadius: 8, padding: "12px 16px", color: "#b91c1c", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Envoi en cours…" : "✉️ Envoyer l'invitation"}
          </button>
          <button type="button" onClick={onCancel} className="btn btn-ghost">Annuler</button>
        </div>
      </form>
    </div>
  );
}

function getRoleDescription(role) {
  const descriptions = {
    admin: "Accès complet à toute la plateforme",
    gestionnaire: "Gestion des bénévoles, présences, accréditations",
    gestionnaire_site: "Gestion du site public : actualités, partenaires, communiqués",
    chef_equipe: "Gestion de son équipe et pointage des présences",
    benevole: "Dossier bénévole, affectations, documents",
    parent_u14: "Inscription et suivi des enfants pré-programme",
  };
  return descriptions[role] || "";
}

/* ── Invitations list ────────────────────────────────────── */
export function InvitationAdminPage({ Panel }) {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionStatus, setActionStatus] = useState("");

  useEffect(() => {
    const q = query(collection(db, "invitations"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setInvitations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleResend(invitation) {
    setActionStatus("Renvoi en cours…");
    try {
      const token = invitation.token || crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await updateDoc(doc(db, "invitations", invitation.id), { token, status: "pending", expiresAt, resentAt: serverTimestamp() });
      const activationUrl = `${getAppBaseUrl()}/invite?token=${token}`;
      const { enqueueTransactionalMail, buildInvitationMail } = await import("../services/mailQueue");
      await enqueueTransactionalMail(buildInvitationMail({
        email: invitation.email,
        firstName: invitation.firstName,
        roles: Array.isArray(invitation.roleLabels) ? invitation.roleLabels : [],
        activationUrl,
      }));
      setActionStatus("Invitation renvoyée ✓");
    } catch (e) {
      setActionStatus(`Erreur : ${e.message}`);
    }
    setTimeout(() => setActionStatus(""), 3000);
  }

  async function handleCancel(invitation) {
    if (!window.confirm(`Annuler l'invitation de ${invitation.email} ?`)) return;
    await updateDoc(doc(db, "invitations", invitation.id), { status: "cancelled" });
  }

  async function handleDelete(invitation) {
    if (!window.confirm(`Supprimer définitivement l'invitation de ${invitation.email} ?`)) return;
    await deleteDoc(doc(db, "invitations", invitation.id));
  }

  const pending = invitations.filter((i) => i.status === "pending");
  const others = invitations.filter((i) => i.status !== "pending");

  if (creating) {
    return (
      <Panel title="Inviter un utilisateur">
        <InviteForm onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
      </Panel>
    );
  }

  return (
    <Panel
      title="Invitations"
      subtitle="Pré-enregistrez un compte et envoyez un lien d'activation par e-mail."
      actions={
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Nouvelle invitation
        </button>
      }
    >
      {actionStatus && (
        <p style={{ padding: "10px 16px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, color: "#16a34a", marginBottom: 16, fontSize: "0.875rem" }}>
          {actionStatus}
        </p>
      )}

      {loading ? (
        <p style={{ color: "#546770" }}>Chargement…</p>
      ) : invitations.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#546770" }}>
          <p>Aucune invitation pour le moment.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)} style={{ marginTop: 16 }}>
            + Nouvelle invitation
          </button>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#546770", margin: "0 0 12px 0" }}>
                En attente ({pending.length})
              </h3>
              <div className="table-wrap" style={{ marginBottom: 32 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>E-mail</th>
                      <th>Nom</th>
                      <th>Modules</th>
                      <th>Envoyée le</th>
                      <th>Expire le</th>
                      <th style={{ width: 160 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((inv) => (
                      <InvitationRow
                        key={inv.id}
                        invitation={inv}
                        onResend={handleResend}
                        onCancel={handleCancel}
                        onDelete={handleDelete}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {others.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#546770", margin: "0 0 12px 0" }}>
                Historique
              </h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>E-mail</th>
                      <th>Nom</th>
                      <th>Modules</th>
                      <th>Statut</th>
                      <th>Date</th>
                      <th style={{ width: 80 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {others.map((inv) => (
                      <InvitationRow
                        key={inv.id}
                        invitation={inv}
                        onResend={handleResend}
                        onCancel={handleCancel}
                        onDelete={handleDelete}
                        history
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

function InvitationRow({ invitation: inv, onResend, onCancel, onDelete, history }) {
  const name = [inv.firstName, inv.lastName].filter(Boolean).join(" ") || "—";
  const roles = Array.isArray(inv.roleLabels) ? inv.roleLabels : [];
  const expiresAt = inv.expiresAt?.toDate ? inv.expiresAt.toDate() : inv.expiresAt ? new Date(inv.expiresAt) : null;
  const expired = expiresAt && expiresAt < new Date();

  return (
    <tr>
      <td style={{ fontWeight: 600, fontSize: "0.875rem" }}>{inv.email}</td>
      <td style={{ fontSize: "0.875rem" }}>{name}</td>
      <td>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {roles.length
            ? roles.map((r) => (
                <span key={r} style={{ fontSize: "0.75rem", background: "#e8f0fe", color: "#1066cc", padding: "2px 8px", borderRadius: 99, fontWeight: 600, whiteSpace: "nowrap" }}>{r}</span>
              ))
            : <span style={{ color: "#999", fontSize: "0.8rem" }}>—</span>}
        </div>
      </td>
      {history ? (
        <td>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: STATUS_COLOR[inv.status] || "#546770" }}>
            {STATUS_LABEL[inv.status] || inv.status}
          </span>
        </td>
      ) : (
        <td style={{ fontSize: "0.8rem", color: expired ? "#e8001c" : "#546770" }}>
          {expiresAt ? expiresAt.toLocaleDateString("fr-FR") : "—"}
          {expired && <span style={{ marginLeft: 6, color: "#e8001c", fontWeight: 700 }}>Expiré</span>}
        </td>
      )}
      <td style={{ fontSize: "0.8rem", color: "#546770" }}>{formatDate(inv.createdAt)}</td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          {inv.status !== "accepted" && (
            <button className="btn btn-sm btn-secondary" onClick={() => onResend(inv)} title="Renvoyer l'invitation">
              ↺ Renvoyer
            </button>
          )}
          {inv.status === "pending" && (
            <button className="btn btn-sm btn-ghost" onClick={() => onCancel(inv)} title="Annuler">
              ✕
            </button>
          )}
          {inv.status !== "pending" && (
            <button className="btn btn-sm btn-danger" onClick={() => onDelete(inv)} title="Supprimer">
              Suppr.
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
