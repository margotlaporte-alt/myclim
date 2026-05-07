import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";

const ATHLETE_PORTAL_SETTINGS_PATH = ["appSettings", "athletePortalSettings"];
const ATHLETES_COLLECTION = "athletes";

// ─── Field definitions ────────────────────────────────────────────────────────

const ALL_ATHLETE_FIELDS = [
  // Core identity
  { key: "event",         label: "Event",             group: "identity" },
  { key: "lastName",      label: "Last name",          group: "identity" },
  { key: "firstName",     label: "First name",         group: "identity" },
  { key: "nationality",   label: "Nationality",        group: "identity" },
  { key: "birthYear",     label: "Birth year",         group: "identity" },

  // Excel-imported performance (from start list / lanes file)
  { key: "status",        label: "Status (ok/out)",    group: "excel" },
  { key: "worldRanking",  label: "World Ranking",      group: "excel" },
  { key: "pb",            label: "PB (Excel raw)",     group: "excel" },
  { key: "pbIndoor",      label: "PB Indoor (Excel)",  group: "excel" },
  { key: "pbOutdoor",     label: "PB Outdoor (Excel)", group: "excel" },
  { key: "sb",            label: "SB (Excel raw)",     group: "excel" },

  // World Athletics — source of truth
  { key: "waid",              label: "WAID",                    group: "wa" },
  { key: "waUrl",             label: "WA Profile URL",          group: "wa" },
  { key: "waPbIndoor",        label: "WA PB Indoor",            group: "wa" },
  { key: "waPbOutdoor",       label: "WA PB Outdoor",           group: "wa" },
  { key: "waIndoorSb",        label: "WA SB Indoor (prev yr)",  group: "wa" },
  { key: "waIndoorSbCurrent", label: "WA SB Indoor (curr yr)",  group: "wa" },
  { key: "waOutdoorSb",       label: "WA SB Outdoor",           group: "wa" },
  { key: "waFetchedAt",       label: "WA last sync",            group: "wa" },

  // Heat/lane (from lanes file)
  { key: "heat",          label: "Heat",               group: "lanes" },
  { key: "lane",          label: "Lane",               group: "lanes" },

  // Travel logistics (from travel file)
  { key: "manager",       label: "Manager",            group: "travel" },
  { key: "arrival",       label: "Arrival",            group: "travel" },
  { key: "departure",     label: "Departure",          group: "travel" },
];

const FIELD_GROUPS = [
  { key: "identity", label: "Identity" },
  { key: "excel",    label: "Excel import" },
  { key: "wa",       label: "World Athletics" },
  { key: "lanes",    label: "Heats & Lanes" },
  { key: "travel",   label: "Travel" },
];

// Default settings — admin can override everything via the settings page.
// Season rule for early-January meetings (meeting year N):
//   indoor     = N-1  (previous indoor season, completed — most athletes have results here)
//   indoorCurrent = N (current indoor season, just started — few results)
//   outdoor    = N-1  (previous outdoor season, completed)
// Example: CMCM 2026 → indoor 2025, indoorCurrent 2026, outdoor 2025
const DEFAULT_PORTAL_SETTINGS = {
  accessRoles: ["admin", "meeting_director"],
  importerRoles: ["admin", "meeting_director"],
  // WA service base URL (the Node.js backend we built)
  waServiceUrl: "http://localhost:3001",
  // Which seasons to display as SBs
  seasons: { indoor: 2025, indoorCurrent: 2026, outdoor: 2025 },
  fieldVisibility: {
    admin:            ALL_ATHLETE_FIELDS.map((f) => f.key),
    meeting_director: ALL_ATHLETE_FIELDS.map((f) => f.key),
    gestionnaire:     ["event", "lastName", "firstName", "nationality", "status", "heat", "lane"],
    chef_equipe:      ["event", "lastName", "firstName", "nationality"],
  },
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useAthletePortalSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, ...ATHLETE_PORTAL_SETTINGS_PATH),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSettings({
            ...DEFAULT_PORTAL_SETTINGS,
            ...data,
            seasons: {
              ...DEFAULT_PORTAL_SETTINGS.seasons,
              ...(data.seasons ?? {}),
              // indoorCurrent defaults to indoor+1 if not explicitly saved
              indoorCurrent: data.seasons?.indoorCurrent
                ?? (data.seasons?.indoor ? data.seasons.indoor + 1 : DEFAULT_PORTAL_SETTINGS.seasons.indoorCurrent),
            },
          });
        } else {
          setSettings(DEFAULT_PORTAL_SETTINGS);
        }
        setLoading(false);
      },
      () => { setSettings(DEFAULT_PORTAL_SETTINGS); setLoading(false); },
    );
    return unsubscribe;
  }, []);

  return { settings, loading };
}

