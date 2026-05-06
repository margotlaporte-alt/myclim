import { useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { useAuth } from "../context/auth-context";
import { getActiveRoles } from "./navigation";
import {
  ALL_ATHLETE_FIELDS,
  ATHLETES_COLLECTION,
  DEFAULT_PORTAL_SETTINGS,
  FIELD_GROUPS,
  athleteMergeKey,
  canImportAthletes,
  extractWaid,
  getVisibleFields,
  normalizeBirthYear,
  parsePb,
  useAthletePortalSettings,
  useAthletes,
  ATHLETE_PORTAL_SETTINGS_PATH,
} from "./athlete-portal-hooks";
import { db } from "../services/firebase";

const PLATFORM_ROLES = [
  { key: "admin",           label: "Administrator" },
  { key: "meeting_director",label: "Meeting Director" },
  { key: "gestionnaire",    label: "Manager (Gestionnaire)" },
  { key: "chef_equipe",     label: "Team Leader (Chef d'équipe)" },
  { key: "benevole",        label: "Volunteer (Bénévole)" },
  { key: "parent_u14",      label: "U14 Parent" },
];

// ─── File-type detection & parsing ───────────────────────────────────────────

/**
 * Detect which CMCM Excel file type we're dealing with.
 *
 * START_LIST  : col[7] = "Status"   (has WR + Status columns)
 * FINAL_LANES : col[7] = "PB"       (has Heat/Lane structure, no Status/WR)
 * TRAVEL      : col[0] = "Event", col[4] = "Manager"
 */
function detectFileType(headerRow) {
  const h = headerRow.map((c) => String(c || "").trim().toLowerCase());
  if (h[4] === "manager" || h[5]?.startsWith("anreise") || h[6]?.startsWith("abreise")) {
    return "TRAVEL";
  }
  if (h[7] === "status" || h[8] === "wr" || h[8] === "welt") return "START_LIST";
  if (h[7] === "pb" || h[7] === "pb ") return "FINAL_LANES";
  // Fallback: if col[2] is "event" it's one of the start-list variants
  if (h[2] === "event") return "START_LIST";
  return "UNKNOWN";
}

function norm(v) {
  return String(v || "").trim();
}

/**
 * Parse a raw Excel row array into a unified athlete object.
 * Returns null for header/empty rows.
 */
function parseStartListRow(row) {
  // col: [empty, #, event, lastName, firstName, nat, birthYear, status, WR, PB, SB25, waUrl, ...]
  const event = norm(row[2]);
  const lastName = norm(row[3]);
  const firstName = norm(row[4]);
  if (!event || !lastName || event.toLowerCase() === "event") return null;

  const rawPb = norm(row[9]);
  const { indoor: pbIndoor, outdoor: pbOutdoor } = parsePb(rawPb);
  const waRaw = norm(row[11]);
  const waid = extractWaid(waRaw);

  return {
    event,
    lastName,
    firstName,
    nationality: norm(row[5]),
    birthYear: normalizeBirthYear(row[6]),
    status: norm(row[7]).toLowerCase() || null,
    worldRanking: row[8] !== "" && !isNaN(Number(row[8])) ? Number(row[8]) : null,
    pb: rawPb || null,
    pbIndoor,
    pbOutdoor,
    sb: norm(row[10]) || null,
    waUrl: waRaw.startsWith("http") ? waRaw : null,
    waid,
    // lanes/travel fields empty until another file fills them
    heat: null,
    lane: null,
    manager: null,
    arrival: null,
    departure: null,
  };
}

function parseFinaLanesRows(rows) {
  const athletes = [];
  let currentHeat = null;

  for (const row of rows) {
    const col0 = norm(row[0]);
    const event = norm(row[2]);

    // Heat header row
    if (col0.toLowerCase().startsWith("heat")) {
      currentHeat = col0;
      continue;
    }

    const lastName = norm(row[3]);
    const firstName = norm(row[4]);
    if (!event || !lastName || event.toLowerCase() === "event") continue;

    const rawPb = norm(row[7]);
    const { indoor: pbIndoor, outdoor: pbOutdoor } = parsePb(rawPb);
    const waRaw = norm(row[9]);
    const waid = extractWaid(waRaw);

    athletes.push({
      event,
      lastName,
      firstName,
      nationality: norm(row[5]),
      birthYear: normalizeBirthYear(row[6]),
      status: null,
      worldRanking: null,
      pb: rawPb || null,
      pbIndoor,
      pbOutdoor,
      sb: norm(row[8]) || null,
      waUrl: waRaw.startsWith("http") ? waRaw : null,
      waid,
      heat: currentHeat,
      lane: col0 !== "" && !isNaN(Number(col0)) ? Number(col0) : null,
      manager: null,
      arrival: null,
      departure: null,
    });
  }

  return athletes;
}

function parseTravelRow(row) {
  // col: [event, lastName, firstName, nat, manager, arrival, departure]
  const event = norm(row[0]);
  const lastName = norm(row[1]);
  const firstName = norm(row[2]);
  if (!lastName || !firstName) return null;

  return {
    event,
    lastName,
    firstName,
    nationality: norm(row[3]),
    birthYear: null,
    status: null,
    worldRanking: null,
    pb: null,
    pbIndoor: null,
    pbOutdoor: null,
    sb: null,
    waUrl: null,
    waid: null,
    heat: null,
    lane: null,
    manager: norm(row[4]) || null,
    arrival: norm(row[5]) || null,
    departure: norm(row[6]) || null,
  };
}

/**
 * Parse raw rows into athlete records based on detected file type.
 */
function parseRows(rows, fileType) {
  if (fileType === "START_LIST") {
    return rows.slice(2).map(parseStartListRow).filter(Boolean);
  }
  if (fileType === "FINAL_LANES") {
    return parseFinaLanesRows(rows.slice(2));
  }
  if (fileType === "TRAVEL") {
    return rows.slice(1).map(parseTravelRow).filter(Boolean);
  }
  return [];
}

/**
 * Merge a batch of new records into existing athletes.
 * Matching key: lastName + firstName + nationality (normalized).
 *
 * For TRAVEL: only updates travel fields (manager, arrival, departure).
 * For FINAL_LANES: updates heat/lane, updates PB/SB if not already set.
 * For START_LIST: sets all performance fields; overwrites status/WR.
 *
 * Returns the merged array (new athletes appended, existing ones updated).
 */
function mergeAthletes(existing, incoming, fileType) {
  const byKey = new Map();
  existing.forEach((a) => {
    const key = athleteMergeKey(a.lastName, a.firstName, a.nationality);
    byKey.set(key, { ...a });
  });

  const added = [];
  const updated = [];

  for (const record of incoming) {
    const key = athleteMergeKey(record.lastName, record.firstName, record.nationality);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, record);
      added.push(record);
      continue;
    }

    const merged = { ...existing };

    if (fileType === "TRAVEL") {
      // Only travel fields
      if (record.manager)   merged.manager   = record.manager;
      if (record.arrival)   merged.arrival   = record.arrival;
      if (record.departure) merged.departure = record.departure;
    } else if (fileType === "FINAL_LANES") {
      // Heat/lane always overwrite (they're new in this file type)
      if (record.heat !== null) merged.heat = record.heat;
      if (record.lane !== null) merged.lane = record.lane;
      // PB/SB only if not already present
      if (!merged.pb && record.pb)         merged.pb       = record.pb;
      if (!merged.pbIndoor && record.pbIndoor) merged.pbIndoor = record.pbIndoor;
      if (!merged.pbOutdoor && record.pbOutdoor) merged.pbOutdoor = record.pbOutdoor;
      if (!merged.sb && record.sb)         merged.sb       = record.sb;
    } else {
      // START_LIST: overwrite all performance fields
      if (record.status !== null)       merged.status       = record.status;
      if (record.worldRanking !== null) merged.worldRanking = record.worldRanking;
      if (record.pb)       merged.pb       = record.pb;
      if (record.pbIndoor) merged.pbIndoor = record.pbIndoor;
      if (record.pbOutdoor) merged.pbOutdoor = record.pbOutdoor;
      if (record.sb)       merged.sb       = record.sb;
      if (record.waUrl)    merged.waUrl    = record.waUrl;
      if (record.waid)     merged.waid     = record.waid;
    }

    byKey.set(key, merged);
    updated.push(merged);
  }

  return { merged: [...byKey.values()], added: added.length, updated: updated.length };
}

