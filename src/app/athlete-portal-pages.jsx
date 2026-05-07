import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { useAuth } from "../context/auth-context";
import { getActiveRoles } from "./navigation";
import {
  ALL_ATHLETE_FIELDS,
  ATHLETES_COLLECTION,
  ATHLETE_REGISTRY_COLLECTION,
  DEFAULT_PORTAL_SETTINGS,
  FIELD_GROUPS,
  athleteMergeKey,
  canImportAthletes,
  extractWaid,
  fetchAthleteFromWaService,
  getVisibleFields,
  normalizeBirthYear,
  parsePb,
  upsertAthleteRegistry,
  useAthletePortalSettings,
  useAthleteRegistry,
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

// ─── Travel entry parser ──────────────────────────────────────────────────────
// Parses strings like "17. flight 21:45 with LG8254 from Nice"
//                  or "19. flight 06:00 with LG3759 to Lisbon"
// into structured fields: day, time, flightNo, dir ("from"|"to"), city.

// Flexible travel regex:
//   "17. flight 21:45 with LG3752 from Lisbon"
//   "16. flight 22:20 with KL 1715 from AMS"   ← space in flight no.
//   "17. flight 10:15 LH9528 from Frankfurt"    ← no "with"
//   "17. flight 17:50 with KL1713"              ← no city
const _TRAVEL_RE = /^(\d+)\.\s+(\S+)\s+(\d{1,2}:\d{2})\s+(?:with\s+)?([A-Z]{1,3}\s*\d+[A-Z0-9]*)(?:\s+(from|to)\s+(.+))?$/i;

function parseTravelEntry(text) {
  if (!text) return null;
  const m = _TRAVEL_RE.exec(String(text).trim());
  if (!m) return null;
  return {
    day:      parseInt(m[1], 10),
    mode:     m[2].toLowerCase(),
    time:     m[3],
    flightNo: m[4].replace(/\s+/g, "").toUpperCase(), // "KL 1715" → "KL1715"
    dir:      (m[5] || "").toLowerCase(),              // "from" | "to" | ""
    city:     (m[6] || "").trim(),
  };
}

/** Expand a raw arrival or departure string into structured sub-fields. */
function expandTravelField(raw, prefix) {
  // prefix = "arrival" | "departure"
  const p = parseTravelEntry(raw);
  if (!p) return {};
  const cityKey = prefix === "arrival" ? `${prefix}From` : `${prefix}To`;
  return {
    [`${prefix}Day`]:    p.day,
    [`${prefix}Time`]:   p.time,
    [`${prefix}Flight`]: p.flightNo,
    [cityKey]:           p.city,
  };
}

function TravelCell({ raw, prefix }) {
  if (!raw) return <span style={{ color: "#bbb" }}>—</span>;
  const p = parseTravelEntry(raw);
  if (!p) return <span style={{ fontSize: "0.82rem", color: "#555" }}>{raw}</span>;
  const arrow = prefix === "arrival" ? "← " : "→ ";
  return (
    <div style={{ lineHeight: 1.65, fontSize: "0.82rem" }}>
      <div style={{ fontWeight: 600 }}>
        Jour {p.day}{p.time ? ` · ${p.time}` : ""}
      </div>
      <div style={{ color: "#555" }}>
        ✈ {p.flightNo} {arrow}{p.city}
      </div>
    </div>
  );
}

// ─── File type detection & parsing ───────────────────────────────────────────

// Column-name patterns for the new "all-in-one" combined file format.
const COMBINED_COL_PATTERNS = {
  event:        [/^event$/,          /^épreuve$/,    /^discipline$/],
  lastName:     [/^last\s?name$/,    /^nom$/,        /^name$/,       /^surname$/],
  firstName:    [/^first\s?name$/,   /^prénom$/,     /^prenom$/,     /^vorname$/],
  nationality:  [/^nat(ionality)?$/, /^pays$/,       /^land$/],
  birthYear:    [/^birth\s?year$/,   /^year$/,       /^jahrg\.?$/,   /^année$/],
  status:       [/^status$/],
  worldRanking: [/^wr$/,             /^world\s?ranking$/, /^ranking$/],
  pb:           [/^pb$/],
  pbIndoor:     [/^pb\s?indoor$/],
  pbOutdoor:    [/^pb\s?outdoor$/],
  sb:           [/^sb\d*$/],
  waUrl:        [/^wa\s?(url|profile)?$/, /^world\s?athletics$/],
  heat:         [/^heat$/,           /^série$/,      /^serie$/],
  lane:         [/^lane$/,           /^couloir$/],
  manager:      [/^manager$/,        /^gestionnaire$/],
  arrival:      [/^arrival$/,        /^anreise$/,    /^arrivée$/,    /^arrivee$/],
  departure:    [/^departure$/,      /^abreise$/,    /^départ$/,     /^depart$/],
};

function buildColMap(row) {
  const h = row.map((c) => String(c || "").trim().toLowerCase());
  const map = {};
  for (const [field, pats] of Object.entries(COMBINED_COL_PATTERNS)) {
    const idx = h.findIndex((cell) => pats.some((p) => p.test(cell)));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

function detectFileType(rows) {
  // Try rows 0-2 to find the best header (most recognized columns).
  let bestMap = {};
  let bestHeaderIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 3); i++) {
    const m = buildColMap(rows[i]);
    if (Object.keys(m).length > Object.keys(bestMap).length) {
      bestMap = m; bestHeaderIdx = i;
    }
  }
  const hasPerfCols   = "status" in bestMap || "worldRanking" in bestMap || "pb" in bestMap || "pbIndoor" in bestMap;
  const hasTravelCols = "manager" in bestMap || "arrival" in bestMap;
  const hasIdent      = "lastName" in bestMap && "firstName" in bestMap;
  if (hasIdent && hasPerfCols && hasTravelCols) {
    return { type: "COMBINED", colMap: bestMap, dataStartIdx: bestHeaderIdx + 1 };
  }

  // Position-based fallback for the legacy CMCM Excel formats.
  const h = rows[0].map((c) => String(c || "").trim().toLowerCase());
  if (h[4] === "manager" || (h[5] || "").startsWith("anreise")) return { type: "TRAVEL",     colMap: null, dataStartIdx: 1 };
  if (h[7] === "status"  || h[8] === "wr")                      return { type: "START_LIST", colMap: null, dataStartIdx: 2 };
  if (h[7] === "pb"      || h[7] === "pb ")                     return { type: "FINAL_LANES",colMap: null, dataStartIdx: 2 };
  if (h[2] === "event")                                          return { type: "START_LIST", colMap: null, dataStartIdx: 2 };
  return { type: "UNKNOWN", colMap: null, dataStartIdx: 1 };
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
  const arrival   = norm(row[5]) || null;
  const departure = norm(row[6]) || null;
  return {
    event: norm(row[0]), lastName, firstName,
    nationality: norm(row[3]),
    birthYear: null, status: null, worldRanking: null,
    pb: null, pbIndoor: null, pbOutdoor: null, sb: null,
    waUrl: null, waid: null, heat: null, lane: null,
    manager: norm(row[4]) || null,
    arrival, ...expandTravelField(arrival, "arrival"),
    departure, ...expandTravelField(departure, "departure"),
  };
}

function parseCombinedRow(row, colMap) {
  const g = (field) => colMap[field] !== undefined ? norm(row[colMap[field]]) : "";
  const lastName  = g("lastName");
  const firstName = g("firstName");
  if (!lastName && !firstName) return null;

  const rawPb   = g("pb");
  const rawWaUrl = g("waUrl");
  const { indoor: parsedPbIn, outdoor: parsedPbOut } = parsePb(rawPb);
  const rawLane = g("lane");

  return {
    event:        g("event")        || null,
    lastName,     firstName,
    nationality:  g("nationality")  || null,
    birthYear:    normalizeBirthYear(colMap.birthYear !== undefined ? row[colMap.birthYear] : null),
    status:       g("status").toLowerCase() || null,
    worldRanking: (() => { const v = g("worldRanking"); return v !== "" && !isNaN(Number(v)) ? Number(v) : null; })(),
    pb:           rawPb || null,
    pbIndoor:     g("pbIndoor")  || parsedPbIn  || null,
    pbOutdoor:    g("pbOutdoor") || parsedPbOut || null,
    sb:           g("sb")        || null,
    waUrl:        rawWaUrl.startsWith("http") ? rawWaUrl : null,
    waid:         extractWaid(rawWaUrl),
    heat:         g("heat") || null,
    lane:         rawLane !== "" && !isNaN(Number(rawLane)) ? Number(rawLane) : null,
    manager:   g("manager")   || null,
    arrival:   g("arrival")   || null,
    departure: g("departure") || null,
    ...expandTravelField(g("arrival")   || null, "arrival"),
    ...expandTravelField(g("departure") || null, "departure"),
  };
}

function parseRows(rows, detected) {
  const { type, colMap, dataStartIdx } = detected;
  if (type === "START_LIST")  return rows.slice(dataStartIdx).map(parseStartListRow).filter(Boolean);
  if (type === "FINAL_LANES") return parseFinaLanesRows(rows.slice(dataStartIdx));
  if (type === "TRAVEL")      return rows.slice(dataStartIdx).map(parseTravelRow).filter(Boolean);
  if (type === "COMBINED")    return rows.slice(dataStartIdx).map((r) => parseCombinedRow(r, colMap)).filter(Boolean);
  return [];
}

// Helper: copy all structured travel sub-fields from a record onto a merged athlete.
function applyTravelFields(merged, record) {
  if (record.arrival !== undefined) {
    merged.arrival       = record.arrival       ?? null;
    merged.arrivalDay    = record.arrivalDay    ?? null;
    merged.arrivalTime   = record.arrivalTime   ?? null;
    merged.arrivalFlight = record.arrivalFlight ?? null;
    merged.arrivalFrom   = record.arrivalFrom   ?? null;
  }
  if (record.departure !== undefined) {
    merged.departure       = record.departure       ?? null;
    merged.departureDay    = record.departureDay    ?? null;
    merged.departureTime   = record.departureTime   ?? null;
    merged.departureFlight = record.departureFlight ?? null;
    merged.departureTo     = record.departureTo     ?? null;
  }
  if (record.manager !== undefined) merged.manager = record.manager ?? null;
}

function mergeAthletes(existing, incoming, fileType) {
  const byKey = new Map(
    existing.map((a) => [athleteMergeKey(a.lastName, a.firstName, a.nationality), { ...a }]),
  );
  const matchedKeys = new Set(); // tracks which existing athletes appear in this import
  let added = 0;
  let updated = 0;

  for (const record of incoming) {
    const key = athleteMergeKey(record.lastName, record.firstName, record.nationality);
    const ex = byKey.get(key);

    if (!ex) { byKey.set(key, { ...record }); added++; continue; }

    matchedKeys.add(key);
    const merged = { ...ex };

    if (fileType === "COMBINED") {
      if (record.event)                merged.event        = record.event;
      if (record.status !== null)      merged.status       = record.status;
      if (record.worldRanking != null) merged.worldRanking = record.worldRanking;
      if (record.pb)                   merged.pb           = record.pb;
      if (record.pbIndoor)             merged.pbIndoor     = record.pbIndoor;
      if (record.pbOutdoor)            merged.pbOutdoor    = record.pbOutdoor;
      if (record.sb)                   merged.sb           = record.sb;
      if (record.waUrl && !merged.waUrl) merged.waUrl      = record.waUrl;
      if (record.waid  && !merged.waid)  merged.waid       = record.waid;
      merged.heat = record.heat ?? null;
      merged.lane = record.lane ?? null;
      applyTravelFields(merged, record);
    } else if (fileType === "TRAVEL") {
      applyTravelFields(merged, record);
    } else if (fileType === "FINAL_LANES") {
      if (record.heat !== null) merged.heat = record.heat;
      if (record.lane !== null) merged.lane = record.lane;
      if (!merged.pb && record.pb)             merged.pb       = record.pb;
      if (!merged.pbIndoor && record.pbIndoor) merged.pbIndoor = record.pbIndoor;
      if (!merged.pbOutdoor && record.pbOutdoor) merged.pbOutdoor = record.pbOutdoor;
      if (!merged.sb && record.sb)             merged.sb       = record.sb;
    } else {
      // START_LIST
      if (record.status !== null)       merged.status       = record.status;
      if (record.worldRanking !== null) merged.worldRanking = record.worldRanking;
      if (record.pb)        merged.pb        = record.pb;
      if (record.pbIndoor)  merged.pbIndoor  = record.pbIndoor;
      if (record.pbOutdoor) merged.pbOutdoor = record.pbOutdoor;
      if (record.sb)        merged.sb        = record.sb;
      if (record.waUrl)     merged.waUrl     = record.waUrl;
      if (record.waid)      merged.waid      = record.waid;
    }

    byKey.set(key, merged);
    updated++;
  }

  // For COMBINED / START_LIST: athletes in the DB but absent from this import
  // → mark as "out", clear heat/lane/travel (they're no longer on the start list).
  // They are NEVER deleted — they stay in the system permanently.
  let markedOut = 0;
  if (fileType === "COMBINED" || fileType === "START_LIST") {
    for (const [key, athlete] of byKey) {
      if (athlete.id && !matchedKeys.has(key)) {
        byKey.set(key, {
          ...athlete,
          status:    "out",
          heat: null, lane: null, manager: null,
          arrival: null, arrivalDay: null, arrivalTime: null, arrivalFlight: null, arrivalFrom: null,
          departure: null, departureDay: null, departureTime: null, departureFlight: null, departureTo: null,
        });
        markedOut++;
      }
    }
  }

  return { merged: [...byKey.values()], added, updated, markedOut };
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
    COMBINED:    ["Combined (all data)", "status-pill status-pill--accent"],
    START_LIST:  ["Start list",          "status-pill status-pill--accent"],
    FINAL_LANES: ["Heats & Lanes",       "status-pill"],
    TRAVEL:      ["Travel",              "status-pill"],
    UNKNOWN:     ["Unknown",             "status-pill status-pill--warn"],
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
      const waData = await fetchAthleteFromWaService(athlete.waid, settings, athlete.event);
      const { _waIdentity, ...firestoreData } = waData;
      await updateDoc(doc(db, ATHLETES_COLLECTION, athlete.id), firestoreData);
      // Persist identity to the permanent registry (fire & forget)
      if (_waIdentity) {
        upsertAthleteRegistry({
          ..._waIdentity,
          nationality: athlete.nationality,
          birthYear:   athlete.birthYear,
        }).catch(() => {});
      }
      setStatus("ok");
      onDone?.();
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  }

  if (status === "syncing") return <span style={{ color: "#888", fontSize: "0.8rem" }}>syncing…</span>;
  if (status === "ok")      return <span className="status-pill status-pill--ok" style={{ fontSize: "0.75rem" }}>synced ✓</span>;

  if (status === "error") return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px", maxWidth: 220 }}>
      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        <span className="status-pill status-pill--warn" style={{ fontSize: "0.75rem" }}>error ✕</span>
        <button className="button button--ghost button--small" type="button" onClick={handleSync} title="Retry">↻</button>
      </div>
      <span style={{
        fontSize: "0.7rem", color: "#b71c1c", lineHeight: 1.35,
        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
        overflow: "hidden", wordBreak: "break-word",
      }} title={error}>
        {error}
      </span>
    </div>
  );

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
            Seasons: <strong>Indoor {seasons.indoor}</strong>
            {seasons.indoorCurrent && seasons.indoorCurrent !== seasons.indoor && (
              <> · <strong>Indoor {seasons.indoorCurrent}</strong> <span style={{ fontWeight: "normal", color: "#888" }}>(current, few results)</span></>
            )}
            {" · "}<strong>Outdoor {seasons.outdoor}</strong>
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
            {isAdmin && <NavLink className="button button--secondary button-link" to="/app/athlete-portal/registry">Athletes database</NavLink>}
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

