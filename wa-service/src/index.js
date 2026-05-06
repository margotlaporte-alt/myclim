/**
 * WA Service – Express REST API
 *
 * Routes:
 *   GET  /health                      → service status
 *   GET  /athlete/:waid               → full athlete data (info + all perfs)
 *   GET  /athlete/:waid/performances  → PBs and SBs only
 *   GET  /athlete/:waid/pb            → personal bests only
 *   GET  /athlete/:waid/sb            → season bests only
 *   POST /athlete/:waid/sync          → force re-fetch from WA
 *   POST /sync/all                    → sync all cached athletes
 *   GET  /athletes                    → list all cached WAIDs
 *   DELETE /athlete/:waid             → remove from cache
 */

import express from "express";
import * as cache from "./cache.js";
import { syncOne, syncAll, startCron } from "./sync.js";

const PORT = Number(process.env.PORT || 3001);
const API_KEY = process.env.API_KEY || "";

// ─── Bootstrap ───────────────────────────────────────────────────────────────

cache.init();
startCron();

const app = express();
app.use(express.json());
app.disable("x-powered-by");

// ─── Auth middleware (optional) ───────────────────────────────────────────────

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const provided = req.headers["x-api-key"] || req.query.api_key;
  if (provided !== API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key." });
  }
  next();
}

// Apply auth to all routes except /health
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  requireApiKey(req, res, next);
});

// ─── WAID validation ──────────────────────────────────────────────────────────

function parseWaid(req, res) {
  const id = Number(req.params.waid);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "WAID must be a positive integer." });
    return null;
  }
  return id;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** Health check */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "wa-service", time: new Date().toISOString() });
});

/** List all WAIDs in cache */
app.get("/athletes", (_req, res) => {
  const waids = cache.listAllWaids();
  res.json({ count: waids.length, waids });
});

/** Full athlete data – tries cache, falls back to live fetch, falls back to stale */
app.get("/athlete/:waid", async (req, res) => {
  const waid = parseWaid(req, res);
  if (!waid) return;

  // 1. Fresh cache hit
  const cached = cache.get(waid);
  if (cached) return res.json({ source: "cache", data: cached });

  // 2. Live fetch
  try {
    const data = await syncOne(waid);
    return res.json({ source: "live", data: cache.get(waid) || data });
  } catch (err) {
    console.error(`[api] Live fetch failed for ${waid}: ${err.message}`);

    // 3. Stale cache fallback
    const stale = cache.getStale(waid);
    if (stale) {
      return res.status(200).json({
        source: "stale",
        warning: "World Athletics API unavailable; returning cached data.",
        data: stale,
      });
    }

    return res.status(502).json({
      error: "Could not fetch athlete data from World Athletics.",
      detail: err.message,
    });
  }
});

/** Performances only (PBs + SBs) */
app.get("/athlete/:waid/performances", async (req, res) => {
  const waid = parseWaid(req, res);
  if (!waid) return;

  const athlete = await resolveAthlete(waid, res);
  if (!athlete) return;

  res.json({
    waid,
    firstName: athlete.data.firstName,
    lastName: athlete.data.lastName,
    source: athlete.source,
    personalBests: athlete.data.personalBests,
    seasonBests: athlete.data.seasonBests,
  });
});

/** Personal bests only */
app.get("/athlete/:waid/pb", async (req, res) => {
  const waid = parseWaid(req, res);
  if (!waid) return;

  const { discipline } = req.query;
  const athlete = await resolveAthlete(waid, res);
  if (!athlete) return;

  let pbs = athlete.data.personalBests;
  if (discipline) {
    const d = discipline.toLowerCase();
    pbs = pbs.filter(
      (p) =>
        p.discipline?.toLowerCase().includes(d) ||
        p.disciplineCode?.toLowerCase().includes(d),
    );
  }

  res.json({
    waid,
    firstName: athlete.data.firstName,
    lastName: athlete.data.lastName,
    source: athlete.source,
    discipline: discipline || null,
    personalBests: pbs,
  });
});

/** Season bests only */
app.get("/athlete/:waid/sb", async (req, res) => {
  const waid = parseWaid(req, res);
  if (!waid) return;

  const { discipline } = req.query;
  const athlete = await resolveAthlete(waid, res);
  if (!athlete) return;

  let sbs = athlete.data.seasonBests;
  if (discipline) {
    const d = discipline.toLowerCase();
    sbs = sbs.filter(
      (p) =>
        p.discipline?.toLowerCase().includes(d) ||
        p.disciplineCode?.toLowerCase().includes(d),
    );
  }

  res.json({
    waid,
    firstName: athlete.data.firstName,
    lastName: athlete.data.lastName,
    source: athlete.source,
    discipline: discipline || null,
    seasonBests: sbs,
  });
});

/** Force re-fetch from World Athletics */
app.post("/athlete/:waid/sync", async (req, res) => {
  const waid = parseWaid(req, res);
  if (!waid) return;

  try {
    await syncOne(waid);
    const data = cache.get(waid);
    res.json({ ok: true, waid, data });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/** Sync all cached athletes */
app.post("/sync/all", async (_req, res) => {
  // Respond immediately; sync runs in background
  res.json({ ok: true, message: "Full sync started in background." });
  syncAll().catch((err) => console.error("[sync/all] Unexpected error:", err));
});

/** Remove an athlete from cache */
app.delete("/athlete/:waid", (req, res) => {
  const waid = parseWaid(req, res);
  if (!waid) return;
  cache.remove(waid);
  res.json({ ok: true, waid, message: "Removed from cache." });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error("[api] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// ─── Shared resolver ─────────────────────────────────────────────────────────

async function resolveAthlete(waid, res) {
  const cached = cache.get(waid);
  if (cached) return { source: "cache", data: cached };

  try {
    await syncOne(waid);
    return { source: "live", data: cache.get(waid) };
  } catch (err) {
    const stale = cache.getStale(waid);
    if (stale) return { source: "stale", data: stale };
    res.status(502).json({ error: "World Athletics unavailable.", detail: err.message });
    return null;
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[wa-service] Listening on http://localhost:${PORT}`);
  if (API_KEY) console.log("[wa-service] API key protection enabled.");
});
