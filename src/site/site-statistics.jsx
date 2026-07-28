import { Fragment, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { formatEditionLabel, getEditionDisplayNumber } from "../app/meeting-edition-utils";
import {
  useAllWinners,
  useMeetingEditions,
  useMeetingRecords,
  useMeetingResultsForYear,
} from "../app/meeting-history-hooks";

/* ── Helpers ─────────────────────────────────────────────── */
function formatMark(mark) {
  return mark || "—";
}

function genderLabel(g) {
  return g === "W" ? "Women" : "Men";
}

function genderGroupLabel(g) {
  return g === "W" ? "Women Records" : g === "M" ? "Men Records" : "Mixed Records";
}

function winnerGroupLabel(g) {
  return g === "W" ? "Women" : g === "M" ? "Men" : "Mixed";
}

const TRACK_DISC_ORDER = [
  "50m","60m","60m hurdles",
  "200m","200m - Special Olympics",
  "400m","400m hurdles","400m - Special Olympics",
  "800m","800m - Special Olympics",
  "1000m","1500m","3000m","5000m",
];
const normDiscipline = (d) =>
  (d || "").replace(/(\d)\s+(m\b)/gi, "$1$2").replace(/Hurdles/g, "hurdles").trim();
const discKey = (d) => {
  const nd = normDiscipline(d);
  const i = TRACK_DISC_ORDER.indexOf(nd);
  return i !== -1 ? `0_${i.toString().padStart(3, "0")}` : `1_${nd.toLowerCase()}`;
};

function genderSortValue(gender) {
  return ({ W: 0, M: 1, X: 2 }[gender] ?? 9);
}

function resultRankSortValue(rank) {
  const numeric = Number(rank);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 999;
}

function normalizeRoundLabel(round) {
  const value = String(round || "").trim().toLowerCase();
  if (value === "heat") return "Heat";
  if (value === "final") return "Final";
  if (value === "timed final") return "Timed Final";
  return String(round || "").trim();
}

function isHeatRound(round) {
  return normalizeRoundLabel(round) === "Heat";
}

function isFinalRound(round) {
  return normalizeRoundLabel(round) === "Final";
}

function isTimedFinalRound(round) {
  return normalizeRoundLabel(round) === "Timed Final";
}

function sectionOrderValue(token) {
  const value = String(token || "").trim().toUpperCase();
  if (!value) return 0;
  if (value === "1" || value === "A") return 1;
  if (value === "2" || value === "B") return 2;
  if (value === "3" || value === "C") return 3;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return 99;
}

function sectionSortValue(section) {
  const round = normalizeRoundLabel(section?.round);
  if (isFinalRound(round)) return 0;
  if (isTimedFinalRound(round)) return 1;
  if (isHeatRound(round)) return 2;
  return 3;
}

function buildSectionKey(result) {
  return [
    normalizeRoundLabel(result?.round) || "Round",
    String(result?.finalGroup || ""),
    String(result?.heat || ""),
  ].join("||");
}

function formatSectionLabel(section) {
  const round = normalizeRoundLabel(section?.round);
  if (round === "Heat") return section?.heat ? `Heat ${section.heat}` : "Heat";
  if (round === "Final") return section?.finalGroup ? `Final ${section.finalGroup}` : "Final";
  if (round === "Timed Final") return section?.heat ? `Timed Final · Heat ${section.heat}` : "Timed Final";
  if (section?.finalGroup) return `${round} ${section.finalGroup}`.trim();
  if (section?.heat) return `${round} ${section.heat}`.trim();
  return round || "Results";
}

function resultDisplayRank(result) {
  if (isHeatRound(result?.round)) return result?.sectionRank || result?.rank || null;
  return result?.rank || result?.sectionRank || null;
}

const NOC_TO_ISO2 = {
  GER:"DE", GBR:"GB", NED:"NL", SUI:"CH", DEN:"DK", NOR:"NO",
  SWE:"SE", FIN:"FI", BLR:"BY", CZE:"CZ", SVK:"SK", SLO:"SI",
  CRO:"HR", SRB:"RS", MKD:"MK", GRE:"GR", TUR:"TR", RSA:"ZA",
  ZAF:"ZA", KEN:"KE", ETH:"ET", MAR:"MA", ALG:"DZ", NGR:"NG",
  CMR:"CM", JAM:"JM", BAH:"BS", TTO:"TT", AUS:"AU", NZL:"NZ",
  JPN:"JP", CHN:"CN", KOR:"KR", MAS:"MY", HKG:"HK", LAT:"LV",
  LTU:"LT", EST:"EE", MDA:"MD", ARM:"AM", GEO:"GE", AZE:"AZ",
  KAZ:"KZ", UZB:"UZ", ROU:"RO", HUN:"HU", BUL:"BG",
};
function nocToFlag(noc) {
  if (!noc) return "";
  const iso = NOC_TO_ISO2[noc] || noc;
  if (iso.length !== 2) return "";
  try {
    return String.fromCodePoint(0x1F1E6 + iso.charCodeAt(0) - 65, 0x1F1E6 + iso.charCodeAt(1) - 65);
  } catch { return ""; }
}

function LoadingRows({ cols = 5 }) {
  return Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} style={{ opacity: 0.4 }}>
      {Array.from({ length: cols }).map((__, j) => (
        <td key={j} style={{ padding: "12px 16px" }}>
          <div style={{ height: 14, background: "rgba(255,255,255,0.06)", borderRadius: 4 }} />
        </td>
      ))}
    </tr>
  ));
}