// ─── File type badge ──────────────────────────────────────────────────────────

function FileTypeBadge({ type }) {
  const config = {
    START_LIST:  { label: "Start list",     className: "status-pill status-pill--accent" },
    FINAL_LANES: { label: "Heats & Lanes",  className: "status-pill" },
    TRAVEL:      { label: "Travel",         className: "status-pill" },
    UNKNOWN:     { label: "Unknown format", className: "status-pill status-pill--warn" },
  };
  const { label, className } = config[type] || config.UNKNOWN;
  return <span className={className}>{label}</span>;
}

// ─── Pages ────────────────────────────────────────────────────────────────────

function AthletePortalOverview({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const { settings, loading: settingsLoading } = useAthletePortalSettings();
  const canImport = canImportAthletes(roles, settings);
  const { athletes, loading: athletesLoading } = useAthletes(!settingsLoading);

  const eventCounts = useMemo(() => {
    const counts = {};
    athletes.forEach((a) => {
      const ev = String(a.event || "Unknown").trim();
      counts[ev] = (counts[ev] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  }, [athletes]);

  const stats = useMemo(() => {
    const nations = new Set(athletes.map((a) => a.nationality).filter(Boolean));
    const withLane = athletes.filter((a) => a.lane).length;
    const withTravel = athletes.filter((a) => a.arrival || a.departure).length;
    const withStatus = athletes.filter((a) => a.status === "ok").length;
    const out = athletes.filter((a) => a.status === "out").length;
    return { nations: nations.size, withLane, withTravel, withStatus, out };
  }, [athletes]);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Overview</h1>
          <p>Manage and consult athlete information for this meeting.</p>
        </div>
      </section>

      <section className="panel-grid panel-grid--2">
        <Panel title="Athlete roster" subtitle="Current database summary.">
          {athletesLoading ? (
            <p className="panel-note">Loading…</p>
          ) : (
            <ul className="compact-list">
              <li><strong>{athletes.length}</strong> athletes in database</li>
              <li><strong>{stats.nations}</strong> nations represented</li>
              <li><strong>{eventCounts.length}</strong> events</li>
              <li><strong>{stats.withStatus}</strong> confirmed (ok) · <strong>{stats.out}</strong> withdrawn (out)</li>
              <li><strong>{stats.withLane}</strong> with heat/lane assignment</li>
              <li><strong>{stats.withTravel}</strong> with travel info</li>
            </ul>
          )}
        </Panel>
        <Panel title="Quick access">
          <div className="dashboard-action-grid">
            <NavLink className="button button--secondary button-link" to="/app/athlete-portal/athletes">
              View athletes
            </NavLink>
            {canImport ? (
              <NavLink className="button button--secondary button-link" to="/app/athlete-portal/import">
                Import file
              </NavLink>
            ) : null}
          </div>
        </Panel>
      </section>

      {eventCounts.length > 0 ? (
        <section className="panel-grid panel-grid--1">
          <Panel title="Events" subtitle="Athletes per event.">
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Event</th><th>Athletes</th></tr></thead>
                <tbody>
                  {eventCounts.map(([ev, count]) => (
                    <tr key={ev}><td>{ev}</td><td>{count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}

function AthletesListPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const { settings, loading: settingsLoading } = useAthletePortalSettings();
  const { athletes, loading: athletesLoading } = useAthletes(!settingsLoading);
  const visibleFields = useMemo(() => getVisibleFields(roles, settings), [roles, settings]);

  const [search, setSearch] = useState("");
  const [filterEvent, setFilterEvent] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const events = useMemo(() => {
    const s = new Set();
    athletes.forEach((a) => { if (a.event) s.add(String(a.event).trim()); });
    return [...s].sort();
  }, [athletes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return athletes.filter((a) => {
      if (filterEvent && String(a.event || "").trim() !== filterEvent) return false;
      if (filterStatus && a.status !== filterStatus) return false;
      if (q) {
        const hay = [a.lastName, a.firstName, a.nationality, a.waid]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [athletes, search, filterEvent, filterStatus]);

  if (settingsLoading || athletesLoading) {
    return <div className="page"><section className="page-header"><div><h1>Athletes</h1></div></section><p className="panel-note">Loading…</p></div>;
  }

  if (visibleFields.length === 0) {
    return (
      <div className="page">
        <section className="page-header"><div><h1>Athletes</h1></div></section>
        <div className="notice-card notice-card--warn">
          <strong>Access restricted</strong>
          <p>You do not have permission to view athlete data. Contact an administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Athletes</h1>
          <p>{filtered.length} of {athletes.length} athletes</p>
        </div>
      </section>

      <section className="panel-grid panel-grid--1">
        <Panel title="Filter">
          <div className="field-grid">
            <label className="field">
              <span>Search</span>
              <input placeholder="Name, nationality, WAID…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label className="field">
              <span>Event</span>
              <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)}>
                <option value="">All events</option>
                {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All</option>
                <option value="ok">OK (confirmed)</option>
                <option value="out">Out (withdrawn)</option>
              </select>
            </label>
          </div>
        </Panel>
      </section>

      {athletes.length === 0 ? (
        <div className="notice-card">
          <strong>No athletes yet</strong>
          <p>No data has been imported yet. A Meeting Director can upload a start list.</p>
        </div>
      ) : (
        <section className="panel-grid panel-grid--1">
          <Panel title="Athlete list" subtitle={`${filtered.length} results`}>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {visibleFields.map((f) => <th key={f.key}>{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className={a.status === "out" ? "row--muted" : ""}>
                      {visibleFields.map((f) => (
                        <td key={f.key}>
                          {f.key === "status"
                            ? <StatusBadge status={a.status} />
                            : f.key === "waUrl" && a.waUrl
                              ? <a href={a.waUrl} target="_blank" rel="noopener noreferrer">WA ↗</a>
                              : a[f.key] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return "—";
  if (status === "ok") return <span className="status-pill status-pill--ok">OK</span>;
  if (status === "out") return <span className="status-pill status-pill--warn">Out</span>;
  return <span className="status-pill">{status}</span>;
}

// ─── Import page ──────────────────────────────────────────────────────────────

function AthleteImportPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const { settings, loading: settingsLoading } = useAthletePortalSettings();
  const canImport = canImportAthletes(roles, settings);
  const { athletes } = useAthletes(true);

  const [parsed, setParsed] = useState(null); // { fileType, records, fileName }
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  if (settingsLoading) return <div className="page"><p className="panel-note">Loading…</p></div>;

  if (!canImport) {
    return (
      <div className="page">
        <section className="page-header"><div><h1>Import athletes</h1></div></section>
        <div className="notice-card notice-card--warn">
          <strong>Access restricted</strong>
          <p>Only Meeting Directors and Administrators can import athlete data.</p>
        </div>
      </div>
    );
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("Reading file…");
    setParsed(null);

    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json(ws, { header: 1, defval: "" });

      if (rows.length < 2) { setStatus("File appears empty."); return; }

      const fileType = detectFileType(rows[0]);
      const records = parseRows(rows, fileType);

      setParsed({ fileType, records, fileName: file.name });
      setStatus(`Detected: ${fileType} — ${records.length} athlete records found.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setSaving(true);
    setStatus("Merging and saving…");

    try {
      const { merged, added, updated } = mergeAthletes(athletes, parsed.records, parsed.fileType);

      // Write all merged athletes as a full replace (simpler than partial updates)
      const batch = writeBatch(db);

      // Delete existing
      athletes.forEach((a) => {
        batch.delete(doc(db, ATHLETES_COLLECTION, a.id));
      });

      // Write merged
      merged.forEach((a, i) => {
        const id = a.id || `athlete_${Date.now()}_${i}`;
        const { id: _id, ...data } = a;
        batch.set(doc(db, ATHLETES_COLLECTION, id), {
          ...data,
          importedAt: serverTimestamp(),
          importSource: parsed.fileType,
        });
      });

      await batch.commit();
      setStatus(`Done. ${added} added · ${updated} updated · ${merged.length} total athletes.`);
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setStatus(`Import failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setParsed(null);
    setStatus("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // Merge preview
  const mergePreview = useMemo(() => {
    if (!parsed) return null;
    return mergeAthletes(athletes, parsed.records, parsed.fileType);
  }, [parsed, athletes]);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Import file</h1>
          <p>Upload a CMCM Excel start list, lanes file, or travel file. The format is detected automatically.</p>
        </div>
      </section>

      <section className="panel-grid panel-grid--2">
        <Panel title="Expected formats" subtitle="The three file types accepted by this import.">
          <ul className="compact-list">
            <li><strong>Start list</strong> — columns: Event, Name, Vorname, Nat., Jahrg., Status, WR, PB, SB25, WA Profile</li>
            <li><strong>Heats &amp; Lanes</strong> — same + Heat rows and Lane column; updates heat/lane assignments</li>
            <li><strong>Travel</strong> — columns: Event, Name, Vorname, Nat., Manager, Anreise, Abreise; adds logistics info without overwriting performances</li>
          </ul>
        </Panel>
        <Panel title="Upload file">
          <label className="field">
            <span>Excel file (.xlsx)</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              disabled={saving}
            />
          </label>
          {status ? <p className="panel-note">{status}</p> : null}
        </Panel>
      </section>

      {parsed ? (
        <>
          <section className="panel-grid panel-grid--2">
            <Panel title="Detection result">
              <ul className="compact-list">
                <li>File: <strong>{parsed.fileName}</strong></li>
                <li>Type detected: <FileTypeBadge type={parsed.fileType} /></li>
                <li>Records in file: <strong>{parsed.records.length}</strong></li>
              </ul>
            </Panel>
            {mergePreview ? (
              <Panel title="Merge preview" subtitle="What will happen if you confirm.">
                <ul className="compact-list">
                  <li>Athletes currently in DB: <strong>{athletes.length}</strong></li>
                  <li>New athletes to add: <strong>{mergePreview.added}</strong></li>
                  <li>Existing athletes to update: <strong>{mergePreview.updated}</strong></li>
                  <li>Total after import: <strong>{mergePreview.merged.length}</strong></li>
                </ul>
                {parsed.fileType === "TRAVEL" && (
                  <p className="panel-note">Travel import only updates manager, arrival and departure fields — performances are untouched.</p>
                )}
                {parsed.fileType === "FINAL_LANES" && (
                  <p className="panel-note">Lanes import updates heat/lane assignments and fills missing PB/SB — existing performances are preserved.</p>
                )}
              </Panel>
            ) : null}
          </section>

          <section className="panel-grid panel-grid--1">
            <Panel title="Preview — first 10 records" subtitle="Parsed data from the file.">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Last name</th>
                      <th>First name</th>
                      <th>Nat.</th>
                      {parsed.fileType === "START_LIST" && <><th>Status</th><th>WR</th><th>PB Indoor</th><th>PB Outdoor</th><th>SB</th><th>WAID</th></>}
                      {parsed.fileType === "FINAL_LANES" && <><th>Heat</th><th>Lane</th><th>PB Indoor</th><th>SB</th></>}
                      {parsed.fileType === "TRAVEL" && <><th>Manager</th><th>Arrival</th><th>Departure</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.records.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        <td>{r.event}</td>
                        <td>{r.lastName}</td>
                        <td>{r.firstName}</td>
                        <td>{r.nationality}</td>
                        {parsed.fileType === "START_LIST" && (
                          <>
                            <td>{r.status ? <StatusBadge status={r.status} /> : "—"}</td>
                            <td>{r.worldRanking ?? "—"}</td>
                            <td>{r.pbIndoor ?? "—"}</td>
                            <td>{r.pbOutdoor ?? "—"}</td>
                            <td>{r.sb ?? "—"}</td>
                            <td>{r.waid ?? "—"}</td>
                          </>
                        )}
                        {parsed.fileType === "FINAL_LANES" && (
                          <>
                            <td>{r.heat ?? "—"}</td>
                            <td>{r.lane ?? "—"}</td>
                            <td>{r.pbIndoor ?? "—"}</td>
                            <td>{r.sb ?? "—"}</td>
                          </>
                        )}
                        {parsed.fileType === "TRAVEL" && (
                          <>
                            <td>{r.manager ?? "—"}</td>
                            <td>{r.arrival ?? "—"}</td>
                            <td>{r.departure ?? "—"}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dashboard-action-grid" style={{ marginTop: "1rem" }}>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={handleImport}
                  disabled={saving || parsed.fileType === "UNKNOWN"}
                >
                  {saving ? "Importing…" : `Confirm import (${parsed.records.length} records)`}
                </button>
                <button className="button button--secondary" type="button" onClick={handleCancel} disabled={saving}>
                  Cancel
                </button>
              </div>
              {parsed.fileType === "UNKNOWN" && (
                <p className="panel-note" style={{ color: "var(--color-danger, #c0392b)" }}>
                  Format not recognized. Please check that this is a CMCM start list, lanes, or travel file.
                </p>
              )}
            </Panel>
          </section>
        </>
      ) : null}
    </div>
  );
}

// ─── Settings page ────────────────────────────────────────────────────────────

function AthletePortalSettingsPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const isAdmin = roles.includes("admin");
  const { settings, loading } = useAthletePortalSettings();

  const [accessRoles, setAccessRoles] = useState([]);
  const [importerRoles, setImporterRoles] = useState([]);
  const [fieldVisibility, setFieldVisibility] = useState({});
  const [saveStatus, setSaveStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync local state when settings load
  useState(() => {
    if (!settings) return;
    setAccessRoles(settings.accessRoles ?? DEFAULT_PORTAL_SETTINGS.accessRoles);
    setImporterRoles(settings.importerRoles ?? DEFAULT_PORTAL_SETTINGS.importerRoles);
    setFieldVisibility(settings.fieldVisibility ?? DEFAULT_PORTAL_SETTINGS.fieldVisibility);
  });

  // Keep state in sync when settings change
  const [initialized, setInitialized] = useState(false);
  if (!initialized && settings) {
    setAccessRoles(settings.accessRoles ?? DEFAULT_PORTAL_SETTINGS.accessRoles);
    setImporterRoles(settings.importerRoles ?? DEFAULT_PORTAL_SETTINGS.importerRoles);
    setFieldVisibility(settings.fieldVisibility ?? DEFAULT_PORTAL_SETTINGS.fieldVisibility);
    setInitialized(true);
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <section className="page-header"><div><h1>Portal settings</h1></div></section>
        <div className="notice-card notice-card--warn">
          <strong>Administrators only</strong>
          <p>Only administrators can manage Athlete Portal permissions.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="page"><p className="panel-note">Loading settings…</p></div>;

  function toggleRole(list, setter, role) {
    setter((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);
  }

  function toggleField(role, key) {
    setFieldVisibility((prev) => {
      const cur = Array.isArray(prev[role]) ? prev[role] : [];
      return {
        ...prev,
        [role]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
      };
    });
  }

  function setGroupForRole(role, group, value) {
    const groupKeys = ALL_ATHLETE_FIELDS.filter((f) => f.group === group).map((f) => f.key);
    setFieldVisibility((prev) => {
      const cur = new Set(Array.isArray(prev[role]) ? prev[role] : []);
      groupKeys.forEach((k) => (value ? cur.add(k) : cur.delete(k)));
      return { ...prev, [role]: [...cur] };
    });
  }

  function allGranted(role, group) {
    const cur = fieldVisibility[role] ?? [];
    return ALL_ATHLETE_FIELDS.filter((f) => f.group === group).every((f) => cur.includes(f.key));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("Saving…");
    try {
      await setDoc(
        doc(db, ...ATHLETE_PORTAL_SETTINGS_PATH),
        { accessRoles, importerRoles, fieldVisibility, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setSaveStatus("Settings saved.");
    } catch (err) {
      setSaveStatus(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const activeRoles = PLATFORM_ROLES.filter((r) => accessRoles.includes(r.key));

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Portal settings</h1>
          <p>Control who can access the portal and which data fields each role can see.</p>
        </div>
      </section>

      <form onSubmit={handleSave}>
        <section className="panel-grid panel-grid--2">
          <Panel title="Portal access" subtitle="Which roles can enter the Athlete Portal.">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {PLATFORM_ROLES.map((role) => (
                <label key={role.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={accessRoles.includes(role.key)}
                    disabled={role.key === "admin"}
                    onChange={() => toggleRole(accessRoles, setAccessRoles, role.key)}
                  />
                  <span>{role.label}</span>
                  {role.key === "admin" && <span className="status-pill status-pill--accent">always</span>}
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Import rights" subtitle="Which roles can upload Excel files.">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {activeRoles.map((role) => (
                <label key={role.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={importerRoles.includes(role.key)}
                    onChange={() => toggleRole(importerRoles, setImporterRoles, role.key)}
                  />
                  <span>{role.label}</span>
                </label>
              ))}
            </div>
            <p className="panel-note">Only roles with portal access are listed.</p>
          </Panel>
        </section>

        <section className="panel-grid panel-grid--1">
          <Panel
            title="Field visibility per role"
            subtitle="Which data each role can see. Columns grouped by data source."
          >
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Field</th>
                    <th style={{ minWidth: 80 }}>Source</th>
                    {activeRoles.map((role) => (
                      <th key={role.key} style={{ minWidth: 130, textAlign: "center" }}>
                        {role.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FIELD_GROUPS.map((group) => {
                    const groupFields = ALL_ATHLETE_FIELDS.filter((f) => f.group === group.key);
                    return groupFields.map((field, fi) => (
                      <tr key={field.key}>
                        <td>{field.label}</td>
                        {fi === 0 ? (
                          <td rowSpan={groupFields.length} style={{ verticalAlign: "middle" }}>
                            <span className="status-pill">{group.label}</span>
                          </td>
                        ) : null}
                        {activeRoles.map((role) => {
                          const visible = (fieldVisibility[role.key] ?? []).includes(field.key);
                          return (
                            <td key={role.key} style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={visible}
                                onChange={() => toggleField(role.key, field.key)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })}
                  {/* Group toggle row */}
                  <tr style={{ background: "rgba(0,0,0,0.03)" }}>
                    <td colSpan={2} style={{ fontWeight: 600, fontSize: "0.8rem", color: "#666" }}>
                      Toggle by group →
                    </td>
                    {activeRoles.map((role) => (
                      <td key={role.key}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          {FIELD_GROUPS.map((g) => (
                            <button
                              key={g.key}
                              type="button"
                              className={`button button--ghost button--small${allGranted(role.key, g.key) ? "" : ""}`}
                              onClick={() => setGroupForRole(role.key, g.key, !allGranted(role.key, g.key))}
                              style={{ fontSize: "0.7rem", padding: "1px 6px" }}
                            >
                              {allGranted(role.key, g.key) ? "−" : "+"} {g.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <section className="panel-grid panel-grid--1">
          <Panel title="Save">
            <div className="dashboard-action-grid">
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
            {saveStatus ? <p className="panel-note">{saveStatus}</p> : null}
          </Panel>
        </section>
      </form>
    </div>
  );
}

export { AthletePortalOverview, AthletesListPage, AthleteImportPage, AthletePortalSettingsPage };
