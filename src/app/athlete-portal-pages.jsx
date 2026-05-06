import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate, useOutletContext } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "../context/auth-context";
import { getActiveRoles } from "./navigation";
import {
  ALL_ATHLETE_FIELDS,
  ATHLETE_PORTAL_SETTINGS_PATH,
  ATHLETES_COLLECTION,
  DEFAULT_PORTAL_SETTINGS,
  canImportAthletes,
  getVisibleFields,
  useAthletePortalSettings,
  useAthletes,
} from "./athlete-portal-hooks";
import { db } from "../services/firebase";

const PLATFORM_ROLES = [
  { key: "admin", label: "Administrator" },
  { key: "meeting_director", label: "Meeting Director" },
  { key: "gestionnaire", label: "Manager (Gestionnaire)" },
  { key: "chef_equipe", label: "Team Leader (Chef d'équipe)" },
  { key: "benevole", label: "Volunteer (Bénévole)" },
  { key: "parent_u14", label: "U14 Parent" },
];

function AthletePortalOverview({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const { settings, loading: settingsLoading } = useAthletePortalSettings();
  const canImport = canImportAthletes(roles, settings);
  const { athletes, loading: athletesLoading } = useAthletes(!settingsLoading);

  const eventCounts = useMemo(() => {
    const counts = {};
    athletes.forEach((a) => {
      const event = String(a.event || "Unknown").trim();
      counts[event] = (counts[event] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [athletes]);

  const countryCounts = useMemo(() => {
    const counts = new Set();
    athletes.forEach((a) => {
      if (a.nationality || a.country) counts.add(a.nationality || a.country);
    });
    return counts.size;
  }, [athletes]);

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Overview</h1>
          <p>Manage and consult athlete information for this meeting.</p>
        </div>
      </section>

      <section className="panel-grid panel-grid--2">
        <Panel title="Athlete data" subtitle="Summary of the current athlete roster.">
          {athletesLoading ? (
            <p className="panel-note">Loading...</p>
          ) : (
            <ul className="compact-list">
              <li>{athletes.length} athlete(s) in the database</li>
              <li>{countryCounts} nation(s) represented</li>
              <li>{eventCounts.length} event(s) listed</li>
            </ul>
          )}
        </Panel>
        <Panel title="Quick access" subtitle="Jump to the main sections of the portal.">
          <div className="dashboard-action-grid">
            <NavLink className="button button--secondary button-link" to="/app/athlete-portal/athletes">
              View athletes
            </NavLink>
            {canImport ? (
              <NavLink className="button button--secondary button-link" to="/app/athlete-portal/import">
                Import from Excel
              </NavLink>
            ) : null}
          </div>
        </Panel>
      </section>

      {eventCounts.length > 0 ? (
        <section className="panel-grid panel-grid--1">
          <Panel title="Events" subtitle="Number of athletes per event.">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Athletes</th>
                  </tr>
                </thead>
                <tbody>
                  {eventCounts.map(([event, count]) => (
                    <tr key={event}>
                      <td>{event}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}

function AthletesListPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const { settings, loading: settingsLoading } = useAthletePortalSettings();
  const { athletes, loading: athletesLoading } = useAthletes(!settingsLoading);
  const visibleFields = useMemo(() => getVisibleFields(roles, settings), [roles, settings]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterEvent, setFilterEvent] = useState("");
  const [filterGender, setFilterGender] = useState("");

  const events = useMemo(() => {
    const set = new Set();
    athletes.forEach((a) => { if (a.event) set.add(String(a.event).trim()); });
    return [...set].sort();
  }, [athletes]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return athletes.filter((a) => {
      if (filterEvent && a.event !== filterEvent) return false;
      if (filterGender && a.gender !== filterGender) return false;
      if (q) {
        const haystack = [a.firstName, a.lastName, a.bib, a.nationality, a.country, a.team]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [athletes, searchQuery, filterEvent, filterGender]);

  if (settingsLoading || athletesLoading) {
    return (
      <div className="page">
        <section className="page-header"><div><h1>Athletes</h1></div></section>
        <p className="panel-note">Loading...</p>
      </div>
    );
  }

  if (visibleFields.length === 0) {
    return (
      <div className="page">
        <section className="page-header"><div><h1>Athletes</h1></div></section>
        <div className="notice-card notice-card--warn">
          <strong>Access restricted</strong>
          <p>You do not have permission to view athlete information. Contact an administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Athletes</h1>
          <p>{filtered.length} athlete(s) shown</p>
        </div>
      </section>

      <section className="panel-grid panel-grid--1">
        <Panel title="Search & filter" subtitle="">
          <div className="field-grid">
            <label className="field">
              <span>Search</span>
              <input
                placeholder="Name, bib, nationality..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Event</span>
              <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)}>
                <option value="">All events</option>
                {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Gender</span>
              <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
                <option value="">All</option>
                <option value="M">Men</option>
                <option value="W">Women</option>
              </select>
            </label>
          </div>
        </Panel>
      </section>

      {athletes.length === 0 ? (
        <div className="notice-card">
          <strong>No athletes yet</strong>
          <p>The athlete database is empty. A Meeting Director can import data from an Excel file.</p>
        </div>
      ) : (
        <section className="panel-grid panel-grid--1">
          <Panel title="Athlete list" subtitle={`${filtered.length} of ${athletes.length} athletes`}>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {visibleFields.map((f) => <th key={f.key}>{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((athlete) => (
                    <tr key={athlete.id}>
                      {visibleFields.map((f) => (
                        <td key={f.key}>{athlete[f.key] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      )}
    </div>
  );
}

function AthleteImportPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const { settings, loading: settingsLoading } = useAthletePortalSettings();
  const canImport = canImportAthletes(roles, settings);
  const { athletes } = useAthletes(true);

  const [preview, setPreview] = useState(null);
  const [columnMap, setColumnMap] = useState({});
  const [importMode, setImportMode] = useState("replace");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  if (settingsLoading) return <div className="page"><p className="panel-note">Loading...</p></div>;

  if (!canImport) {
    return (
      <div className="page">
        <section className="page-header"><div><h1>Import athletes</h1></div></section>
        <div className="notice-card notice-card--warn">
          <strong>Access restricted</strong>
          <p>Only Meeting Directors and Administrators can import athlete data.</p>
        </div>
      </div>
    );
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("Reading file...");
    setPreview(null);
    setColumnMap({});

    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0) {
        setStatus("The file appears to be empty.");
        return;
      }

      const headers = Object.keys(rows[0]);
      const autoMap = {};
      const fieldAliases = {
        bib: ["bib", "dossard", "number", "num", "#"],
        firstName: ["firstname", "first_name", "first name", "prenom", "prénom", "given"],
        lastName: ["lastname", "last_name", "last name", "nom", "family", "surname"],
        gender: ["gender", "sex", "sexe", "m/f", "m/w"],
        birthYear: ["birthyear", "birth_year", "birth year", "year", "yob", "dob", "année"],
        nationality: ["nationality", "nat", "nationalite", "nationalité"],
        country: ["country", "pays", "nation"],
        team: ["team", "club", "equipe", "équipe", "association"],
        event: ["event", "discipline", "épreuve", "epreuve"],
        round: ["round", "heat", "serie", "série", "round/heat"],
        lane: ["lane", "couloir", "voie"],
        mark: ["mark", "performance", "perf", "result", "résultat", "time", "distance"],
        wind: ["wind", "vent"],
        place: ["place", "rank", "classement", "pos", "position"],
      };

      headers.forEach((h) => {
        const normalized = h.toLowerCase().trim();
        for (const [fieldKey, aliases] of Object.entries(fieldAliases)) {
          if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
            if (!autoMap[fieldKey]) autoMap[fieldKey] = h;
          }
        }
      });

      setPreview({ headers, rows: rows.slice(0, 5), allRows: rows });
      setColumnMap(autoMap);
      setStatus(`File loaded: ${rows.length} row(s) detected.`);
    } catch (err) {
      setStatus(`Error reading file: ${err.message}`);
    }
  }

  async function handleImport() {
    if (!preview) return;
    setSaving(true);
    setStatus("Importing athletes...");

    try {
      const { allRows } = preview;
      const batch = writeBatch(db);

      if (importMode === "replace") {
        const existing = athletes;
        existing.forEach((a) => {
          batch.delete(doc(db, ATHLETES_COLLECTION, a.id));
        });
      }

      allRows.forEach((row, index) => {
        const athleteData = { importedAt: serverTimestamp() };
        ALL_ATHLETE_FIELDS.forEach(({ key }) => {
          if (columnMap[key]) {
            const raw = row[columnMap[key]];
            athleteData[key] = raw !== undefined && raw !== null ? String(raw).trim() : "";
          }
        });

        const id = `athlete_${Date.now()}_${index}`;
        batch.set(doc(db, ATHLETES_COLLECTION, id), athleteData);
      });

      await batch.commit();
      setStatus(`Successfully imported ${allRows.length} athlete(s).`);
      setPreview(null);
      setColumnMap({});
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setStatus(`Import failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearAll() {
    if (!window.confirm(`Delete all ${athletes.length} athletes from the database? This cannot be undone.`)) return;
    setSaving(true);
    setStatus("Deleting all athletes...");

    try {
      const batch = writeBatch(db);
      athletes.forEach((a) => batch.delete(doc(db, ATHLETES_COLLECTION, a.id)));
      await batch.commit();
      setStatus("All athletes deleted.");
    } catch (err) {
      setStatus(`Delete failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Import athletes</h1>
          <p>Upload an Excel file (.xlsx) to populate the athlete database.</p>
        </div>
      </section>

      <section className="panel-grid panel-grid--1">
        <Panel title="Upload file" subtitle="Select an .xlsx file exported from your timing or registration system.">
          <div className="field-grid">
            <label className="field">
              <span>Excel file (.xlsx)</span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                disabled={saving}
              />
            </label>
            <label className="field">
              <span>Import mode</span>
              <select value={importMode} onChange={(e) => setImportMode(e.target.value)} disabled={saving}>
                <option value="replace">Replace all existing athletes</option>
                <option value="append">Add to existing athletes</option>
              </select>
            </label>
          </div>
          {status ? <p className="panel-note">{status}</p> : null}
        </Panel>
      </section>

      {preview ? (
        <>
          <section className="panel-grid panel-grid--1">
            <Panel title="Column mapping" subtitle="Map the spreadsheet columns to athlete fields. Auto-detection has been applied.">
              <div className="field-grid">
                {ALL_ATHLETE_FIELDS.map((field) => (
                  <label key={field.key} className="field">
                    <span>{field.label}</span>
                    <select
                      value={columnMap[field.key] || ""}
                      onChange={(e) =>
                        setColumnMap((prev) => ({ ...prev, [field.key]: e.target.value || undefined }))
                      }
                    >
                      <option value="">— Not mapped —</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </Panel>
          </section>

          <section className="panel-grid panel-grid--1">
            <Panel title="Preview" subtitle="First 5 rows from the file after mapping.">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {ALL_ATHLETE_FIELDS.filter((f) => columnMap[f.key]).map((f) => (
                        <th key={f.key}>{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i}>
                        {ALL_ATHLETE_FIELDS.filter((f) => columnMap[f.key]).map((f) => (
                          <td key={f.key}>{row[columnMap[f.key]] ?? "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dashboard-action-grid" style={{ marginTop: "1rem" }}>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={handleImport}
                  disabled={saving || Object.keys(columnMap).length === 0}
                >
                  {saving ? "Importing..." : `Import ${preview.allRows.length} athletes`}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => { setPreview(null); setColumnMap({}); setStatus(""); }}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </Panel>
          </section>
        </>
      ) : null}

      {athletes.length > 0 ? (
        <section className="panel-grid panel-grid--1">
          <Panel title="Danger zone" subtitle={`There are currently ${athletes.length} athlete(s) in the database.`}>
            <button
              className="button button--ghost"
              type="button"
              onClick={handleClearAll}
              disabled={saving}
              style={{ color: "var(--color-danger, #c0392b)", borderColor: "var(--color-danger, #c0392b)" }}
            >
              Delete all athletes
            </button>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}

function AthletePortalSettingsPage({ Panel }) {
  const { userProfile } = useAuth();
  const roles = getActiveRoles(userProfile);
  const isAdmin = roles.includes("admin");
  const { settings, loading } = useAthletePortalSettings();

  const [accessRoles, setAccessRoles] = useState([]);
  const [importerRoles, setImporterRoles] = useState([]);
  const [fieldVisibility, setFieldVisibility] = useState({});
  const [saveStatus, setSaveStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setAccessRoles(settings.accessRoles || DEFAULT_PORTAL_SETTINGS.accessRoles);
    setImporterRoles(settings.importerRoles || DEFAULT_PORTAL_SETTINGS.importerRoles);
    setFieldVisibility(settings.fieldVisibility || DEFAULT_PORTAL_SETTINGS.fieldVisibility);
  }, [settings]);

  if (!isAdmin) {
    return (
      <div className="page">
        <section className="page-header"><div><h1>Portal settings</h1></div></section>
        <div className="notice-card notice-card--warn">
          <strong>Administrators only</strong>
          <p>Only administrators can manage Athlete Portal permissions.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="page"><p className="panel-note">Loading settings...</p></div>;

  function toggleRoleInList(list, setList, role) {
    setList((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function toggleFieldForRole(role, fieldKey) {
    setFieldVisibility((prev) => {
      const current = Array.isArray(prev[role]) ? prev[role] : [];
      const next = current.includes(fieldKey)
        ? current.filter((f) => f !== fieldKey)
        : [...current, fieldKey];
      return { ...prev, [role]: next };
    });
  }

  function grantAllFieldsToRole(role) {
    setFieldVisibility((prev) => ({
      ...prev,
      [role]: ALL_ATHLETE_FIELDS.map((f) => f.key),
    }));
  }

  function revokeAllFieldsFromRole(role) {
    setFieldVisibility((prev) => ({ ...prev, [role]: [] }));
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setSaveStatus("Saving...");

    try {
      await setDoc(
        doc(db, ...ATHLETE_PORTAL_SETTINGS_PATH),
        {
          accessRoles,
          importerRoles,
          fieldVisibility,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setSaveStatus("Settings saved.");
    } catch (err) {
      setSaveStatus(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Athlete Portal</p>
          <h1>Portal settings</h1>
          <p>Control who can access the portal and what information each role can see.</p>
        </div>
      </section>

      <form onSubmit={handleSave}>
        <section className="panel-grid panel-grid--2">
          <Panel title="Access control" subtitle="Choose which roles can enter the Athlete Portal.">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {PLATFORM_ROLES.map((role) => (
                <label key={role.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={accessRoles.includes(role.key)}
                    disabled={role.key === "admin"}
                    onChange={() => toggleRoleInList(accessRoles, setAccessRoles, role.key)}
                  />
                  <span>{role.label}</span>
                  {role.key === "admin" ? <span className="status-pill status-pill--accent">always</span> : null}
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Import rights" subtitle="Who can upload an Excel file to update the athlete database.">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {PLATFORM_ROLES.filter((r) => accessRoles.includes(r.key)).map((role) => (
                <label key={role.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={importerRoles.includes(role.key)}
                    onChange={() => toggleRoleInList(importerRoles, setImporterRoles, role.key)}
                  />
                  <span>{role.label}</span>
                </label>
              ))}
            </div>
            <p className="panel-note">Only roles with portal access are listed here.</p>
          </Panel>
        </section>

        <section className="panel-grid panel-grid--1">
          <Panel
            title="Field visibility per role"
            subtitle="Select which data fields each role can see in the athlete list."
          >
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    {PLATFORM_ROLES.filter((r) => accessRoles.includes(r.key)).map((role) => (
                      <th key={role.key}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                          <span>{role.label}</span>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              type="button"
                              className="button button--ghost button--small"
                              onClick={() => grantAllFieldsToRole(role.key)}
                              title="Grant all"
                            >
                              All
                            </button>
                            <button
                              type="button"
                              className="button button--ghost button--small"
                              onClick={() => revokeAllFieldsFromRole(role.key)}
                              title="Revoke all"
                            >
                              None
                            </button>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_ATHLETE_FIELDS.map((field) => (
                    <tr key={field.key}>
                      <td>{field.label}</td>
                      {PLATFORM_ROLES.filter((r) => accessRoles.includes(r.key)).map((role) => {
                        const visible = Array.isArray(fieldVisibility[role.key])
                          ? fieldVisibility[role.key].includes(field.key)
                          : false;
                        return (
                          <td key={role.key} style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={visible}
                              onChange={() => toggleFieldForRole(role.key, field.key)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <section className="panel-grid panel-grid--1">
          <Panel title="Save settings" subtitle="">
            <div className="dashboard-action-grid">
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save settings"}
              </button>
            </div>
            {saveStatus ? <p className="panel-note">{saveStatus}</p> : null}
          </Panel>
        </section>
      </form>
    </div>
  );
}

export { AthletePortalOverview, AthletesListPage, AthleteImportPage, AthletePortalSettingsPage };
