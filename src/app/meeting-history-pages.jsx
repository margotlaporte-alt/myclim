import { useMemo, useState } from "react";
import { useAuth } from "../context/auth-context";
import { getActiveRoles } from "./navigation";
import {
  MEETING_EDITIONS_COL,
  clearResultsForYear,
  closeEdition,
  deleteResult,
  saveResult,
  seedMeetingDatabase,
  setEditionVisibility,
  useAllWinners,
  useMeetingEditions,
  useMeetingRecords,
  useMeetingResultsForYear,
} from "./meeting-history-hooks";
import { useAthleteRegistry } from "./athlete-portal-hooks";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FLAG_BASE = "https://flagcdn.com/20x15";
const NOC_TO_ISO2 = {
  ALG: "dz", AND: "ad", ARG: "ar", AUS: "au", AUT: "at",
  BAH: "bs", BEL: "be", BGR: "bg", BLR: "by", BRA: "br", BUL: "bg",
  CAN: "ca", CHI: "cl", CHN: "cn", CIV: "ci", COL: "co", CRO: "hr",
  CYP: "cy", CZE: "cz",
  DEN: "dk", DEU: "de",
  ESP: "es", EST: "ee", ETH: "et",
  FIN: "fi", FRA: "fr",
  GBR: "gb", GER: "de", GHA: "gh", GRE: "gr",
  HUN: "hu",
  IRL: "ie", ISR: "il", ITA: "it",
  JAM: "jm", JPN: "jp",
  KEN: "ke", KOR: "kr",
  LAT: "lv", LBR: "lr", LTU: "lt", LUX: "lu",
  MAR: "ma", MDA: "md", MRI: "mu",
  NED: "nl", NGR: "ng", NLD: "nl", NOR: "no", NZL: "nz",
  POL: "pl", POR: "pt", PRT: "pt",
  QAT: "qa",
  ROM: "ro", ROU: "ro", RSA: "za", RUS: "ru",
  SLO: "si", SRB: "rs", STP: "st", SUI: "ch", SVK: "sk", SWE: "se",
  TUR: "tr",
  UKR: "ua", USA: "us",
  ZAF: "za", ZIM: "zw",
};

function FlagImg({ noc }) {
  const iso = NOC_TO_ISO2[noc?.toUpperCase()];
  if (!iso) return <span style={{ fontSize: "0.75rem", color: "#888" }}>{noc || ""}</span>;
  return (
    <img
      src={`${FLAG_BASE}/${iso}.png`}
      alt={noc}
      width={20}
      height={15}
      style={{ verticalAlign: "middle", marginRight: 4, borderRadius: 2 }}
      onError={(e) => { e.target.style.display = "none"; }}
    />
  );
}

function RankBadge({ rank }) {
  const colors = { 1: "#f5c842", 2: "#b0b8c1", 3: "#cd7f32" };
  const bg = colors[rank] || "#e5e7eb";
  const color = rank <= 3 ? "#1a1a1a" : "#374151";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 24, height: 24, borderRadius: "50%",
      background: bg, color, fontWeight: 700, fontSize: "0.78rem",
    }}>
      {rank}
    </span>
  );
}

function GenderTag({ gender }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 7px",
      borderRadius: 20,
      fontSize: "0.72rem",
      fontWeight: 700,
      background: gender === "W" ? "#fce7f3" : "#dbeafe",
      color: gender === "W" ? "#be185d" : "#1d4ed8",
      letterSpacing: "0.04em",
    }}>
      {gender === "W" ? "Women" : "Men"}
    </span>
  );
}

