/**
 * Hooks and helpers for the CMCM meeting history database.
 *
 * Collections:
 *   meetingEditions   — one doc per edition (year is doc ID)
 *   meetingResults    — one doc per result entry (auto-ID)
 *   meetingRecords    — meeting records by discipline/gender
 *   meetingWinners    — historical winners by year/discipline
 */
import { useEffect, useState } from "react";
import {
  collection, doc, getDocs, onSnapshot,
  query, where, writeBatch, setDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { ATHLETE_REGISTRY_COLLECTION } from "./athlete-portal-hooks";

// ─── Collection names ──────────────────────────────────────────────────────

export const MEETING_EDITIONS_COL  = "meetingEditions";
export const MEETING_RESULTS_COL   = "meetingResults";
export const MEETING_RECORDS_COL   = "meetingRecords";
export const MEETING_WINNERS_COL   = "meetingWinners";

// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useMeetingEditions() {
  const [editions, setEditions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, MEETING_EDITIONS_COL), (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.year - a.year);
      setEditions(items);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);
  return { editions, loading };
}

export function useMeetingResultsForYear(year) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!year) { setLoading(false); return; }
    const q = query(collection(db, MEETING_RESULTS_COL), where("year", "==", Number(year)));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const dc = String(a.discipline || "").localeCompare(String(b.discipline || ""));
          if (dc !== 0) return dc;
          const gc = String(a.gender || "").localeCompare(String(b.gender || ""));
          if (gc !== 0) return gc;
          return (a.rank || 99) - (b.rank || 99);
        });
      setResults(items);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [year]);
  return { results, loading };
}

export function useMeetingRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, MEETING_RECORDS_COL), (snap) => {
      setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);
  return { records, loading };
}

export function useMeetingWinners(discipline, gender) {
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let q = collection(db, MEETING_WINNERS_COL);
    if (discipline) q = query(q, where("discipline", "==", discipline));
    if (gender) q = query(q, where("gender", "==", gender));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.year - a.year);
      setWinners(items);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [discipline, gender]);
  return { winners, loading };
}

export function useAllWinners() {
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, MEETING_WINNERS_COL), (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          // Sort by canonical event order (track by distance, then field alpha)
          const DISCIPLINE_ORDER = [
            "50 m","60 m","60 m hurdles",
            "200 m","200 m - Special Olympics",
            "400 m","800 m","1000 m","1500 m","3000 m","5000 m",
          ];
          const keyOf = (d) => {
            const i = DISCIPLINE_ORDER.indexOf(d);
            return i !== -1 ? `0_${String(i).padStart(3,"0")}` : `1_${d}`;
          };
          const dc = keyOf(a.discipline || "").localeCompare(keyOf(b.discipline || ""));
          if (dc !== 0) return dc;
          if (a.gender !== b.gender) return a.gender === "W" ? -1 : 1;
          return b.year - a.year;
        });
      setWinners(items);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);
  return { winners, loading };
}

// ─── Seed historical data from JSON files ────────────────────────────────────

/**
 * Seed all historical data from the bundled JSON files into Firestore.
 * Idempotent — uses setDoc with merge so re-running is safe.
 * Returns a status string.
 */
