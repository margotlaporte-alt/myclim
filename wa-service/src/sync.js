/**
 * Sync engine.
 *
 * - syncOne(waid)  : fetch from WA and write to cache (throws on error)
 * - syncAll()      : sync every WAID already in the DB; logs errors, doesn't throw
 * - startCron()    : register the daily job using SYNC_CRON env variable
 */

import cron from "node-cron";
import { fetchAthlete } from "./worldathletics.js";
import * as cache from "./cache.js";

const SYNC_CRON = process.env.SYNC_CRON || "0 3 * * *"; // 3:00 AM every day

let cronJob = null;

// ─── Core ────────────────────────────────────────────────────────────────────

async function syncOne(waid) {
  const id = Number(waid);
  console.log(`[sync] Fetching WAID ${id} from World Athletics…`);
  const data = await fetchAthlete(id);
  cache.set(id, data);
  console.log(`[sync] WAID ${id} cached (${data.personalBests.length} PBs, ${data.seasonBests.length} SBs)`);
  return data;
}

async function syncAll() {
  const waids = cache.listAllWaids();
  if (waids.length === 0) {
    console.log("[sync] No WAIDs in cache to sync.");
    return { synced: 0, failed: 0, errors: [] };
  }

  console.log(`[sync] Starting full sync for ${waids.length} athlete(s)…`);

  let synced = 0;
  const errors = [];

  for (const waid of waids) {
    try {
      await syncOne(waid);
      synced++;
      // Polite delay between requests to avoid hammering WA
      await sleep(500);
    } catch (err) {
      console.error(`[sync] Failed for WAID ${waid}: ${err.message}`);
      errors.push({ waid, error: err.message });
    }
  }

  const summary = { synced, failed: errors.length, errors };
  console.log(`[sync] Done. ${synced} OK, ${errors.length} failed.`);
  return summary;
}

// ─── Cron ────────────────────────────────────────────────────────────────────

function startCron() {
  if (!cron.validate(SYNC_CRON)) {
    console.error(`[sync] Invalid cron expression: "${SYNC_CRON}"`);
    return;
  }

  cronJob = cron.schedule(SYNC_CRON, async () => {
    console.log(`[sync] Daily cron triggered (${SYNC_CRON})`);
    await syncAll();
  });

  console.log(`[sync] Daily cron scheduled: "${SYNC_CRON}"`);
}

function stopCron() {
  cronJob?.stop();
}

// ─── Util ────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { syncOne, syncAll, startCron, stopCron };