// ─── Athletes list page — helpers ────────────────────────────────────────────

// Splits "60m W" → { discipline:"60m", gender:"W" }   "W 100m" → { discipline:"100m", gender:"W" }
const _GENDER_SUFFIX_RE = /^(.+?)\s+(W|M|F|H|Women|Men|Femmes?|Hommes?)$/i;
const _GENDER_PREFIX_RE = /^(W|M|F|H)\s+(.+)$/i;

function parseEventField(raw) {
  if (!raw) return { discipline: "", gender: null };
  const s = String(raw).trim();
  let m = _GENDER_SUFFIX_RE.exec(s);
  if (m) {
    const g = m[2][0].toUpperCase();
    return { discipline: m[1].trim(), gender: (g === "W" || g === "F") ? "W" : "M" };
  }
  m = _GENDER_PREFIX_RE.exec(s);
  if (m) {
    const g = m[1][0].toUpperCase();
    return { discipline: m[2].trim(), gender: (g === "W" || g === "F") ? "W" : "M" };
  }
  return { discipline: s, gender: null };
}

const _DISC_RANK = [
  "60m","60mH","100m","200m","400m","600m","800m","1000m","1500m","1mile",
  "2000m","3000m","2miles","5000m","10000m","110mH","400mH","3000mSC",
  "HJ","PV","LJ","TJ","SP","DT","HT","JT","Pen","Hep","Dec",
];
function disciplineRank(disc) {
  const d = (disc || "").toLowerCase().replace(/[\s-]/g, "");
  const i = _DISC_RANK.findIndex((x) => d === x.toLowerCase() || d.startsWith(x.toLowerCase()));
  return i >= 0 ? i : 999;
}

