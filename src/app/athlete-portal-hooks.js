import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";

const ATHLETE_PORTAL_SETTINGS_PATH = ["appSettings", "athletePortalSettings"];
const ATHLETES_COLLECTION = "athletes";

// ─── Field definitions ────────────────────────────────────────────────────────
// Based on real CMCM Excel file structure (3 file types).

const ALL_ATHLETE_FIELDS = [
  // Core identity
  { key: "event",         label: "Event",            group: "identity" },
  { key: "lastName",      label: "Last name",         group: "identity" },
  { key: "firstName",     label: "First name",        group: "identity" },
  { key: "nationality",   label: "Nationality",       group: "identity" },
  { key: "birthYear",     label: "Birth year",        group: "identity" },

  // Performance (from START_LIST / FINAL_LANES)
  { key: "pb",            label: "PB (raw)",          group: "performance" },
  { key: "pbIndoor",      label: "PB Indoor",         group: "performance" },
  { key: "pbOutdoor",     label: "PB Outdoor",        group: "performance" },
  { key: "sb",            label: "SB (season)",       group: "performance" },

  // START_LIST specific
  { key: "status",        label: "Status (ok/out)",   group: "startlist" },
  { key: "worldRanking",  label: "World Ranking",     group: "startlist" },
  { key: "waUrl",         label: "WA Profile URL",    group: "startlist" },
  { key: "waid",          label: "WAID",              group: "startlist" },

  // FINAL_LANES specific
  { key: "heat",          label: "Heat",              group: "lanes" },
  { key: "lane",          label: "Lane",              group: "lanes" },

  // TRAVEL specific
  { key: "manager",       label: "Manager",           group: "travel" },
  { key: "arrival",       label: "Arrival",           group: "travel" },
  { key: "departure",     label: "Departure",         group: "travel" },
];

const FIELD_GROUPS = [
  { key: "identity",    label: "Identity" },
  { key: "performance", label: "Performance" },
  { key: "startlist",   label: "Start list" },
  { key: "lanes",       label: "Heats & Lanes" },
  { key: "travel",      label: "Travel logistics" },
];

// Default visibility per role — conservative: non-admin roles see basics only
const DEFAULT_PORTAL_SETTINGS = {
  accessRoles: ["admin", "meeting_director"],
  importerRoles: ["admin", "meeting_director"],
  fieldVisibility: {
    admin: ALL_ATHLETE_FIELDS.map((f) => f.key),
    meeting_director: ALL_ATHLETE_FIELDS.map((f) => f.key),
    gestionnaire: ["event", "lastName", "firstName", "nationality", "status", "heat", "lane"],
    chef_equipe: ["event", "lastName", "firstName", "nationality"],
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
        setSettings(
          snapshot.exists()
            ? { ...DEFAULT_PORTAL_SETTINGS, ...snapshot.data() }
            : DEFAULT_PORTAL_SETTINGS,
        );
        setLoading(false);
      },
      () => {
        setSettings(DEFAULT_PORTAL_SETTINGS);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  return { settings, loading };
}

function useAthletes(enabled = true) {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

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

// ─── Permission helpers ───────────────────────────────────────────────────────

function canAccessAthletePortal(roles, settings) {
  if (!settings) return false;
  const accessRoles = settings.accessRoles ?? DEFAULT_PORTAL_SETTINGS.accessRoles;
  return roles.some((r) => accessRoles.includes(r));
}

function canImportAthletes(roles, settings) {
  if (!settings) return false;
  const importerRoles = settings.importerRoles ?? DEFAULT_PORTAL_SETTINGS.importerRoles;
  return roles.some((r) => importerRoles.includes(r));
}

function getVisibleFields(roles, settings) {
  if (!settings) return [];
  const fieldVisibility = settings.fieldVisibility ?? {};

  const visibleKeys = new Set();
  roles.forEach((role) => {
    const fields = fieldVisibility[role];
    if (Array.isArray(fields)) fields.forEach((f) => visibleKeys.add(f));
  });

  return ALL_ATHLETE_FIELDS.filter((f) => visibleKeys.has(f.key));
}

// ─── Parsing helpers (shared with import page) ────────────────────────────────

/**
 * Extract WAID from a World Athletics profile URL.
 * URL pattern: /athletes/{country}/{firstname-lastname-14621598}
 * Returns null if no WAID found.
 */
function extractWaid(urlOrText) {
  if (!urlOrText) return null;
  const str = String(urlOrText).trim();
  // Match trailing 7-10 digit number (the WAID at end of WA URLs)
  const m = str.match(/[/-](\d{7,10})(?:[#?].*)?$/);
  return m ? m[1] : null;
}

/**
 * Parse PB string like "7,06s(25)/11,00s(24)" or "7NR,06s(25)/11,00s(24)".
 * Returns { indoor, outdoor } where each is "7.06 (2025)" or null.
 */
function parsePb(raw) {
  if (!raw) return { indoor: null, outdoor: null };
  const str = String(raw).trim();

  // Split on "/" — left = indoor, right = outdoor
  const parts = str.split("/").map((p) => p.trim()).filter(Boolean);

  function parsePart(p) {
    if (!p) return null;
    // Extract year from (YY) or (YYYY) FIRST before stripping chars
    const yearMatch = p.match(/\((\d{2,4})\)/);
    let year = yearMatch ? yearMatch[1] : null;
    if (year && year.length === 2) year = Number(year) < 50 ? `20${year}` : `19${year}`;
    // Strip year, NR flag, letters, and punctuation — keep only digits and decimal separator
    const noYear = p.replace(/\(\d{2,4}\)/g, "").replace(/NR/gi, "");
    const val = noYear.replace(/[^0-9,]/g, "").replace(",", ".");
    return val ? `${val}${year ? ` (${year})` : ""}` : null;
  }

  return {
    indoor: parsePart(parts[0]),
    outdoor: parsePart(parts[1]) ?? null,
  };
}

/**
 * Normalize birth year: 99 → 1999, 2001 → 2001.
 */
function normalizeBirthYear(raw) {
  const n = Number(raw);
  if (!n) return null;
  if (n >= 1900) return n;
  return n < 50 ? 2000 + n : 1900 + n;
}

/**
 * Build a stable merge key for matching athletes across file types.
 * Key: normalized lastName + firstName + nationality.
 */
function athleteMergeKey(lastName, firstName, nationality) {
  return [lastName, firstName, nationality]
    .map((s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export {
  useAthletePortalSettings,
  useAthletes,
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
