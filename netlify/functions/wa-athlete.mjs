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

const WA_GRAPHQL_URL = "https://graphql-prod-4.athleticswa.com/graphql";

const WA_HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  "Origin": "https://worldathletics.org",
  "Referer": "https://worldathletics.org/",
  "User-Agent": "Mozilla/5.0 (compatible; MyCLIM-WA-Proxy/1.0)",
  "x-amz-user-agent": "aws-amplify/3.0.7",
};

// ─── GraphQL queries (same as wa-service) ────────────────────────────────────

const QUERY_V1 = `
  query GetSingleAthleteByWAId($id: Int!) {
    getSingleAthleteByWAId(waid: $id) {
      aaId iaafId urlSlug givenName familyName birthDate sexNameUrlSlug
      personalBests {
        discipline disciplineCode mark wind notLegal date venueCity venueCountry resultScore
      }
      seasonBests {
        discipline disciplineCode mark wind notLegal date venueCity venueCountry resultScore
      }
    }
  }
`;

const QUERY_V2 = `
  query GetAthleteProfileByAthleteId($id: Int!) {
    getAthleteProfileByAthleteId(id: $id) {
      basicData { iaafId aaId givenName familyName birthDate }
      personalBests { results { discipline mark wind notLegal date venue resultScore } }
      seasonBests   { results { discipline mark wind notLegal date venue resultScore } }
    }
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  if (!res.ok) throw new Error(`WA HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join("; "));
  return data.data;
}

function normalizeResult(r) {
  const venue = r.venue || [r.venueCity, r.venueCountry].filter(Boolean).join(", ") || null;
  return {
    discipline: r.discipline || null,
    disciplineCode: r.disciplineCode || null,
    mark: r.mark || null,
    wind: r.wind ?? null,
    notLegal: r.notLegal ?? false,
    date: r.date || null,
    venue,
    resultScore: r.resultScore ?? null,
  };
}

function normalizeV1(data) {
  const a = data.getSingleAthleteByWAId;
  if (!a) return null;
  return {
    firstName: a.givenName || null,
    lastName: a.familyName || null,
    personalBests: (a.personalBests || []).map(normalizeResult),
    seasonBests: (a.seasonBests || []).map(normalizeResult),
  };
}

function normalizeV2(data) {
  const a = data.getAthleteProfileByAthleteId;
  if (!a) return null;
  return {
    firstName: a.basicData?.givenName || null,
    lastName: a.basicData?.familyName || null,
    personalBests: (a.personalBests?.results || []).map(normalizeResult),
    seasonBests: (a.seasonBests?.results || []).map(normalizeResult),
  };
}

async function fetchAthlete(waid) {
  const id = Number(waid);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid WAID");

  try {
    const data = await graphql(QUERY_V1, { id });
    const normalized = normalizeV1(data);
    if (normalized) return normalized;
  } catch (err) {
    console.warn(`[wa-athlete] v1 failed for ${id}: ${err.message}`);
  }

  const data = await graphql(QUERY_V2, { id });
  const normalized = normalizeV2(data);
  if (!normalized) throw new Error(`No data from WA for WAID ${id}`);
  return normalized;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method === "OPTIONS") return json(204, {});

  if (req.method !== "GET") return json(405, { error: "Method not allowed." });

  const url = new URL(req.url);
  const waid = url.searchParams.get("waid");

  if (!waid || isNaN(Number(waid)) || Number(waid) <= 0) {
    return json(400, { error: "Missing or invalid ?waid parameter." });
  }

  try {
    const athlete = await fetchAthlete(waid);
    return json(200, {
      waid: Number(waid),
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      source: "live",
      personalBests: athlete.personalBests,
      seasonBests: athlete.seasonBests,
    });
  } catch (err) {
    console.error(`[wa-athlete] Error for WAID ${waid}:`, err.message);
    return json(502, {
      error: "Could not fetch athlete data from World Athletics.",
      detail: err.message,
    });
  }
}
