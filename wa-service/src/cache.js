/**
 * SQLite cache layer.
 *
 * Schema:
 *   athletes      – basic info per WAID
 *   performances  – individual PB/SB results linked to a WAID
 *
 * All writes are synchronous (better-sqlite3); reads return plain objects.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = process.env.DB_PATH || "./data/wa_cache.db";
const CACHE_TTL = Number(process.env.CACHE_TTL_SECONDS || 21_600); // 6 h default

let db;

// ─── Schema ──────────────────────────────────────────────────────────────────

const DDL = `
  CREATE TABLE IF NOT EXISTS athletes (
    waid          INTEGER PRIMARY KEY,
    url_slug      TEXT,
    first_name    TEXT,
    last_name     TEXT,
    birth_date    TEXT,
    gender        TEXT,
    disciplines   TEXT,   -- JSON array
    fetched_at    INTEGER NOT NULL  -- unix timestamp seconds
  );

  CREATE TABLE IF NOT EXISTS performances (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    waid            INTEGER NOT NULL REFERENCES athletes(waid) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('PB','SB')),
    discipline      TEXT,
    discipline_code TEXT,
    mark            TEXT,
    wind            TEXT,
    not_legal       INTEGER DEFAULT 0,
    perf_date       TEXT,
    venue           TEXT,
    result_score    REAL
  );

  CREATE INDEX IF NOT EXISTS idx_perf_waid ON performances (waid);
  CREATE INDEX IF NOT EXISTS idx_perf_type ON performances (waid, type);
`;

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(DDL);
  console.log(`[cache] SQLite ready at ${DB_PATH}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function isStale(fetchedAt) {
  return nowSeconds() - fetchedAt > CACHE_TTL;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns cached data or null if missing/stale.
 */
function get(waid) {
  const athlete = db.prepare("SELECT * FROM athletes WHERE waid = ?").get(waid);
  if (!athlete) return null;
  if (isStale(athlete.fetched_at)) return null;

  const performances = db
    .prepare("SELECT * FROM performances WHERE waid = ? ORDER BY type, discipline")
    .all(waid);

  return formatOutput(athlete, performances);
}

/**
 * Returns cached data regardless of staleness (used for graceful degradation).
 */
function getStale(waid) {
  const athlete = db.prepare("SELECT * FROM athletes WHERE waid = ?").get(waid);
  if (!athlete) return null;

  const performances = db
    .prepare("SELECT * FROM performances WHERE waid = ? ORDER BY type, discipline")
    .all(waid);

  return { ...formatOutput(athlete, performances), _stale: true };
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Upsert an athlete and replace all their performances atomically.
 */
function set(waid, athleteData) {
  const upsertAthlete = db.prepare(`
    INSERT INTO athletes (waid, url_slug, first_name, last_name, birth_date, gender, disciplines, fetched_at)
    VALUES (@waid, @url_slug, @first_name, @last_name, @birth_date, @gender, @disciplines, @fetched_at)
    ON CONFLICT (waid) DO UPDATE SET
      url_slug   = excluded.url_slug,
      first_name = excluded.first_name,
      last_name  = excluded.last_name,
      birth_date = excluded.birth_date,
      gender     = excluded.gender,
      disciplines = excluded.disciplines,
      fetched_at = excluded.fetched_at
  `);

  const deletePerfs = db.prepare("DELETE FROM performances WHERE waid = ?");

  const insertPerf = db.prepare(`
    INSERT INTO performances
      (waid, type, discipline, discipline_code, mark, wind, not_legal, perf_date, venue, result_score)
    VALUES
      (@waid, @type, @discipline, @discipline_code, @mark, @wind, @not_legal, @perf_date, @venue, @result_score)
  `);

  const tx = db.transaction(() => {
    upsertAthlete.run({
      waid: Number(waid),
      url_slug: athleteData.urlSlug || null,
      first_name: athleteData.firstName || null,
      last_name: athleteData.lastName || null,
      birth_date: athleteData.birthDate || null,
      gender: athleteData.gender || null,
      disciplines: JSON.stringify(athleteData.disciplines || []),
      fetched_at: nowSeconds(),
    });

    deletePerfs.run(Number(waid));

    for (const pb of (athleteData.personalBests || [])) {
      insertPerf.run(mapPerf(waid, "PB", pb));
    }
    for (const sb of (athleteData.seasonBests || [])) {
      insertPerf.run(mapPerf(waid, "SB", sb));
    }
  });

  tx();
}

function mapPerf(waid, type, r) {
  return {
    waid: Number(waid),
    type,
    discipline: r.discipline || null,
    discipline_code: r.disciplineCode || null,
    mark: r.mark || null,
    wind: r.wind != null ? String(r.wind) : null,
    not_legal: r.notLegal ? 1 : 0,
    perf_date: r.date || null,
    venue: r.venue || null,
    result_score: r.resultScore ?? null,
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatPerf(row) {
  return {
    discipline: row.discipline,
    disciplineCode: row.discipline_code,
    mark: row.mark,
    wind: row.wind,
    notLegal: Boolean(row.not_legal),
    date: row.perf_date,
    venue: row.venue,
    resultScore: row.result_score,
  };
}

function formatOutput(athlete, performances) {
  const pbs = performances.filter((p) => p.type === "PB").map(formatPerf);
  const sbs = performances.filter((p) => p.type === "SB").map(formatPerf);

  let disciplines = [];
  try { disciplines = JSON.parse(athlete.disciplines || "[]"); } catch {}

  return {
    waid: athlete.waid,
    urlSlug: athlete.url_slug,
    firstName: athlete.first_name,
    lastName: athlete.last_name,
    birthDate: athlete.birth_date,
    gender: athlete.gender,
    disciplines,
    personalBests: pbs,
    seasonBests: sbs,
    fetchedAt: new Date(athlete.fetched_at * 1000).toISOString(),
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function listAllWaids() {
  return db.prepare("SELECT waid FROM athletes").all().map((r) => r.waid);
}

function remove(waid) {
  db.prepare("DELETE FROM athletes WHERE waid = ?").run(Number(waid));
}

export { init, get, getStale, set, listAllWaids, remove };
