import { Fragment, useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../context/auth-context";
import { extractRolesFromProfile, getDisplayName } from "./utils";
import { useActiveEdition } from "./edition";
import {
  BUDGET_COLLECTION,
  BUDGET_HISTORY_COLLECTION,
  EXPENSE_SECTION_ORDER,
  REVENUE_SECTION_ORDER,
  applyCanonicalHistoricalBudget,
  buildAllBudgetSeeds,
  buildBudgetDiff,
  buildSimplifiedRows,
  createBudgetRow,
  enrichBudgetWithLinkedActuals,
  getBudgetDocumentLabel,
  getBudgetTotals,
  groupRowsBySection,
  isBudgetLockedEdition,
  mapHistoryEntry,
  mergeFallbackBudgetValues,
  normalizeBudgetDocument,
  normalizeEditionId,
  serializeBudgetDocument,
  sortBudgetDocuments,
  toBudgetNumber,
} from "./budget-tracking-data";

const currencyFormatter = new Intl.NumberFormat("fr-LU", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const historyFieldLabels = {
  section: "Section",
  label: "Libellé",
  details: "Détail",
  referenceForecast: "Prévisionnel année de référence",
  referenceActual: "Réalisé année de référence",
  currentForecast: "Prévisionnel année courante",
  currentActual: "Réalisé année courante",
  actualReference: "Facture / repère",
  comment: "Commentaire",
  created: "Création",
  deleted: "Suppression",
};

function formatCurrency(value) {
  if (value == null) return "—";
  return currencyFormatter.format(value);
}

function formatDateTime(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "En attente";
  return new Date(value).toLocaleString("fr-LU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHistoryValue(value) {
  if (typeof value === "number") return formatCurrency(value);
  if (value == null || value === "") return "vide";
  return String(value);
}

function computeVariance(forecastValue, actualValue) {
  const normalizedForecast = forecastValue == null ? null : Number(forecastValue);
  const normalizedActual = actualValue == null ? null : Number(actualValue);

  if (normalizedForecast == null && normalizedActual == null) return null;

  return Number(((normalizedActual ?? 0) - (normalizedForecast ?? 0)).toFixed(2));
}

function formatVariance(value) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${formatCurrency(value)}`;
}

function getBalanceToneClass(value) {
  if (value > 0) return "budget-balance budget-balance--positive";
  if (value < 0) return "budget-balance budget-balance--negative";
  return "budget-balance";
}

function getVarianceToneClass(value, side = "neutral") {
  if (value == null || value === 0) return "budget-variance";

  const positiveIsGood = side === "revenue" || side === "balance";
  if (value > 0) {
    return positiveIsGood ? "budget-variance budget-variance--positive" : "budget-variance budget-variance--negative";
  }

  return positiveIsGood ? "budget-variance budget-variance--negative" : "budget-variance budget-variance--positive";
}

function hasComparisonEdition(referenceEditionId) {
  return Boolean(String(referenceEditionId || "").trim());
}

function buildBudgetFromTemplate(templateBudget, nextEditionId) {
  const normalizedEditionId = normalizeEditionId(nextEditionId);
  const referenceEditionId = normalizeEditionId(
    templateBudget.currentEditionId || templateBudget.editionId,
    templateBudget.editionId,
  );

  function mapRowForNewBudget(row) {
    return {
      ...row,
      referenceForecast: row.currentForecast ?? row.referenceForecast,
      referenceActual: row.currentActual ?? row.currentForecast ?? row.referenceActual,
      currentForecast: row.currentForecast ?? row.referenceForecast,
      currentActual: null,
      actualReference: "",
      comment: "",
    };
  }

  return {
    ...structuredClone(templateBudget),
    editionId: normalizedEditionId,
    currentEditionId: normalizedEditionId,
    referenceEditionId,
    title: `Budget CMCM Luxembourg Indoor Meeting ${normalizedEditionId}`,
    createdAt: null,
    updatedAt: null,
    updatedByName: "",
    updatedByUid: "",
    expenses: templateBudget.expenses.map(mapRowForNewBudget),
    revenues: templateBudget.revenues.map(mapRowForNewBudget),
  };
}

function BudgetLineTable({
  side,
  collectionKey,
  sections,
  referenceEditionId,
  currentEditionId,
  hasComparison,
  isEditable,
  newSectionName,
  onValueChange,
  onAddRow,
  onDeleteRow,
  onNewSectionNameChange,
  onAddSection,
  totals,
}) {
  function renderNumberCell(row, fieldName) {
    if (!isEditable) {
      return <span className="budget-cell-value">{formatCurrency(row[fieldName])}</span>;
    }

    return (
      <input
        className="budget-cell-input"
        inputMode="decimal"
        type="number"
        step="0.01"
        value={row[fieldName] ?? ""}
        onChange={(event) => onValueChange(collectionKey, row.id, fieldName, event.target.value)}
      />
    );
  }

  function renderTextCell(row, fieldName, placeholder) {
    if (!isEditable) {
      return <span className="budget-cell-text">{row[fieldName] || "—"}</span>;
    }

    return (
      <input
        className="budget-text-input"
        type="text"
        value={row[fieldName]}
        onChange={(event) => onValueChange(collectionKey, row.id, fieldName, event.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="budget-table-stack">
      {isEditable ? (
        <div className="budget-table-toolbar">
          <div className="budget-table-toolbar__legend">
            {hasComparison ? <span className="budget-legend budget-legend--reference">Réalisé {referenceEditionId}</span> : null}
            <span className="budget-legend budget-legend--forecast">Prévisionnel {currentEditionId}</span>
            <span className="budget-legend budget-legend--actual">Réalisé {currentEditionId}</span>
          </div>
          <div className="budget-table-toolbar__actions">
            <input
              className="budget-text-input budget-table-toolbar__input"
              type="text"
              value={newSectionName}
              onChange={(event) => onNewSectionNameChange(collectionKey, event.target.value)}
              placeholder="Nouvelle section"
            />
            <button
              className="button button--secondary budget-add-row-button"
              type="button"
              onClick={() => onAddSection(collectionKey)}
            >
              Ajouter une section
            </button>
          </div>
        </div>
      ) : null}
      {sections.map(({ sectionName, rows }) => {
        const sectionReferenceActual = rows.reduce((sum, row) => sum + Number(row.referenceActual || 0), 0);
        const sectionCurrentForecast = rows.reduce((sum, row) => sum + Number(row.currentForecast || 0), 0);
        const sectionCurrentActual = rows.reduce((sum, row) => sum + Number(row.currentActual || 0), 0);
        const sectionVariance = computeVariance(sectionCurrentForecast, sectionCurrentActual);

        return (
        <section className="budget-section-card" key={sectionName}>
          <div className="budget-section-card__header">
            <div className="budget-section-card__heading">
              <h3>{sectionName}</h3>
              <p>{rows.length} poste(s) dans cette section.</p>
            </div>
            {isEditable ? (
              <button
                className="button button--secondary budget-add-row-button"
                type="button"
                onClick={() => onAddRow(collectionKey, sectionName)}
              >
                Ajouter une ligne
              </button>
            ) : null}
          </div>
          <div className="table-wrap table-wrap--compact">
            <div className={`budget-section-summary ${isEditable ? "budget-section-summary--editable" : ""}`}>
              <div className="budget-section-summary__spacer" />
              <div className="budget-section-summary__spacer" />
              {hasComparison ? (
                <span className="budget-metric-chip budget-metric-chip--reference">
                  <small>Réalisé {referenceEditionId}</small>
                  <strong>{formatCurrency(sectionReferenceActual)}</strong>
                </span>
              ) : null}
              <span className="budget-metric-chip budget-metric-chip--forecast">
                <small>Prévu {currentEditionId}</small>
                <strong>{formatCurrency(sectionCurrentForecast)}</strong>
              </span>
              <span className="budget-metric-chip budget-metric-chip--actual">
                <small>Réalisé {currentEditionId}</small>
                <strong>{formatCurrency(sectionCurrentActual)}</strong>
              </span>
              <span className={`${getVarianceToneClass(sectionVariance, side)} budget-metric-chip budget-metric-chip--variance`}>
                <small>Écart {currentEditionId}</small>
                <strong>{formatVariance(sectionVariance)}</strong>
              </span>
              <div className="budget-section-summary__spacer" />
              <div className="budget-section-summary__spacer" />
              {isEditable ? <div className="budget-section-summary__spacer" /> : null}
            </div>
            <table className="data-table data-table--admin data-table--compact budget-table budget-table--sheet">
              <colgroup>
                <col className="budget-col budget-col--label" />
                <col className="budget-col budget-col--details" />
                {hasComparison ? <col className="budget-col budget-col--comparison" /> : null}
                <col className="budget-col budget-col--amount" />
                <col className="budget-col budget-col--amount" />
                <col className="budget-col budget-col--variance" />
                <col className="budget-col budget-col--reference" />
                <col className="budget-col budget-col--comment" />
                {isEditable ? <col className="budget-col budget-col--actions" /> : null}
              </colgroup>
              <thead>
                <tr>
                  <th>Poste</th>
                  <th>Détail</th>
                  {hasComparison ? <th className="budget-table__col budget-table__col--reference">Réalisé {referenceEditionId}</th> : null}
                  <th className="budget-table__col budget-table__col--forecast">Prév. {currentEditionId}</th>
                  <th className="budget-table__col budget-table__col--actual">Réalisé {currentEditionId}</th>
                  <th>Écart {currentEditionId}</th>
                  <th>Facture / repère</th>
                  <th>Commentaire</th>
                  {isEditable ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className={row.isCustom ? "budget-table__row budget-table__row--custom" : "budget-table__row"} key={row.id}>
                    <td className="budget-table__label">
                      {isEditable ? (
                        <input
                          className="budget-text-input"
                          type="text"
                          value={row.label}
                          onChange={(event) => onValueChange(collectionKey, row.id, "label", event.target.value)}
                          placeholder="Libellé"
                        />
                      ) : (
                        <span className="budget-cell-text">{row.label}</span>
                      )}
                    </td>
                    <td className="budget-table__details">
                      {isEditable
                        ? renderTextCell(row, "details", "Détail")
                        : <span className="budget-cell-text">{row.details || "—"}</span>}
                    </td>
                    {hasComparison ? (
                      <td className="budget-table__cell budget-table__cell--reference"><span className="budget-cell-value">{formatCurrency(row.referenceActual)}</span></td>
                    ) : null}
                    <td className="budget-table__cell budget-table__cell--forecast">{renderNumberCell(row, "currentForecast")}</td>
                    <td className="budget-table__cell budget-table__cell--actual">{renderNumberCell(row, "currentActual")}</td>
                    <td className="budget-table__variance">
                      <span className={getVarianceToneClass(computeVariance(row.currentForecast, row.currentActual), side)}>
                        {formatVariance(computeVariance(row.currentForecast, row.currentActual))}
                      </span>
                    </td>
                    <td>{renderTextCell(row, "actualReference", "Facture / note")}</td>
                    <td>{renderTextCell(row, "comment", "Commentaire")}</td>
                    {isEditable ? (
                      <td className="budget-table__actions">
                        <button
                          className="budget-icon-button"
                          type="button"
                          onClick={() => onDeleteRow(collectionKey, row.id)}
                          aria-label={`Supprimer ${row.label}`}
                          title="Supprimer la ligne"
                        >
                          Suppr.
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
      })}
      <PanelTotals
        totals={totals}
        title={collectionKey === "expenses" ? "Total dépenses" : "Total recettes"}
        side={side}
        hasComparison={hasComparison}
      />
    </div>
  );
}

function BudgetOverviewTable({
  collectionKey,
  sections,
  currentEditionId,
  allowEditing,
  actualColumnLabel,
  onValueChange,
  totals,
}) {
  const amountColumns = [
    { key: "currentForecast", label: `Prév. ${currentEditionId}`, cellClassName: "budget-table__cell--forecast" },
    { key: "currentActual", label: actualColumnLabel, cellClassName: "budget-table__cell--actual" },
  ];

  function renderTextField(row, fieldName, placeholder) {
    if (!allowEditing) {
      return <span className="budget-cell-text">{row[fieldName] || "—"}</span>;
    }

    return (
      <input
        className="budget-text-input"
        type="text"
        value={row[fieldName]}
        onChange={(event) => onValueChange(collectionKey, row.id, fieldName, event.target.value)}
        placeholder={placeholder}
      />
    );
  }

  function renderAmountField(row, fieldName) {
    if (!allowEditing) {
      return <span className="budget-cell-value">{formatCurrency(row[fieldName])}</span>;
    }

    return (
      <input
        className="budget-cell-input"
        inputMode="decimal"
        type="number"
        step="0.01"
        value={row[fieldName] ?? ""}
        onChange={(event) => onValueChange(collectionKey, row.id, fieldName, event.target.value)}
      />
    );
  }

  return (
    <div className="table-wrap table-wrap--compact">
      <table className="data-table data-table--admin data-table--compact budget-table budget-table--sheet budget-overview-table">
        <colgroup>
          <col className="budget-col budget-col--label" />
          <col className="budget-col budget-col--details" />
          {amountColumns.map((column) => (
            <col className="budget-col budget-col--amount" key={column.key} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th>Poste</th>
            <th>Détail</th>
            {amountColumns.map((column) => (
              <th key={column.key} className={`budget-table__col ${column.cellClassName.replace("__cell", "__col")}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map(({ sectionName, rows }) => {
            const sectionCurrentForecast = rows.reduce((sum, row) => sum + Number(row.currentForecast || 0), 0);
            const sectionCurrentActual = rows.reduce((sum, row) => sum + Number(row.currentActual || 0), 0);

            return (
              <Fragment key={sectionName}>
                <tr className="budget-overview-table__section-row">
                  <th className="budget-overview-table__section-title" colSpan={2} scope="rowgroup">
                    <div className="budget-overview-table__section-heading">
                      <strong>{sectionName}</strong>
                      <span>{rows.length} ligne(s)</span>
                    </div>
                  </th>
                  <th className="budget-overview-table__section-total budget-table__cell--forecast">
                    {formatCurrency(sectionCurrentForecast)}
                  </th>
                  <th className="budget-overview-table__section-total budget-table__cell--actual">
                    {formatCurrency(sectionCurrentActual)}
                  </th>
                </tr>
                {rows.map((row) => (
                  <tr className={row.isCustom ? "budget-table__row budget-table__row--custom" : "budget-table__row"} key={row.id}>
                    <td className="budget-table__label">
                      {allowEditing ? (
                        <input
                          className="budget-text-input"
                          type="text"
                          value={row.label}
                          onChange={(event) => onValueChange(collectionKey, row.id, "label", event.target.value)}
                          placeholder="Libellé"
                        />
                      ) : (
                        <span className="budget-cell-text">{row.label}</span>
                      )}
                    </td>
                    <td className="budget-table__details">{renderTextField(row, "details", "Détail")}</td>
                    {amountColumns.map((column) => (
                      <td className={`budget-table__cell ${column.cellClassName}`} key={`${row.id}-${column.key}`}>
                        {renderAmountField(row, column.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="budget-overview-table__footer">
            <th colSpan={2}>Total</th>
            <th className="budget-table__cell--forecast">{formatCurrency(totals.currentForecast)}</th>
            <th className="budget-table__cell--actual">{formatCurrency(totals.currentActual)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PanelTotals({ title, totals, side, hasComparison }) {
  if (!totals) return null;

  return (
    <div className="budget-inline-summary">
      <strong>{title}</strong>
      {hasComparison ? <span>{formatCurrency(totals.referenceActual)} réalisé réf.</span> : null}
      <span>{formatCurrency(totals.currentForecast)} prév. courante</span>
      <span>{formatCurrency(totals.currentActual)} réalisé courant</span>
      <span className={getVarianceToneClass(computeVariance(totals.currentForecast, totals.currentActual), side)}>
        {formatVariance(computeVariance(totals.currentForecast, totals.currentActual))} courant
      </span>
    </div>
  );
}

function BudgetSeedLog({ lines = [] }) {
  if (!lines.length) return null;

  return (
    <div className="budget-seed-log" aria-live="polite">
      {lines.map((line, index) => (
        <div key={`${line}-${index}`}>{line}</div>
      ))}
    </div>
  );
}

function SimplifiedBudgetTable({
  Panel,
  title,
  subtitle,
  side,
  rows,
  selectedMap,
  detailSelections,
  displayMode,
  showDetails,
  onToggleRow,
  onToggleDetailRow,
  referenceEditionId,
  currentEditionId,
  hasComparison,
}) {
  const visibleRows = rows.filter((row) => selectedMap[row.id] ?? true);
  const showForecast = displayMode === "forecast" || displayMode === "both";
  const showActual = displayMode === "actual" || displayMode === "both";

  return (
    <Panel title={title} subtitle={subtitle}>
      <div className="budget-simplified-picker">
        <div className="budget-simplified-picker__header">
          <strong>Blocs affichés</strong>
          <span>{visibleRows.length} sur {rows.length}</span>
        </div>
        <div className="budget-simplified-picker__grid">
          {rows.map((row) => (
            <label className="budget-simplified-check" key={row.id}>
              <input
                type="checkbox"
                checked={selectedMap[row.id] ?? true}
                onChange={() => onToggleRow(row.id)}
              />
              <span>{row.label}</span>
            </label>
          ))}
        </div>
      </div>

      {showDetails ? (
        <div className="budget-simplified-detail-picker">
          <div className="budget-simplified-picker__header">
            <strong>Détail affiché</strong>
            <span>Le total du bloc reste inchangé.</span>
          </div>
          <div className="budget-simplified-detail-picker__stack">
            {visibleRows.map((row) => (
              <div className="budget-simplified-detail-group" key={`${row.id}-details`}>
                <strong>{row.label}</strong>
                <div className="budget-simplified-detail-picker__grid">
                  {row.items.map((item) => (
                    <label className="budget-simplified-check budget-simplified-check--detail" key={item.id}>
                      <input
                        type="checkbox"
                        checked={detailSelections[row.id]?.[item.id] ?? true}
                        onChange={() => onToggleDetailRow(row.id, item.id)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="table-wrap table-wrap--compact">
        <table className="data-table data-table--admin data-table--compact budget-table budget-table--sheet budget-table--summary">
          <thead>
            <tr>
              <th>Bloc</th>
              {hasComparison ? <th>Réalisé {referenceEditionId}</th> : null}
              {showForecast ? <th>Prév. {currentEditionId}</th> : null}
              {showActual ? <th>Réalisé {currentEditionId}</th> : null}
              {showForecast && showActual ? <th>Écart {currentEditionId}</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <Fragment key={row.id}>
                <tr key={row.id}>
                  <td>{row.label}</td>
                  {hasComparison ? <td>{formatCurrency(row.referenceActual)}</td> : null}
                  {showForecast ? <td>{formatCurrency(row.currentForecast)}</td> : null}
                  {showActual ? <td>{formatCurrency(row.currentActual)}</td> : null}
                  {showForecast && showActual ? (
                    <td className="budget-table__variance">
                      <span className={getVarianceToneClass(computeVariance(row.currentForecast, row.currentActual), side)}>
                        {formatVariance(computeVariance(row.currentForecast, row.currentActual))}
                      </span>
                    </td>
                  ) : null}
                </tr>
                {showDetails ? row.items
                  .filter((item) => detailSelections[row.id]?.[item.id] ?? true)
                  .map((item) => (
                  <tr className="budget-table__detail-row" key={`${row.id}-${item.id}`}>
                    <td>
                      <div className="budget-detail-label">
                        <span>{item.label}</span>
                        {item.details ? <small>{item.details}</small> : null}
                      </div>
                    </td>
                    {hasComparison ? <td>{formatCurrency(item.referenceActual)}</td> : null}
                    {showForecast ? <td>{formatCurrency(item.currentForecast)}</td> : null}
                    {showActual ? <td>{formatCurrency(item.currentActual)}</td> : null}
                    {showForecast && showActual ? (
                      <td className="budget-table__variance">
                        <span className={getVarianceToneClass(computeVariance(item.currentForecast, item.currentActual), side)}>
                          {formatVariance(computeVariance(item.currentForecast, item.currentActual))}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                )) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function BudgetTrackingPage({ Panel }) {
  const { currentUser, userProfile } = useAuth();
  const { activeEditionId } = useActiveEdition(true);
  const [storedBudgets, setStoredBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEditionId, setSelectedEditionId] = useState("");
  const [draftBudget, setDraftBudget] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditMode, setIsEditMode] = useState(false);
  const [newBudgetYear, setNewBudgetYear] = useState("");
  const [isCreatingBudget, setIsCreatingBudget] = useState(false);
  const [pendingNewBudgetId, setPendingNewBudgetId] = useState("");
  const [simplifiedDisplayMode, setSimplifiedDisplayMode] = useState("both");
  const [simplifiedShowDetails, setSimplifiedShowDetails] = useState(false);
  const [simplifiedSelections, setSimplifiedSelections] = useState({
    expenses: {},
    revenues: {},
  });
  const [simplifiedDetailSelections, setSimplifiedDetailSelections] = useState({
    expenses: {},
    revenues: {},
  });
  const [sectionDrafts, setSectionDrafts] = useState({
    expenses: "",
    revenues: "",
  });
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSeedingBudgets, setIsSeedingBudgets] = useState(false);
  const [budgetSeedLog, setBudgetSeedLog] = useState([]);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const fallbackBudgets = useMemo(() => buildAllBudgetSeeds(), []);
  const fallbackBudgetMap = useMemo(
    () => new Map(fallbackBudgets.map((budget) => [budget.editionId, budget])),
    [fallbackBudgets],
  );
  const missingSeedEditionIds = useMemo(
    () => fallbackBudgets
      .filter((fallbackBudget) => !storedBudgets.some((budget) => budget.editionId === fallbackBudget.editionId))
      .map((budget) => budget.editionId),
    [fallbackBudgets, storedBudgets],
  );
  const usesFallbackBudgets = missingSeedEditionIds.length > 0;

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, BUDGET_COLLECTION),
      (snapshot) => {
        const nextBudgets = sortBudgetDocuments(snapshot.docs.map((docSnapshot) => normalizeBudgetDocument({
          id: docSnapshot.id,
          editionId: docSnapshot.id,
          ...docSnapshot.data(),
        })));
        setStoredBudgets(nextBudgets);
        setLoading(false);
        setError("");
      },
      () => {
        setStoredBudgets([]);
        setLoading(false);
        setError("Impossible de charger les budgets.");
      },
    );

    return unsubscribe;
  }, []);

  const budgets = useMemo(() => {
    const sourceBudgets = usesFallbackBudgets
      ? sortBudgetDocuments([
          ...storedBudgets,
          ...fallbackBudgets.filter((fallbackBudget) => missingSeedEditionIds.includes(fallbackBudget.editionId)),
        ])
      : storedBudgets;

    const hydratedBudgets = sourceBudgets.map((budget) =>
      mergeFallbackBudgetValues(budget, fallbackBudgetMap.get(budget.editionId)),
    );

    const canonicalBudgets = hydratedBudgets.map((budget) =>
      applyCanonicalHistoricalBudget(budget, fallbackBudgetMap.get(budget.editionId)),
    );

    return canonicalBudgets.map((budget) => enrichBudgetWithLinkedActuals(budget, canonicalBudgets));
  }, [fallbackBudgetMap, fallbackBudgets, missingSeedEditionIds, storedBudgets, usesFallbackBudgets]);

  useEffect(() => {
    if (!budgets.length) return;
    if (selectedEditionId && budgets.some((budget) => budget.editionId === selectedEditionId)) return;

    const normalizedActiveEditionId = normalizeEditionId(activeEditionId, "");
    const preferredBudget =
      budgets.find((budget) => budget.editionId === normalizedActiveEditionId) ??
      budgets.find((budget) => budget.editionId === "2026") ??
      budgets[0];

    setSelectedEditionId(preferredBudget.editionId);
  }, [activeEditionId, budgets, selectedEditionId]);

  const selectedBudget = useMemo(
    () => budgets.find((budget) => budget.editionId === selectedEditionId) ?? null,
    [budgets, selectedEditionId],
  );
  const persistedBudget = useMemo(
    () => storedBudgets.find((budget) => budget.editionId === selectedEditionId) ?? null,
    [selectedEditionId, storedBudgets],
  );
  const latestBudget = useMemo(() => {
    const numericBudgets = budgets.filter((budget) => Number.isFinite(Number(getBudgetDocumentLabel(budget))));

    if (numericBudgets.length) {
      return [...numericBudgets].sort((left, right) => Number(getBudgetDocumentLabel(right)) - Number(getBudgetDocumentLabel(left)))[0];
    }

    return budgets[0] ?? null;
  }, [budgets]);
  const isBudgetLocked = Boolean(selectedBudget && isBudgetLockedEdition(selectedBudget.editionId));
  const isBudgetEditable = Boolean(selectedBudget && latestBudget && selectedBudget.editionId === latestBudget.editionId && !isBudgetLocked);
  const canEditBudget = isBudgetEditable && isEditMode;
  const canCreateNextBudget = Boolean(selectedBudget && latestBudget && selectedBudget.editionId === latestBudget.editionId);
  const primaryTabLabel = isBudgetLocked ? "Budget définitif" : (isBudgetEditable ? "Prévisionnel / actuel" : "Budget consulté");

  useEffect(() => {
    if (!selectedBudget) return;
    setDraftBudget(structuredClone(selectedBudget));
    setActiveTab("overview");
    if (selectedBudget.editionId === pendingNewBudgetId) {
      setIsEditMode(true);
      setSaveStatus(`Budget ${selectedBudget.currentEditionId} créé à partir de ${selectedBudget.referenceEditionId}.`);
      setPendingNewBudgetId("");
      return;
    }

    setIsEditMode(false);
    setSaveStatus("");
  }, [selectedBudget]);

  useEffect(() => {
    if (!latestBudget) return;
    const nextYear = Number(getBudgetDocumentLabel(latestBudget));
    if (!Number.isFinite(nextYear)) return;
    setNewBudgetYear(String(nextYear + 1));
  }, [latestBudget]);

  useEffect(() => {
    if (!selectedEditionId) return undefined;

    setHistoryLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, BUDGET_COLLECTION, selectedEditionId, BUDGET_HISTORY_COLLECTION),
      (snapshot) => {
        const entries = snapshot.docs.map(mapHistoryEntry).sort((left, right) => {
          return (right.createdAt?.getTime?.() || 0) - (left.createdAt?.getTime?.() || 0);
        });
        setHistoryEntries(entries);
        setHistoryLoading(false);
        setHistoryError("");
      },
      () => {
        setHistoryEntries([]);
        setHistoryLoading(false);
        setHistoryError("Impossible de charger l'historique du budget.");
      },
    );

    return unsubscribe;
  }, [selectedEditionId]);

  const actorName = useMemo(() => getDisplayName(userProfile, currentUser?.email), [currentUser?.email, userProfile]);
  const activeRoles = useMemo(() => extractRolesFromProfile(userProfile), [userProfile]);
  const canSyncBudgets = activeRoles.includes("admin");
  const budgetDiff = useMemo(
    () => (draftBudget && selectedBudget ? buildBudgetDiff(selectedBudget, draftBudget) : []),
    [draftBudget, selectedBudget],
  );
  const hasPersistedBudget = Boolean(persistedBudget);
  const hasUnsavedChanges = isBudgetEditable && (Boolean(budgetDiff.length) || !hasPersistedBudget);
  const totals = useMemo(() => (draftBudget ? getBudgetTotals(draftBudget) : null), [draftBudget]);
  const hasComparison = useMemo(
    () => hasComparisonEdition(draftBudget?.referenceEditionId),
    [draftBudget?.referenceEditionId],
  );
  const expenseSections = useMemo(
    () => (draftBudget ? groupRowsBySection(draftBudget.expenses, EXPENSE_SECTION_ORDER) : []),
    [draftBudget],
  );
  const revenueSections = useMemo(
    () => (draftBudget ? groupRowsBySection(draftBudget.revenues, REVENUE_SECTION_ORDER) : []),
    [draftBudget],
  );
  const simplifiedExpenseRows = useMemo(
    () => (draftBudget ? buildSimplifiedRows(draftBudget, "expense") : []),
    [draftBudget],
  );
  const simplifiedRevenueRows = useMemo(
    () => (draftBudget ? buildSimplifiedRows(draftBudget, "revenue") : []),
    [draftBudget],
  );

  useEffect(() => {
    setSimplifiedSelections((currentSelections) => ({
      expenses: Object.fromEntries(
        simplifiedExpenseRows.map((row) => [row.id, currentSelections.expenses[row.id] ?? true]),
      ),
      revenues: Object.fromEntries(
        simplifiedRevenueRows.map((row) => [row.id, currentSelections.revenues[row.id] ?? true]),
      ),
    }));
  }, [simplifiedExpenseRows, simplifiedRevenueRows]);

  useEffect(() => {
    setSimplifiedDetailSelections((currentSelections) => ({
      expenses: Object.fromEntries(
        simplifiedExpenseRows.map((row) => [
          row.id,
          Object.fromEntries(
            row.items.map((item) => [item.id, currentSelections.expenses[row.id]?.[item.id] ?? true]),
          ),
        ]),
      ),
      revenues: Object.fromEntries(
        simplifiedRevenueRows.map((row) => [
          row.id,
          Object.fromEntries(
            row.items.map((item) => [item.id, currentSelections.revenues[row.id]?.[item.id] ?? true]),
          ),
        ]),
      ),
    }));
  }, [simplifiedExpenseRows, simplifiedRevenueRows]);

  function handleRowChange(type, rowId, fieldName, nextValue) {
    if (!canEditBudget) return;

    setDraftBudget((currentBudget) => {
      if (!currentBudget) return currentBudget;

      const collectionKey = type === "expenses" ? "expenses" : "revenues";
      const isNumericField = fieldName.includes("Forecast") || fieldName.includes("Actual");

      return {
        ...currentBudget,
        [collectionKey]: currentBudget[collectionKey].map((row) =>
          row.id === rowId
            ? {
                ...row,
                [fieldName]: isNumericField ? toBudgetNumber(nextValue) : nextValue,
              }
            : row,
        ),
      };
    });
  }

  function handleAddRow(type, sectionName) {
    if (!canEditBudget) return;

    setDraftBudget((currentBudget) => {
      if (!currentBudget) return currentBudget;

      const collectionKey = type === "expenses" ? "expenses" : "revenues";
      const sideName = collectionKey === "expenses" ? "expense" : "revenue";
      const existingRows = currentBudget[collectionKey];
      const nextRowNumber = existingRows.reduce((maxValue, row) => Math.max(maxValue, Number(row.rowNumber || 0)), 0) + 1;
      const newRow = createBudgetRow({
        side: sideName,
        section: sectionName,
        rowNumber: nextRowNumber,
      });

      const insertIndex = existingRows.reduce(
        (lastMatchIndex, row, index) => (row.section === sectionName ? index + 1 : lastMatchIndex),
        existingRows.length,
      );
      const nextRows = [...existingRows];
      nextRows.splice(insertIndex, 0, newRow);

      return {
        ...currentBudget,
        [collectionKey]: nextRows,
      };
    });

    setSaveStatus("Nouvelle ligne ajoutée au budget en cours.");
  }

  function handleNewSectionNameChange(type, value) {
    setSectionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [type]: value,
    }));
  }

  function handleAddSection(type) {
    if (!canEditBudget) return;

    const nextSectionName = String(sectionDrafts[type] || "").trim();
    if (!nextSectionName) {
      setSaveStatus("Indique un nom de section avant de l'ajouter.");
      return;
    }

    const collectionKey = type === "expenses" ? "expenses" : "revenues";
    if (draftBudget?.[collectionKey]?.some((row) => row.section.toLowerCase() === nextSectionName.toLowerCase())) {
      setSaveStatus("Cette section existe déjà dans le budget en cours.");
      return;
    }

    setDraftBudget((currentBudget) => {
      if (!currentBudget) return currentBudget;

      const sideName = collectionKey === "expenses" ? "expense" : "revenue";
      const existingRows = currentBudget[collectionKey];

      const nextRowNumber = existingRows.reduce((maxValue, row) => Math.max(maxValue, Number(row.rowNumber || 0)), 0) + 1;
      const newRow = createBudgetRow({
        side: sideName,
        section: nextSectionName,
        rowNumber: nextRowNumber,
      });

      return {
        ...currentBudget,
        [collectionKey]: [...existingRows, newRow],
      };
    });

    setSectionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [type]: "",
    }));
    setSaveStatus(`Section "${nextSectionName}" ajoutée au budget en cours.`);
  }

  function handleDeleteRow(type, rowId) {
    if (!canEditBudget) return;

    const collectionKey = type === "expenses" ? "expenses" : "revenues";
    const rowToDelete = draftBudget?.[collectionKey]?.find((row) => row.id === rowId);
    if (!rowToDelete) return;

    setDraftBudget((currentBudget) => {
      if (!currentBudget) return currentBudget;

      return {
        ...currentBudget,
        [collectionKey]: currentBudget[collectionKey].filter((row) => row.id !== rowId),
      };
    });

    setSaveStatus(`Ligne "${rowToDelete.label}" supprimée du budget en cours.`);
  }

  function resetDraft() {
    if (!isBudgetEditable || !selectedBudget) return;
    setDraftBudget(structuredClone(selectedBudget));
    setIsEditMode(false);
    setSaveStatus("Les modifications locales ont été réinitialisées.");
  }

  async function handleSave() {
    if (!isBudgetEditable) {
      setSaveStatus("Les budgets passés sont verrouillés en lecture seule.");
      return;
    }
    if (!draftBudget) return;
    if (!budgetDiff.length && hasPersistedBudget) {
      setSaveStatus("Aucune modification à enregistrer.");
      return;
    }

    setIsSaving(true);
    setSaveStatus("Enregistrement du budget en cours...");

    try {
      const budgetRef = doc(db, BUDGET_COLLECTION, draftBudget.editionId);
      const serializedBudget = serializeBudgetDocument(draftBudget, {
        actorName,
        actorUid: currentUser?.uid || "",
      });
      const historySummary = !hasPersistedBudget && !budgetDiff.length
        ? "Initialisation du budget"
        : `${budgetDiff.length} modification(s) enregistrée(s)`;

      await setDoc(
        budgetRef,
        {
          ...serializedBudget,
          createdAt: persistedBudget?.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      await addDoc(collection(db, BUDGET_COLLECTION, draftBudget.editionId, BUDGET_HISTORY_COLLECTION), {
        createdAt: serverTimestamp(),
        actorName,
        actorUid: currentUser?.uid || "",
        summary: historySummary,
        changeCount: budgetDiff.length,
        changes: budgetDiff.slice(0, 80),
      });

      setSaveStatus(historySummary);
      setIsEditMode(false);
    } catch (saveError) {
      console.error("Unable to save budget tracking changes", saveError);
      setSaveStatus("La sauvegarde du budget a échoué.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateBudget() {
    if (!canCreateNextBudget || !latestBudget) return;

    const normalizedEditionId = normalizeEditionId(newBudgetYear);
    const targetYear = Number(normalizedEditionId);
    const latestYear = Number(getBudgetDocumentLabel(latestBudget));

    if (!Number.isFinite(targetYear)) {
      setSaveStatus("Indique une année valide pour le nouveau budget.");
      return;
    }

    if (budgets.some((budget) => budget.editionId === normalizedEditionId)) {
      setSaveStatus(`Le budget ${normalizedEditionId} existe déjà.`);
      return;
    }

    if (Number.isFinite(latestYear) && targetYear <= latestYear) {
      setSaveStatus(`Le nouveau budget doit être supérieur à ${latestYear}.`);
      return;
    }

    setIsCreatingBudget(true);
    setSaveStatus(`Création du budget ${normalizedEditionId} en cours...`);

    try {
      const nextBudget = buildBudgetFromTemplate(latestBudget, normalizedEditionId);
      const budgetRef = doc(db, BUDGET_COLLECTION, normalizedEditionId);

      await setDoc(budgetRef, {
        ...serializeBudgetDocument(nextBudget, {
          actorName,
          actorUid: currentUser?.uid || "",
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, BUDGET_COLLECTION, normalizedEditionId, BUDGET_HISTORY_COLLECTION), {
        createdAt: serverTimestamp(),
        actorName,
        actorUid: currentUser?.uid || "",
        summary: `Initialisation du budget ${normalizedEditionId}`,
        changeCount: 0,
        changes: [],
      });

      setPendingNewBudgetId(normalizedEditionId);
      setSelectedEditionId(normalizedEditionId);
    } catch (createError) {
      console.error("Unable to create budget", createError);
      setSaveStatus("La création du nouveau budget a échoué.");
    } finally {
      setIsCreatingBudget(false);
    }
  }

  async function handleSeedBudgets() {
    if (isSeedingBudgets) return;

    const shouldSeed = window.confirm(
      usesFallbackBudgets
        ? `Importer ${missingSeedEditionIds.join(", ")} dans Firestore et faire de Firebase la source de vérité ?`
        : "Ressynchroniser les budgets historiques locaux vers Firestore ?",
    );
    if (!shouldSeed) return;

    setIsSeedingBudgets(true);
    setBudgetSeedLog([]);
    setSaveStatus("");

    try {
      const budgetsToSeed = usesFallbackBudgets
        ? fallbackBudgets.filter((budget) => missingSeedEditionIds.includes(budget.editionId))
        : fallbackBudgets;

      setBudgetSeedLog((currentLog) => [
        ...currentLog,
        `Préparation de ${budgetsToSeed.length} budget(s) : ${budgetsToSeed.map((budget) => budget.editionId).join(", ")}`,
      ]);

      let batch = writeBatch(db);
      let count = 0;

      budgetsToSeed.forEach((budget) => {
        const existingBudget = storedBudgets.find((item) => item.editionId === budget.editionId);
        const budgetRef = doc(db, BUDGET_COLLECTION, budget.editionId);

        batch.set(
          budgetRef,
          {
            ...serializeBudgetDocument(budget, {
              actorName,
              actorUid: currentUser?.uid || "",
            }),
            createdAt: existingBudget?.createdAt ?? serverTimestamp(),
            updatedAt: serverTimestamp(),
            seededAt: serverTimestamp(),
          },
          { merge: true },
        );
        count += 1;
      });

      await batch.commit();
      setBudgetSeedLog((currentLog) => [...currentLog, `Budgets importés : ${count}`]);

      for (const budget of budgetsToSeed) {
        await setDoc(
          doc(db, BUDGET_COLLECTION, budget.editionId, BUDGET_HISTORY_COLLECTION, "seed-initial"),
          {
            createdAt: serverTimestamp(),
            actorName,
            actorUid: currentUser?.uid || "",
            summary: `Initialisation Firestore du budget ${budget.editionId}`,
            changeCount: 0,
            changes: [],
            source: "local-seed",
          },
          { merge: true },
        );
        setBudgetSeedLog((currentLog) => [...currentLog, `Historique créé : ${budget.editionId}`]);
      }

      setSaveStatus(
        usesFallbackBudgets
          ? `Firestore initialisé pour ${budgetsToSeed.map((budget) => budget.editionId).join(", ")}.`
          : "Budgets Firestore resynchronisés depuis les modèles locaux.",
      );
    } catch (seedError) {
      console.error("Unable to seed budgets", seedError);
      setBudgetSeedLog((currentLog) => [...currentLog, `❌ ${seedError?.message || "Import impossible"}`]);
      setSaveStatus("L'initialisation Firestore du budget a échoué.");
    } finally {
      setIsSeedingBudgets(false);
    }
  }

  function handleToggleSimplifiedRow(sideKey, rowId) {
    setSimplifiedSelections((currentSelections) => ({
      ...currentSelections,
      [sideKey]: {
        ...currentSelections[sideKey],
        [rowId]: !(currentSelections[sideKey][rowId] ?? true),
      },
    }));
  }

  function handleToggleSimplifiedDetailRow(sideKey, rowId, itemId) {
    setSimplifiedDetailSelections((currentSelections) => ({
      ...currentSelections,
      [sideKey]: {
        ...currentSelections[sideKey],
        [rowId]: {
          ...currentSelections[sideKey][rowId],
          [itemId]: !(currentSelections[sideKey][rowId]?.[itemId] ?? true),
        },
      },
    }));
  }

  if (loading || !draftBudget || !totals) {
    return (
      <div className="page">
        <section className="page-header">
          <div>
            <p className="eyebrow">Budget</p>
            <h1>Chargement du suivi budgétaire</h1>
            <p>Nous préparons la structure du budget et son historique.</p>
          </div>
        </section>
      </div>
    );
  }

  const currentYearLabel = getBudgetDocumentLabel(draftBudget);

  return (
    <div className="page budget-page">
      {error ? (
        <div className="notice-card notice-card--warn">
          <strong>Chargement partiel</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="budget-topbar">
        <div className="budget-topbar__header">
          <div className="budget-topbar__identity">
            <p className="budget-topbar__eyebrow">Budget {currentYearLabel}</p>
            <h1>{primaryTabLabel}</h1>
            <p>{draftBudget.meetingLevel || "meeting"}</p>
          </div>
          <div className="budget-toolbar-actions">
            {canCreateNextBudget ? (
              <div className="budget-toolbar-actions__new">
                <input
                  type="text"
                  inputMode="numeric"
                  value={newBudgetYear}
                  onChange={(event) => setNewBudgetYear(event.target.value)}
                  placeholder="2027"
                />
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={handleCreateBudget}
                  disabled={isCreatingBudget}
                >
                  {isCreatingBudget ? "Création..." : "Nouveau budget"}
                </button>
              </div>
            ) : null}
            <span className={`status-pill ${isBudgetEditable ? "status-pill--ok" : "status-pill--warn"}`}>
              {isBudgetEditable ? (isEditMode ? "Mode modification actif" : "Budget en cours prêt à modifier") : (isBudgetLocked ? "Budget verrouillé" : "Lecture seule")}
            </span>
            {usesFallbackBudgets ? (
              <span className="status-pill status-pill--warn">Source provisoire</span>
            ) : (
              <span className="status-pill">Firebase</span>
            )}
            {canSyncBudgets ? (
              <button className="button button--secondary" type="button" onClick={handleSeedBudgets} disabled={isSeedingBudgets}>
                {isSeedingBudgets ? "Synchronisation..." : "Synchroniser Firebase"}
              </button>
            ) : null}
            {isBudgetEditable ? (
              <>
                {!isEditMode ? (
                  <button className="button button--secondary" type="button" onClick={() => setIsEditMode(true)}>
                    Modifier
                  </button>
                ) : (
                  <>
                    <button className="button button--secondary" type="button" onClick={() => setIsEditMode(false)}>
                      Fermer
                    </button>
                    <button className="button button--secondary" type="button" onClick={resetDraft} disabled={!hasUnsavedChanges || isSaving}>
                      Réinitialiser
                    </button>
                    <button className="button button--primary" type="button" onClick={handleSave} disabled={isSaving}>
                      {isSaving ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>

        <div className="budget-toolbar">
          <label className="field budget-toolbar__field">
            <span>Budget consulté</span>
            <select value={selectedEditionId} onChange={(event) => setSelectedEditionId(event.target.value)}>
              {budgets.map((budget) => (
                <option key={budget.editionId} value={budget.editionId}>
                  {getBudgetDocumentLabel(budget)}
                </option>
              ))}
            </select>
          </label>
          <div className="budget-toolbar__meta">
            <strong>{hasPersistedBudget ? "Budget sauvegardé" : "Modèle local"}</strong>
            <span>{formatDateTime(draftBudget.updatedAt)}</span>
            <span>{draftBudget.updatedByName || actorName}</span>
          </div>
        </div>

        {budgetSeedLog.length ? <BudgetSeedLog lines={budgetSeedLog} /> : null}
        {saveStatus ? <p className="panel-note budget-save-status">{saveStatus}</p> : null}
      </section>

      {activeTab !== "overview" ? (
        <section className="budget-summary-grid">
            {hasComparison ? (
              <article className="budget-summary-card">
                <span className="budget-summary-card__label">Dépenses {draftBudget.referenceEditionId}</span>
                <strong>{formatCurrency(totals.expenses.referenceActual)}</strong>
                <small>Réalisé de comparaison</small>
              </article>
            ) : null}
            <article className="budget-summary-card">
              <span className="budget-summary-card__label">Dépenses {draftBudget.currentEditionId}</span>
              <strong>{formatCurrency(totals.expenses.currentActual)}</strong>
              <small>{formatCurrency(totals.expenses.currentForecast)} prévues</small>
              <span className={getVarianceToneClass(computeVariance(totals.expenses.currentForecast, totals.expenses.currentActual), "expense")}>
                {formatVariance(computeVariance(totals.expenses.currentForecast, totals.expenses.currentActual))}
              </span>
            </article>
            {hasComparison ? (
              <article className="budget-summary-card">
                <span className="budget-summary-card__label">Recettes {draftBudget.referenceEditionId}</span>
                <strong>{formatCurrency(totals.revenues.referenceActual)}</strong>
                <small>Réalisé de comparaison</small>
              </article>
            ) : null}
            <article className="budget-summary-card">
              <span className="budget-summary-card__label">Recettes {draftBudget.currentEditionId}</span>
              <strong>{formatCurrency(totals.revenues.currentActual)}</strong>
              <small>{formatCurrency(totals.revenues.currentForecast)} prévues</small>
              <span className={getVarianceToneClass(computeVariance(totals.revenues.currentForecast, totals.revenues.currentActual), "revenue")}>
                {formatVariance(computeVariance(totals.revenues.currentForecast, totals.revenues.currentActual))}
              </span>
            </article>
            {hasComparison ? (
              <article className="budget-summary-card budget-summary-card--balance">
                <span className="budget-summary-card__label">Équilibre {draftBudget.referenceEditionId}</span>
                <strong className={getBalanceToneClass(totals.balance.referenceActual)}>{formatCurrency(totals.balance.referenceActual)}</strong>
                <small>Réalisé de comparaison</small>
              </article>
            ) : null}
            <article className="budget-summary-card budget-summary-card--balance">
              <span className="budget-summary-card__label">Équilibre {draftBudget.currentEditionId}</span>
              <strong className={getBalanceToneClass(totals.balance.currentActual)}>{formatCurrency(totals.balance.currentActual)}</strong>
              <small>{formatCurrency(totals.balance.currentForecast)} prévisionnel</small>
              <span className={getVarianceToneClass(computeVariance(totals.balance.currentForecast, totals.balance.currentActual), "balance")}>
                {formatVariance(computeVariance(totals.balance.currentForecast, totals.balance.currentActual))}
              </span>
            </article>
        </section>
      ) : null}

      <div className="admin-subtabs" role="tablist" aria-label="Navigation du budget">
        {[
          ["overview", primaryTabLabel],
          ["expenses", "Dépenses"],
          ["revenues", "Recettes"],
          ["simplified", "Simplifiée"],
          ["history", "Historique"],
        ].map(([tabId, label]) => (
          <button
            key={tabId}
            className={`admin-subtab ${activeTab === tabId ? "admin-subtab--active" : ""}`}
            type="button"
            onClick={() => setActiveTab(tabId)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <div className="budget-sheet-stack">
          <section className="budget-sheet-group">
            <div className="budget-sheet-group__header">
              <div>
                <h3>Dépenses</h3>
                <p>{isBudgetLocked ? `Budget ${draftBudget.currentEditionId} — prévisionnel et définitif.` : `Budget ${draftBudget.currentEditionId} — prévisionnel et réalisé.`}</p>
              </div>
            </div>
            <BudgetOverviewTable
              collectionKey="expenses"
              sections={expenseSections}
              currentEditionId={draftBudget.currentEditionId}
              allowEditing={canEditBudget}
              actualColumnLabel={`${isBudgetLocked ? "Définitif" : "Réalisé"} ${draftBudget.currentEditionId}`}
              onValueChange={handleRowChange}
              totals={totals.expenses}
            />
          </section>

          <section className="budget-sheet-group">
            <div className="budget-sheet-group__header">
              <div>
                <h3>Recettes</h3>
                <p>{isBudgetLocked ? `Budget ${draftBudget.currentEditionId} — prévisionnel et définitif.` : `Budget ${draftBudget.currentEditionId} — prévisionnel et réalisé.`}</p>
              </div>
            </div>
            <BudgetOverviewTable
              collectionKey="revenues"
              sections={revenueSections}
              currentEditionId={draftBudget.currentEditionId}
              allowEditing={canEditBudget}
              actualColumnLabel={`${isBudgetLocked ? "Définitif" : "Réalisé"} ${draftBudget.currentEditionId}`}
              onValueChange={handleRowChange}
              totals={totals.revenues}
            />
          </section>
        </div>
      ) : null}

      {activeTab === "expenses" ? (
        <BudgetLineTable
          side="expense"
          collectionKey="expenses"
          sections={expenseSections}
          referenceEditionId={draftBudget.referenceEditionId}
          currentEditionId={draftBudget.currentEditionId}
          hasComparison={hasComparison}
          isEditable={canEditBudget}
          newSectionName={sectionDrafts.expenses}
          onValueChange={handleRowChange}
          onAddRow={handleAddRow}
          onDeleteRow={handleDeleteRow}
          onNewSectionNameChange={handleNewSectionNameChange}
          onAddSection={handleAddSection}
          totals={totals.expenses}
        />
      ) : null}

      {activeTab === "revenues" ? (
        <BudgetLineTable
          side="revenue"
          collectionKey="revenues"
          sections={revenueSections}
          referenceEditionId={draftBudget.referenceEditionId}
          currentEditionId={draftBudget.currentEditionId}
          hasComparison={hasComparison}
          isEditable={canEditBudget}
          newSectionName={sectionDrafts.revenues}
          onValueChange={handleRowChange}
          onAddRow={handleAddRow}
          onDeleteRow={handleDeleteRow}
          onNewSectionNameChange={handleNewSectionNameChange}
          onAddSection={handleAddSection}
          totals={totals.revenues}
        />
      ) : null}

      {activeTab === "simplified" ? (
        <div className="budget-simplified-layout">
          <Panel
            title="Réglages de la vue simplifiée"
            subtitle="Choisissez les gros blocs à afficher, puis le niveau de lecture souhaité."
          >
            <div className="budget-simplified-controls">
              <label className="field budget-simplified-controls__field">
                <span>Afficher</span>
                <select value={simplifiedDisplayMode} onChange={(event) => setSimplifiedDisplayMode(event.target.value)}>
                  <option value="forecast">Prévisionnel</option>
                  <option value="actual">Réalisé</option>
                  <option value="both">Les deux</option>
                </select>
              </label>
              <label className="budget-simplified-toggle">
                <input
                  type="checkbox"
                  checked={simplifiedShowDetails}
                  onChange={(event) => setSimplifiedShowDetails(event.target.checked)}
                />
                <span>Afficher le détail des lignes</span>
              </label>
            </div>
          </Panel>

          <div className="budget-overview-grid">
            <SimplifiedBudgetTable
              Panel={Panel}
              title="Version simplifiée — dépenses"
              subtitle="Agrégats calculés automatiquement à partir du budget détaillé."
              side="expense"
              rows={simplifiedExpenseRows}
              selectedMap={simplifiedSelections.expenses}
              detailSelections={simplifiedDetailSelections.expenses}
              displayMode={simplifiedDisplayMode}
              showDetails={simplifiedShowDetails}
              onToggleRow={(rowId) => handleToggleSimplifiedRow("expenses", rowId)}
              onToggleDetailRow={(rowId, itemId) => handleToggleSimplifiedDetailRow("expenses", rowId, itemId)}
              referenceEditionId={draftBudget.referenceEditionId}
              currentEditionId={draftBudget.currentEditionId}
              hasComparison={hasComparison}
            />
            <SimplifiedBudgetTable
              Panel={Panel}
              title="Version simplifiée — recettes"
              subtitle="Même logique, côté recettes, pour lire rapidement l'équilibre."
              side="revenue"
              rows={simplifiedRevenueRows}
              selectedMap={simplifiedSelections.revenues}
              detailSelections={simplifiedDetailSelections.revenues}
              displayMode={simplifiedDisplayMode}
              showDetails={simplifiedShowDetails}
              onToggleRow={(rowId) => handleToggleSimplifiedRow("revenues", rowId)}
              onToggleDetailRow={(rowId, itemId) => handleToggleSimplifiedDetailRow("revenues", rowId, itemId)}
              referenceEditionId={draftBudget.referenceEditionId}
              currentEditionId={draftBudget.currentEditionId}
              hasComparison={hasComparison}
            />
          </div>
        </div>
      ) : null}

      {activeTab === "history" ? (
        <Panel
          title="Historique des modifications"
          subtitle="Chaque enregistrement garde une trace des changements budgétaires."
        >
          {historyLoading ? (
            <p>Chargement de l'historique…</p>
          ) : historyError ? (
            <p className="form-error">{historyError}</p>
          ) : historyEntries.length === 0 ? (
            <p>Aucune sauvegarde n'a encore été enregistrée pour cette édition.</p>
          ) : (
            <div className="budget-history-list">
              {historyEntries.map((entry) => (
                <article className="budget-history-entry" key={entry.id}>
                  <div className="budget-history-entry__header">
                    <div>
                      <strong>{entry.summary || "Modification budgétaire"}</strong>
                      <p>{formatDateTime(entry.createdAt)} • {entry.actorName || "Admin"}</p>
                    </div>
                    <span className="status-pill">{entry.changeCount} changement(s)</span>
                  </div>
                  {entry.changes.length ? (
                    <div className="budget-history-entry__changes">
                      {entry.changes.slice(0, 8).map((change, index) => (
                        <div className="budget-history-change" key={`${entry.id}-${change.rowId}-${change.field}-${index}`}>
                          <strong>{change.rowLabel}</strong>
                          <span>{historyFieldLabels[change.field] || change.field}</span>
                          <small>
                            {formatHistoryValue(change.before)} → {formatHistoryValue(change.after)}
                          </small>
                        </div>
                      ))}
                      {entry.changes.length > 8 ? (
                        <p className="panel-note">+ {entry.changes.length - 8} autre(s) changement(s) enregistrés.</p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

export { BudgetTrackingPage };