function SeedButton({ onSeed, seeding, seedLog }) {
  return (
    <div>
      <button
        className="btn btn--primary"
        onClick={onSeed}
        disabled={seeding}
        style={{ marginBottom: "0.5rem" }}
      >
        {seeding ? "Seeding…" : "🌱 Seed historical data"}
      </button>
      {seedLog.length > 0 && (
        <div style={{
          marginTop: "0.5rem",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: "0.75rem 1rem",
          fontFamily: "monospace",
          fontSize: "0.8rem",
          color: "#374151",
          maxHeight: 160,
          overflowY: "auto",
        }}>
          {seedLog.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Result form ──────────────────────────────────────────────────────────────

const EMPTY_RESULT = { discipline: "", gender: "M", round: "", heat: "", rank: 1, lastName: "", firstName: "", noc: "", result: "", yob: "", points: "" };

function ResultForm({ year, initial, onSave, onCancel }) {
  const [data, setData] = useState({ ...EMPTY_RESULT, year: Number(year), ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (field, value) => setData((p) => ({ ...p, [field]: value }));

  async function handleSave() {
    if (!data.discipline.trim()) { setError("Discipline requise."); return; }
    if (!data.lastName.trim()) { setError("Nom requis."); return; }
    setSaving(true); setError("");
    try {
      await onSave({ ...data, year: Number(year), rank: Number(data.rank) || 1, yob: data.yob ? Number(data.yob) : null, points: data.points !== "" ? Number(data.points) : null });
    } catch (e) {
      setError(e.message || "Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  const inp = { padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: "0.875rem", fontFamily: "inherit", width: "100%" };

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginTop: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 14, fontSize: "0.9rem" }}>{initial?.id ? "Modifier un résultat" : "Ajouter un résultat"} — {year}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Discipline *</label>
          <input style={inp} value={data.discipline} onChange={(e) => set("discipline", e.target.value)} placeholder="ex: 60m" />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Genre</label>
          <select style={inp} value={data.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="M">Hommes (M)</option>
            <option value="W">Femmes (W)</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Round</label>
          <input style={inp} value={data.round} onChange={(e) => set("round", e.target.value)} placeholder="Final A / Final B / Heats combines…" />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Série</label>
          <input style={inp} value={data.heat} onChange={(e) => set("heat", e.target.value)} placeholder="S1 / S2 / S3…" />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Rang *</label>
          <input type="number" style={inp} value={data.rank} onChange={(e) => set("rank", e.target.value)} min={1} />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Nom *</label>
          <input style={inp} value={data.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="NOM" />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Prénom</label>
          <input style={inp} value={data.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Prénom" />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>NOC</label>
          <input style={inp} value={data.noc} onChange={(e) => set("noc", e.target.value.toUpperCase())} placeholder="FRA" maxLength={3} />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Résultat</label>
          <input style={inp} value={data.result} onChange={(e) => set("result", e.target.value)} placeholder="6.58" />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Année naissance</label>
          <input type="number" style={inp} value={data.yob} onChange={(e) => set("yob", e.target.value)} placeholder="1998" />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Points</label>
          <input type="number" style={inp} value={data.points} onChange={(e) => set("points", e.target.value)} placeholder="—" />
        </div>
      </div>
      {error && <p style={{ color: "#dc2626", fontSize: "0.8rem", marginTop: 8 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="btn btn--primary" onClick={handleSave} disabled={saving} style={{ fontSize: "0.85rem" }}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button className="btn" onClick={onCancel} style={{ fontSize: "0.85rem" }}>Annuler</button>
      </div>
    </div>
  );
}

// ─── Meeting History page ─────────────────────────────────────────────────────

// Build a lookup index from athlete registry: "lastname_yob" → registry entry
function useRegistryIndex() {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const canAccess = roles.includes("admin") || roles.includes("meeting_director");
  const { registry } = useAthleteRegistry(canAccess);
  return useMemo(() => {
    const idx = new Map();
    for (const a of registry) {
      const yob = a.birthYear ?? (a.birthDate ? Number(a.birthDate.slice(0, 4)) : null);
      const key = `${String(a.lastName || "").toLowerCase()}_${yob ?? ""}`;
      if (!idx.has(key)) idx.set(key, a);
    }
    return idx;
  }, [registry]);
}

function AthleteNameCell({ lastName, firstName, yob, registryIdx, style }) {
  const key = `${String(lastName || "").toLowerCase()}_${yob ?? ""}`;
  const entry = registryIdx?.get(key);
  const fullName = `${lastName || ""}${firstName ? " " + firstName : ""}`;

  if (entry?.waUrl) {
    return (
      <a
        href={entry.waUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...style, color: "#1d4ed8", textDecoration: "none", fontWeight: 600 }}
        title={`World Athletics profile${entry.waid ? ` · WAID ${entry.waid}` : ""}`}
      >
        {fullName}
        <span style={{ marginLeft: 4, fontSize: "0.68rem", opacity: 0.55 }}>↗</span>
      </a>
    );
  }
  if (entry) {
    // In registry but no WA URL yet
    return (
      <span style={{ ...style, fontWeight: 600 }} title="In athlete database">
        {fullName}
        <span style={{ marginLeft: 4, fontSize: "0.65rem", color: "#6b7280" }}>●</span>
      </span>
    );
  }
  return <span style={{ ...style, fontWeight: 600 }}>{fullName}</span>;
}

function MeetingHistoryPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const isAdmin = roles.includes("admin");

  const { editions, loading: editionsLoading } = useMeetingEditions();
  const [selectedYear, setSelectedYear] = useState(null);
  const [closingYear, setClosingYear] = useState(null);
  const [closeStatus, setCloseStatus] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [seedLog, setSeedLog] = useState([]);
  const [addingResult, setAddingResult] = useState(false);
  const [editingResult, setEditingResult] = useState(null);
  const registryIdx = useRegistryIndex();

  // Pick the most recent non-closed edition by default once loaded
  const effectiveYear = selectedYear
    ?? editions.find((e) => !e.isClosed)?.year
    ?? editions[0]?.year
    ?? null;

  const { results, loading: resultsLoading } = useMeetingResultsForYear(effectiveYear);

  // Group results by discipline + gender + round
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of results) {
      const key = `${r.discipline}||${r.gender}||${r.round || ""}`;
      if (!map.has(key)) map.set(key, { discipline: r.discipline, gender: r.gender, round: r.round || "", rows: [] });
      map.get(key).rows.push(r);
    }
    return [...map.values()].sort((a, b) => {
      const dc = String(a.discipline).localeCompare(String(b.discipline));
      if (dc !== 0) return dc;
      return a.gender === "W" ? -1 : 1;
    });
  }, [results]);

  async function handleSeed() {
    setSeeding(true);
    setSeedLog([]);
    try {
      const result = await seedMeetingDatabase((msg) => setSeedLog((prev) => [...prev, msg]));
      setSeedLog((prev) => [...prev, `✅ ${result}`]);
    } catch (err) {
      setSeedLog((prev) => [...prev, `❌ Error: ${err.message}`]);
    } finally {
      setSeeding(false);
    }
  }

  async function handleCloseEdition() {
    if (!effectiveYear || !results.length) return;
    const confirmed = window.confirm(
      `Close edition ${effectiveYear}? This will update the athlete registry with participation data.`,
    );
    if (!confirmed) return;
    setClosingYear(effectiveYear);
    setCloseStatus(null);
    try {
      const msg = await closeEdition(effectiveYear, results, (m) => setCloseStatus(m));
      setCloseStatus(msg);
    } catch (err) {
      setCloseStatus(`Error: ${err.message}`);
    } finally {
      setClosingYear(null);
    }
  }

  async function handleSaveResult(data) {
    await saveResult(editingResult?.id || null, data);
    setAddingResult(false);
    setEditingResult(null);
  }

  async function handleDeleteResult(id, label) {
    if (!window.confirm(`Supprimer ce résultat (${label}) ?`)) return;
    await deleteResult(id);
  }

  async function handleToggleVisibility(year, currentVisible) {
    await setEditionVisibility(year, !currentVisible);
  }

  const selectedEdition = editions.find((e) => e.year === effectiveYear);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Meeting History</p>
          <h1>Edition Results</h1>
          <p>Full results for each edition of the Luxembourg Indoor Meeting.</p>
        </div>
      </section>

      {/* Edition picker */}
      <section className="panel-grid panel-grid--1">
        <Panel title="Select edition">
          {editionsLoading ? (
            <p className="panel-note">Loading editions…</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              {editions.map((ed) => (
                ed.cancelled ? (
                  <span
                    key={ed.year}
                    title={ed.note}
                    style={{
                      padding: "0.35rem 0.9rem",
                      borderRadius: 20,
                      border: "1.5px dashed #d1d5db",
                      background: "#f9fafb",
                      color: "#9ca3af",
                      fontSize: "0.88rem",
                      cursor: "default",
                      userSelect: "none",
                      textDecoration: "line-through",
                    }}
                  >
                    {ed.year}
                  </span>
                ) : (
                  <div key={ed.year} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <button
                      onClick={() => setSelectedYear(ed.year)}
                      style={{
                        padding: "0.35rem 0.9rem",
                        borderRadius: 20,
                        border: "1.5px solid",
                        cursor: "pointer",
                        fontWeight: effectiveYear === ed.year ? 700 : 400,
                        background: effectiveYear === ed.year ? "#1d4ed8" : "#f8fafc",
                        color: effectiveYear === ed.year ? "#fff" : "#374151",
                        borderColor: effectiveYear === ed.year ? "#1d4ed8" : "#cbd5e1",
                        fontSize: "0.88rem",
                        opacity: ed.visibleInStats === false ? 0.45 : 1,
                      }}
                    >
                      {ed.year}
                      {ed.isClosed && (
                        <span style={{ marginLeft: 4, fontSize: "0.68rem", opacity: 0.75 }}>✓</span>
                      )}
                    </button>
                    {isAdmin && (
                      <label title="Visible dans les statistiques publiques" style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: "0.68rem", color: "#6b7280" }}>
                        <input
                          type="checkbox"
                          checked={ed.visibleInStats !== false}
                          onChange={() => handleToggleVisibility(ed.year, ed.visibleInStats !== false)}
                          style={{ width: 12, height: 12 }}
                        />
                        stats
                      </label>
                    )}
                  </div>
                )
              ))}
            </div>
          )}

          {selectedEdition && (
            selectedEdition.cancelled ? (
              <div style={{
                marginTop: "0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.6rem 1rem",
                background: "#fef9c3",
                border: "1px solid #fde047",
                borderRadius: 8,
                fontSize: "0.85rem",
                color: "#854d0e",
              }}>
                <span style={{ fontSize: "1.1rem" }}>🚫</span>
                <span><strong>{selectedEdition.year}</strong> — {selectedEdition.note}</span>
              </div>
            ) : (
              <div style={{
                marginTop: "0.75rem",
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                alignItems: "center",
                fontSize: "0.85rem",
                color: "#555",
              }}>
                <span>📅 {selectedEdition.date}</span>
                <span>🏟 {selectedEdition.venue}</span>
                {selectedEdition.edition && <span>🏆 Edition #{selectedEdition.edition}</span>}
                {selectedEdition.label && <span>🏅 {selectedEdition.label}</span>}
                {selectedEdition.isClosed && (
                  <span style={{
                    background: "#dcfce7", color: "#15803d",
                    padding: "2px 8px", borderRadius: 12, fontWeight: 600, fontSize: "0.75rem",
                  }}>Closed</span>
                )}
              </div>
            )
          )}
        </Panel>
      </section>

      {/* Results */}
      <section className="panel-grid panel-grid--1">
        <Panel
          title={`Results — ${effectiveYear ?? "—"}`}
          subtitle={resultsLoading ? "Loading…" : `${results.length} entries, ${groups.length} events`}
          actions={
            isAdmin && effectiveYear ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                {closeStatus && (
                  <span style={{ fontSize: "0.8rem", color: "#15803d", maxWidth: 260 }}>
                    {closeStatus}
                  </span>
                )}
                <button
                  className="btn btn--secondary"
                  onClick={() => { setAddingResult(true); setEditingResult(null); }}
                  style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}
                >
                  + Ajouter un résultat
                </button>
                {!selectedEdition?.isClosed && results.length > 0 && (
                  <button
                    className="btn btn--secondary"
                    onClick={handleCloseEdition}
                    disabled={closingYear === effectiveYear}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {closingYear === effectiveYear ? "Closing…" : "🔒 Close edition"}
                  </button>
                )}
              </div>
            ) : null
          }
        >
          {(addingResult || editingResult) && isAdmin && (
            <ResultForm
              year={effectiveYear}
              initial={editingResult || {}}
              onSave={handleSaveResult}
              onCancel={() => { setAddingResult(false); setEditingResult(null); }}
            />
          )}
          {resultsLoading ? (
            <p className="panel-note">Loading results…</p>
          ) : results.length === 0 ? (
            <div className="notice-card">
              <strong>No results found for {effectiveYear}</strong>
              <p>
                {isAdmin
                  ? 'Use the "Seed historical data" button in the Admin panel below to import data, or click "+ Ajouter un résultat" to add manually.'
                  : 'Results for this edition are not yet available.'}
              </p>
            </div>
          ) : (
            <div className="table-wrap table-wrap--athletes" style={{ maxHeight: "calc(100vh - 320px)" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>Rk</th>
                    <th>Event</th>
                    <th data-sticky-col="1" className="col-sticky col-sticky--last">Athlete</th>
                    <th>Nat.</th>
                    <th>Result</th>
                    <th style={{ width: 44 }}>Série</th>
                    <th>YOB</th>
                    <th>Pts</th>
                    {isAdmin && <th style={{ width: 80 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((grp) => [
                    // Event group header
                    <tr key={`grp-${grp.discipline}-${grp.gender}-${grp.round}`} className="event-group-header">
                      <td colSpan={isAdmin ? 8 : 7} style={{ paddingTop: "0.65rem", paddingBottom: "0.4rem" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.88rem", marginRight: 8 }}>
                          {grp.discipline}
                        </span>
                        <GenderTag gender={grp.gender} />
                        {grp.round && (
                          <span style={{ marginLeft: 8, fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", background: "#f3f4f6", padding: "1px 7px", borderRadius: 10 }}>
                            {grp.round}
                          </span>
                        )}
                      </td>
                    </tr>,
                    // Result rows
                    ...grp.rows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ textAlign: "center" }}>
                          <RankBadge rank={r.rank} />
                        </td>
                        <td style={{ fontSize: "0.78rem", color: "#888" }}>{r.discipline}</td>
                        <td className="col-sticky col-sticky--last">
                          <AthleteNameCell
                            lastName={r.lastName}
                            firstName={r.firstName}
                            yob={r.yob}
                            registryIdx={registryIdx}
                          />
                        </td>
                        <td>
                          <FlagImg noc={r.noc} />
                          {r.noc}
                        </td>
                        <td style={{ fontWeight: 600, fontFamily: "monospace" }}>
                          {r.result || "—"}
                        </td>
                        <td style={{ color: "#6b7280", fontSize: "0.75rem", textAlign: "center" }}>
                          {r.heat || "—"}
                        </td>
                        <td style={{ color: "#888", fontSize: "0.82rem" }}>{r.yob || "—"}</td>
                        <td style={{ color: "#888", fontSize: "0.82rem" }}>
                          {r.points != null ? r.points : "—"}
                        </td>
                        {isAdmin && (
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button
                              onClick={() => { setEditingResult(r); setAddingResult(false); }}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: "#6b7280", padding: "2px 4px" }}
                              title="Modifier"
                            >✏️</button>
                            <button
                              onClick={() => handleDeleteResult(r.id, `${r.discipline} ${r.lastName}`)}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: "#dc2626", padding: "2px 4px" }}
                              title="Supprimer"
                            >🗑</button>
                          </td>
                        )}
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      {/* Admin tools */}
      {isAdmin && (
        <section className="panel-grid panel-grid--1">
          <Panel title="Admin — Database" subtitle="Import and manage historical data">
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <p className="panel-note" style={{ marginBottom: "0.5rem" }}>
                  Seeds all historical data (editions, results, records, winners) from the bundled
                  JSON files into Firestore. Safe to re-run — uses merge writes.
                </p>
                <SeedButton onSeed={handleSeed} seeding={seeding} seedLog={seedLog} />
              </div>
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.75rem" }}>
                <p className="panel-note" style={{ marginBottom: "0.5rem" }}>
                  <strong>Close an edition</strong> to record participation in the athlete registry.
                  Select an edition above, then click the "Close edition" button in the Results panel.
                </p>
                <p className="panel-note" style={{ marginBottom: "0.5rem" }}>
                  <strong>Visibilité dans les stats publiques :</strong> cochez/décochez la case "stats" sous chaque année dans le sélecteur d'édition.
                </p>
                <button
                  className="btn"
                  style={{ fontSize: "0.82rem" }}
                  onClick={async () => {
                    const years = editions.filter((e) => e.year >= 2004 && e.year <= 2018).map((e) => e.year);
                    if (!years.length) return;
                    if (!window.confirm(`Masquer les années ${years.join(", ")} des statistiques ?`)) return;
                    await Promise.all(years.map((y) => setEditionVisibility(y, false)));
                  }}
                >
                  Masquer 2004–2018 des stats
                </button>
                {effectiveYear && (
                  <button
                    className="btn"
                    style={{ fontSize: "0.82rem", marginTop: "0.5rem", color: "#dc2626", borderColor: "#dc2626" }}
                    onClick={async () => {
                      if (!window.confirm(`Vider TOUS les résultats ${effectiveYear} de Firestore et les réimporter depuis le JSON ?`)) return;
                      setSeedLog([`Suppression des résultats ${effectiveYear}…`]);
                      const n = await clearResultsForYear(effectiveYear);
                      setSeedLog((p) => [...p, `${n} résultats supprimés. Réimport en cours…`]);
                      await seedMeetingDatabase((msg) => setSeedLog((p) => [...p, msg]));
                      setSeedLog((p) => [...p, `✅ Résultats ${effectiveYear} réimportés.`]);
                    }}
                  >
                    Vider et réimporter {effectiveYear}
                  </button>
                )}
              </div>
            </div>
          </Panel>
        </section>
      )}
    </div>
  );
}

// ─── Meeting Records page ─────────────────────────────────────────────────────

function MeetingRecordsPage({ Panel }) {
  const { records, loading } = useMeetingRecords();
  const [genderFilter, setGenderFilter] = useState("all");

  const displayed = useMemo(() => {
    const base = genderFilter === "all" ? records : records.filter((r) => r.gender === genderFilter);
    return [...base].sort((a, b) => {
      const gc = (a.gender === "W" ? 0 : 1) - (b.gender === "W" ? 0 : 1);
      if (gc !== 0) return gc;
      return String(a.discipline).localeCompare(String(b.discipline));
    });
  }, [records, genderFilter]);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Meeting History</p>
          <h1>Meeting Records</h1>
          <p>All-time best performances set at the Luxembourg Indoor Meeting.</p>
        </div>
      </section>

      <section className="panel-grid panel-grid--1">
        <Panel
          title="Records"
          subtitle={loading ? "Loading…" : `${displayed.length} records`}
          actions={
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {["all", "W", "M"].map((g) => (
                <button
                  key={g}
                  onClick={() => setGenderFilter(g)}
                  style={{
                    padding: "0.3rem 0.75rem",
                    borderRadius: 16,
                    border: "1.5px solid",
                    cursor: "pointer",
                    fontWeight: genderFilter === g ? 700 : 400,
                    background: genderFilter === g ? "#1d4ed8" : "#f8fafc",
                    color: genderFilter === g ? "#fff" : "#374151",
                    borderColor: genderFilter === g ? "#1d4ed8" : "#cbd5e1",
                    fontSize: "0.82rem",
                  }}
                >
                  {g === "all" ? "All" : g === "W" ? "Women" : "Men"}
                </button>
              ))}
            </div>
          }
        >
          {loading ? (
            <p className="panel-note">Loading records…</p>
          ) : records.length === 0 ? (
            <div className="notice-card">
              <strong>No records found</strong>
              <p>Seed the historical database to populate records.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th></th>
                    <th>Record</th>
                    <th>Athlete</th>
                    <th>Nat.</th>
                    <th>Date</th>
                    <th>Year</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.discipline}</td>
                      <td><GenderTag gender={r.gender} /></td>
                      <td style={{ fontWeight: 700, fontFamily: "monospace", color: "#1d4ed8" }}>
                        {r.mark}
                      </td>
                      <td>{r.fullName}</td>
                      <td>
                        <FlagImg noc={r.noc} />
                        {r.noc}
                      </td>
                      <td style={{ color: "#666", fontSize: "0.83rem" }}>{r.date}</td>
                      <td style={{ color: "#888", fontSize: "0.83rem" }}>{r.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

// ─── Meeting Winners page ─────────────────────────────────────────────────────

function MeetingWinnersPage({ Panel }) {
  const { winners, loading } = useAllWinners();
  const registryIdx = useRegistryIndex();
  const [genderFilter, setGenderFilter] = useState("all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Collect unique disciplines for filter
  const disciplines = useMemo(() => {
    const set = new Set(winners.map((w) => w.discipline));
    return ["all", ...Array.from(set).sort()];
  }, [winners]);

  const filtered = useMemo(() => {
    let list = winners;
    if (genderFilter !== "all") list = list.filter((w) => w.gender === genderFilter);
    if (disciplineFilter !== "all") list = list.filter((w) => w.discipline === disciplineFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((w) => {
        const hay = [w.lastName, w.firstName, w.noc, w.discipline, String(w.year)]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [winners, genderFilter, disciplineFilter, search]);

  // Count how many times each athlete has won (detect serial winners)
  const winCounts = useMemo(() => {
    const counts = {};
    for (const w of winners) {
      const k = `${String(w.lastName || "").toLowerCase()}_${String(w.firstName || "").toLowerCase()}`;
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [winners]);

  function winnerKey(w) {
    return `${String(w.lastName || "").toLowerCase()}_${String(w.firstName || "").toLowerCase()}`;
  }

  // Group by discipline for the "all" view
  const grouped = useMemo(() => {
    if (disciplineFilter !== "all") return null; // flat list when filtered
    const map = new Map();
    for (const w of filtered) {
      const key = `${w.discipline}||${w.gender}`;
      if (!map.has(key)) map.set(key, { discipline: w.discipline, gender: w.gender, rows: [] });
      map.get(key).rows.push(w);
    }
    return [...map.values()].sort((a, b) => {
      const dc = String(a.discipline).localeCompare(String(b.discipline));
      if (dc !== 0) return dc;
      return a.gender === "W" ? -1 : 1;
    });
  }, [filtered, disciplineFilter]);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Meeting History</p>
          <h1>Hall of Winners</h1>
          <p>Historical winners for every event at the Luxembourg Indoor Meeting (2003–2026).</p>
        </div>
      </section>

      <section className="panel-grid panel-grid--1">
        <Panel
          title="Winners"
          subtitle={loading ? "Loading…" : `${filtered.length} winner entries`}
        >
          {/* Filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem", alignItems: "flex-end" }}>
            {/* Gender */}
            <div>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                GENDER
              </label>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                {["all", "W", "M"].map((g) => (
                  <button
                    key={g}
                    onClick={() => setGenderFilter(g)}
                    style={{
                      padding: "0.28rem 0.7rem",
                      borderRadius: 14,
                      border: "1.5px solid",
                      cursor: "pointer",
                      fontWeight: genderFilter === g ? 700 : 400,
                      background: genderFilter === g ? "#1d4ed8" : "#f8fafc",
                      color: genderFilter === g ? "#fff" : "#374151",
                      borderColor: genderFilter === g ? "#1d4ed8" : "#cbd5e1",
                      fontSize: "0.8rem",
                    }}
                  >
                    {g === "all" ? "All" : g === "W" ? "Women" : "Men"}
                  </button>
                ))}
              </div>
            </div>

            {/* Discipline */}
            <div>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                EVENT
              </label>
              <select
                className="input"
                value={disciplineFilter}
                onChange={(e) => setDisciplineFilter(e.target.value)}
                style={{ padding: "0.28rem 0.6rem", minWidth: 160 }}
              >
                {disciplines.map((d) => (
                  <option key={d} value={d}>{d === "all" ? "All events" : d}</option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                SEARCH
              </label>
              <input
                className="input"
                placeholder="Name, country, year…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <p className="panel-note">Loading winners…</p>
          ) : filtered.length === 0 ? (
            <div className="notice-card">
              <strong>No winners found</strong>
              <p>Try adjusting the filters, or seed the historical database first.</p>
            </div>
          ) : grouped ? (
            // Grouped by discipline
            <div className="table-wrap table-wrap--athletes" style={{ maxHeight: "calc(100vh - 380px)" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Event</th>
                    <th data-sticky-col="1" className="col-sticky col-sticky--last">Winner</th>
                    <th>Nat.</th>
                    <th>Result</th>
                    <th>Wins</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((grp) => [
                    <tr key={`grp-${grp.discipline}-${grp.gender}`} className="event-group-header">
                      <td colSpan={6} style={{ paddingTop: "0.6rem", paddingBottom: "0.35rem" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.88rem", marginRight: 8 }}>
                          {grp.discipline}
                        </span>
                        <GenderTag gender={grp.gender} />
                      </td>
                    </tr>,
                    ...grp.rows.map((w) => {
                      const wins = winCounts[winnerKey(w)] || 1;
                      return (
                        <tr key={w.id}>
                          <td style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1d4ed8" }}>
                            {w.year}
                          </td>
                          <td style={{ fontSize: "0.75rem", color: "#888" }}>{w.discipline}</td>
                          <td className="col-sticky col-sticky--last">
                            <AthleteNameCell
                              lastName={w.lastName}
                              firstName={w.firstName}
                              yob={w.yob}
                              registryIdx={registryIdx}
                            />
                            {wins >= 3 && (
                              <span style={{
                                marginLeft: 6, fontSize: "0.68rem", fontWeight: 700,
                                background: "#fef3c7", color: "#92400e",
                                padding: "1px 5px", borderRadius: 8,
                              }} title={`${wins}× winner`}>
                                ×{wins}
                              </span>
                            )}
                          </td>
                          <td>
                            <FlagImg noc={w.noc} />
                            {w.noc}
                          </td>
                          <td style={{ fontFamily: "monospace", fontWeight: 600 }}>
                            {w.result || "—"}
                          </td>
                          <td>
                            {wins >= 2 ? (
                              <span style={{
                                fontSize: "0.75rem", fontWeight: 700,
                                color: wins >= 3 ? "#92400e" : "#374151",
                              }}>
                                {wins}×
                              </span>
                            ) : (
                              <span style={{ color: "#ccc", fontSize: "0.75rem" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  ])}
                </tbody>
              </table>
            </div>
          ) : (
            // Flat list when a specific discipline is selected
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Event</th>
                    <th></th>
                    <th>Winner</th>
                    <th>Nat.</th>
                    <th>Result</th>
                    <th>Wins</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w) => {
                    const wins = winCounts[winnerKey(w)] || 1;
                    return (
                      <tr key={w.id}>
                        <td style={{ fontWeight: 700, color: "#1d4ed8" }}>{w.year}</td>
                        <td style={{ fontSize: "0.83rem" }}>{w.discipline}</td>
                        <td><GenderTag gender={w.gender} /></td>
                        <td>
                          <AthleteNameCell
                            lastName={w.lastName}
                            firstName={w.firstName}
                            yob={w.yob}
                            registryIdx={registryIdx}
                          />
                          {wins >= 3 && (
                            <span style={{
                              marginLeft: 6, fontSize: "0.68rem", fontWeight: 700,
                              background: "#fef3c7", color: "#92400e",
                              padding: "1px 5px", borderRadius: 8,
                            }} title={`${wins}× winner`}>
                              ×{wins}
                            </span>
                          )}
                        </td>
                        <td>
                          <FlagImg noc={w.noc} />
                          {w.noc}
                        </td>
                        <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{w.result || "—"}</td>
                        <td style={{ fontSize: "0.82rem", fontWeight: wins >= 2 ? 700 : 400, color: wins >= 3 ? "#92400e" : "#374151" }}>
                          {wins >= 2 ? `${wins}×` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

export { MeetingHistoryPage, MeetingRecordsPage, MeetingWinnersPage };
