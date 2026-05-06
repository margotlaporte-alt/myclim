import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";

const ATHLETE_PORTAL_SETTINGS_PATH = ["appSettings", "athletePortalSettings"];
const ATHLETES_COLLECTION = "athletes";

const ALL_ATHLETE_FIELDS = [
  { key: "bib", label: "Bib number" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "gender", label: "Gender" },
  { key: "birthYear", label: "Birth year" },
  { key: "nationality", label: "Nationality" },
  { key: "country", label: "Country" },
  { key: "team", label: "Club / Team" },
  { key: "event", label: "Event" },
  { key: "round", label: "Round / Heat" },
  { key: "lane", label: "Lane" },
  { key: "mark", label: "Mark / Performance" },
  { key: "wind", label: "Wind" },
  { key: "place", label: "Place" },
];

const DEFAULT_PORTAL_SETTINGS = {
  accessRoles: ["admin", "meeting_director"],
  importerRoles: ["admin", "meeting_director"],
  fieldVisibility: {
    admin: ALL_ATHLETE_FIELDS.map((f) => f.key),
    meeting_director: ALL_ATHLETE_FIELDS.map((f) => f.key),
  },
};

function useAthletePortalSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, ...ATHLETE_PORTAL_SETTINGS_PATH),
      (snapshot) => {
        setSettings(snapshot.exists() ? { ...DEFAULT_PORTAL_SETTINGS, ...snapshot.data() } : DEFAULT_PORTAL_SETTINGS);
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

function canAccessAthletePortal(roles, settings) {
  if (!settings) return false;
  const accessRoles = Array.isArray(settings.accessRoles) ? settings.accessRoles : DEFAULT_PORTAL_SETTINGS.accessRoles;
  return roles.some((role) => accessRoles.includes(role));
}

function canImportAthletes(roles, settings) {
  if (!settings) return false;
  const importerRoles = Array.isArray(settings.importerRoles) ? settings.importerRoles : DEFAULT_PORTAL_SETTINGS.importerRoles;
  return roles.some((role) => importerRoles.includes(role));
}

function getVisibleFields(roles, settings) {
  if (!settings) return [];
  const fieldVisibility = settings.fieldVisibility || {};

  const visibleKeys = new Set();
  roles.forEach((role) => {
    const fields = fieldVisibility[role];
    if (Array.isArray(fields)) fields.forEach((f) => visibleKeys.add(f));
  });

  return ALL_ATHLETE_FIELDS.filter((f) => visibleKeys.has(f.key));
}

export {
  useAthletePortalSettings,
  useAthletes,
  canAccessAthletePortal,
  canImportAthletes,
  getVisibleFields,
  ALL_ATHLETE_FIELDS,
  DEFAULT_PORTAL_SETTINGS,
  ATHLETE_PORTAL_SETTINGS_PATH,
  ATHLETES_COLLECTION,
};
