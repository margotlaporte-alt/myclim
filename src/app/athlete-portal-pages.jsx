import { useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
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
  fetchAthleteFromWaService,
  getVisibleFields,
  normalizeBirthYear,
  parsePb,
  useAthletePortalSettings,
  useAthletes,
  ATHLETE_PORTAL_SETTINGS_PATH,
} from "./athlete-portal-hooks";
import { db } from "../services/firebase";

const PLATFORM_ROLES = [
  { key: "admin",            label: "Administrator" },
  { key: "meeting_director", label: "Meeting Director" },
  { key: "gestionnaire",     label: "Manager (Gestionnaire)" },
  { key: "chef_equipe",      label: "Team Leader (Chef d'équipe)" },
  { key: "benevole",         label: "Volunteer (Bénévole)" },
  { key: "parent_u14",       label: "U14 Parent" },
];

// ─── File type detection & parsing (same as before) ──────────────────────────

function detectFileType(headerRow) {
  const h = headerRow.map((c) => String(c || "").trim().toLowerCase());
  if (h[4] === "manager" || (h[5] || "").startsWith("anreise")) return "TRAVEL";
  if (h[7] === "status" || h[8] === "wr") return "START_LIST";
  if (h[7] === "pb" || h[7] === "pb ") return "FINAL_LANES";
  if (h[2] === "event") return "START_LIST";
  return "UNKNOWN";
}

function norm(v) { return String(v || "").trim(); }

function parseStartListRow(row) {
  const event = norm(row[2]);
  const lastName = norm(row[3]);
  const firstName = norm(row[4]);
  if (!event || !lastName || event.toLowerCase() === "event") return null;

  const rawPb = norm(row[9]);
  const { indoor: pbIndoor, outdoor: pbOutdoor } = parsePb(rawPb);
  const waRaw = norm(row[11]);

  return {
    event, lastName, firstName,
    nationality: norm(row[5]),
    birthYear: normalizeBirthYear(row[6]),
    status: norm(row[7]).toLowerCase() || null,
    worldRanking: row[8] !== "" && !isNaN(Number(row[8])) ? Number(row[8]) : null,
    pb: rawPb || null, pbIndoor, pbOutdoor,
    sb: norm(row[10]) || null,
    waUrl: waRaw.startsWith("http") ? waRaw : null,
    waid: extractWaid(waRaw),
    heat: null, lane: null, manager: null, arrival: null, departure: null,
  };
}

function parseFinaLanesRows(rows) {
  const athletes = [];
  let currentHeat = null;

  for (const row of rows) {
    const col0 = norm(row[0]);
    const event = norm(row[2]);
    if (col0.toLowerCase().startsWith("heat")) { currentHeat = col0; continue; }
    const lastName = norm(row[3]);
    if (!event || !lastName || event.toLowerCase() === "event") continue;

    const rawPb = norm(row[7]);
    const { indoor: pbIndoor, outdoor: pbOutdoor } = parsePb(rawPb);
    const waRaw = norm(row[9]);

    athletes.push({
      event, lastName, firstName: norm(row[4]),
      nationality: norm(row[5]),
      birthYear: normalizeBirthYear(row[6]),
      status: null, worldRanking: null,
      pb: rawPb || null, pbIndoor, pbOutdoor,
      sb: norm(row[8]) || null,
      waUrl: waRaw.startsWith("http") ? waRaw : null,
      waid: extractWaid(waRaw),
      heat: currentHeat,
      lane: col0 !== "" && !isNaN(Number(col0)) ? Number(col0) : null,
      manager: null, arrival: null, departure: null,
    });
  }
  return athletes;
}

function parseTravelRow(row) {
  const lastName = norm(row[1]);
  const firstName = norm(row[2]);
  if (!lastName || !firstName) return null;
  return {
    event: norm(row[0]), lastName, firstName,
    nationality: norm(row[3]),
    birthYear: null, status: null, worldRanking: null,
    pb: null, pbIndoor: null, pbOutdoor: null, sb: null,
    waUrl: null, waid: null, heat: null, lane: null,
    manager: norm(row[4]) || null,
    arrival: norm(row[5]) || null,
    departure: norm(row[6]) || null,
  };
}

