import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  deleteNewsArticle,
  deletePressRelease,
  deleteSponsor,
  generateSlug,
  saveNewsArticle,
  savePressRelease,
  saveSponsor,
  useAllNews,
  useAllPressReleases,
  useSponsors,
} from "../site/site-hooks";

/* ── Shared helpers ──────────────────────────────────────── */
function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatusBadge({ status }) {
  const map = {
    published: { label: "Published", cls: "badge-status badge-status--green" },
    draft: { label: "Draft", cls: "badge-status badge-status--gray" },
  };
  const { label, cls } = map[status] || map.draft;
  return <span className={cls}>{label}</span>;
}

/* ── News admin ──────────────────────────────────────────── */
const NEWS_CATEGORIES = ["news", "event", "athletes", "results", "press"];
const NEWS_LANGUAGES = ["en", "fr", "de", "lu"];

function NewsForm({ initial, onSave, onCancel }) {
  const [data, setData] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    coverImageUrl: "",
    category: "news",
    language: "en",
    status: "draft",
    featured: false,
    seoTitle: "",
    seoDescription: "",
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(field, value) {
    setData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "title" && !initial?.slug) {
        next.slug = generateSlug(value);
      }
      return next;
    });
  }

  async function handleSave(status) {
    if (!data.title.trim()) { setError("Title is required."); return; }
    if (!data.slug.trim()) { setError("Slug is required."); return; }
    setSaving(true);
    setError("");
    try {
      const payload = { ...data, status };
      if (status === "published" && !initial?.publishedAt) {
        payload.publishedAt = new Date();
      }
      await onSave(payload);
    } catch (e) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = { fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#546770", display: "block", marginBottom: 6 };
  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", fontSize: "0.9rem", fontFamily: "inherit", background: "#fff", color: "#0f2d37" };
  const textareaStyle = { ...inputStyle, minHeight: 100, resize: "vertical", lineHeight: 1.6 };

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 16, padding: 32, maxWidth: 860 }}>
      <div style={{ display: "grid", gap: 20 }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input style={inputStyle} value={data.title} onChange={(e) => set("title", e.target.value)} placeholder="Article title" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Slug (URL)</label>
            <input style={inputStyle} value={data.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto-generated" />
          </div>
          <div>
            <label style={labelStyle}>Cover image URL</label>
            <input style={inputStyle} value={data.coverImageUrl} onChange={(e) => set("coverImageUrl", e.target.value)} placeholder="https://…" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Category</label>
            <select style={inputStyle} value={data.category} onChange={(e) => set("category", e.target.value)}>
              {NEWS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Language</label>
            <select style={inputStyle} value={data.language} onChange={(e) => set("language", e.target.value)}>
              {NEWS_LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={data.featured} onChange={(e) => set("featured", e.target.checked)} style={{ width: 18, height: 18 }} />
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0f2d37" }}>Featured on homepage</span>
            </label>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Excerpt / Summary</label>
          <textarea style={textareaStyle} value={data.excerpt} onChange={(e) => set("excerpt", e.target.value)} placeholder="Short description shown in news cards and lists…" rows={3} />
        </div>

        <div>
          <label style={labelStyle}>Content</label>
          <textarea
            style={{ ...textareaStyle, minHeight: 240 }}
            value={data.content}
            onChange={(e) => set("content", e.target.value)}
            placeholder="Full article content. Use double line breaks for paragraphs. ## for headings, ### for subheadings."
          />
          <p style={{ fontSize: "0.75rem", color: "#546770", marginTop: 6 }}>
            Use double line breaks (blank line) for new paragraphs. Start a line with ## for H2, ### for H3.
          </p>
        </div>

        <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 20 }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#546770", marginBottom: 16 }}>SEO (optional)</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>SEO Title</label>
              <input style={inputStyle} value={data.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} placeholder="Defaults to article title" />
            </div>
            <div>
              <label style={labelStyle}>SEO Description</label>
              <input style={inputStyle} value={data.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} placeholder="Meta description" />
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: "#fff0f0", border: "1px solid #f87171", borderRadius: 8, padding: "12px 16px", color: "#b91c1c", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => handleSave("published")}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? "Saving…" : "Publish"}
          </button>
          <button
            onClick={() => handleSave("draft")}
            disabled={saving}
            className="btn btn-secondary"
          >
            Save as draft
          </button>
          <button onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function WebsiteNewsPage({ Panel }) {
  const { news, loading } = useAllNews();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  async function handleSave(data) {
    await saveNewsArticle(editing?.id || null, data);
    setEditing(null);
    setCreating(false);
  }

  async function handleDelete(id, title) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await deleteNewsArticle(id);
  }

  if (creating || editing) {
    return (
      <Panel title={editing ? "Edit article" : "New article"}>
        <NewsForm
          initial={editing || {}}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setCreating(false); }}
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Website News"
      subtitle="Manage news articles published on the public site"
      actions={
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New article
        </button>
      }
    >
      {loading ? (
        <p style={{ color: "#546770", fontSize: "0.875rem" }}>Loading…</p>
      ) : news.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#546770" }}>
          <p>No articles yet. Create your first one!</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)} style={{ marginTop: 16 }}>
            + New article
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Language</th>
                <th>Status</th>
                <th>Featured</th>
                <th>Published</th>
                <th>Created</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {news.map((article) => (
                <tr key={article.id}>
                  <td style={{ fontWeight: 600 }}>
                    {article.title}
                    {article.slug && (
                      <div style={{ fontSize: "0.75rem", color: "#8da4b8", marginTop: 2 }}>
                        /news/{article.slug}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="badge-status badge-status--blue">{article.category || "—"}</span>
                  </td>
                  <td>{(article.language || "en").toUpperCase()}</td>
                  <td><StatusBadge status={article.status} /></td>
                  <td>{article.featured ? "⭐" : "—"}</td>
                  <td style={{ fontSize: "0.82rem" }}>{formatDate(article.publishedAt)}</td>
                  <td style={{ fontSize: "0.82rem" }}>{formatDate(article.createdAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setEditing(article)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(article.id, article.title)}
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── Sponsors admin ──────────────────────────────────────── */
const SPONSOR_CATEGORIES = ["title", "main", "institutional", "media", "supplier"];

function SponsorForm({ initial, onSave, onCancel }) {
  const [data, setData] = useState({
    name: "",
    logoUrl: "",
    website: "",
    category: "main",
    order: 10,
    active: true,
    description: "",
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (field, value) => setData((p) => ({ ...p, [field]: value }));

  async function handleSave() {
    if (!data.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(data);
    } catch (e) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = { fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#546770", display: "block", marginBottom: 6 };
  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", fontSize: "0.9rem", fontFamily: "inherit" };

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 16, padding: 32, maxWidth: 640 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input style={inputStyle} value={data.name} onChange={(e) => set("name", e.target.value)} placeholder="Partner name" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Category</label>
            <select style={inputStyle} value={data.category} onChange={(e) => set("category", e.target.value)}>
              {SPONSOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Display order</label>
            <input type="number" style={inputStyle} value={data.order} onChange={(e) => set("order", Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Logo URL</label>
          <input style={inputStyle} value={data.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://… (SVG or PNG recommended)" />
        </div>
        <div>
          <label style={labelStyle}>Website URL</label>
          <input style={inputStyle} value={data.website} onChange={(e) => set("website", e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <label style={labelStyle}>Short description (optional)</label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={data.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Short text shown on the partners page"
          />
        </div>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={data.active} onChange={(e) => set("active", e.target.checked)} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Active (visible on site)</span>
          </label>
        </div>
        {error && (
          <div style={{ background: "#fff0f0", border: "1px solid #f87171", borderRadius: 8, padding: "12px 16px", color: "#b91c1c", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save partner"}
          </button>
          <button onClick={onCancel} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function WebsiteSponsorsPage({ Panel }) {
  const { sponsors, loading } = useSponsors(false);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  async function handleSave(data) {
    await saveSponsor(editing?.id || null, data);
    setEditing(null);
    setCreating(false);
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Remove "${name}"?`)) return;
    await deleteSponsor(id);
  }

  if (creating || editing) {
    return (
      <Panel title={editing ? "Edit partner" : "Add partner"}>
        <SponsorForm
          initial={editing || {}}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setCreating(false); }}
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Partners & Sponsors"
      subtitle="Manage sponsors displayed on the public site"
      actions={
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Add partner
        </button>
      }
    >
      {loading ? (
        <p>Loading…</p>
      ) : sponsors.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#546770" }}>
          <p>No partners configured yet.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)} style={{ marginTop: 16 }}>
            + Add partner
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Order</th>
                <th>Active</th>
                <th>Logo</th>
                <th>Website</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sponsors
                .sort((a, b) => {
                  const order = ["title", "main", "institutional", "media", "supplier"];
                  const ai = order.indexOf(a.category ?? "");
                  const bi = order.indexOf(b.category ?? "");
                  if (ai !== bi) return ai - bi;
                  return (a.order ?? 99) - (b.order ?? 99);
                })
                .map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>
                      <span className="badge-status badge-status--blue">{s.category}</span>
                    </td>
                    <td>{s.order ?? "—"}</td>
                    <td>{s.active ? "✅" : "❌"}</td>
                    <td style={{ fontSize: "0.78rem", color: "#546770", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.logoUrl ? "✓ configured" : "—"}
                    </td>
                    <td style={{ fontSize: "0.78rem" }}>
                      {s.website ? (
                        <a href={s.website} target="_blank" rel="noopener noreferrer" style={{ color: "#1066cc" }}>
                          {new URL(s.website).hostname}
                        </a>
                      ) : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditing(s)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id, s.name)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── Press releases admin ─────────────────────────────────── */
const PRESS_CATEGORIES = ["Communiqué de presse", "Press release", "Déclaration", "Résultats"];
const PRESS_LANGUAGES = ["en", "fr", "de", "lu"];

function PressReleaseForm({ initial, onSave, onCancel }) {
  const [data, setData] = useState({
    title: "",
    date: new Date().toISOString().slice(0, 10),
    language: "fr",
    category: "Press release",
    fileUrl: "",
    year: new Date().getFullYear(),
    published: false,
    ...initial,
    date: initial?.date
      ? (initial.date.toDate ? initial.date.toDate() : new Date(initial.date)).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (field, value) => setData((p) => ({ ...p, [field]: value }));

  async function handleSave() {
    if (!data.title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ ...data, date: new Date(data.date), year: Number(data.year) });
    } catch (e) {
      setError(e.message || "Failed.");
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = { fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#546770", display: "block", marginBottom: 6 };
  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", fontSize: "0.9rem", fontFamily: "inherit" };

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 16, padding: 32, maxWidth: 640 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input style={inputStyle} value={data.title} onChange={(e) => set("title", e.target.value)} placeholder="Press release title" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" style={inputStyle} value={data.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Language</label>
            <select style={inputStyle} value={data.language} onChange={(e) => set("language", e.target.value)}>
              {PRESS_LANGUAGES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Year</label>
            <input type="number" style={inputStyle} value={data.year} onChange={(e) => set("year", e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle} value={data.category} onChange={(e) => set("category", e.target.value)}>
            {PRESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>PDF File URL</label>
          <input style={inputStyle} value={data.fileUrl} onChange={(e) => set("fileUrl", e.target.value)} placeholder="https://… (direct link to PDF)" />
        </div>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={data.published} onChange={(e) => set("published", e.target.checked)} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Published (visible on site)</span>
          </label>
        </div>
        {error && (
          <div style={{ background: "#fff0f0", border: "1px solid #f87171", borderRadius: 8, padding: "12px 16px", color: "#b91c1c", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save press release"}
          </button>
          <button onClick={onCancel} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function WebsitePressPage({ Panel }) {
  const { releases, loading } = useAllPressReleases();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  async function handleSave(data) {
    await savePressRelease(editing?.id || null, data);
    setEditing(null);
    setCreating(false);
  }

  async function handleDelete(id, title) {
    if (!window.confirm(`Delete "${title}"?`)) return;
    await deletePressRelease(id);
  }

  if (creating || editing) {
    return (
      <Panel title={editing ? "Edit press release" : "New press release"}>
        <PressReleaseForm
          initial={editing || {}}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setCreating(false); }}
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Press Releases"
      subtitle="Manage press releases displayed on the public press page"
      actions={
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New press release
        </button>
      }
    >
      {loading ? (
        <p>Loading…</p>
      ) : releases.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#546770" }}>
          <p>No press releases yet.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)} style={{ marginTop: 16 }}>
            + New press release
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Date</th>
                <th>Language</th>
                <th>Category</th>
                <th>Published</th>
                <th>PDF</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.title}</td>
                  <td style={{ fontSize: "0.82rem" }}>{formatDate(r.date)}</td>
                  <td>{(r.language || "").toUpperCase()}</td>
                  <td style={{ fontSize: "0.82rem" }}>{r.category}</td>
                  <td>{r.published ? "✅" : "❌"}</td>
                  <td>
                    {r.fileUrl ? (
                      <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1066cc", fontSize: "0.82rem" }}>
                        View PDF
                      </a>
                    ) : "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditing(r)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id, r.title)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── Website admin overview ──────────────────────────────── */
export function WebsiteDashboardPage({ Panel }) {
  const { news } = useAllNews();
  const { sponsors } = useSponsors(false);
  const { releases } = useAllPressReleases();

  const publishedNews = news.filter((n) => n.status === "published").length;
  const draftNews = news.filter((n) => n.status === "draft").length;
  const activeSponsors = sponsors.filter((s) => s.active).length;
  const publishedReleases = releases.filter((r) => r.published).length;

  const sections = [
    {
      to: "/app/website/news",
      icon: "📰",
      title: "News",
      desc: `${publishedNews} published, ${draftNews} draft`,
      cta: "Manage news",
    },
    {
      to: "/app/website/sponsors",
      icon: "🤝",
      title: "Partners & Sponsors",
      desc: `${activeSponsors} active sponsor${activeSponsors !== 1 ? "s" : ""}`,
      cta: "Manage partners",
    },
    {
      to: "/app/website/press",
      icon: "📄",
      title: "Press Releases",
      desc: `${publishedReleases} published`,
      cta: "Manage press",
    },
    {
      to: "/",
      icon: "🌐",
      title: "View public site",
      desc: "Open the public-facing website",
      cta: "Open site →",
      external: true,
    },
  ];

  return (
    <Panel title="Website Management" subtitle="Manage content published on the public CMCM event website">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20, marginTop: 8 }}>
        {sections.map((s) => (
          s.external ? (
            <a
              key={s.to}
              href={s.to}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              <div className="panel" style={{ cursor: "pointer", height: "100%", transition: "box-shadow 0.2s" }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>{s.icon}</div>
                <h3 style={{ fontSize: "1rem", marginBottom: 6 }}>{s.title}</h3>
                <p style={{ fontSize: "0.82rem", color: "#546770", marginBottom: 16 }}>{s.desc}</p>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1066cc" }}>{s.cta}</span>
              </div>
            </a>
          ) : (
            <NavLink key={s.to} to={s.to} style={{ textDecoration: "none" }}>
              <div className="panel" style={{ cursor: "pointer", height: "100%" }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>{s.icon}</div>
                <h3 style={{ fontSize: "1rem", marginBottom: 6 }}>{s.title}</h3>
                <p style={{ fontSize: "0.82rem", color: "#546770", marginBottom: 16 }}>{s.desc}</p>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1066cc" }}>{s.cta}</span>
              </div>
            </NavLink>
          )
        ))}
      </div>
    </Panel>
  );
}
