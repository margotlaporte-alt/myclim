/**
 * World Athletics GraphQL client.
 *
 * Uses the WA internal GraphQL endpoint discovered from their JS bundles.
 * The `indoor` boolean field returned by WA is unreliable (often wrong),
 * so we detect indoor results from the venue "(i)" suffix and discipline name.
 */

const WA_GRAPHQL_URL = "https://graphql-prod-4871.edge.aws.worldathletics.org/graphql";
const WA_API_KEY     = "da2-j25npjv5w5ft7bgv3smr22xcda";

const HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  "x-api-key": WA_API_KEY,
  "Origin": "https://worldathletics.org",
  "Referer": "https://worldathletics.org/",
  "User-Agent": "Mozilla/5.0 (compatible; MyCLIM-WA-Service/1.0)",
};

// ─── GraphQL queries ──────────────────────────────────────────────────────────

const QUERY_PB = `
  query GetSingleCompetitor($id: Int!) {
    getSingleCompetitor(id: $id) {
      basicData {
        firstName
        lastName
        birthDate
        countryCode
        sexNameUrlSlug
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

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function graphql(query, variables) {
  const response = await fetch(WA_GRAPHQL_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`WA API HTTP ${response.status}: ${await response.text()}`);
  }

  const json = await response.json();

  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join("; ");
    throw new Error(`WA GraphQL errors: ${msg}`);
  }

  return json.data;
}

// ─── Indoor detection ─────────────────────────────────────────────────────────

/**
 * Detect whether a result is indoor.
 * WA's own `indoor` boolean is unreliable (often returns false for indoor results).
 * We use multiple signals in priority order:
 *  1. venue string contains " (i)" suffix  ← most reliable
 *  2. disciplineNameUrlSlug contains "indoor"
 *  3. discipline name starts with "60"  ← 60m / 60mH are indoor-only events
 *  4. WA's `indoor` boolean  ← last resort
 */
function isIndoor(r) {
  const venue = (r.venue || "").toLowerCase();
  if (venue.includes("(i)")) return true;

  const slug = (r.disciplineNameUrlSlug || "").toLowerCase();
  if (slug.includes("indoor")) return true;

  const disc = (r.discipline || "").toLowerCase();
  if (disc.startsWith("60")) return true;

  return r.indoor === true;
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

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
    indoor:      isIndoor(r),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all public data for a single athlete from World Athletics.
 *
 * @param {number} waid  World Athletics ID (integer)
 * @returns {Promise<object>}  Normalized athlete object
 */
async function fetchAthlete(waid) {
  const id = Number(waid);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid WAID");

  // Fetch PBs
  const pbData     = await graphql(QUERY_PB, { id });
  const competitor = pbData?.getSingleCompetitor;
  if (!competitor) throw new Error(`No competitor found for WAID ${id}`);

  const basic         = competitor.basicData || {};
  const personalBests = (competitor.personalBests?.results || []).map(normalizeResult);

  // Fetch SBs for current year and the two previous years
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const sbResults = await Promise.allSettled(
    years.map((year) => graphql(QUERY_SB, { id, year })),
  );

  const seasonBests = sbResults.flatMap((res, i) => {
    if (res.status !== "fulfilled") {
      console.warn(`[WA] SB fetch failed for WAID ${id} year ${years[i]}: ${res.reason?.message}`);
      return [];
    }
    return (res.value?.getSingleCompetitorSeasonBests?.results || []).map(normalizeResult);
  });

  return {
    waid:         id,
    firstName:    basic.firstName   || null,
    lastName:     basic.lastName    || null,
    birthDate:    basic.birthDate   || null,
    countryCode:  basic.countryCode || null,
    gender:       basic.sexNameUrlSlug || null,
    personalBests,
    seasonBests,
  };
}

export { fetchAthlete };