function parseRows(rows, fileType) {
  if (fileType === "START_LIST") return rows.slice(2).map(parseStartListRow).filter(Boolean);
  if (fileType === "FINAL_LANES") return parseFinaLanesRows(rows.slice(2));
  if (fileType === "TRAVEL") return rows.slice(1).map(parseTravelRow).filter(Boolean);
  return [];
}

function mergeAthletes(existing, incoming, fileType) {
  const byKey = new Map(
    existing.map((a) => [athleteMergeKey(a.lastName, a.firstName, a.nationality), { ...a }]),
  );
  let added = 0;
  let updated = 0;

  for (const record of incoming) {
    const key = athleteMergeKey(record.lastName, record.firstName, record.nationality);
    const ex = byKey.get(key);

    if (!ex) { byKey.set(key, record); added++; continue; }

    const merged = { ...ex };
    if (fileType === "TRAVEL") {
      if (record.manager)   merged.manager   = record.manager;
      if (record.arrival)   merged.arrival   = record.arrival;
      if (record.departure) merged.departure = record.departure;
    } else if (fileType === "FINAL_LANES") {
      if (record.heat !== null) merged.heat = record.heat;
      if (record.lane !== null) merged.lane = record.lane;
      if (!merged.pb && record.pb)           merged.pb       = record.pb;
      if (!merged.pbIndoor && record.pbIndoor) merged.pbIndoor = record.pbIndoor;
      if (!merged.pbOutdoor && record.pbOutdoor) merged.pbOutdoor = record.pbOutdoor;
      if (!merged.sb && record.sb)           merged.sb       = record.sb;
    } else {
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
    updated++;
  }

  return { merged: [...byKey.values()], added, updated };
}

// ─── Small shared components ─────────────────────────────────────────────────

function StatusBadge({ status }) {
  if (!status) return "—";
  if (status === "ok")  return <span className="status-pill status-pill--ok">OK</span>;
  if (status === "out") return <span className="status-pill status-pill--warn">Out</span>;
  return <span className="status-pill">{status}</span>;
}

function WaBadge({ value }) {
  if (!value) return <span style={{ color: "#aaa" }}>—</span>;
  return <span className="status-pill status-pill--accent" title="Source: World Athletics">{value}</span>;
}

function FileTypeBadge({ type }) {
  const map = {
    START_LIST:  ["Start list",   "status-pill status-pill--accent"],
    FINAL_LANES: ["Heats & Lanes","status-pill"],
    TRAVEL:      ["Travel",       "status-pill"],
    UNKNOWN:     ["Unknown",      "status-pill status-pill--warn"],
  };
  const [label, cls] = map[type] ?? map.UNKNOWN;
  return <span className={cls}>{label}</span>;
}

// ─── Inline WAID editor ───────────────────────────────────────────────────────

function WaidCell({ athlete, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(athlete.waid ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = value.trim();
    if (trimmed === (athlete.waid ?? "")) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(athlete.id, trimmed || null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        <input
          autoFocus
          style={{ width: 100, fontSize: "0.85rem", padding: "2px 4px" }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          placeholder="WAID"
          disabled={saving}
        />
        <button className="button button--ghost button--small" type="button" onClick={handleSave} disabled={saving}>✓</button>
        <button className="button button--ghost button--small" type="button" onClick={() => setEditing(false)}>✕</button>
      </span>
    );
  }

  return (
    <span
      style={{ cursor: "pointer", borderBottom: "1px dashed #999", paddingBottom: 1 }}
      title="Click to edit WAID"
      onClick={() => { setValue(athlete.waid ?? ""); setEditing(true); }}
    >
      {athlete.waid ?? <span style={{ color: "#aaa", fontStyle: "italic" }}>— add</span>}
    </span>
  );
}

// ─── WA sync button ───────────────────────────────────────────────────────────

function WaSyncButton({ athlete, settings, onDone }) {
  const [status, setStatus] = useState(null); // null | "syncing" | "ok" | "error"
  const [error, setError] = useState("");

  if (!athlete.waid) return <span style={{ color: "#ccc", fontSize: "0.8rem" }}>no WAID</span>;

  async function handleSync() {
    setStatus("syncing");
    setError("");
    try {
      const waData = await fetchAthleteFromWaService(athlete.waid, settings);
      await updateDoc(doc(db, ATHLETES_COLLECTION, athlete.id), waData);
      setStatus("ok");
      onDone?.();
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  }

  if (status === "syncing") return <span style={{ color: "#888", fontSize: "0.8rem" }}>syncing…</span>;
  if (status === "ok") return <span className="status-pill status-pill--ok" style={{ fontSize: "0.75rem" }}>synced ✓</span>;
  if (status === "error") return <span title={error} className="status-pill status-pill--warn" style={{ cursor: "help", fontSize: "0.75rem" }}>error ✕</span>;

  return (
    <button className="button button--ghost button--small" type="button" onClick={handleSync}>
      ↻ WA
    </button>
  );
}

// ─── Overview page ────────────────────────────────────────────────────────────

function AthletePortalOverview({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const { settings, loading: settingsLoading } = useAthletePortalSettings();
  const canImport = canImportAthletes(roles, settings);
  const { athletes, loading: athletesLoading } = useAthletes(!settingsLoading);
  const isAdmin = roles.includes("admin") || roles.includes("meeting_director");

  const seasons = settings?.seasons ?? DEFAULT_PORTAL_SETTINGS.seasons;

  const stats = useMemo(() => {
    const nations = new Set(athletes.map((a) => a.nationality).filter(Boolean));
    const withWaid = athletes.filter((a) => a.waid).length;
    const waSynced = athletes.filter((a) => a.waFetchedAt).length;
    const ok = athletes.filter((a) => a.status === "ok").length;
    const out = athletes.filter((a) => a.status === "out").length;
    const withLane = athletes.filter((a) => a.lane).length;
    const withTravel = athletes.filter((a) => a.arrival || a.departure).length;
    return { nations: nations.size, withWaid, waSynced, ok, out, withLane, withTravel };
  }, [athletes]);

  const eventCounts = useMemo(() => {
    const counts = {};
    athletes.forEach((a) => {
      const ev = String(a.event || "Unknown").trim();
      counts[ev] = (counts[ev] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  }, [athletes]);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Overview</h1>
          <p>
            Active seasons: <strong>Indoor {seasons.indoor}</strong> · <strong>Outdoor {seasons.outdoor}</strong>
          </p>
        </div>
      </section>

      <section className="panel-grid panel-grid--2">
        <Panel title="Roster">
          {athletesLoading ? <p className="panel-note">Loading…</p> : (
            <ul className="compact-list">
              <li><strong>{athletes.length}</strong> athletes · <strong>{stats.nations}</strong> nations · <strong>{eventCounts.length}</strong> events</li>
              <li>Status: <strong>{stats.ok}</strong> confirmed · <strong>{stats.out}</strong> withdrawn</li>
              <li>Lanes assigned: <strong>{stats.withLane}</strong></li>
              <li>Travel info: <strong>{stats.withTravel}</strong></li>
              <li>WAID known: <strong>{stats.withWaid}</strong> · WA synced: <strong>{stats.waSynced}</strong></li>
            </ul>
          )}
        </Panel>
        <Panel title="Quick access">
          <div className="dashboard-action-grid">
            <NavLink className="button button--secondary button-link" to="/app/athlete-portal/athletes">View athletes</NavLink>
            {canImport && <NavLink className="button button--secondary button-link" to="/app/athlete-portal/import">Import file</NavLink>}
            {isAdmin && <NavLink className="button button--secondary button-link" to="/app/athlete-portal/settings">Portal settings</NavLink>}
          </div>
        </Panel>
      </section>

      {eventCounts.length > 0 && (
        <section className="panel-grid panel-grid--1">
          <Panel title="Events">
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
      )}
    </div>
  );
}

// ─── Athletes list page ───────────────────────────────────────────────────────

function AthletesListPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const { settings, loading: settingsLoading } = useAthletePortalSettings();
  const { athletes, loading: athletesLoading } = useAthletes(!settingsLoading);
  const visibleFields = useMemo(() => getVisibleFields(roles, settings), [roles, settings]);
  const canEdit = roles.includes("admin") || roles.includes("meeting_director");
  const seasons = settings?.seasons ?? DEFAULT_PORTAL_SETTINGS.seasons;

  const [search, setSearch] = useState("");
  const [filterEvent, setFilterEvent] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllStatus, setSyncAllStatus] = useState("");

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

  async function handleSaveWaid(athleteId, waid) {
    await updateDoc(doc(db, ATHLETES_COLLECTION, athleteId), { waid });
  }

  async function handleSyncAll() {
    const withWaid = athletes.filter((a) => a.waid);
    if (!withWaid.length) { setSyncAllStatus("No athletes with a WAID to sync."); return; }
    setSyncingAll(true);
    setSyncAllStatus(`Syncing ${withWaid.length} athletes with World Athletics…`);

    let ok = 0;
    let failed = 0;
    for (const athlete of withWaid) {
      try {
        const waData = await fetchAthleteFromWaService(athlete.waid, settings);
        await updateDoc(doc(db, ATHLETES_COLLECTION, athlete.id), waData);
        ok++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 400)); // polite delay
    }

    setSyncAllStatus(`Sync complete: ${ok} updated, ${failed} failed.`);
    setSyncingAll(false);
  }

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

  // Determine which column groups are visible
  const showWa     = visibleFields.some((f) => f.group === "wa");
  const showExcel  = visibleFields.some((f) => f.group === "excel");

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Athletes</h1>
          <p>
            {filtered.length} of {athletes.length} athletes ·&nbsp;
            <strong>Indoor {seasons.indoor}</strong> · <strong>Outdoor {seasons.outdoor}</strong>
          </p>
        </div>
        {canEdit && (
          <div>
            <button
              className="button button--secondary"
              type="button"
              onClick={handleSyncAll}
              disabled={syncingAll}
            >
              {syncingAll ? "Syncing…" : "↻ Sync all with WA"}
            </button>
            {syncAllStatus && <p className="panel-note" style={{ marginTop: 4 }}>{syncAllStatus}</p>}
          </div>
        )}
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
                <option value="ok">OK</option>
                <option value="out">Out</option>
              </select>
            </label>
          </div>
        </Panel>
      </section>

      {athletes.length === 0 ? (
        <div className="notice-card">
          <strong>No athletes yet</strong>
          <p>No data imported yet. A Meeting Director can upload a start list.</p>
        </div>
      ) : (
        <section className="panel-grid panel-grid--1">
          <Panel title="Athlete list" subtitle={`${filtered.length} results`}>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {visibleFields.map((f) => <th key={f.key}>{f.label}</th>)}
                    {/* WAID and WA sync are always shown to admin/meeting_director */}
                    {canEdit && !visibleFields.find((f) => f.key === "waid") && <th>WAID</th>}
                    {canEdit && <th>WA sync</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className={a.status === "out" ? "row--muted" : ""}>
                      {visibleFields.map((f) => (
                        <td key={f.key}>
                          {f.key === "waid" && canEdit
                            ? <WaidCell athlete={a} onSave={handleSaveWaid} />
                            : f.key === "status"
                              ? <StatusBadge status={a.status} />
                              : f.key === "waUrl" && a.waUrl
                                ? <a href={a.waUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem" }}>WA ↗</a>
                                : (f.group === "wa" && f.key !== "waid" && f.key !== "waUrl" && f.key !== "waFetchedAt")
                                  ? <WaBadge value={a[f.key]} />
                                  : a[f.key] ?? "—"}
                        </td>
                      ))}
                      {canEdit && !visibleFields.find((f) => f.key === "waid") && (
                        <td><WaidCell athlete={a} onSave={handleSaveWaid} /></td>
                      )}
                      {canEdit && (
                        <td><WaSyncButton athlete={a} settings={settings} /></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {showWa && (
              <p className="panel-note" style={{ marginTop: "0.5rem" }}>
                <span className="status-pill status-pill--accent">value</span> = sourced from World Athletics · overrides Excel data
              </p>
            )}
          </Panel>
        </section>
      )}
    </div>
  );
}

// ─── Import page ──────────────────────────────────────────────────────────────

function AthleteImportPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const { settings, loading: settingsLoading } = useAthletePortalSettings();
  const canImport = canImportAthletes(roles, settings);
  const { athletes } = useAthletes(true);

  const [parsed, setParsed] = useState(null);
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

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("Reading file…"); setParsed(null);
    try {
      const { read, utils } = await import("xlsx");
      const wb = read(await file.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (rows.length < 2) { setStatus("File appears empty."); return; }
      const fileType = detectFileType(rows[0]);
      const records = parseRows(rows, fileType);
      setParsed({ fileType, records, fileName: file.name });
      setStatus(`Detected: ${fileType} — ${records.length} records.`);
    } catch (err) { setStatus(`Error: ${err.message}`); }
  }

  async function handleImport() {
    if (!parsed) return;
    setSaving(true); setStatus("Merging and saving…");
    try {
      const { merged, added, updated } = mergeAthletes(athletes, parsed.records, parsed.fileType);
      const batch = writeBatch(db);
      athletes.forEach((a) => batch.delete(doc(db, ATHLETES_COLLECTION, a.id)));
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
      setStatus(`Done. ${added} added · ${updated} updated · ${merged.length} total.`);
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) { setStatus(`Import failed: ${err.message}`); }
    finally { setSaving(false); }
  }

  const mergePreview = useMemo(
    () => (parsed ? mergeAthletes(athletes, parsed.records, parsed.fileType) : null),
    [parsed, athletes],
  );

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Import file</h1>
          <p>Format detected automatically. Existing WAID and WA data are always preserved.</p>
        </div>
      </section>

      <section className="panel-grid panel-grid--2">
        <Panel title="Accepted formats">
          <ul className="compact-list">
            <li><strong>Start list</strong> — Event, Name, Vorname, Nat., Jahrg., Status, WR, PB, SB25, WA Profile</li>
            <li><strong>Heats &amp; Lanes</strong> — same columns + Heat rows and Lane; only updates lane/heat assignments</li>
            <li><strong>Travel</strong> — Event, Name, Vorname, Nat., Manager, Anreise, Abreise; only adds logistics</li>
          </ul>
          <p className="panel-note">WA data (WAID, PBs from WA) is never overwritten by an import — only by a manual WA sync.</p>
        </Panel>
        <Panel title="Upload">
          <label className="field">
            <span>Excel file (.xlsx)</span>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={saving} />
          </label>
          {status && <p className="panel-note">{status}</p>}
        </Panel>
      </section>

      {parsed && (
        <>
          <section className="panel-grid panel-grid--2">
            <Panel title="Detection result">
              <ul className="compact-list">
                <li>File: <strong>{parsed.fileName}</strong></li>
                <li>Type: <FileTypeBadge type={parsed.fileType} /></li>
                <li>Records in file: <strong>{parsed.records.length}</strong></li>
              </ul>
            </Panel>
            {mergePreview && (
              <Panel title="Merge preview">
                <ul className="compact-list">
                  <li>Currently in DB: <strong>{athletes.length}</strong></li>
                  <li>New athletes: <strong>{mergePreview.added}</strong></li>
                  <li>Updated: <strong>{mergePreview.updated}</strong></li>
                  <li>Total after import: <strong>{mergePreview.merged.length}</strong></li>
                </ul>
                {parsed.fileType === "TRAVEL" && <p className="panel-note">Only updates manager/arrival/departure.</p>}
                {parsed.fileType === "FINAL_LANES" && <p className="panel-note">Only updates heat/lane; fills missing PBs.</p>}
              </Panel>
            )}
          </section>

          <section className="panel-grid panel-grid--1">
            <Panel title="Preview — first 10 records">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Event</th><th>Last name</th><th>First name</th><th>Nat.</th>
                      {parsed.fileType === "START_LIST" && <><th>Status</th><th>WR</th><th>PB Indoor</th><th>PB Outdoor</th><th>SB</th><th>WAID</th></>}
                      {parsed.fileType === "FINAL_LANES" && <><th>Heat</th><th>Lane</th><th>PB Indoor</th><th>SB</th></>}
                      {parsed.fileType === "TRAVEL" && <><th>Manager</th><th>Arrival</th><th>Departure</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.records.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        <td>{r.event}</td><td>{r.lastName}</td><td>{r.firstName}</td><td>{r.nationality}</td>
                        {parsed.fileType === "START_LIST" && (
                          <><td>{r.status ? <StatusBadge status={r.status} /> : "—"}</td><td>{r.worldRanking ?? "—"}</td><td>{r.pbIndoor ?? "—"}</td><td>{r.pbOutdoor ?? "—"}</td><td>{r.sb ?? "—"}</td><td>{r.waid ?? "—"}</td></>
                        )}
                        {parsed.fileType === "FINAL_LANES" && (
                          <><td>{r.heat ?? "—"}</td><td>{r.lane ?? "—"}</td><td>{r.pbIndoor ?? "—"}</td><td>{r.sb ?? "—"}</td></>
                        )}
                        {parsed.fileType === "TRAVEL" && (
                          <><td>{r.manager ?? "—"}</td><td>{r.arrival ?? "—"}</td><td>{r.departure ?? "—"}</td></>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dashboard-action-grid" style={{ marginTop: "1rem" }}>
                <button className="button button--primary" type="button" onClick={handleImport} disabled={saving || parsed.fileType === "UNKNOWN"}>
                  {saving ? "Importing…" : `Confirm import (${parsed.records.length} records)`}
                </button>
                <button className="button button--secondary" type="button" onClick={() => { setParsed(null); setStatus(""); if (fileRef.current) fileRef.current.value = ""; }} disabled={saving}>
                  Cancel
                </button>
              </div>
              {parsed.fileType === "UNKNOWN" && (
                <p className="panel-note" style={{ color: "var(--color-danger, #c0392b)" }}>
                  Format not recognized. Please check this is a CMCM start list, lanes or travel file.
                </p>
              )}
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

// ─── Settings page ────────────────────────────────────────────────────────────

function AthletePortalSettingsPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const isAdmin = roles.includes("admin");
  const { settings, loading } = useAthletePortalSettings();

  const [accessRoles,    setAccessRoles]    = useState([]);
  const [importerRoles,  setImporterRoles]  = useState([]);
  const [fieldVisibility,setFieldVisibility]= useState({});
  const [indoorSeason,   setIndoorSeason]   = useState(DEFAULT_PORTAL_SETTINGS.seasons.indoor);
  const [outdoorSeason,  setOutdoorSeason]  = useState(DEFAULT_PORTAL_SETTINGS.seasons.outdoor);
  const [waServiceUrl,   setWaServiceUrl]   = useState(DEFAULT_PORTAL_SETTINGS.waServiceUrl);
  const [saveStatus,     setSaveStatus]     = useState("");
  const [saving,         setSaving]         = useState(false);
  const [initialized,    setInitialized]    = useState(false);

  if (!initialized && settings) {
    setAccessRoles(settings.accessRoles ?? DEFAULT_PORTAL_SETTINGS.accessRoles);
    setImporterRoles(settings.importerRoles ?? DEFAULT_PORTAL_SETTINGS.importerRoles);
    setFieldVisibility(settings.fieldVisibility ?? DEFAULT_PORTAL_SETTINGS.fieldVisibility);
    setIndoorSeason(settings.seasons?.indoor ?? DEFAULT_PORTAL_SETTINGS.seasons.indoor);
    setOutdoorSeason(settings.seasons?.outdoor ?? DEFAULT_PORTAL_SETTINGS.seasons.outdoor);
    setWaServiceUrl(settings.waServiceUrl ?? DEFAULT_PORTAL_SETTINGS.waServiceUrl);
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

  if (loading) return <div className="page"><p className="panel-note">Loading…</p></div>;

  function toggleRole(list, setter, role) {
    setter((p) => p.includes(role) ? p.filter((r) => r !== role) : [...p, role]);
  }

  function toggleField(role, key) {
    setFieldVisibility((p) => {
      const cur = new Set(p[role] ?? []);
      cur.has(key) ? cur.delete(key) : cur.add(key);
      return { ...p, [role]: [...cur] };
    });
  }

  function setGroupForRole(role, group, on) {
    const keys = ALL_ATHLETE_FIELDS.filter((f) => f.group === group).map((f) => f.key);
    setFieldVisibility((p) => {
      const cur = new Set(p[role] ?? []);
      keys.forEach((k) => on ? cur.add(k) : cur.delete(k));
      return { ...p, [role]: [...cur] };
    });
  }

  function groupAllGranted(role, group) {
    const cur = fieldVisibility[role] ?? [];
    return ALL_ATHLETE_FIELDS.filter((f) => f.group === group).every((f) => cur.includes(f.key));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setSaveStatus("Saving…");
    try {
      await setDoc(
        doc(db, ...ATHLETE_PORTAL_SETTINGS_PATH),
        {
          accessRoles, importerRoles, fieldVisibility,
          seasons: { indoor: Number(indoorSeason), outdoor: Number(outdoorSeason) },
          waServiceUrl: waServiceUrl.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setSaveStatus("Settings saved.");
    } catch (err) { setSaveStatus(`Save failed: ${err.message}`); }
    finally { setSaving(false); }
  }

  const activeRoles = PLATFORM_ROLES.filter((r) => accessRoles.includes(r.key));

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Portal settings</h1>
          <p>Access control, season configuration and World Athletics integration.</p>
        </div>
      </section>

      <form onSubmit={handleSave}>
        {/* Seasons & WA service */}
        <section className="panel-grid panel-grid--2">
          <Panel title="Active seasons" subtitle="Meeting year N → Indoor N · Outdoor N−1">
            <div className="field-grid">
              <label className="field">
                <span>Indoor season year</span>
                <input type="number" min="2020" max="2040" value={indoorSeason} onChange={(e) => setIndoorSeason(e.target.value)} />
              </label>
              <label className="field">
                <span>Outdoor season year</span>
                <input type="number" min="2020" max="2040" value={outdoorSeason} onChange={(e) => setOutdoorSeason(e.target.value)} />
              </label>
            </div>
            <p className="panel-note">
              WA SBs are filtered by these years. For CMCM {indoorSeason}: indoor {indoorSeason}, outdoor {outdoorSeason}.
            </p>
          </Panel>
          <Panel title="World Athletics service" subtitle="URL of the wa-service backend.">
            <label className="field">
              <span>WA service URL</span>
              <input
                type="url"
                value={waServiceUrl}
                onChange={(e) => setWaServiceUrl(e.target.value)}
                placeholder="http://localhost:3001"
              />
            </label>
            <p className="panel-note">
              Run <code>npm start</code> in <code>wa-service/</code> for local development.
              In production, deploy the service and enter its public URL here.
            </p>
          </Panel>
        </section>

        {/* Access & import rights */}
        <section className="panel-grid panel-grid--2">
          <Panel title="Portal access" subtitle="Who can enter the Athlete Portal.">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {PLATFORM_ROLES.map((role) => (
                <label key={role.key} style={{ display: "flex", gap: "0.5rem", alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={accessRoles.includes(role.key)} disabled={role.key === "admin"} onChange={() => toggleRole(accessRoles, setAccessRoles, role.key)} />
                  <span>{role.label}</span>
                  {role.key === "admin" && <span className="status-pill status-pill--accent">always</span>}
                </label>
              ))}
            </div>
          </Panel>
          <Panel title="Import rights" subtitle="Who can upload Excel files.">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {activeRoles.map((role) => (
                <label key={role.key} style={{ display: "flex", gap: "0.5rem", alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={importerRoles.includes(role.key)} onChange={() => toggleRole(importerRoles, setImporterRoles, role.key)} />
                  <span>{role.label}</span>
                </label>
              ))}
            </div>
            <p className="panel-note">Only roles with portal access are shown.</p>
          </Panel>
        </section>

        {/* Field visibility */}
        <section className="panel-grid panel-grid--1">
          <Panel title="Field visibility per role" subtitle="Which columns each role can see. WA data always overrides Excel for the same field.">
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Field</th>
                    <th style={{ minWidth: 110 }}>Source</th>
                    {activeRoles.map((r) => <th key={r.key} style={{ minWidth: 130, textAlign: "center" }}>{r.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {FIELD_GROUPS.map((group) => {
                    const gFields = ALL_ATHLETE_FIELDS.filter((f) => f.group === group.key);
                    return gFields.map((field, fi) => (
                      <tr key={field.key}>
                        <td>{field.label}</td>
                        {fi === 0 ? (
                          <td rowSpan={gFields.length} style={{ verticalAlign: "middle" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span className="status-pill">{group.label}</span>
                              {activeRoles.map((r) => (
                                <button
                                  key={r.key}
                                  type="button"
                                  className="button button--ghost button--small"
                                  onClick={() => setGroupForRole(r.key, group.key, !groupAllGranted(r.key, group.key))}
                                  style={{ fontSize: "0.68rem", padding: "1px 5px" }}
                                >
                                  {groupAllGranted(r.key, group.key) ? "−" : "+"} {r.label.split(" ")[0]}
                                </button>
                              ))}
                            </div>
                          </td>
                        ) : null}
                        {activeRoles.map((r) => (
                          <td key={r.key} style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={(fieldVisibility[r.key] ?? []).includes(field.key)}
                              onChange={() => toggleField(r.key, field.key)}
                            />
                          </td>
                        ))}
                      </tr>
                    ));
                  })}
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
            {saveStatus && <p className="panel-note">{saveStatus}</p>}
          </Panel>
        </section>
      </form>
    </div>
  );
}

export { AthletePortalOverview, AthletesListPage, AthleteImportPage, AthletePortalSettingsPage };
