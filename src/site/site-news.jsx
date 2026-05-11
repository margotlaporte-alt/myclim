import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useNewsArticle, usePublishedNews } from "./site-hooks";

const CATEGORIES = ["all", "news", "event", "athletes", "results", "press"];

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function categoryColor(cat) {
  const map = {
    news: "site-badge--blue",
    press: "site-badge--gray",
    event: "site-badge--red",
    athletes: "site-badge--gold",
    results: "site-badge--gold",
  };
  return map[cat] || "site-badge--gray";
}

/* ── News card (compact) ─────────────────────────────────── */
function NewsCardSmall({ article }) {
  return (
    <NavLink to={`/news/${article.slug}`} style={{ textDecoration: "none" }}>
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "16px 0",
          borderBottom: "1px solid var(--site-border)",
          cursor: "pointer",
          transition: "opacity 0.2s",
        }}
      >
        <div style={{
          width: 72,
          height: 72,
          flexShrink: 0,
          borderRadius: "var(--site-radius-sm)",
          overflow: "hidden",
          background: "var(--site-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
        }}>
          {article.coverImageUrl ? (
            <img
              src={article.coverImageUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : "📰"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className={`site-badge ${categoryColor(article.category)}`}>
              {article.category || "news"}
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--site-text-dim)" }}>
              {formatDate(article.publishedAt)}
            </span>
          </div>
          <p style={{
            fontSize: "0.875rem",
            fontWeight: 700,
            color: "var(--site-text)",
            lineHeight: 1.4,
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {article.title}
          </p>
        </div>
      </div>
    </NavLink>
  );
}

/* ═══════════════════════════════════════════════════════════
   NEWS LIST PAGE
═══════════════════════════════════════════════════════════ */
export function SiteNewsListPage() {
  const { news, loading } = usePublishedNews();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = news
    .filter((a) => categoryFilter === "all" || a.category === categoryFilter)
    .filter((a) => !search || a.title?.toLowerCase().includes(search.toLowerCase()) ||
      a.excerpt?.toLowerCase().includes(search.toLowerCase()));

  const featured = filtered[0] || null;
  const rest = filtered.slice(1);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="site-news-hero">
        <div className="site-container">
          <span className="site-eyebrow">Updates & announcements</span>
          <h1 className="site-heading">News</h1>
          <p className="site-lead">
            Stay up to date with the latest news, athlete announcements, results and event information from the CMCM Luxembourg Indoor Meeting.
          </p>
        </div>
      </section>

      {/* ── Filters ──────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid var(--site-border)", background: "var(--site-surface)" }}>
        <div className="site-container">
          <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "16px 0", flexWrap: "wrap" }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`site-stats-filter${categoryFilter === cat ? " site-stats-filter--active" : ""}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat === "all" ? "All categories" : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
            <input
              className="site-stats-search"
              placeholder="Search news…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginLeft: "auto" }}
            />
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <section className="site-section">
        <div className="site-container">
          {loading ? (
            <div style={{ textAlign: "center", color: "var(--site-text-muted)", padding: "64px 0" }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "var(--site-text-muted)" }}>
              <div style={{ fontSize: "2rem", marginBottom: 12 }}>🔍</div>
              <p>No articles found{categoryFilter !== "all" ? ` in category "${categoryFilter}"` : ""}.</p>
            </div>
          ) : (
            <div className="site-news-list-grid">
              {/* Featured large card */}
              <div>
                {featured && (
                  <NavLink to={`/news/${featured.slug}`} className="site-news-featured">
                    <div className="site-news-featured__image">
                      {featured.coverImageUrl ? (
                        <img src={featured.coverImageUrl} alt={featured.title} />
                      ) : (
                        <div className="site-news-featured__image-placeholder">📰</div>
                      )}
                    </div>
                    <div className="site-news-featured__body">
                      <div className="site-news-featured__meta">
                        <span className={`site-badge ${categoryColor(featured.category)}`}>
                          {featured.category || "news"}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--site-text-dim)" }}>
                          {formatDate(featured.publishedAt)}
                        </span>
                      </div>
                      <h2>{featured.title}</h2>
                      <p>{featured.excerpt}</p>
                      <span className="site-btn site-btn--primary site-btn--sm">
                        Read article →
                      </span>
                    </div>
                  </NavLink>
                )}

                {/* Grid of remaining articles */}
                {rest.length > 0 && (
                  <div className="site-news-grid" style={{ marginTop: 24 }}>
                    {rest.map((article) => (
                      <NavLink key={article.id} to={`/news/${article.slug}`} className="site-news-card">
                        <div className="site-news-card__image">
                          {article.coverImageUrl ? (
                            <img src={article.coverImageUrl} alt={article.title} />
                          ) : (
                            <div className="site-news-card__image-placeholder">📰</div>
                          )}
                        </div>
                        <div className="site-news-card__body">
                          <div className="site-news-card__meta">
                            <span className={`site-badge ${categoryColor(article.category)}`}>
                              {article.category || "news"}
                            </span>
                            <span className="site-news-card__date">
                              {formatDate(article.publishedAt)}
                            </span>
                          </div>
                          <h3>{article.title}</h3>
                          <p>{article.excerpt}</p>
                          <span className="site-news-card__link">Read more →</span>
                        </div>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <aside>
                <div style={{
                  background: "var(--site-card)",
                  border: "1px solid var(--site-border)",
                  borderRadius: "var(--site-radius)",
                  padding: 24,
                  position: "sticky",
                  top: "calc(var(--site-nav-h) + 24px)",
                }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: 16 }}>
                    Latest news
                  </h3>
                  {news.slice(0, 6).map((a) => (
                    <NewsCardSmall key={a.id} article={a} />
                  ))}
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   SINGLE ARTICLE PAGE
═══════════════════════════════════════════════════════════ */
export function SiteNewsArticlePage() {
  const { slug } = useParams();
  const { article, loading } = useNewsArticle(slug);
  const { news: relatedNews } = usePublishedNews(5);

  const related = relatedNews.filter((n) => n.slug !== slug).slice(0, 3);

  useEffect(() => {
    if (article?.seoTitle) {
      document.title = article.seoTitle;
    } else if (article?.title) {
      document.title = `${article.title} — CMCM Luxembourg Indoor Meeting`;
    }
    return () => {
      document.title = "CMCM Luxembourg Indoor Meeting";
    };
  }, [article]);

  if (loading) {
    return (
      <div style={{ paddingTop: "calc(var(--site-nav-h) + 64px)", textAlign: "center", color: "var(--site-text-muted)", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading…
      </div>
    );
  }

  if (!article) {
    return (
      <div style={{ paddingTop: "calc(var(--site-nav-h) + 64px)", textAlign: "center", padding: "calc(var(--site-nav-h) + 64px) 24px 64px", minHeight: "60vh" }}>
        <div style={{ fontSize: "2rem", marginBottom: 16 }}>📭</div>
        <h1 style={{ color: "var(--site-text)", marginBottom: 12 }}>Article not found</h1>
        <p style={{ color: "var(--site-text-muted)", marginBottom: 32 }}>
          This article may have been removed or the URL is incorrect.
        </p>
        <NavLink to="/news" className="site-btn site-btn--primary">
          Back to all news
        </NavLink>
      </div>
    );
  }

  return (
    <>
      {/* ── Article hero ─────────────────────────────────── */}
      <section className="site-article-hero">
        <div className="site-container">
          <NavLink
            to="/news"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--site-text-muted)", fontSize: "0.875rem", marginBottom: 24, textDecoration: "none" }}
          >
            ← Back to news
          </NavLink>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span className={`site-badge ${categoryColor(article.category)}`}>
              {article.category || "news"}
            </span>
            <span style={{ fontSize: "0.82rem", color: "var(--site-text-dim)" }}>
              {formatDate(article.publishedAt)}
            </span>
          </div>
          <h1 style={{ fontSize: "clamp(1.8rem, 5vw, 3.2rem)", fontWeight: 900, color: "var(--site-text)", lineHeight: 1.1, maxWidth: 820 }}>
            {article.title}
          </h1>
          {article.excerpt && (
            <p style={{ fontSize: "1.1rem", color: "var(--site-text-muted)", lineHeight: 1.65, maxWidth: 680, marginTop: 20 }}>
              {article.excerpt}
            </p>
          )}
        </div>
      </section>

      {/* ── Article body ─────────────────────────────────── */}
      <section className="site-section">
        <div className="site-container">
          {article.coverImageUrl && (
            <div className="site-article-image">
              <img src={article.coverImageUrl} alt={article.title} />
            </div>
          )}

          <div className="site-article-content">
            {/* Render content paragraphs */}
            {article.content ? (
              article.content.split("\n\n").filter(Boolean).map((para, i) => {
                if (para.startsWith("## ")) {
                  return <h2 key={i}>{para.slice(3)}</h2>;
                }
                if (para.startsWith("### ")) {
                  return <h3 key={i}>{para.slice(4)}</h3>;
                }
                return <p key={i}>{para}</p>;
              })
            ) : (
              <p style={{ color: "var(--site-text-muted)", fontStyle: "italic" }}>
                No content available for this article.
              </p>
            )}
          </div>

          {/* Share */}
          <div style={{
            maxWidth: 760,
            margin: "48px auto 0",
            paddingTop: 32,
            borderTop: "1px solid var(--site-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}>
            <NavLink to="/news" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--site-text-muted)", fontSize: "0.875rem", textDecoration: "none" }}>
              ← All news
            </NavLink>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: "0.82rem", color: "var(--site-text-dim)" }}>Share:</span>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(window.location.href)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="site-btn site-btn--secondary site-btn--sm"
              >
                Twitter / X
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="site-btn site-btn--secondary site-btn--sm"
              >
                Facebook
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Related articles ──────────────────────────────── */}
      {related.length > 0 && (
        <section className="site-section site-section--alt">
          <div className="site-container">
            <div style={{ marginBottom: 40 }}>
              <span className="site-eyebrow">More news</span>
              <h2 className="site-heading site-heading--sm">You might also like</h2>
            </div>
            <div className="site-news-grid">
              {related.map((a) => (
                <NavLink key={a.id} to={`/news/${a.slug}`} className="site-news-card">
                  <div className="site-news-card__image">
                    {a.coverImageUrl ? (
                      <img src={a.coverImageUrl} alt={a.title} />
                    ) : (
                      <div className="site-news-card__image-placeholder">📰</div>
                    )}
                  </div>
                  <div className="site-news-card__body">
                    <div className="site-news-card__meta">
                      <span className={`site-badge ${categoryColor(a.category)}`}>
                        {a.category || "news"}
                      </span>
                      <span className="site-news-card__date">{formatDate(a.publishedAt)}</span>
                    </div>
                    <h3>{a.title}</h3>
                    <p>{a.excerpt}</p>
                    <span className="site-news-card__link">Read more →</span>
                  </div>
                </NavLink>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
