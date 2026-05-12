import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
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
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return records
      .filter((r) => genderFilter === "all" || r.gender === genderFilter)
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          r.discipline?.toLowerCase().includes(q) ||
          r.fullName?.toLowerCase().includes(q) ||
          r.noc?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const dc = String(a.discipline || "").localeCompare(String(b.discipline || ""));
        if (dc !== 0) return dc;
        return (a.gender || "").localeCompare(b.gender || "");
      });
  }, [records, genderFilter, search]);

  return (
    <div className="site-stats-panel site-stats-panel--full">
      <div className="site-stats-panel__head">
        <span className="site-stats-panel__title">Meeting Records</span>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
            placeholder="Search discipline or athlete…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
          <tbody>
            {loading ? <LoadingRows cols={6} /> : filtered.length === 0 ? (
              <tr><td colSpan={6} className="site-empty-state">No records found</td></tr>
            ) : filtered.map((r, i) => (
              <tr key={r.id || i}>
                <td>{r.discipline}</td>
                <td>
                  <span className={`site-badge ${r.gender === "W" ? "site-badge--red" : "site-badge--blue"}`}>
                    {genderLabel(r.gender)}
                  </span>
                </td>
                <td className="athlete-name">{r.fullName}</td>
                <td><span className="noc-badge">{r.noc}</span></td>
                <td className="mark">{formatMark(r.mark)}</td>
                <td style={{ color: "var(--site-text-muted)" }}>{r.year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Winners history panel ───────────────────────────────── */
function WinnersPanel({ winners, loading }) {
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [search, setSearch] = useState("");

  const disciplines = useMemo(() => {
    const set = new Set(winners.map((w) => w.discipline));
    return ["all", ...Array.from(set).sort()];
  }, [winners]);

  const years = useMemo(() => {
    const set = new Set(winners.map((w) => String(w.year)));
    return ["all", ...Array.from(set).sort((a, b) => Number(b) - Number(a))];
  }, [winners]);

  const filtered = useMemo(() => {
    return winners
      .filter((w) => disciplineFilter === "all" || w.discipline === disciplineFilter)
      .filter((w) => genderFilter === "all" || w.gender === genderFilter)
      .filter((w) => yearFilter === "all" || String(w.year) === yearFilter)
      .filter((w) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const full = `${w.lastName || ""} ${w.firstName || ""}`.toLowerCase();
        return full.includes(q) || (w.noc || "").toLowerCase().includes(q) || (w.discipline || "").toLowerCase().includes(q);
      });
  }, [winners, disciplineFilter, genderFilter, yearFilter, search]);

  return (
    <div className="site-stats-panel site-stats-panel--full">
      <div className="site-stats-panel__head">
        <span className="site-stats-panel__title">Winners History</span>
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
        <select
          className="site-stats-select"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y === "all" ? "All years" : y}</option>
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
              <th>Year</th>
              <th>Discipline</th>
              <th>Gender</th>
              <th>Athlete</th>
              <th>Nation</th>
              <th>Performance</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingRows cols={6} /> : filtered.length === 0 ? (
              <tr><td colSpan={6} className="site-empty-state">No results found</td></tr>
            ) : filtered.map((w, i) => (
              <tr key={w.id || i}>
                <td style={{ color: "var(--site-text-muted)", fontVariantNumeric: "tabular-nums" }}>{w.year}</td>
                <td>{w.discipline}</td>
                <td>
                  <span className={`site-badge ${w.gender === "W" ? "site-badge--red" : "site-badge--blue"}`}>
                    {genderLabel(w.gender)}
                  </span>
                </td>
                <td className="athlete-name">
                  {w.firstName} {w.lastName}
                </td>
                <td><span className="noc-badge">{w.noc}</span></td>
                <td className="mark">{formatMark(w.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

  const { results, loading } = useMeetingResultsForYear(Number(selectedYear));

  const disciplines = useMemo(() => {
    const set = new Set(results.map((r) => r.discipline));
    return ["all", ...Array.from(set).sort()];
  }, [results]);

  const filtered = useMemo(() => {
    return results
      .filter((r) => disciplineFilter === "all" || r.discipline === disciplineFilter)
      .filter((r) => genderFilter === "all" || r.gender === genderFilter)
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const full = `${r.lastName || ""} ${r.firstName || ""}`.toLowerCase();
        return full.includes(q) || (r.noc || "").toLowerCase().includes(q);
      });
  }, [results, disciplineFilter, genderFilter, search]);

  const selectedEdition = editions.find((e) => String(e.year) === selectedYear);

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
          {editions.map((e) => (
            <option key={e.year} value={String(e.year)}>{e.year} — Edition {e.edition}</option>
          ))}
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
          <tbody>
            {loading ? <LoadingRows cols={7} /> : filtered.length === 0 ? (
              <tr><td colSpan={7} className="site-empty-state">
                {results.length === 0 ? "No results available for this edition" : "No results match your filters"}
              </td></tr>
            ) : filtered.map((r, i) => (
              <tr key={r.id || i} className={r.rank === 1 ? "rank-1" : ""}>
                <td style={{ fontWeight: r.rank === 1 ? 800 : 400, color: r.rank === 1 ? "var(--site-gold)" : "var(--site-text-muted)" }}>
                  {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank || "—"}
                </td>
                <td>{r.discipline}</td>
                <td>
                  <span className={`site-badge ${r.gender === "W" ? "site-badge--red" : "site-badge--blue"}`}>
                    {genderLabel(r.gender)}
                  </span>
                </td>
                <td className="athlete-name">{r.firstName} {r.lastName}</td>
                <td><span className="noc-badge">{r.noc}</span></td>
                <td className="mark">{formatMark(r.result)}</td>
                <td style={{ color: "var(--site-text-dim)", fontSize: "0.78rem" }}>{r.notes || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Luxembourg performances panel ─────────────────────── */
function LuxPanel({ winners, records, loading }) {
  const luxWinners = useMemo(() =>
    winners.filter((w) => w.noc === "LUX").sort((a, b) => b.year - a.year),
    [winners],
  );

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
                <th>Athlete</th>
                <th>Performance</th>
              </tr>
            </thead>
            <tbody>
              {luxWinners.map((w, i) => (
                <tr key={w.id || i}>
                  <td style={{ color: "var(--site-text-muted)" }}>{w.year}</td>
                  <td>{w.discipline}</td>
                  <td className="athlete-name">{w.firstName} {w.lastName}</td>
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
                    <td>{r.discipline}</td>
                    <td className="athlete-name">{r.fullName}</td>
                    <td className="mark">{r.mark}</td>
                    <td style={{ color: "var(--site-text-muted)" }}>{r.year}</td>
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
                <td style={{ color: "var(--site-text-muted)", fontWeight: 600 }}>#{e.edition}</td>
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
            <h2 className="site-heading site-heading--sm" style={{ marginBottom: 8 }}>Results &amp; Live Ranking</h2>
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