function useAthletes(enabled = true) {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) { setLoading(false); return undefined; }

    const unsubscribe = onSnapshot(
      collection(db, ATHLETES_COLLECTION),
      (snapshot) => {
        setAthletes(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [enabled]);

  return { athletes, loading };
}

// ─── WA service integration ───────────────────────────────────────────────────

/**
 * Fetch a single athlete's data from the wa-service and extract the
 * season-relevant SBs.
 *
 * Returns an object with the fields to write back to Firestore:
 *   waPbIndoor, waPbOutdoor, waIndoorSb, waOutdoorSb, waFetchedAt, waUrl
 */
async function fetchAthleteFromWaService(waid, settings) {
  const baseUrl = String(settings?.waServiceUrl || DEFAULT_PORTAL_SETTINGS.waServiceUrl).replace(/\/$/, "");
  const seasons = settings?.seasons ?? DEFAULT_PORTAL_SETTINGS.seasons;

  const response = await fetch(`${baseUrl}/athlete/${waid}/performances`, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`WA service returned ${response.status}: ${text}`);
  }

  const data = await response.json();

  const pbs = Array.isArray(data.personalBests) ? data.personalBests : [];
  const sbs = Array.isArray(data.seasonBests) ? data.seasonBests : [];

  // Best PB for each environment (indoor track is typically ≤ 200m)
  const waPbIndoor  = bestMark(pbs.filter((r) => isIndoorDiscipline(r.discipline)));
  const waPbOutdoor = bestMark(pbs.filter((r) => !isIndoorDiscipline(r.discipline)));

  // Season bests:
  //   indoor     = previous indoor season (N-1, completed, most athletes have results)
  //   indoorCurrent = current indoor season (N, just started, few results)
  //   outdoor    = previous outdoor season (N-1)
  const waIndoorSb        = bestMarkForYear(sbs, seasons.indoor,        true);
  const waIndoorSbCurrent = bestMarkForYear(sbs, seasons.indoorCurrent, true);
  const waOutdoorSb       = bestMarkForYear(sbs, seasons.outdoor,       false);

  function fmtPb(r)  { return r ? `${r.mark}${r.date ? ` (${r.date.slice(0,4)})` : ""}` : null; }
  function fmtSb(r)  { return r ? `${r.mark}${r.date ? ` @ ${(r.venue ?? "").trim()}`.trimEnd() : ""}` : null; }

  return {
    waPbIndoor:        fmtPb(waPbIndoor),
    waPbOutdoor:       fmtPb(waPbOutdoor),
    waIndoorSb:        fmtSb(waIndoorSb),
    waIndoorSbCurrent: fmtSb(waIndoorSbCurrent),
    waOutdoorSb:       fmtSb(waOutdoorSb),
    waFetchedAt: new Date().toISOString(),
    waUrl: data.firstName ? `https://worldathletics.org/athletes/_/${waid}` : null,
  };
}

