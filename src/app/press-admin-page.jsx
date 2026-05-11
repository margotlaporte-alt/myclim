import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { ACCREDITATION_PRINT_STATUS_OPTIONS } from "./accreditation-config";

const PRESS_REGISTRATION_STATUS_OPTIONS = ["pending_review", "accepted", "rejected"];

const STATUS_LABELS = {
  pending_review: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
};

const STATUS_PILL_CLASS = {
  pending_review: "workflow-pill workflow-pill--received",
  accepted: "workflow-pill workflow-pill--confirmed",
  rejected: "workflow-pill workflow-pill--cancelled",
};

const REQUEST_TYPE_LABELS = {
  press: "Presse",
  photographer: "Photographe",
};

const ZONE_LABELS_BY_TYPE = {
  press: "Mixed Zone",
  photographer: "Mixed Zone + Infield",
};

function formatDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PressAdminPage({ Panel, loadMailQueueModule }) {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [rejectionComment, setRejectionComment] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "pressRegistrations"),
      (snapshot) => {
        const docs = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aMs = a.submittedAt?.toMillis?.() || 0;
            const bMs = b.submittedAt?.toMillis?.() || 0;
            return bMs - aMs;
          });
        setRegistrations(docs);
        setLoading(false);
        setError("");
      },
      () => {
        setLoading(false);
        setError("Impossible de charger les demandes presse.");
      },
    );
    return unsubscribe;
  }, []);

  const filtered = registrations.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (typeFilter !== "all" && r.requestType !== typeFilter) return false;
    return true;
  });

  const selected = registrations.find((r) => r.id === selectedId) ?? null;
  const effectiveSelectedId =
    registrations.some((r) => r.id === selectedId) ? selectedId : registrations[0]?.id ?? "";
  const effectiveSelected = registrations.find((r) => r.id === effectiveSelectedId) ?? null;

  const countByStatus = registrations.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  async function acceptRegistration(registration) {
    if (isProcessing) return;
    setIsProcessing(true);
    setActionStatus("");

    try {
      const zoneIds =
        registration.requestType === "photographer"
          ? ["zone-infield", "zone-mixed"]
          : ["zone-mixed"];

      await updateDoc(doc(db, "pressRegistrations", registration.id), {
        status: "accepted",
        zoneIds,
        printStatus: "Non-imprimé",
        processedAt: serverTimestamp(),
        rejectionComment: "",
      });

      if (registration.email && loadMailQueueModule) {
        const { buildPressRegistrationDecisionMail, enqueueTransactionalMail } =
          await loadMailQueueModule();
        await enqueueTransactionalMail(
          buildPressRegistrationDecisionMail({
            email: registration.email,
            firstName: registration.firstName,
            requestType: registration.requestType,
            decision: "accepted",
          }),
        );
      }

      setActionStatus("Demande acceptée. Un email a été envoyé au demandeur.");
      setShowRejectForm(false);
      setRejectionComment("");
    } catch (err) {
      console.error("Press accept failed", err);
      setActionStatus("Impossible d'accepter la demande pour le moment.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function rejectRegistration(registration) {
    if (isProcessing) return;
    setIsProcessing(true);
    setActionStatus("");

    try {
      await updateDoc(doc(db, "pressRegistrations", registration.id), {
        status: "rejected",
        rejectionComment: rejectionComment.trim(),
        processedAt: serverTimestamp(),
      });

      if (registration.email && loadMailQueueModule) {
        const { buildPressRegistrationDecisionMail, enqueueTransactionalMail } =
          await loadMailQueueModule();
        await enqueueTransactionalMail(
          buildPressRegistrationDecisionMail({
            email: registration.email,
            firstName: registration.firstName,
            requestType: registration.requestType,
            decision: "rejected",
            rejectionComment: rejectionComment.trim(),
          }),
        );
      }

      setActionStatus("Demande refusée. Un email a été envoyé au demandeur.");
      setShowRejectForm(false);
      setRejectionComment("");
    } catch (err) {
      console.error("Press reject failed", err);
      setActionStatus("Impossible de refuser la demande pour le moment.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function updatePrintStatus(registration, printStatus) {
    if (isProcessing) return;
    setIsProcessing(true);
    setActionStatus("");

    try {
      await updateDoc(doc(db, "pressRegistrations", registration.id), { printStatus });
      setActionStatus("Statut d'impression mis à jour.");
    } catch (err) {
      console.error("Press print status update failed", err);
      setActionStatus("Impossible de mettre à jour le statut d'impression.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="admin-stack">
      <section className="panel-head">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Demandes d'accréditation presse</h1>
          <p>Gestion des demandes d'accréditation presse et photographe pour le CMCM Luxembourg Indoor Meeting.</p>
        </div>
      </section>

      <Panel title="Vue d'ensemble">
        <div className="accreditation-person-summary">
          <div className="team-summary-pill">
            <strong>{registrations.length}</strong>
            <span>Demande(s) reçue(s)</span>
          </div>
          <div className="team-summary-pill">
            <strong>{countByStatus.pending_review ?? 0}</strong>
            <span>En attente</span>
          </div>
          <div className="team-summary-pill">
            <strong>{countByStatus.accepted ?? 0}</strong>
            <span>Acceptée(s)</span>
          </div>
          <div className="team-summary-pill">
            <strong>{countByStatus.rejected ?? 0}</strong>
            <span>Refusée(s)</span>
          </div>
        </div>
      </Panel>

      <Panel title="Liste des demandes" subtitle="Cliquez sur une demande pour afficher le détail et prendre une décision.">
        {loading ? <p className="panel-note">Chargement des demandes...</p> : null}
        {error ? <p className="panel-note">{error}</p> : null}

        <div className="admin-toolbar">
          <label className="field">
            <span>Statut</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Tous les statuts</option>
              {PRESS_REGISTRATION_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Type</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">Tous les types</option>
              <option value="press">Presse</option>
              <option value="photographer">Photographe</option>
            </select>
          </label>
        </div>

        {!loading && filtered.length === 0 ? (
          <div className="placeholder-card">
            <p className="eyebrow">Aucune demande</p>
            <h2>Aucun résultat pour ces filtres</h2>
            <p>Modifiez les filtres ou attendez de nouvelles demandes via le formulaire public.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table data-table--admin">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Média</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={r.id === effectiveSelectedId ? "data-table__row--selected" : ""}>
                    <td>{`${r.firstName || ""} ${r.lastName || ""}`.trim() || "—"}</td>
                    <td>{r.media || "—"}</td>
                    <td>{REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType ?? "—"}</td>
                    <td>
                      <span className={STATUS_PILL_CLASS[r.status] ?? "workflow-pill"}>
                        {STATUS_LABELS[r.status] ?? r.status ?? "—"}
                      </span>
                    </td>
                    <td>{formatDate(r.submittedAt)}</td>
                    <td>
                      <button
                        className="button button--secondary button--small"
                        type="button"
                        onClick={() => {
                          setSelectedId(r.id);
                          setShowRejectForm(false);
                          setRejectionComment("");
                          setActionStatus("");
                        }}
                      >
                        Détail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {effectiveSelected ? (
        <Panel
          title={`Détail — ${effectiveSelected.firstName || ""} ${effectiveSelected.lastName || ""}`.trim()}
          subtitle={effectiveSelected.media || ""}
        >
          {actionStatus ? (
            <p className="panel-note panel-note--success">{actionStatus}</p>
          ) : null}

          <div className="accreditation-inline-panel">
            <div className="field-grid">
              <div>
                <p className="eyebrow">Identité</p>
                <p>
                  <strong>{`${effectiveSelected.firstName || ""} ${effectiveSelected.lastName || ""}`.trim()}</strong>
                </p>
                <p>{effectiveSelected.role || "—"}</p>
                <p>{effectiveSelected.media || "—"}</p>
              </div>
              <div>
                <p className="eyebrow">Contact</p>
                <p>{effectiveSelected.email || "—"}</p>
                <p>{effectiveSelected.phone || "—"}</p>
              </div>
            </div>

            <div className="field-grid">
              <div>
                <p className="eyebrow">Type de demande</p>
                <p><strong>{REQUEST_TYPE_LABELS[effectiveSelected.requestType] ?? effectiveSelected.requestType}</strong></p>
                <p className="panel-note" style={{ marginTop: 4 }}>
                  Accès : {ZONE_LABELS_BY_TYPE[effectiveSelected.requestType] ?? "—"}
                </p>
              </div>
              <div>
                <p className="eyebrow">Statut</p>
                <span className={STATUS_PILL_CLASS[effectiveSelected.status] ?? "workflow-pill"}>
                  {STATUS_LABELS[effectiveSelected.status] ?? effectiveSelected.status}
                </span>
                {effectiveSelected.status === "accepted" ? (
                  <p className="panel-note" style={{ marginTop: 8 }}>
                    Impression : {effectiveSelected.printStatus || "Non-imprimé"}
                  </p>
                ) : null}
                {effectiveSelected.status === "rejected" && effectiveSelected.rejectionComment ? (
                  <p className="panel-note" style={{ marginTop: 8 }}>
                    Motif : {effectiveSelected.rejectionComment}
                  </p>
                ) : null}
              </div>
            </div>

            {effectiveSelected.comment ? (
              <div>
                <p className="eyebrow">Commentaire du demandeur</p>
                <p>{effectiveSelected.comment}</p>
              </div>
            ) : null}

            <div>
              <p className="eyebrow">Soumis le</p>
              <p>{formatDate(effectiveSelected.submittedAt)}</p>
              {effectiveSelected.processedAt ? (
                <p>Traité le : {formatDate(effectiveSelected.processedAt)}</p>
              ) : null}
            </div>
          </div>

          {effectiveSelected.status === "pending_review" ? (
            <div className="table-actions table-actions--inline" style={{ marginTop: 16 }}>
              <button
                className="button button--primary"
                type="button"
                disabled={isProcessing}
                onClick={() => acceptRegistration(effectiveSelected)}
              >
                Accepter la demande
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setShowRejectForm((v) => !v);
                  setRejectionComment("");
                }}
              >
                Refuser la demande
              </button>
            </div>
          ) : null}

          {effectiveSelected.status === "pending_review" && showRejectForm ? (
            <div className="accreditation-inline-panel" style={{ marginTop: 12 }}>
              <label className="field">
                <span>Motif du refus (optionnel — inclus dans l'email)</span>
                <textarea
                  rows="2"
                  placeholder="Ex: zone de photographes complète pour cette édition."
                  value={rejectionComment}
                  onChange={(e) => setRejectionComment(e.target.value)}
                />
              </label>
              <div className="table-actions table-actions--inline" style={{ marginTop: 8 }}>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={isProcessing}
                  onClick={() => rejectRegistration(effectiveSelected)}
                >
                  Confirmer le refus
                </button>
              </div>
            </div>
          ) : null}

          {effectiveSelected.status === "accepted" ? (
            <div style={{ marginTop: 16 }}>
              <label className="field">
                <span>Statut d'impression du badge</span>
                <select
                  value={effectiveSelected.printStatus || "Non-imprimé"}
                  disabled={isProcessing}
                  onChange={(e) => updatePrintStatus(effectiveSelected, e.target.value)}
                >
                  {ACCREDITATION_PRINT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

export { PressAdminPage };
