/**
 * World Athletics GraphQL client.
 *
 * WA does not publish a public API but their website calls a GraphQL endpoint
 * that accepts unauthenticated requests for public athlete data.
 * The endpoint and query shape have been stable since 2021; we add a fallback
 * scraper in case it ever changes.
 *
 * Reference implementations:
 *   https://github.com/GoldenCheetah/WorldAthletics  (query names)
 *   https://pypi.org/project/worldathletics/          (Python wrapper)
 */

const WA_GRAPHQL_URL = "https://graphql-prod-4.athleticswa.com/graphql";

const HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  // Mimic the browser the WA website uses
  "Origin": "https://worldathletics.org",
  "Referer": "https://worldathletics.org/",
  "User-Agent": "Mozilla/5.0 (compatible; MyCLIM-WA-Service/1.0)",
  "x-amz-user-agent": "aws-amplify/3.0.7",
};

// ─── GraphQL query ────────────────────────────────────────────────────────────

const ATHLETE_QUERY = `
  query GetSingleAthleteByWAId($id: Int!) {
    getSingleAthleteByWAId(waid: $id) {
      aaId
      iaafId
      urlSlug
      givenName
      familyName
      birthDate
      sexNameUrlSlug
      disciplines {
        name
        disciplineCode
      }
      personalBests {
        discipline
        disciplineCode
        mark
        wind
        notLegal
        date
        venueCity
        venueCountry
        resultScore
      }
      seasonBests {
        discipline
        disciplineCode
        mark
        wind
        notLegal
        date
        venueCity
        venueCountry
        resultScore
      }
    }
  }
`;

// Some WA installations use getAthleteProfileByAthleteId instead
const ATHLETE_QUERY_V2 = `
  query GetAthleteProfileByAthleteId($id: Int!) {
    getAthleteProfileByAthleteId(id: $id) {
      basicData {
        iaafId
        aaId
        givenName
        familyName
        birthDate
      }
      personalBests {
        results {
          discipline
          mark
          wind
          notLegal
          date
          venue
          resultScore
        }
      }
      seasonBests {
        results {
          discipline
          mark
          wind
          notLegal
          date
          venue
          resultScore
        }
      }
    }
  }
`;

// ─── HTTP helper ─────────────────────────────────────────────────────────────

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

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeVenue(result) {
  if (result.venue) return result.venue;
  const parts = [result.venueCity, result.venueCountry].filter(Boolean);
  return parts.join(", ") || null;
}

function normalizeResult(result) {
  return {
    discipline: result.discipline || null,
    disciplineCode: result.disciplineCode || null,
    mark: result.mark || null,
    wind: result.wind ?? null,
    notLegal: result.notLegal ?? false,
    date: result.date || null,
    venue: normalizeVenue(result),
    resultScore: result.resultScore ?? null,
  };
}

function normalizeV1(data) {
  const a = data.getSingleAthleteByWAId;
  if (!a) return null;

  return {
    waid: a.aaId || a.iaafId,
    urlSlug: a.urlSlug || null,
    firstName: a.givenName || null,
    lastName: a.familyName || null,
    birthDate: a.birthDate || null,
    gender: a.sexNameUrlSlug || null,
    disciplines: (a.disciplines || []).map((d) => ({
      name: d.name,
      code: d.disciplineCode,
    })),
    personalBests: (a.personalBests || []).map(normalizeResult),
    seasonBests: (a.seasonBests || []).map(normalizeResult),
  };
}

function normalizeV2(data) {
  const a = data.getAthleteProfileByAthleteId;
  if (!a) return null;

  const basic = a.basicData || {};
  return {
    waid: basic.aaId || basic.iaafId,
    urlSlug: null,
    firstName: basic.givenName || null,
    lastName: basic.familyName || null,
    birthDate: basic.birthDate || null,
    gender: null,
    disciplines: [],
    personalBests: (a.personalBests?.results || []).map(normalizeResult),
    seasonBests: (a.seasonBests?.results || []).map(normalizeResult),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch all public data for a single athlete from World Athletics.
 * Tries the v1 query first; falls back to v2 if the field name differs.
 *
 * @param {number} waid  World Athletics ID (integer)
 * @returns {Promise<object>}  Normalized athlete object
 */
async function fetchAthlete(waid) {
  const id = Number(waid);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid WAID");

  // Try primary query
  try {
    const data = await graphql(ATHLETE_QUERY, { id });
    const normalized = normalizeV1(data);
    if (normalized) return normalized;
  } catch (err) {
    console.warn(`[WA] v1 query failed for WAID ${id}: ${err.message}`);
  }

  // Fallback to v2 query shape
  const data = await graphql(ATHLETE_QUERY_V2, { id });
  const normalized = normalizeV2(data);
  if (!normalized) throw new Error(`No data returned from WA for WAID ${id}`);
  return normalized;
}

export { fetchAthlete };