// Indoor disciplines: 60m, 60mH, 200m (indoor only), pole vault, etc.
// Simple heuristic: distance ≤ 200 + standard track & field events at indoor meets.
// WA doesn't always tag disciplines as indoor/outdoor explicitly.
function isIndoorDiscipline(discipline) {
  if (!discipline) return false;
  const d = discipline.toLowerCase();
  return d.startsWith("60") || d === "200m" || d.includes("indoor");
}

function bestMark(results) {
  if (!results.length) return null;
  // Sort by resultScore desc if available, otherwise just take first
  return results.slice().sort((a, b) => (b.resultScore ?? 0) - (a.resultScore ?? 0))[0];
}

function bestMarkForYear(results, year, indoor) {
  const yearStr = String(year);
  const relevant = results.filter((r) => {
    if (!r.date) return false;
    if (!r.date.startsWith(yearStr)) return false;
    if (indoor !== undefined) {
      const isIn = isIndoorDiscipline(r.discipline);
      if (indoor && !isIn) return false;
      if (!indoor && isIn) return false;
    }
    return true;
  });
  return bestMark(relevant);
}

// ─── Permission helpers ───────────────────────────────────────────────────────

function canAccessAthletePortal(roles, settings) {
  const accessRoles = settings?.accessRoles ?? DEFAULT_PORTAL_SETTINGS.accessRoles;
  return roles.some((r) => accessRoles.includes(r));
}

function canImportAthletes(roles, settings) {
  const importerRoles = settings?.importerRoles ?? DEFAULT_PORTAL_SETTINGS.importerRoles;
  return roles.some((r) => importerRoles.includes(r));
}

function getVisibleFields(roles, settings) {
  const fieldVisibility = settings?.fieldVisibility ?? {};
  const visibleKeys = new Set();
  roles.forEach((role) => {
    (fieldVisibility[role] ?? []).forEach((k) => visibleKeys.add(k));
  });
  return ALL_ATHLETE_FIELDS.filter((f) => visibleKeys.has(f.key));
}

// ─── Parsing helpers (used by import page) ────────────────────────────────────

function extractWaid(urlOrText) {
  if (!urlOrText) return null;
  const m = String(urlOrText).trim().match(/[/-](\d{7,10})(?:[#?].*)?$/);
  return m ? m[1] : null;
}

function parsePb(raw) {
  if (!raw) return { indoor: null, outdoor: null };
  const parts = String(raw).trim().split("/").map((p) => p.trim()).filter(Boolean);

  function parsePart(p) {
    if (!p) return null;
    const yearMatch = p.match(/\((\d{2,4})\)/);
    let year = yearMatch ? yearMatch[1] : null;
    if (year && year.length === 2) year = Number(year) < 50 ? `20${year}` : `19${year}`;
    const noYear = p.replace(/\(\d{2,4}\)/g, "").replace(/NR/gi, "");
    const val = noYear.replace(/[^0-9,]/g, "").replace(",", ".");
    return val ? `${val}${year ? ` (${year})` : ""}` : null;
  }

  return { indoor: parsePart(parts[0]), outdoor: parsePart(parts[1]) ?? null };
}

function normalizeBirthYear(raw) {
  const n = Number(raw);
  if (!n) return null;
  if (n >= 1900) return n;
  return n < 50 ? 2000 + n : 1900 + n;
}

function athleteMergeKey(lastName, firstName, nationality) {
  return [lastName, firstName, nationality]
    .map((s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export {
  useAthletePortalSettings,
  useAthletes,
  fetchAthleteFromWaService,
  canAccessAthletePortal,
  canImportAthletes,
  getVisibleFields,
  extractWaid,
  parsePb,
  normalizeBirthYear,
  athleteMergeKey,
  ALL_ATHLETE_FIELDS,
  FIELD_GROUPS,
  DEFAULT_PORTAL_SETTINGS,
  ATHLETE_PORTAL_SETTINGS_PATH,
  ATHLETES_COLLECTION,
};