export async function seedMeetingDatabase(onProgress) {
  // Dynamic imports so bundle doesn't include JSON unless this function runs
  const [editionsJson, recordsJson, winnersJson, resultsJson] = await Promise.all([
    import("../data/meetingEditions.json").then((m) => m.default),
    import("../data/meetingRecords.json").then((m) => m.default),
    import("../data/meetingWinners.json").then((m) => m.default),
    import("../data/meetingResults.json").then((m) => m.default),
  ]);

  let total = 0;

  // 1. Editions
  onProgress?.("Importing editions…");
  let batch = writeBatch(db);
  let count = 0;
  for (const ed of editionsJson) {
    batch.set(doc(db, MEETING_EDITIONS_COL, String(ed.year)), { ...ed, seededAt: serverTimestamp() }, { merge: true });
    count++;
    if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  await batch.commit();
  total += count;
  onProgress?.(`Editions: ${count} done`);

  // 2. Records
  onProgress?.("Importing meeting records…");
  batch = writeBatch(db); count = 0;
  for (const rec of recordsJson) {
    const id = `${rec.gender}_${rec.discipline.replace(/\s+/g, "_")}`;
    batch.set(doc(db, MEETING_RECORDS_COL, id), { ...rec, seededAt: serverTimestamp() }, { merge: true });
    count++;
    if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  await batch.commit();
  total += count;
  onProgress?.(`Records: ${count} done`);

  // 3. Winners
  onProgress?.("Importing winners…");
  batch = writeBatch(db); count = 0;
  for (const w of winnersJson) {
    const id = `${w.year}_${w.gender}_${w.discipline.replace(/\s+/g, "_")}`;
    batch.set(doc(db, MEETING_WINNERS_COL, id), { ...w, seededAt: serverTimestamp() }, { merge: true });
    count++;
    if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  await batch.commit();
  total += count;
  onProgress?.(`Winners: ${count} done`);

  // 4. Results (all years)
  onProgress?.("Importing historical results…");
  batch = writeBatch(db); count = 0;
  for (const [year, results] of Object.entries(resultsJson)) {
    for (const r of results) {
      const id = `${year}_${(r.discipline || "").replace(/\s+/g, "_")}_${r.gender || "X"}_${r.rank}_${r.lastName}`;
      batch.set(doc(db, MEETING_RESULTS_COL, id), {
        ...r, year: Number(year), seededAt: serverTimestamp(),
      }, { merge: true });
      count++;
      if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
    }
  }
  await batch.commit();
  total += count;
  onProgress?.(`Results: ${count} done`);

  return `Done — ${total} documents written to Firestore.`;
}

// ─── Close an edition ─────────────────────────────────────────────────────────

/**
 * Mark an edition as closed and record participation in athleteRegistry.
 * Matches results → registry entries by lastName + yob.
 * Falls back to name-only match if no registry entry found yet.
 */
export async function closeEdition(year, results, onProgress) {
  // Load all registry entries to find matches
  onProgress?.("Loading athlete registry…");
  const regSnap = await getDocs(collection(db, ATHLETE_REGISTRY_COLLECTION));
  const registry = regSnap.docs.map((d) => ({ _docId: d.id, ...d.data() }));

  // Index registry by lastName.toLowerCase()
  const regByName = new Map();
  for (const a of registry) {
    const k = String(a.lastName || "").toLowerCase();
    if (!regByName.has(k)) regByName.set(k, []);
    regByName.get(k).push(a);
  }

  let matched = 0;
  let created = 0;
  const batch = writeBatch(db);

  onProgress?.(`Processing ${results.length} results…`);

  for (const r of results) {
    const lastKey = String(r.lastName || "").toLowerCase();
    const candidates = regByName.get(lastKey) || [];

    // Match: same lastName + same yob (preferred) or same NOC
    let match = candidates.find((c) => c.yob === r.yob || c.birthYear === r.yob) ||
                candidates.find((c) => String(c.nationality || "").toUpperCase() === r.noc);

    const participation = {
      year: Number(year),
      discipline: r.discipline,
      gender: r.gender,
      rank: r.rank,
      result: r.result,
      noc: r.noc,
    };

    if (match) {
      // Add participation to existing registry entry
      const existing = Array.isArray(match.editions) ? match.editions : [];
      const alreadyPresent = existing.some((e) => e.year === Number(year) && e.discipline === r.discipline);
      if (!alreadyPresent) {
        batch.set(
          doc(db, ATHLETE_REGISTRY_COLLECTION, match._docId),
          { editions: [...existing, participation] },
          { merge: true },
        );
        matched++;
      }
    } else {
      // Create a new registry entry for this historical athlete
      const newId = `hist_${lastKey}_${(r.firstName || "").toLowerCase().slice(0, 4)}_${r.yob || ""}`;
      batch.set(
        doc(db, ATHLETE_REGISTRY_COLLECTION, newId),
        {
          lastName:    r.lastName,
          firstName:   r.firstName,
          yob:         r.yob,
          birthYear:   r.yob,
          nationality: r.noc,
          editions:    [participation],
          createdAt:   serverTimestamp(),
          updatedAt:   serverTimestamp(),
        },
        { merge: true },
      );
      created++;
    }
  }

  // Mark edition as closed
  batch.set(
    doc(db, MEETING_EDITIONS_COL, String(year)),
    { isClosed: true, closedAt: serverTimestamp() },
    { merge: true },
  );

  await batch.commit();
  return `Edition ${year} closed. ${matched} athletes matched in registry, ${created} new registry entries created.`;
}
