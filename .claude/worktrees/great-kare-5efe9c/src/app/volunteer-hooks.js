import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { recordMatchesEdition, useActiveEdition } from "./edition";
import { VOLUNTEER_ALERT_LOG_DOC_PATH } from "./seed-data";
import { db } from "../services/firebase";

function useVolunteerApplication(uid) {
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { activeEditionId, loading: editionLoading, error: editionError } = useActiveEdition(Boolean(uid));

  useEffect(() => {
    if (!uid || editionLoading) return undefined;

    setLoading(true);

    const applicationQuery = query(collection(db, "volunteerApplications"), where("uid", "==", uid));

    const unsubscribe = onSnapshot(
      applicationQuery,
      (snapshot) => {
        const firstApplication = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }))
          .find((entry) => recordMatchesEdition(entry, activeEditionId));
        setApplication(firstApplication || null);
        setError("");
        setLoading(false);
      },
      () => {
        setApplication(null);
        setError("Impossible de charger le dossier bénévole.");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [activeEditionId, editionLoading, uid]);

  return uid
    ? { application, loading: loading || editionLoading, error: error || editionError }
    : { application: null, loading: false, error: "" };
}

function useVolunteerApplicationsList(enabled = true) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { activeEditionId, loading: editionLoading, error: editionError } = useActiveEdition(enabled);

  useEffect(() => {
    if (!enabled || editionLoading) return undefined;

    setLoading(true);

    const unsubscribe = onSnapshot(
      collection(db, "volunteerApplications"),
      (snapshot) => {
        setApplications(
          snapshot.docs
            .map((entry) => ({ id: entry.id, ...entry.data() }))
            .filter((entry) => recordMatchesEdition(entry, activeEditionId)),
        );
        setLoading(false);
        setError("");
      },
      () => {
        setApplications([]);
        setLoading(false);
        setError("Impossible de charger les candidatures bénévoles.");
      },
    );

    return unsubscribe;
  }, [activeEditionId, editionLoading, enabled]);

  return enabled
    ? { applications, loading: loading || editionLoading, error: error || editionError }
    : { applications: [], loading: false, error: "" };
}

function useVolunteerAlertLog(enabled = true) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    const volunteerAlertLogRef = doc(db, ...VOLUNTEER_ALERT_LOG_DOC_PATH);

    const unsubscribe = onSnapshot(
      volunteerAlertLogRef,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        const nextEntries = Array.isArray(data?.entries)
          ? data.entries
              .map((entry, index) => ({
                id: String(entry?.id || `volunteer-alert-${index + 1}`),
                volunteerId: String(entry?.volunteerId || "").trim(),
                volunteerName: String(entry?.volunteerName || "").trim(),
                volunteerEmail: String(entry?.volunteerEmail || "").trim(),
                previousRoles: Array.isArray(entry?.previousRoles)
                  ? entry.previousRoles.map((role) => String(role || "").trim()).filter(Boolean)
                  : [],
                previousTeamRoleAssignments:
                  entry?.previousTeamRoleAssignments && typeof entry.previousTeamRoleAssignments === "object"
                    ? Object.fromEntries(
                        Object.entries(entry.previousTeamRoleAssignments).map(([roleName, teamRole]) => [
                          String(roleName || "").trim(),
                          String(teamRole || "").trim(),
                        ]),
                      )
                    : {},
                previousWorkflowStatus: String(entry?.previousWorkflowStatus || "").trim(),
                alertType: String(entry?.alertType || "withdrawal").trim(),
                reason: String(entry?.reason || "").trim(),
                createdAt: entry?.createdAt || null,
              }))
              .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
          : [];

        setEntries(nextEntries);
        setLoading(false);
        setError("");
      },
      () => {
        setEntries([]);
        setLoading(false);
        setError("Impossible de charger l'historique des alertes bénévoles.");
      },
    );

    return unsubscribe;
  }, [enabled]);

  return enabled
    ? { entries, loading, error }
    : { entries: [], loading: false, error: "" };
}

export { useVolunteerApplication, useVolunteerApplicationsList, useVolunteerAlertLog };
