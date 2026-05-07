/**
 * Netlify Function — World Athletics athlete proxy
 *
 * Fetches PBs and SBs for a single athlete from the WA internal GraphQL API.
 * No cache (stateless) — the caller (MyCLIM frontend) persists data in Firestore.
 *
 * Route (via netlify.toml redirect):
 *   GET /api/wa/athlete/:waid/performances
 *   → /.netlify/functions/wa-athlete?waid=:waid
 */

const WA_GRAPHQL_URL = "https://graphql-prod-4871.edge.aws.worldathletics.org/graphql";
const WA_API_KEY     = "da2-j25npjv5w5ft7bgv3smr22xcda";

const WA_HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  "x-api-key": WA_API_KEY,
  "Origin": "https://worldathletics.org",
  "Referer": "https://worldathletics.org/",
  "User-Agent": "Mozilla/5.0 (compatible; MyCLIM-WA-Proxy/1.0)",
};

// ─── GraphQL queries ──────────────────────────────────────────────────────────

// Personal bests
const QUERY_PB = `
  query GetSingleCompetitor($id: Int!) {
    getSingleCompetitor(id: $id) {
      basicData {
        firstName
        lastName
      }
      personalBests {
        results {
          indoor
          discipline
          disciplineCode
          disciplineNameUrlSlug
          mark
          wind
          notLegal
          venue
          date
          resultScore
        }
      }
    }
  }
`;

// Season bests — requires a specific season year
const QUERY_SB = `
  query GetSingleCompetitorSeasonBests($id: Int!, $year: Int!) {
    getSingleCompetitorSeasonBests(id: $id, seasonsBestsSeason: $year) {
      results {
        indoor
        discipline
        disciplineCode
        disciplineNameUrlSlug
        mark
        wind
        notLegal
        venue
        date
        resultScore
      }
    }
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}

async function graphql(query, variables) {
  const res = await fetch(WA_GRAPHQL_URL, {
    method: "POST",
    headers: WA_HEADERS,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`WA HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join("; "));
  return data.data;
}

/**
 * Detect whether a result is indoor using multiple signals:
 *  1. venue string contains " (i)" suffix (most reliable)
 *  2. disciplineNameUrlSlug contains "indoor"
 *  3. discipline name starts with "60" (60m / 60mH are indoor-only)
 *  4. `indoor` boolean field from WA (unreliable — often wrong)
 */
function isIndoor(r) {
  const venue = (r.venue || "").toLowerCase();
  if (venue.includes("(i)")) return true;

  const slug = (r.disciplineNameUrlSlug || "").toLowerCase();
  if (slug.includes("indoor")) return true;

  const disc = (r.discipline || "").toLowerCase();
  if (disc.startsWith("60")) return true;   // 60m / 60mH are indoor-only events

  // Fall back to the WA boolean as a last resort (it is sometimes correct)
  return r.indoor === true;
}

function normalizeResult(r) {
  return {
    discipline:            r.discipline            || null,
    disciplineCode:        r.disciplineCode        || null,
    disciplineNameUrlSlug: r.disciplineNameUrlSlug || null,
    mark:        r.mark        || null,
    wind:        r.wind        ?? null,
    notLegal:    r.notLegal    ?? false,
    venue:       r.venue       || null,
    date:        r.date        || null,
    resultScore: r.resultScore ?? null,
    indoor:      isIndoor(r),   // our computed value, not WA's unreliable field
  };
}

async function fetchAthlete(waid) {
  const id = Number(waid);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid WAID");

  // Fetch PBs
  const pbData = await graphql(QUERY_PB, { id });
  const competitor = pbData?.getSingleCompetitor;
  if (!competitor) throw new Error(`No competitor found for WAID ${id}`);

  const personalBests = (competitor.personalBests?.results || []).map(normalizeResult);
  const firstName     = competitor.basicData?.firstName || null;
  const lastName      = competitor.basicData?.lastName  || null;

  // Fetch SBs for multiple seasons (current year and previous two)
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const sbResults = await Promise.allSettled(
    years.map((year) => graphql(QUERY_SB, { id, year })),
  );

  const seasonBests = sbResults.flatMap((res, i) => {
    if (res.status !== "fulfilled") {
      console.warn(`[wa-athlete] SB fetch failed for WAID ${id} year ${years[i]}: ${res.reason?.message}`);
      return [];
    }
    return (res.value?.getSingleCompetitorSeasonBests?.results || []).map(normalizeResult);
  });

  return { firstName, lastName, personalBests, seasonBests };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method === "OPTIONS") return json(204, {});

  if (req.method !== "GET") return json(405, { error: "Method not allowed." });

  const url  = new URL(req.url);
  const waid = url.searchParams.get("waid");

  if (!waid || isNaN(Number(waid)) || Number(waid) <= 0) {
    return json(400, { error: "Missing or invalid ?waid parameter." });
  }

  try {
    const athlete = await fetchAthlete(waid);
    return json(200, {
      waid: Number(waid),
      firstName:    athlete.firstName,
      lastName:     athlete.lastName,
      source:       "live",
      personalBests: athlete.personalBests,
      seasonBests:   athlete.seasonBests,
    });
  } catch (err) {
    console.error(`[wa-athlete] Error for WAID ${waid}:`, err.message);
    return json(502, {
      error:  "Could not fetch athlete data from World Athletics.",
      detail: err.message,
    });
  }
}