function compareEventGroups([keyA], [keyB]) {
  const pa = parseEventField(keyA);
  const pb = parseEventField(keyB);
  const da = disciplineRank(pa.discipline);
  const db = disciplineRank(pb.discipline);
  if (da !== db) return da - db;
  // Women (W) before Men (M) — typical meeting program order
  if (pa.gender !== pb.gender) {
    if (pa.gender === "W") return -1;
    if (pb.gender === "W") return  1;
  }
  return keyA.localeCompare(keyB);
}

/**
 * Best available competition reference time for heat seeding.
 * Priority: current indoor SB → prev indoor SB → outdoor SB → indoor PB → outdoor PB → raw SB/PB
 */
function getCompPace(a) {
  return a.waIndoorSbCurrent || a.waIndoorSb || a.waOutdoorSb
      || a.waPbIndoor || a.waPbOutdoor
      || a.sb || a.pb || null;
}

function GenderBadge({ gender }) {
  if (!gender) return null;
  const w = gender === "W";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 10px", borderRadius: 999,
      fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em",
      background: w ? "#fce4ec" : "#e3f2fd",
      color: w ? "#b71c1c" : "#1565c0",
      flexShrink: 0,
      textTransform: "uppercase",
    }}>
      {w ? "Women" : "Men"}
    </span>
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

  // ── Filter state ────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState("");
  const [filterEvent,  setFilterEvent]  = useState("");
  const [filterGender, setFilterGender] = useState("");
  const [filterNat,    setFilterNat]    = useState("");
  const [filterHeat,   setFilterHeat]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterWa,     setFilterWa]     = useState("");
  const [groupByEvent, setGroupByEvent] = useState(true);
  // Column visibility — keys in this set are hidden (lastName + firstName always visible)
  const [hiddenCols,    setHiddenCols]    = useState(new Set());
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef(null);
  const tableRef = useRef(null);

  // Close column picker when clicking outside it
  useLayoutEffect(() => {
    if (!colPickerOpen) return;
    function handleClick(e) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target)) {
        setColPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [colPickerOpen]);
  const [syncingAll,      setSyncingAll]      = useState(false);
  const [syncAllStatus,   setSyncAllStatus]   = useState("");
  const [syncAllFailures, setSyncAllFailures] = useState([]); // [{ name, waid, error }]

  // ── Augment each athlete with parsed event fields ───────────────────────────
  const athletesParsed = useMemo(
    () => athletes.map((a) => ({ ...a, _ev: parseEventField(a.event) })),
    [athletes],
  );

  // ── Build dropdown option lists ─────────────────────────────────────────────
  const filterOptions = useMemo(() => {
    const disciplines = new Set();
    const nats  = new Set();
    const heats = new Set();
    athletesParsed.forEach((a) => {
      if (a._ev.discipline) disciplines.add(a._ev.discipline);
      if (a.nationality)    nats.add(String(a.nationality).trim());
      if (a.heat)           heats.add(String(a.heat).trim());
    });
    return {
      disciplines: [...disciplines].sort((a, b) => disciplineRank(a) - disciplineRank(b) || a.localeCompare(b)),
      nats:  [...nats].sort(),
      heats: [...heats].sort((a, b) => {
        const na = parseInt(a, 10); const nb = parseInt(b, 10);
        return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b);
      }),
    };
  }, [athletesParsed]);

  // ── Apply all filters ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return athletesParsed.filter((a) => {
      if (filterEvent  && a._ev.discipline !== filterEvent)               return false;
      if (filterGender && a._ev.gender     !== filterGender)              return false;
      if (filterNat    && String(a.nationality || "").trim() !== filterNat) return false;
      if (filterHeat   && String(a.heat    || "").trim() !== filterHeat)  return false;
      if (filterStatus && a.status !== filterStatus)                      return false;
      if (filterWa === "synced"   && !a.waFetchedAt) return false;
      if (filterWa === "has_waid" && !a.waid)        return false;
      if (filterWa === "no_waid"  &&  a.waid)        return false;
      if (q) {
        const hay = [a.lastName, a.firstName, a.nationality, a.waid]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [athletesParsed, search, filterEvent, filterGender, filterNat, filterHeat, filterStatus, filterWa]);

  // ── Group athletes by event, sort within group by heat → lane → name ────────
  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((a) => {
      const key = String(a.event || "").trim() || "(no event)";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    map.forEach((grp) => {
      grp.sort((a, b) => {
        const ha = parseInt(a.heat, 10) || 999; const hb = parseInt(b.heat, 10) || 999;
        if (ha !== hb) return ha - hb;
        const la = parseInt(a.lane, 10) || 999; const lb = parseInt(b.lane, 10) || 999;
        if (la !== lb) return la - lb;
        return String(a.lastName || "").localeCompare(String(b.lastName || ""));
      });
    });
    return [...map.entries()].sort(compareEventGroups);
  }, [filtered]);

  // ── Column config ───────────────────────────────────────────────────────────
  // In grouped view, drop "event" (shown in section header instead)
  // tableFields = all fields the user is allowed to see (before the hide toggle)
  const tableFields = useMemo(
    () => (groupByEvent ? visibleFields.filter((f) => f.key !== "event") : visibleFields),
    [visibleFields, groupByEvent],
  );

  // displayedFields = tableFields minus any the user has hidden via the column picker
  // lastName and firstName are always shown (they are the frozen/sticky columns)
  const displayedFields = useMemo(
    () => tableFields.filter((f) => !hiddenCols.has(f.key)),
    [tableFields, hiddenCols],
  );

  // Columns the user can toggle in the picker (all except the frozen identity cols)
  const toggleableCols = useMemo(
    () => tableFields.filter((f) => f.key !== "lastName" && f.key !== "firstName"),
    [tableFields],
  );

  // Show "Ref. Pace" column whenever any performance data is visible AND not hidden
  const showPace = displayedFields.some((f) =>
    ["sb","pb","pbIndoor","pbOutdoor","waPbIndoor","waPbOutdoor",
     "waIndoorSb","waIndoorSbCurrent","waOutdoorSb"].includes(f.key),
  );

  const colCount =
    displayedFields.length
    + (showPace ? 1 : 0)
    + (canEdit && !displayedFields.find((f) => f.key === "waid") ? 1 : 0)
    + (canEdit ? 1 : 0);

  // ── Sticky column left-offset computation ────────────────────────────────────
  // Run after every render that could change column layout.
  // Measures each `data-sticky-col` <th> width and sets the `left` CSS property
  // on both the <th> and every <td> in that column so they freeze correctly.
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const theadRow = table.querySelector("thead tr");
    if (!theadRow) return;
    const ths = [...theadRow.children];
    let left = 0;
    ths.forEach((th, colIdx) => {
      if (!th.dataset.stickyCol) return;
      th.style.left = `${left}px`;
      const w = th.getBoundingClientRect().width;
      table.querySelectorAll("tbody tr").forEach((row) => {
        const cell = row.children[colIdx];
        if (cell) cell.style.left = `${left}px`;
      });
      left += w;
    });
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function handleSaveWaid(athleteId, waid) {
    await updateDoc(doc(db, ATHLETES_COLLECTION, athleteId), { waid });
  }

  async function handleSyncAll() {
    const withWaid = athletes.filter((a) => a.waid);
    if (!withWaid.length) { setSyncAllStatus("No athletes with a WAID to sync."); return; }
    setSyncingAll(true);
    setSyncAllStatus(`Syncing ${withWaid.length} athletes…`);
    let ok = 0;
    const failures = [];
    setSyncAllFailures([]);
    for (const athlete of withWaid) {
      try {
        const waData = await fetchAthleteFromWaService(athlete.waid, settings, athlete.event);
        const { _waIdentity, ...firestoreData } = waData;
        await updateDoc(doc(db, ATHLETES_COLLECTION, athlete.id), firestoreData);
        // Persist identity to the permanent registry (fire & forget)
        if (_waIdentity) {
          upsertAthleteRegistry({
            ..._waIdentity,
            nationality: athlete.nationality,
            birthYear:   athlete.birthYear,
          }).catch(() => {});
        }
        ok++;
      } catch (err) {
        failures.push({
          name: [athlete.firstName, athlete.lastName].filter(Boolean).join(" "),
          waid: athlete.waid,
          error: err.message,
        });
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    setSyncAllStatus(`Done: ${ok} updated, ${failures.length} failed.`);
    setSyncAllFailures(failures);
    setSyncingAll(false);
  }

  // ── Guards ──────────────────────────────────────────────────────────────────
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

  // ── Cell renderer ────────────────────────────────────────────────────────────
  function renderCell(f, a) {
    if (f.key === "waid" && canEdit) return <WaidCell athlete={a} onSave={handleSaveWaid} />;
    if (f.key === "status") return <StatusBadge status={a.status} />;
    if (f.key === "waUrl" && a.waUrl)
      return <a href={a.waUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem" }}>WA ↗</a>;
    if (f.group === "wa" && f.key !== "waid" && f.key !== "waUrl" && f.key !== "waFetchedAt")
      return <WaBadge value={a[f.key]} />;
    // Arrival / departure: render structured if raw string present
    if (f.key === "arrival")   return <TravelCell raw={a.arrival}   prefix="arrival" />;
    if (f.key === "departure") return <TravelCell raw={a.departure} prefix="departure" />;
    return a[f.key] ?? "—";
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page">

      {/* ── Page header ── */}
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Athletes</h1>
          <p>
            {filtered.length} of {athletes.length} athletes ·{" "}
            <strong>Indoor {seasons.indoor}</strong>
            {seasons.indoorCurrent && seasons.indoorCurrent !== seasons.indoor && (
              <> / <strong>{seasons.indoorCurrent}</strong></>
            )}
            {" · "}<strong>Outdoor {seasons.outdoor}</strong>
          </p>
        </div>
        {canEdit && (
          <div style={{ maxWidth: 320 }}>
            <button className="button button--secondary" type="button" onClick={handleSyncAll} disabled={syncingAll}>
              {syncingAll ? "Syncing…" : "↻ Sync all with WA"}
            </button>
            {syncAllStatus && (
              <p className="panel-note" style={{ marginTop: 4 }}>
                {syncAllStatus}
              </p>
            )}
            {syncAllFailures.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ fontSize: "0.8rem", cursor: "pointer", color: "#b71c1c" }}>
                  {syncAllFailures.length} failure{syncAllFailures.length > 1 ? "s" : ""} — see details
                </summary>
                <ul style={{ margin: "4px 0 0 0", padding: "0 0 0 1rem", fontSize: "0.75rem", color: "#555" }}>
                  {syncAllFailures.map((f, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <strong>{f.name}</strong>{f.waid ? ` (${f.waid})` : ""}
                      <br />
                      <span style={{ color: "#b71c1c" }}>{f.error}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      {/* ── Filters ── */}
      <section className="panel-grid panel-grid--1">
        <Panel title="Filters &amp; view">
          <div className="field-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            <label className="field">
              <span>Search</span>
              <input placeholder="Name, nat., WAID…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label className="field">
              <span>Discipline</span>
              <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)}>
                <option value="">All disciplines</option>
                {filterOptions.disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Gender</span>
              <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
                <option value="">All</option>
                <option value="W">Women (W)</option>
                <option value="M">Men (M)</option>
              </select>
            </label>
            <label className="field">
              <span>Nationality</span>
              <select value={filterNat} onChange={(e) => setFilterNat(e.target.value)}>
                <option value="">All nations</option>
                {filterOptions.nats.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            {filterOptions.heats.length > 0 && (
              <label className="field">
                <span>Heat</span>
                <select value={filterHeat} onChange={(e) => setFilterHeat(e.target.value)}>
                  <option value="">All heats</option>
                  {filterOptions.heats.map((h) => <option key={h} value={h}>Heat {h}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              <span>Status</span>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All</option>
                <option value="ok">Confirmed (OK)</option>
                <option value="out">Withdrawn (Out)</option>
              </select>
            </label>
            <label className="field">
              <span>WA sync</span>
              <select value={filterWa} onChange={(e) => setFilterWa(e.target.value)}>
                <option value="">All</option>
                <option value="synced">WA synced ✓</option>
                <option value="has_waid">Has WAID</option>
                <option value="no_waid">No WAID</option>
              </select>
            </label>
            <label className="field" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <span>&nbsp;</span>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", padding: "7px 0" }}>
                <input type="checkbox" checked={groupByEvent} onChange={(e) => setGroupByEvent(e.target.checked)} />
                <span style={{ fontSize: "0.875rem" }}>Group by event</span>
              </label>
            </label>
          </div>
        </Panel>
      </section>

      {/* ── Table ── */}
      {athletes.length === 0 ? (
        <div className="notice-card">
          <strong>No athletes yet</strong>
          <p>No data imported yet. A Meeting Director can upload a start list.</p>
        </div>
      ) : (
        <section className="panel-grid panel-grid--1">
          <Panel
            title={groupByEvent ? `${grouped.length} event${grouped.length !== 1 ? "s" : ""}` : "Athlete list"}
            subtitle={`${filtered.length} athlete${filtered.length !== 1 ? "s" : ""}`}
          >
            {/* ── Column picker ── */}
            <div ref={colPickerRef} style={{ position: "relative", display: "inline-block", marginBottom: "0.75rem" }}>
              <button
                className="button button--ghost button--small"
                type="button"
                onClick={() => setColPickerOpen((v) => !v)}
                style={{ fontSize: "0.8rem" }}
              >
                Colonnes {colPickerOpen ? "▲" : "▼"}
                {hiddenCols.size > 0 && (
                  <span style={{
                    marginLeft: 6, background: "#1b6b55", color: "#fff",
                    borderRadius: 999, padding: "1px 7px", fontSize: "0.7rem", fontWeight: 700,
                  }}>
                    {hiddenCols.size} masquée{hiddenCols.size > 1 ? "s" : ""}
                  </span>
                )}
              </button>
              {colPickerOpen && (
                <div className="col-picker-popover">
                  <div style={{ fontWeight: 600, fontSize: "0.78rem", color: "#587079",
                    textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>
                    Afficher / masquer
                  </div>
                  {toggleableCols.map((f) => {
                    const hidden = hiddenCols.has(f.key);
                    return (
                      <label key={f.key} className="col-picker-row">
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={() => setHiddenCols((prev) => {
                            const next = new Set(prev);
                            if (hidden) next.delete(f.key); else next.add(f.key);
                            return next;
                          })}
                        />
                        <span>{f.label}</span>
                      </label>
                    );
                  })}
                  {hiddenCols.size > 0 && (
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      style={{ marginTop: "0.5rem", width: "100%", fontSize: "0.78rem" }}
                      onClick={() => setHiddenCols(new Set())}
                    >
                      Tout afficher
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="table-wrap table-wrap--athletes">
              <table className="data-table" ref={tableRef}>
                <thead>
                  <tr>
                    {displayedFields.map((f) => {
                      const isSticky = f.key === "lastName" || f.key === "firstName";
                      const isLast = isSticky &&
                        !displayedFields.slice(displayedFields.indexOf(f) + 1).some(
                          (x) => x.key === "lastName" || x.key === "firstName"
                        );
                      return (
                        <th
                          key={f.key}
                          className={isSticky ? `col-sticky${isLast ? " col-sticky--last" : ""}` : ""}
                          data-sticky-col={isSticky ? "1" : undefined}
                        >
                          {f.label}
                        </th>
                      );
                    })}
                    {showPace && <th title="Best available reference time for competition seeding">Ref. Pace</th>}
                    {canEdit && !displayedFields.find((f) => f.key === "waid") && <th>WAID</th>}
                    {canEdit && <th>WA sync</th>}
                  </tr>
                </thead>

                {groupByEvent
                  ? grouped.map(([eventKey, group]) => {
                      const ev = parseEventField(eventKey);
                      return (
                        <tbody key={eventKey} className="event-group">
                          <tr className="event-group-header">
                            <td colSpan={colCount}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.01em" }}>
                                  {ev.discipline || eventKey}
                                </span>
                                <GenderBadge gender={ev.gender} />
                                <span style={{ color: "#888", fontSize: "0.8rem", fontWeight: 400 }}>
                                  {group.length} athlete{group.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                            </td>
                          </tr>
                          {group.map((a) => (
                            <tr key={a.id} className={a.status === "out" ? "row--muted" : ""}>
                              {displayedFields.map((f) => {
                                const isSticky = f.key === "lastName" || f.key === "firstName";
                                const isLast = isSticky &&
                                  !displayedFields.slice(displayedFields.indexOf(f) + 1).some(
                                    (x) => x.key === "lastName" || x.key === "firstName"
                                  );
                                return (
                                  <td
                                    key={f.key}
                                    className={isSticky ? `col-sticky${isLast ? " col-sticky--last" : ""}` : ""}
                                  >
                                    {renderCell(f, a)}
                                  </td>
                                );
                              })}
                              {showPace && (
                                <td>
                                  {getCompPace(a)
                                    ? <span className="status-pill status-pill--accent">{getCompPace(a)}</span>
                                    : <span style={{ color: "#bbb" }}>—</span>}
                                </td>
                              )}
                              {canEdit && !displayedFields.find((f) => f.key === "waid") && (
                                <td><WaidCell athlete={a} onSave={handleSaveWaid} /></td>
                              )}
                              {canEdit && <td><WaSyncButton athlete={a} settings={settings} /></td>}
                            </tr>
                          ))}
                        </tbody>
                      );
                    })
                  : (
                    <tbody>
                      {filtered.map((a) => (
                        <tr key={a.id} className={a.status === "out" ? "row--muted" : ""}>
                          {displayedFields.map((f) => {
                            const isSticky = f.key === "lastName" || f.key === "firstName";
                            const isLast = isSticky &&
                              !displayedFields.slice(displayedFields.indexOf(f) + 1).some(
                                (x) => x.key === "lastName" || x.key === "firstName"
                              );
                            return (
                              <td
                                key={f.key}
                                className={isSticky ? `col-sticky${isLast ? " col-sticky--last" : ""}` : ""}
                              >
                                {renderCell(f, a)}
                              </td>
                            );
                          })}
                          {showPace && (
                            <td>
                              {getCompPace(a)
                                ? <span className="status-pill status-pill--accent">{getCompPace(a)}</span>
                                : <span style={{ color: "#bbb" }}>—</span>}
                            </td>
                          )}
                          {canEdit && !displayedFields.find((f) => f.key === "waid") && (
                            <td><WaidCell athlete={a} onSave={handleSaveWaid} /></td>
                          )}
                          {canEdit && <td><WaSyncButton athlete={a} settings={settings} /></td>}
                        </tr>
                      ))}
                    </tbody>
                  )
                }
              </table>
            </div>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
              {showPace && (
                <p className="panel-note">
                  <span className="status-pill status-pill--accent">7.05 …</span>{" "}
                  Ref. Pace = best available: indoor SB (current) → indoor SB → outdoor SB → PB
                </p>
              )}
              {visibleFields.some((f) => f.group === "wa") && (
                <p className="panel-note">
                  <span className="status-pill status-pill--accent">WA value</span> = sourced from World Athletics
                </p>
              )}
            </div>
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

  // ⚠️ useMemo must be declared before any early returns (Rules of Hooks)
  const mergePreview = useMemo(
    () => (parsed ? mergeAthletes(athletes, parsed.records, parsed.fileType) : null),
    [parsed, athletes],
  );

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
      const detected = detectFileType(rows);
      const records = parseRows(rows, detected);
      setParsed({ fileType: detected.type, records, fileName: file.name });
      setStatus(`Detected: ${detected.type} — ${records.length} records.`);
    } catch (err) { setStatus(`Error: ${err.message}`); }
  }

  async function handleImport() {
    if (!parsed) return;
    setSaving(true); setStatus("Merging and saving…");
    try {
      const { merged, added, updated, markedOut } = mergeAthletes(athletes, parsed.records, parsed.fileType);
      const batch = writeBatch(db);
      // Never delete athletes — update or create only
      merged.forEach((a, i) => {
        const id = a.id || `athlete_${Date.now()}_${i}`;
        const { id: _id, _ev, ...data } = a; // strip client-only fields
        batch.set(doc(db, ATHLETES_COLLECTION, id), {
          ...data,
          importedAt: serverTimestamp(),
          importSource: parsed.fileType,
        });
      });
      await batch.commit();

      // Upsert identity into the permanent athlete registry (fire & forget)
      merged
        .filter((a) => a.lastName || a.firstName)
        .forEach((a) => {
          upsertAthleteRegistry({
            lastName:    a.lastName,
            firstName:   a.firstName,
            nationality: a.nationality,
            birthYear:   a.birthYear,
            waid:        a.waid,
            waUrl:       a.waUrl,
          }).catch(() => {});
        });

      const parts = [`${added} added`, `${updated} updated`];
      if (markedOut > 0) parts.push(`${markedOut} marked out (not in file)`);
      setStatus(`Done. ${parts.join(" · ")} · ${merged.length} total.`);
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) { setStatus(`Import failed: ${err.message}`); }
    finally { setSaving(false); }
  }

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
            <li><strong>Combined (recommended)</strong> — one file with all columns: Event, Last name, First name, Nat., Birth year, Status, WR, PB, SB, WA URL, Heat, Lane, Manager, Arrival, Departure. Updates everything; can be re-uploaded as many times as needed.</li>
            <li><strong>Start list</strong> (legacy) — Event, Name, Vorname, Nat., Jahrg., Status, WR, PB, SB, WA Profile</li>
            <li><strong>Heats &amp; Lanes</strong> (legacy) — same + Heat rows and Lane; only updates heat/lane</li>
            <li><strong>Travel</strong> (legacy) — Event, Name, Vorname, Nat., Manager, Anreise, Abreise; only updates logistics</li>
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
                  <li>New athletes to add: <strong>{mergePreview.added}</strong></li>
                  <li>Existing athletes to update: <strong>{mergePreview.updated}</strong></li>
                  {mergePreview.markedOut > 0 && (
                    <li style={{ color: "#b45309" }}>
                      Not in this file → will be marked <strong>Out</strong>{" "}
                      (heat/lane/travel cleared): <strong>{mergePreview.markedOut}</strong>
                    </li>
                  )}
                  <li>Total in DB after import: <strong>{mergePreview.merged.length}</strong></li>
                </ul>
                {parsed.fileType === "COMBINED"    && <p className="panel-note">Updates all fields. Athletes absent from this file are marked Out — never deleted.</p>}
                {parsed.fileType === "TRAVEL"      && <p className="panel-note">Only updates travel details. No athletes marked out.</p>}
                {parsed.fileType === "FINAL_LANES" && <p className="panel-note">Only updates heat/lane. No athletes marked out.</p>}
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
                      {(parsed.fileType === "START_LIST" || parsed.fileType === "COMBINED") && <><th>Status</th><th>WR</th><th>PB Indoor</th><th>PB Outdoor</th><th>SB</th><th>WAID</th></>}
                      {(parsed.fileType === "FINAL_LANES" || parsed.fileType === "COMBINED") && <><th>Heat</th><th>Lane</th></>}
                      {(parsed.fileType === "TRAVEL"      || parsed.fileType === "COMBINED") && <><th>Manager</th><th>Arrival</th><th>Departure</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.records.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        <td>{r.event}</td><td>{r.lastName}</td><td>{r.firstName}</td><td>{r.nationality}</td>
                        {(parsed.fileType === "START_LIST" || parsed.fileType === "COMBINED") && (
                          <><td>{r.status ? <StatusBadge status={r.status} /> : "—"}</td><td>{r.worldRanking ?? "—"}</td><td>{r.pbIndoor ?? "—"}</td><td>{r.pbOutdoor ?? "—"}</td><td>{r.sb ?? "—"}</td><td>{r.waid ?? "—"}</td></>
                        )}
                        {(parsed.fileType === "FINAL_LANES" || parsed.fileType === "COMBINED") && (
                          <><td>{r.heat ?? "—"}</td><td>{r.lane ?? "—"}</td></>
                        )}
                        {(parsed.fileType === "TRAVEL" || parsed.fileType === "COMBINED") && (
                          <><td>{r.manager ?? "—"}</td><td><TravelCell raw={r.arrival} prefix="arrival" /></td><td><TravelCell raw={r.departure} prefix="departure" /></td></>
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
  const [indoorSeason,        setIndoorSeason]        = useState(DEFAULT_PORTAL_SETTINGS.seasons.indoor);
  const [indoorCurrentSeason, setIndoorCurrentSeason] = useState(DEFAULT_PORTAL_SETTINGS.seasons.indoorCurrent);
  const [outdoorSeason,       setOutdoorSeason]       = useState(DEFAULT_PORTAL_SETTINGS.seasons.outdoor);
  const [waServiceUrl,   setWaServiceUrl]   = useState(DEFAULT_PORTAL_SETTINGS.waServiceUrl);
  const [saveStatus,     setSaveStatus]     = useState("");
  const [saving,         setSaving]         = useState(false);
  const [initialized,    setInitialized]    = useState(false);

  if (!initialized && settings) {
    setAccessRoles(settings.accessRoles ?? DEFAULT_PORTAL_SETTINGS.accessRoles);
    setImporterRoles(settings.importerRoles ?? DEFAULT_PORTAL_SETTINGS.importerRoles);
    setFieldVisibility(settings.fieldVisibility ?? DEFAULT_PORTAL_SETTINGS.fieldVisibility);
    setIndoorSeason(settings.seasons?.indoor ?? DEFAULT_PORTAL_SETTINGS.seasons.indoor);
    setIndoorCurrentSeason(settings.seasons?.indoorCurrent ?? DEFAULT_PORTAL_SETTINGS.seasons.indoorCurrent);
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
          seasons: { indoor: Number(indoorSeason), indoorCurrent: Number(indoorCurrentSeason), outdoor: Number(outdoorSeason) },
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

  const colCount = activeRoles.length;
  // CSS grid: field label column + one column per active role
  const visGrid = {
    display: "grid",
    gridTemplateColumns: `220px repeat(${colCount}, 1fr)`,
    gap: "0",
    alignItems: "center",
  };

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Portal settings</h1>
          <p>Access control, season configuration and World Athletics integration.</p>
        </div>
        <div>
          <button className="button button--primary" form="settings-form" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
          {saveStatus && <p className="panel-note" style={{ marginTop: 4 }}>{saveStatus}</p>}
        </div>
      </section>

      <form id="settings-form" onSubmit={handleSave}>

        {/* ── Seasons ──────────────────────────────────────────────── */}
        <section className="panel-grid panel-grid--1">
          <Panel title="Seasons" subtitle="CMCM takes place in early January — the indoor season has barely started at meeting time.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem 2rem", maxWidth: 520 }}>
              <label className="field">
                <span>Indoor — previous year</span>
                <input type="number" min="2020" max="2040" value={indoorSeason}
                  onChange={(e) => setIndoorSeason(e.target.value)} />
                <span className="field-hint">Main SB (season completed)</span>
              </label>
              <label className="field">
                <span>Indoor — current year</span>
                <input type="number" min="2020" max="2040" value={indoorCurrentSeason}
                  onChange={(e) => setIndoorCurrentSeason(e.target.value)} />
                <span className="field-hint">Also shown if available</span>
              </label>
              <label className="field">
                <span>Outdoor</span>
                <input type="number" min="2020" max="2040" value={outdoorSeason}
                  onChange={(e) => setOutdoorSeason(e.target.value)} />
                <span className="field-hint">Previous summer (N−1)</span>
              </label>
            </div>
            <p className="panel-note" style={{ marginTop: "1rem" }}>
              Example for CMCM <strong>{indoorCurrentSeason}</strong>: Indoor SB <strong>{indoorSeason}</strong> (main) ·
              Indoor SB <strong>{indoorCurrentSeason}</strong> (current, few results) ·
              Outdoor SB <strong>{outdoorSeason}</strong>.
            </p>
          </Panel>
        </section>

        {/* ── Access & Import rights ────────────────────────────────── */}
        <section className="panel-grid panel-grid--2">
          <Panel title="Portal access" subtitle="Who can open the Athlete Portal.">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {PLATFORM_ROLES.map((role) => (
                <label key={role.key} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: "0.5rem", alignItems: "center", cursor: role.key === "admin" ? "default" : "pointer", minWidth: 0 }}>
                  <input type="checkbox"
                    checked={accessRoles.includes(role.key)}
                    disabled={role.key === "admin"}
                    onChange={() => toggleRole(accessRoles, setAccessRoles, role.key)} />
                  <span style={{ fontSize: "0.875rem", wordBreak: "break-word" }}>{role.label}</span>
                  {role.key === "admin" && <span className="status-pill status-pill--accent" style={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}>always</span>}
                  {role.key !== "admin" && <span />}
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Import rights" subtitle="Who can upload Excel files. Only roles with portal access are shown.">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {activeRoles.map((role) => (
                <label key={role.key} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: "0.5rem", alignItems: "center", cursor: "pointer", minWidth: 0 }}>
                  <input type="checkbox"
                    checked={importerRoles.includes(role.key)}
                    onChange={() => toggleRole(importerRoles, setImporterRoles, role.key)} />
                  <span style={{ fontSize: "0.875rem" }}>{role.label}</span>
                </label>
              ))}
            </div>
          </Panel>
        </section>

        {/* ── WA service URL ────────────────────────────────────────── */}
        <section className="panel-grid panel-grid--1">
          <Panel title="World Athletics service" subtitle="URL used by the ↻ WA sync buttons.">
            <div style={{ maxWidth: 480 }}>
              <label className="field">
                <span>WA service URL</span>
                <input type="text" value={waServiceUrl}
                  onChange={(e) => setWaServiceUrl(e.target.value)}
                  placeholder="/api/wa" />
              </label>
              <p className="panel-note" style={{ marginTop: "0.5rem" }}>
                Default <code>/api/wa</code> → Netlify Function (works in production with no extra setup).<br />
                For local dev, switch to <code>http://localhost:3001</code> while running <code>wa-service/</code>.
              </p>
            </div>
          </Panel>
        </section>

        {/* ── Field visibility ──────────────────────────────────────── */}
        <section className="panel-grid panel-grid--1">
          <Panel title="Field visibility per role" subtitle="Which columns each role can see in the athlete list.">

            {/* Sticky role header */}
            <div style={{ ...visGrid, borderBottom: "2px solid var(--color-border, #e0e0e0)", paddingBottom: "0.5rem", marginBottom: "0.25rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Field</div>
              {activeRoles.map((r) => (
                <div key={r.key} style={{ textAlign: "center", fontWeight: 600, fontSize: "0.85rem", lineHeight: 1.3, padding: "0 4px" }}>
                  {r.label}
                </div>
              ))}
            </div>

            {/* Groups */}
            {FIELD_GROUPS.map((group) => {
              const gFields = ALL_ATHLETE_FIELDS.filter((f) => f.group === group.key);
              return (
                <div key={group.key} style={{ marginTop: "1.25rem" }}>

                  {/* Group header row */}
                  <div style={{ ...visGrid, background: "var(--color-surface-2, #f5f5f5)", borderRadius: 6, padding: "0.4rem 0.5rem", marginBottom: "0.15rem" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted, #555)" }}>
                      {group.label}
                    </div>
                    {activeRoles.map((r) => {
                      const allOn = groupAllGranted(r.key, group.key);
                      return (
                        <div key={r.key} style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className={`button button--small ${allOn ? "button--secondary" : "button--ghost"}`}
                            style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                            onClick={() => setGroupForRole(r.key, group.key, !allOn)}
                            title={allOn ? `Remove all ${group.label} fields for ${r.label}` : `Grant all ${group.label} fields to ${r.label}`}
                          >
                            {allOn ? "All ✓" : "None"}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Field rows */}
                  {gFields.map((field, fi) => (
                    <div
                      key={field.key}
                      style={{
                        ...visGrid,
                        padding: "0.35rem 0.5rem",
                        borderRadius: 4,
                        background: fi % 2 === 0 ? "transparent" : "var(--color-surface-1, #fafafa)",
                      }}
                    >
                      <div style={{ fontSize: "0.875rem" }}>{field.label}</div>
                      {activeRoles.map((r) => (
                        <div key={r.key} style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            style={{ width: 16, height: 16, cursor: "pointer" }}
                            checked={(fieldVisibility[r.key] ?? []).includes(field.key)}
                            onChange={() => toggleField(r.key, field.key)}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border, #e0e0e0)", display: "flex", gap: "1rem", alignItems: "center" }}>
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </button>
              {saveStatus && <p className="panel-note" style={{ margin: 0 }}>{saveStatus}</p>}
            </div>
          </Panel>
        </section>

      </form>
    </div>
  );
}

// ─── Athlete Registry page ────────────────────────────────────────────────────

function AthleteRegistryPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const canAccess = roles.includes("admin") || roles.includes("meeting_director");

  const { registry, loading } = useAthleteRegistry(canAccess);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return registry;
    return registry.filter((a) => {
      const hay = [a.lastName, a.firstName, a.nationality, a.waid, a.birthDate]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [registry, search]);

  if (!canAccess) {
    return (
      <div className="page">
        <section className="page-header"><div><h1>Athletes Database</h1></div></section>
        <div className="notice-card notice-card--warn">
          <strong>Access restricted</strong>
          <p>Admin and Meeting Director only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Athletes Database</h1>
          <p>
            {loading ? "Loading…" : `${registry.length} athletes across all editions`}
            {" · "}Grows automatically when athletes are imported or WA-synced.
          </p>
        </div>
      </section>

      <section className="panel-grid panel-grid--1">
        <Panel title="Search" subtitle={`${filtered.length} result${filtered.length !== 1 ? "s" : ""}`}>
          <div style={{ marginBottom: "0.75rem" }}>
            <input
              className="input"
              placeholder="Name, nationality, WAID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 340 }}
            />
          </div>

          {loading ? (
            <p className="panel-note">Loading registry…</p>
          ) : registry.length === 0 ? (
            <div className="notice-card">
              <strong>Registry is empty</strong>
              <p>Import athletes or run a WA sync to populate the database.</p>
            </div>
          ) : (
            <div className="table-wrap table-wrap--athletes">
              <table className="data-table">
                <thead>
                  <tr>
                    <th data-sticky-col="1" className="col-sticky col-sticky--last">Last name</th>
                    <th>First name</th>
                    <th>Nat.</th>
                    <th>Birth date</th>
                    <th>WAID</th>
                    <th>WA Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a._docId}>
                      <td className="col-sticky col-sticky--last" style={{ fontWeight: 600 }}>
                        {a.lastName || "—"}
                      </td>
                      <td>{a.firstName || "—"}</td>
                      <td>{a.nationality || "—"}</td>
                      <td style={{ color: "#555", fontSize: "0.85rem" }}>
                        {a.birthDate
                          ? a.birthDate.slice(0, 10)          // ISO → YYYY-MM-DD
                          : a.birthYear
                            ? String(a.birthYear)
                            : "—"}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                        {a.waid || "—"}
                      </td>
                      <td>
                        {a.waUrl
                          ? <a href={a.waUrl} target="_blank" rel="noopener noreferrer"
                               style={{ fontSize: "0.82rem" }}>WA ↗</a>
                          : <span style={{ color: "#bbb" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="panel-note" style={{ marginTop: "0.5rem" }}>
            Records are permanent — an athlete is never removed from this database,
            even if they no longer appear in the current edition's start list.
            Core identity (name, birth date, WAID, WA URL) is preserved forever.
          </p>
        </Panel>
      </section>
    </div>
  );
}

export { AthletePortalOverview, AthletesListPage, AthleteImportPage, AthletePortalSettingsPage, AthleteRegistryPage };