/* ── Records panel ───────────────────────────────────────── */
function RecordsPanel({ records, loading }) {
  const [genderFilter, setGenderFilter] = useState("all");
  const [luxOnly, setLuxOnly] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const seen = new Set();
    return records
      .filter((r) => genderFilter === "all" || r.gender === genderFilter)
      .filter((r) => !luxOnly || r.noc === "LUX")
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          normDiscipline(r.discipline)?.toLowerCase().includes(q) ||
          r.fullName?.toLowerCase().includes(q) ||
          r.noc?.toLowerCase().includes(q) ||
          String(r.year || "").includes(q) ||
          String(r.mark || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const genderOrder = { W: 0, M: 1, X: 2 };
        const gc = (genderOrder[a.gender] ?? 9) - (genderOrder[b.gender] ?? 9);
        if (gc !== 0) return gc;
        const dc = discKey(a.discipline).localeCompare(discKey(b.discipline));
        if (dc !== 0) return dc;
        return String(a.fullName || "").localeCompare(String(b.fullName || ""));
      })
      .filter((r) => {
        const key = `${normDiscipline(r.discipline)}_${r.gender}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [records, genderFilter, luxOnly, search]);

  const grouped = useMemo(() => {
    const groups = [
      { key: "W", label: "Women Records", rows: [] },
      { key: "M", label: "Men Records", rows: [] },
      { key: "X", label: "Mixed / Other", rows: [] },
    ];
    filtered.forEach((row) => {
      const target = groups.find((group) => group.key === row.gender) || groups[2];
      target.rows.push(row);
    });
    return groups.filter((group) => group.rows.length > 0);
  }, [filtered]);

  const activeDisciplines = useMemo(
    () => new Set(filtered.map((row) => normDiscipline(row.discipline)).filter(Boolean)).size,
    [filtered],
  );
  const activeNations = useMemo(
    () => new Set(filtered.map((row) => row.noc).filter(Boolean)).size,
    [filtered],
  );
  const latestRecordYear = useMemo(
    () => filtered.reduce((max, row) => Math.max(max, Number(row.year || 0)), 0) || "—",
    [filtered],
  );

  return (
    <div className="site-stats-panel site-stats-panel--full">
      <div className="site-stats-panel__head">
        <div className="site-stats-heading">
          <span className="site-stats-panel__title">Meeting Records</span>
          <p>Fastest marks and best field performances ever achieved at the meeting.</p>
        </div>
      </div>
      <div className="site-stats-toolbar">
        <div className="site-stats-toolbar__row">
          <input
            className="site-stats-search site-stats-search--wide"
            placeholder="Search athlete, discipline, nation, year or mark…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <button className="site-stats-clear" onClick={() => setSearch("")}>
              Clear search
            </button>
          ) : null}
        </div>
        <div className="site-stats-toolbar__row">
          <div className="site-stats-segmented">
            {["all", "W", "M"].map((g) => (
              <button
                key={g}
                className={`site-stats-filter${genderFilter === g ? " site-stats-filter--active" : ""}`}
                onClick={() => setGenderFilter(g)}
              >
                {g === "all" ? "All categories" : genderLabel(g)}
              </button>
            ))}
          </div>
          <button
            className={`site-stats-filter${luxOnly ? " site-stats-filter--active" : ""}`}
            onClick={() => setLuxOnly((current) => !current)}
          >
            Luxembourg only
          </button>
        </div>
      </div>
      <div className="site-stats-summary" aria-label="Records summary">
        <span className="site-stats-summary__item"><strong>{filtered.length}</strong> records shown</span>
        <span className="site-stats-summary__item"><strong>{activeDisciplines}</strong> disciplines</span>
        <span className="site-stats-summary__item"><strong>{activeNations}</strong> nations</span>
        <span className="site-stats-summary__item"><strong>{latestRecordYear}</strong> latest record year</span>
      </div>
      <div className="site-stats-panel__body">
        <table className="site-data-table">
          <thead>
            <tr>
              <th>Discipline</th>
              <th>Gender</th>
              <th>Athlete</th>
              <th>Nation</th>
              <th>Performance</th>
              <th>Year</th>
            </tr>
          </thead>
          {loading ? (
            <tbody><LoadingRows cols={6} /></tbody>
          ) : filtered.length === 0 ? (
            <tbody><tr><td colSpan={6} className="site-empty-state">No records match your filters</td></tr></tbody>
          ) : grouped.map((group) => (
            <tbody key={group.key}>
              <tr className="site-data-table__group-row">
                <td colSpan={6}>
                  <div className="site-data-table__group-meta">
                    <span>{genderGroupLabel(group.key)}</span>
                    <span>{group.rows.length} record{group.rows.length > 1 ? "s" : ""}</span>
                  </div>
                </td>
              </tr>
              {group.rows.map((r, i) => (
                <tr key={r.id || `${group.key}-${i}`} className={r.noc === "LUX" ? "row--lux" : ""}>
                  <td style={{ fontWeight: 600, whiteSpace: "normal" }}>{normDiscipline(r.discipline)}</td>
                  <td>
                    <span className={`site-badge ${r.gender === "W" ? "site-badge--red" : "site-badge--blue"}`}>
                      {r.gender === "W" ? "W" : r.gender === "M" ? "M" : "X"}
                    </span>
                  </td>
                  <td className="athlete-name" style={{ color: r.noc === "LUX" ? "var(--site-red)" : undefined, fontWeight: r.noc === "LUX" ? 700 : undefined, whiteSpace: "normal" }}>
                    {r.fullName}
                  </td>
                  <td>
                    <span title={r.noc} style={{ fontSize: "1.1rem", marginRight: 4 }}>{nocToFlag(r.noc)}</span>
                    <span className="noc-badge">{r.noc}</span>
                  </td>
                  <td className="mark" style={{ color: "var(--site-red)", fontWeight: 700 }}>{formatMark(r.mark)}</td>
                  <td style={{ color: "var(--site-text-muted)", fontSize: "0.82rem" }}>{r.year}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}

/* ── Winners history panel ───────────────────────────────── */
function WinnersPanel({ winners, loading }) {
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [luxOnly, setLuxOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState([]);

  const disciplines = useMemo(() => {
    const set = new Set(winners.map((w) => normDiscipline(w.discipline)));
    return ["all", ...Array.from(set).sort((a, b) => discKey(a).localeCompare(discKey(b)))];
  }, [winners]);

  const filtered = useMemo(() => {
    const seen = new Set();
    return winners
      .filter((w) => disciplineFilter === "all" || normDiscipline(w.discipline) === disciplineFilter)
      .filter((w) => genderFilter === "all" || w.gender === genderFilter)
      .filter((w) => !luxOnly || w.noc === "LUX")
      .filter((w) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const full = `${w.lastName || ""} ${w.firstName || ""}`.toLowerCase();
        return (
          full.includes(q)
          || (w.noc || "").toLowerCase().includes(q)
          || normDiscipline(w.discipline).toLowerCase().includes(q)
          || String(w.year || "").includes(q)
          || String(w.result || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        Number(b.year || 0) - Number(a.year || 0)
        || discKey(a.discipline).localeCompare(discKey(b.discipline))
        || (({ W: 0, M: 1, X: 2 }[a.gender] ?? 9) - ({ W: 0, M: 1, X: 2 }[b.gender] ?? 9))
        || String(a.lastName || "").localeCompare(String(b.lastName || ""))
        || String(a.firstName || "").localeCompare(String(b.firstName || "")),
      )
      .filter((w) => {
        const key = `${w.year}_${normDiscipline(w.discipline)}_${w.gender}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [winners, disciplineFilter, genderFilter, luxOnly, search]);

  const groupedByDiscipline = useMemo(() => {
    const map = new Map();
    filtered.forEach((winner) => {
      const discipline = normDiscipline(winner.discipline);
      const key = `${discipline}__${winner.gender || "X"}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          discipline,
          gender: winner.gender || "X",
          rows: [],
        });
      }
      map.get(key).rows.push(winner);
    });
    return [...map.values()]
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort(
          (a, b) =>
            Number(b.year || 0) - Number(a.year || 0)
            || String(a.lastName || "").localeCompare(String(b.lastName || ""))
            || String(a.firstName || "").localeCompare(String(b.firstName || "")),
        ),
      }))
      .sort(
        (a, b) =>
          discKey(a.discipline).localeCompare(discKey(b.discipline))
          || (({ W: 0, M: 1, X: 2 }[a.gender] ?? 9) - ({ W: 0, M: 1, X: 2 }[b.gender] ?? 9)),
      );
  }, [filtered]);

  const uniqueAthletes = useMemo(
    () => new Set(filtered.map((winner) => `${winner.firstName || ""}|${winner.lastName || ""}`)).size,
    [filtered],
  );
  const visibleGroups = useMemo(() => groupedByDiscipline.length, [groupedByDiscipline]);

  function toggleGroup(groupKey) {
    setOpenGroups((current) => (
      current.includes(groupKey)
        ? current.filter((value) => value !== groupKey)
        : [...current, groupKey]
    ));
  }

  return (
    <div className="site-stats-panel site-stats-panel--full">
      <div className="site-stats-panel__head">
        <div className="site-stats-heading">
          <span className="site-stats-panel__title">Winners History</span>
          <p>Browse every official winner edition by edition, with filters for discipline, year and nation.</p>
        </div>
      </div>
      <div className="site-stats-toolbar">
        <div className="site-stats-toolbar__row">
          <input
            className="site-stats-search site-stats-search--wide"
            placeholder="Search athlete, nation, discipline, year or performance…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <button className="site-stats-clear" onClick={() => setSearch("")}>
              Clear search
            </button>
          ) : null}
        </div>
        <div className="site-stats-toolbar__row">
          <select
            className="site-stats-select"
            value={disciplineFilter}
            onChange={(e) => setDisciplineFilter(e.target.value)}
          >
            {disciplines.map((d) => (
              <option key={d} value={d}>{d === "all" ? "All disciplines" : d}</option>
            ))}
          </select>
          <div className="site-stats-segmented">
            {["all", "W", "M"].map((g) => (
              <button
                key={g}
                className={`site-stats-filter${genderFilter === g ? " site-stats-filter--active" : ""}`}
                onClick={() => setGenderFilter(g)}
              >
                {g === "all" ? "All categories" : genderLabel(g)}
              </button>
            ))}
          </div>
          <button
            className={`site-stats-filter${luxOnly ? " site-stats-filter--active" : ""}`}
            onClick={() => setLuxOnly((current) => !current)}
          >
            Luxembourg only
          </button>
        </div>
      </div>
      <div className="site-stats-summary" aria-label="Winners summary">
        <span className="site-stats-summary__item"><strong>{filtered.length}</strong> wins shown</span>
        <span className="site-stats-summary__item"><strong>{uniqueAthletes}</strong> unique athletes</span>
        <span className="site-stats-summary__item"><strong>{disciplineFilter === "all" ? disciplines.length - 1 : 1}</strong> disciplines</span>
        <span className="site-stats-summary__item"><strong>{visibleGroups}</strong> winner groups</span>
      </div>
      <div className="site-stats-panel__body">
        {loading ? (
          <div className="site-stats-winner-list">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="site-stats-winner-card" style={{ opacity: 0.45 }}>
                <div className="site-stats-winner-card__summary">
                  <div style={{ height: 18, width: 180, background: "rgba(0,0,0,0.06)", borderRadius: 999 }} />
                  <div style={{ height: 16, width: 300, background: "rgba(0,0,0,0.05)", borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        ) : groupedByDiscipline.length === 0 ? (
          <div className="site-empty-state">No winners match your filters</div>
        ) : (
          <div className="site-stats-winner-list">
            {groupedByDiscipline.map((group) => {
              const latestWinner = group.rows[0];
              const isOpen = openGroups.includes(group.key);
              return (
                <div key={group.key} className="site-stats-winner-card">
                  <div className="site-stats-winner-card__summary">
                    <div className="site-stats-winner-card__meta">
                      <div className="site-stats-winner-card__title-row">
                        <span className="site-stats-winner-card__discipline">{group.discipline}</span>
                        <span className={`site-badge ${group.gender === "W" ? "site-badge--red" : "site-badge--blue"}`}>
                          {winnerGroupLabel(group.gender)}
                        </span>
                      </div>
                    </div>
                    <div className="site-stats-winner-card__winner">
                      <span className="site-stats-latest-pill">Latest winner</span>
                      <div className="site-stats-winner-card__latest-row">
                        <span className="site-stats-winner-card__year">{latestWinner.year}</span>
                        <span className={`site-stats-winner-card__athlete${latestWinner.noc === "LUX" ? " is-lux" : ""}`}>
                          {latestWinner.firstName} {latestWinner.lastName}
                        </span>
                        <span className="site-stats-winner-card__nation">
                          <span title={latestWinner.noc} style={{ fontSize: "1.05rem" }}>{nocToFlag(latestWinner.noc)}</span>
                          <span className="noc-badge">{latestWinner.noc}</span>
                        </span>
                        <span className="site-stats-winner-card__mark">{formatMark(latestWinner.result)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="site-stats-year-toggle"
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={isOpen}
                    >
                      <span className="site-stats-year-toggle__left">
                        <span className={`site-stats-year-chevron${isOpen ? " is-open" : ""}`}>⌄</span>
                        <span className="site-stats-year-label">{isOpen ? "Hide history" : "Voir plus"}</span>
                      </span>
                      <span className="site-stats-year-toggle__right">
                        {group.rows.length} win{group.rows.length > 1 ? "s" : ""}
                      </span>
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="site-stats-winner-card__history">
                      <table className="site-data-table">
                        <thead>
                          <tr>
                            <th>Year</th>
                            <th>Athlete</th>
                            <th>Nation</th>
                            <th>Performance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((winner, index) => (
                            <tr key={winner.id || `${group.key}-${index}`} className={winner.noc === "LUX" ? "row--lux" : ""}>
                              <td style={{ color: "var(--site-text-muted)", fontWeight: 700 }}>{winner.year}</td>
                              <td className="athlete-name" style={{ whiteSpace: "normal", color: winner.noc === "LUX" ? "var(--site-red)" : undefined, fontWeight: winner.noc === "LUX" ? 700 : undefined }}>
                                {winner.firstName} {winner.lastName}
                              </td>
                              <td>
                                <span title={winner.noc} style={{ fontSize: "1.05rem", marginRight: 4 }}>{nocToFlag(winner.noc)}</span>
                                <span className="noc-badge">{winner.noc}</span>
                              </td>
                              <td className="mark">{formatMark(winner.result)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ padding: "16px 24px", borderTop: "1px solid var(--site-border)", color: "var(--site-text-muted)", fontSize: "0.82rem" }}>
        Showing {filtered.length} of {winners.length} results
      </div>
    </div>
  );
}

/* ── Edition results panel ──────────────────────────────── */
function EditionResultsPanel({ editions }) {
  const [selectedYear, setSelectedYear] = useState(() => {
    const latest = editions[0];
    return latest ? String(latest.year) : "";
  });
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState({});

  const { results, loading } = useMeetingResultsForYear(Number(selectedYear));

  const disciplines = useMemo(() => {
    const set = new Set(results.map((r) => normDiscipline(r.discipline)));
    return ["all", ...Array.from(set).sort((a, b) => discKey(a).localeCompare(discKey(b)))];
  }, [results]);

  const filtered = useMemo(() => {
    return results
      .filter((r) => disciplineFilter === "all" || normDiscipline(r.discipline) === disciplineFilter)
      .filter((r) => genderFilter === "all" || r.gender === genderFilter)
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const full = `${r.lastName || ""} ${r.firstName || ""}`.toLowerCase();
        return (
          full.includes(q)
          || (r.noc || "").toLowerCase().includes(q)
          || normDiscipline(r.discipline).toLowerCase().includes(q)
          || String(r.result || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        discKey(a.discipline).localeCompare(discKey(b.discipline))
        || genderSortValue(a.gender) - genderSortValue(b.gender)
        || sectionSortValue(a) - sectionSortValue(b)
        || sectionOrderValue(a.finalGroup || a.heat) - sectionOrderValue(b.finalGroup || b.heat)
        || resultRankSortValue(resultDisplayRank(a)) - resultRankSortValue(resultDisplayRank(b))
        || String(a.lastName || "").localeCompare(String(b.lastName || ""))
        || String(a.firstName || "").localeCompare(String(b.firstName || "")),
      );
  }, [results, disciplineFilter, genderFilter, search]);

  const groupedResults = useMemo(() => {
    const map = new Map();
    filtered.forEach((result) => {
      const discipline = normDiscipline(result.discipline);
      const gender = result.gender || "X";
      const groupKey = `${discipline}__${gender}`;
      if (!map.has(groupKey)) {
        map.set(groupKey, {
          key: groupKey,
          discipline,
          gender,
          sections: new Map(),
        });
      }
      const group = map.get(groupKey);
      const sectionKey = buildSectionKey(result);
      if (!group.sections.has(sectionKey)) {
        group.sections.set(sectionKey, {
          key: sectionKey,
          round: normalizeRoundLabel(result.round),
          heat: result.heat || "",
          finalGroup: result.finalGroup || "",
          rows: [],
        });
      }
      group.sections.get(sectionKey).rows.push(result);
    });
    return [...map.values()]
      .sort((a, b) =>
        discKey(a.discipline).localeCompare(discKey(b.discipline))
        || genderSortValue(a.gender) - genderSortValue(b.gender),
      )
      .map((group) => {
        const sections = [...group.sections.values()]
          .sort((a, b) =>
            sectionSortValue(a) - sectionSortValue(b)
            || sectionOrderValue(a.finalGroup || a.heat) - sectionOrderValue(b.finalGroup || b.heat),
          )
          .map((section) => ({
            ...section,
            rows: [...section.rows].sort((a, b) =>
              resultRankSortValue(resultDisplayRank(a)) - resultRankSortValue(resultDisplayRank(b))
              || String(a.lastName || "").localeCompare(String(b.lastName || ""))
              || String(a.firstName || "").localeCompare(String(b.firstName || "")),
            ),
          }));
        return {
          ...group,
          sections,
          totalRows: sections.reduce((total, section) => total + section.rows.length, 0),
        };
      });
  }, [filtered]);

  const selectedEdition = editions.find((e) => String(e.year) === selectedYear);

  useEffect(() => {
    setExpandedSections({});
  }, [selectedYear, disciplineFilter, genderFilter, search]);

  function toggleSection(sectionId) {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  return (
    <div className="site-stats-panel site-stats-panel--full">
      <div className="site-stats-panel__head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="site-stats-panel__title">Results by Edition</span>
          {selectedEdition && (
            <span style={{ fontSize: "0.78rem", color: "var(--site-text-muted)" }}>
              {selectedEdition.name} — {selectedEdition.venue}
              {selectedEdition.label ? ` · ${selectedEdition.label}` : ""}
            </span>
          )}
        </div>
        <select
          className="site-stats-select"
          value={selectedYear}
          onChange={(e) => { setSelectedYear(e.target.value); setDisciplineFilter("all"); }}
        >
          {editions.map((e) => {
            const editionLabel = formatEditionLabel(e);
            return (
              <option key={e.year} value={String(e.year)}>
                {editionLabel ? `${e.year} — ${editionLabel}` : `${e.year}`}
              </option>
            );
          })}
        </select>
      </div>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--site-border)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select
          className="site-stats-select"
          value={disciplineFilter}
          onChange={(e) => setDisciplineFilter(e.target.value)}
        >
          {disciplines.map((d) => (
            <option key={d} value={d}>{d === "all" ? "All disciplines" : d}</option>
          ))}
        </select>
        {["all", "M", "W"].map((g) => (
          <button
            key={g}
            className={`site-stats-filter${genderFilter === g ? " site-stats-filter--active" : ""}`}
            onClick={() => setGenderFilter(g)}
          >
            {g === "all" ? "All" : genderLabel(g)}
          </button>
        ))}
        <input
          className="site-stats-search"
          placeholder="Search athlete or nation…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="site-stats-panel__body">
        <table className="site-data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Discipline</th>
              <th>Gender</th>
              <th>Athlete</th>
              <th>Nation</th>
              <th>Performance</th>
              <th>Notes</th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              <LoadingRows cols={7} />
            </tbody>
          ) : filtered.length === 0 ? (
            <tbody>
              <tr><td colSpan={7} className="site-empty-state">
                {results.length === 0 ? "No results available for this edition" : "No results match your filters"}
              </td></tr>
            </tbody>
          ) : groupedResults.map((group) => (
            <tbody key={group.key}>
              <tr className="site-data-table__group-row">
                <td colSpan={7}>
                  <div className="site-data-table__group-meta">
                    <span>{group.discipline}</span>
                    <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span className={`site-badge ${group.gender === "W" ? "site-badge--red" : group.gender === "M" ? "site-badge--blue" : ""}`}>
                        {group.gender === "W" ? "Women" : group.gender === "M" ? "Men" : "Mixed"}
                      </span>
                      <span>
                        {group.totalRows} result
                        {group.totalRows > 1 ? "s" : ""}
                      </span>
                    </span>
                  </div>
                </td>
              </tr>
              {group.sections.map((section) => (
                <Fragment key={`${group.key}-${section.key}`}>
                  {(() => {
                    const sectionId = `${selectedYear}-${group.key}-${section.key}`;
                    const isHeatSection = isHeatRound(section.round);
                    const isExpanded = isHeatSection ? Boolean(expandedSections[sectionId]) : true;
                    return (
                      <>
                  <tr key={`${group.key}-${section.key}-header`} className="site-data-table__stage-row">
                    <td colSpan={7}>
                      <div className="site-data-table__stage-meta">
                        <span>{formatSectionLabel(section)}</span>
                        <span className="site-data-table__stage-actions">
                          <span>{section.rows.length} result{section.rows.length > 1 ? "s" : ""}</span>
                          {isHeatSection ? (
                            <button
                              type="button"
                              className="site-stats-inline-toggle"
                              onClick={() => toggleSection(sectionId)}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? "Hide heat" : "Show heat"}
                            </button>
                          ) : null}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {isExpanded ? section.rows.map((r, i) => {
                    const displayRank = resultDisplayRank(r);
                    const showMedal = !isHeatRound(r.round) && Number(displayRank) >= 1 && Number(displayRank) <= 3;
                    return (
                      <tr key={r.id || `${group.key}-${section.key}-${i}`} className={!isHeatRound(r.round) && Number(displayRank) === 1 ? "rank-1" : ""}>
                        <td style={{ fontWeight: showMedal ? 800 : 500, color: showMedal ? "var(--site-gold)" : "var(--site-text-muted)" }}>
                          {showMedal
                            ? Number(displayRank) === 1
                              ? "🥇"
                              : Number(displayRank) === 2
                                ? "🥈"
                                : "🥉"
                            : displayRank || "—"}
                        </td>
                        <td style={{ fontWeight: 600 }}>{normDiscipline(r.discipline)}</td>
                        <td>
                          <span className={`site-badge ${r.gender === "W" ? "site-badge--red" : r.gender === "M" ? "site-badge--blue" : ""}`}>
                            {r.gender === "W" ? "W" : r.gender === "M" ? "M" : "X"}
                          </span>
                        </td>
                        <td className="athlete-name" style={{ color: r.noc === "LUX" ? "var(--site-red)" : undefined, fontWeight: r.noc === "LUX" ? 700 : undefined, whiteSpace: "normal" }}>
                          {r.firstName} {r.lastName}
                        </td>
                        <td>
                          <span title={r.noc} style={{ fontSize: "1.1rem", marginRight: 4 }}>{nocToFlag(r.noc)}</span>
                          <span className="noc-badge">{r.noc}</span>
                        </td>
                        <td className="mark">{formatMark(r.result)}</td>
                        <td style={{ color: "var(--site-text-dim)", fontSize: "0.78rem", whiteSpace: "normal" }}>
                          {[r.qualification, r.notes].filter(Boolean).join(" · ")}
                        </td>
                      </tr>
                    );
                  }) : null}
                      </>
                    );
                  })()}
                </Fragment>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}

/* ── Luxembourg performances panel ─────────────────────── */
function LuxPanel({ winners, records, loading }) {
  const luxWinners = useMemo(() => {
    const seen = new Set();
    return winners
      .filter((w) => w.noc === "LUX")
      .sort((a, b) => b.year - a.year || discKey(a.discipline).localeCompare(discKey(b.discipline)))
      .filter((w) => {
        const key = `${w.year}_${normDiscipline(w.discipline)}_${w.gender}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [winners]);

  const luxRecords = useMemo(() =>
    records.filter((r) => r.noc === "LUX"),
    [records],
  );

  return (
    <div className="site-stats-panel">
      <div className="site-stats-panel__head">
        <span className="site-stats-panel__title">🇱🇺 Luxembourg Performances</span>
      </div>
      <div className="site-stats-panel__body">
        {loading ? (
          <table className="site-data-table"><tbody><LoadingRows cols={4} /></tbody></table>
        ) : luxWinners.length === 0 ? (
          <div className="site-empty-state">No Luxembourg winners in the database</div>
        ) : (
          <table className="site-data-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Discipline</th>
                <th>Gender</th>
                <th>Athlete</th>
                <th>Performance</th>
              </tr>
            </thead>
            <tbody>
              {luxWinners.map((w, i) => (
                <tr key={w.id || i}>
                  <td style={{ color: "var(--site-text-muted)", fontWeight: 600 }}>{w.year}</td>
                  <td style={{ fontWeight: 600 }}>{normDiscipline(w.discipline)}</td>
                  <td>
                    <span className={`site-badge ${w.gender === "W" ? "site-badge--red" : "site-badge--blue"}`}>
                      {w.gender === "W" ? "W" : "M"}
                    </span>
                  </td>
                  <td className="athlete-name" style={{ color: "var(--site-red)", fontWeight: 700 }}>{w.firstName} {w.lastName}</td>
                  <td className="mark">{formatMark(w.result)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {luxRecords.length > 0 && (
          <>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--site-border)", borderBottom: "1px solid var(--site-border)" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--site-text-muted)" }}>
                Meeting Records held by Luxembourg athletes
              </span>
            </div>
            <table className="site-data-table">
              <thead>
                <tr>
                  <th>Discipline</th>
                  <th>Athlete</th>
                  <th>Mark</th>
                  <th>Year</th>
                </tr>
              </thead>
              <tbody>
                {luxRecords.map((r, i) => (
                  <tr key={r.id || i}>
                    <td style={{ fontWeight: 600 }}>{normDiscipline(r.discipline)}</td>
                    <td className="athlete-name" style={{ color: "var(--site-red)", fontWeight: 700 }}>{r.fullName}</td>
                    <td className="mark" style={{ color: "var(--site-red)", fontWeight: 700 }}>{r.mark}</td>
                    <td style={{ color: "var(--site-text-muted)", fontSize: "0.82rem" }}>{r.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Editions overview panel ─────────────────────────────── */
function EditionsPanel({ editions, winners, loading }) {
  const winnersByYear = useMemo(() => {
    const map = {};
    for (const w of winners) {
      if (!map[w.year]) map[w.year] = 0;
      map[w.year]++;
    }
    return map;
  }, [winners]);

  return (
    <div className="site-stats-panel">
      <div className="site-stats-panel__head">
        <span className="site-stats-panel__title">All Editions</span>
      </div>
      <div className="site-stats-panel__body">
        <table className="site-data-table">
          <thead>
            <tr>
              <th>Edition</th>
              <th>Year</th>
              <th>Name</th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingRows cols={4} /> : editions.map((e, i) => (
              <tr key={e.year || i}>
                <td style={{ color: "var(--site-text-muted)", fontWeight: 600 }}>
                  {getEditionDisplayNumber(e) ? `#${getEditionDisplayNumber(e)}` : "—"}
                </td>
                <td style={{ fontWeight: 700 }}>{e.year}</td>
                <td>{e.name}</td>
                <td>
                  {e.label ? (
                    <span className="site-badge site-badge--gold">{e.label}</span>
                  ) : (
                    <span style={{ color: "var(--site-text-dim)", fontSize: "0.82rem" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main statistics page ────────────────────────────────── */
export function SiteStatistics() {
  const [activeTab, setActiveTab] = useState("records");

  const { records, loading: recordsLoading } = useMeetingRecords();
  const { winners, loading: winnersLoading } = useAllWinners();
  const { editions: allEditions, loading: editionsLoading } = useMeetingEditions();
  const editions = allEditions.filter((e) => e.visibleInStats !== false);

  const tabs = [
    { id: "records", label: "Meeting Records" },
    { id: "winners", label: "Winners History" },
    { id: "results", label: "Results by Edition" },
    { id: "luxembourg", label: "🇱🇺 Luxembourg" },
    { id: "editions", label: "All Editions" },
  ];

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="site-stats-hero">
        <div className="site-container">
          <span className="site-eyebrow">Data & Performance</span>
          <h1 className="site-heading">Results &amp; Statistics</h1>
          <p className="site-lead">
            Explore the complete historical database of the CMCM Luxembourg Indoor Meeting — results, records, winners and key statistics across all editions since 2003.
          </p>

          {/* Stats summary */}
          {!editionsLoading && (
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginTop: 32 }}>
              {[
                ["Editions", editions.length],
                ["Meeting records", records.length],
                ["Winners tracked", winners.length],
                ["Years of history", editions.length > 0 ? `${editions[editions.length - 1]?.year}–${editions[0]?.year}` : "—"],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--site-text)", lineHeight: 1 }}>
                    {val}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--site-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Live Results iframe ──────────────────────────── */}
      <section className="site-section site-section--alt" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div className="site-container">
          <div style={{ marginBottom: 32 }}>
            <span className="site-eyebrow" style={{ color: "var(--site-red)" }}>● Live</span>
            <h2 className="site-heading site-heading--sm" style={{ marginBottom: 8 }}>Live Results &amp; Live Streaming</h2>
            <p style={{ color: "var(--site-text-muted)", fontSize: "0.9rem" }}>
              Results updated live throughout competition day.
            </p>
          </div>
          <div style={{
            borderRadius: "var(--site-radius-lg)",
            overflow: "hidden",
            border: "1px solid var(--site-border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
            background: "#fff",
          }}>
            <iframe
              src="https://fla.laportal.net/Competitions/Details/18079"
              title="CMCM Luxembourg Indoor Meeting 2026 — Live Results"
              width="100%"
              height="700"
              style={{ display: "block", border: "none" }}
              loading="lazy"
            />
          </div>
          <div style={{ marginTop: 16, textAlign: "right" }}>
            <a
              href="https://fla.laportal.net/Competitions/Details/18079"
              target="_blank"
              rel="noopener noreferrer"
              className="site-btn site-btn--secondary site-btn--sm"
            >
              Open full results page →
            </a>
          </div>
        </div>
      </section>

      {/* ── Tab navigation ───────────────────────────────── */}
      <div style={{ borderBottom: "1px solid var(--site-border)", background: "var(--site-surface)", position: "sticky", top: "var(--site-nav-h)", zIndex: 10 }}>
        <div className="site-container">
          <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "16px 20px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: activeTab === tab.id ? "var(--site-text)" : "var(--site-text-muted)",
                  borderBottom: activeTab === tab.id ? "2px solid var(--site-red)" : "2px solid transparent",
                  whiteSpace: "nowrap",
                  transition: "color 0.2s, border-color 0.2s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <section className="site-section">
        <div className="site-container">
          <div className="site-stats-grid">
            {activeTab === "records" && (
              <RecordsPanel records={records} loading={recordsLoading} />
            )}
            {activeTab === "winners" && (
              <WinnersPanel winners={winners} loading={winnersLoading} />
            )}
            {activeTab === "results" && (
              <EditionResultsPanel editions={editions} />
            )}
            {activeTab === "luxembourg" && (
              <>
                <LuxPanel winners={winners} records={records} loading={winnersLoading || recordsLoading} />
                <div className="site-stats-panel">
                  <div className="site-stats-panel__head">
                    <span className="site-stats-panel__title">Luxembourg at a glance</span>
                  </div>
                  <div style={{ padding: "24px" }}>
                    <p style={{ color: "var(--site-text-muted)", fontSize: "0.875rem", lineHeight: 1.7, marginBottom: 20 }}>
                      The CMCM Luxembourg Indoor Meeting showcases the best of Luxembourg athletics alongside international elite competition. From early editions when Christian Kemp won the 60m, to recent performances, Luxembourg athletes have consistently competed at the highest level.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {[
                        ["Luxembourg winners (all time)", winners.filter(w => w.noc === "LUX").length],
                        ["Records held by LUX athletes", records.filter(r => r.noc === "LUX").length],
                      ].map(([label, val]) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--site-border)" }}>
                          <span style={{ fontSize: "0.875rem", color: "var(--site-text-muted)" }}>{label}</span>
                          <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--site-text)" }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {activeTab === "editions" && (
              <EditionsPanel editions={editions} winners={winners} loading={editionsLoading} />
            )}
          </div>
        </div>
      </section>
    </>
  );
}
