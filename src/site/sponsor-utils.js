export const DEFAULT_SPONSOR_CATEGORIES = [
  { key: "title", label: "Title Partner" },
  { key: "main", label: "Main Partners" },
  { key: "institutional", label: "Institutional Partners" },
  { key: "media", label: "Media Partners" },
  { key: "event", label: "Event Sponsors" },
  { key: "supplier", label: "Suppliers & Partners" },
];

export const SPONSOR_CATEGORY_ORDER = DEFAULT_SPONSOR_CATEGORIES.map((category) => category.key);

export const SPONSOR_CATEGORY_LABELS = Object.fromEntries(
  DEFAULT_SPONSOR_CATEGORIES.map((category) => [category.key, category.label]),
);

const CATEGORY_ALIASES = new Map([
  ["title", "title"],
  ["title partner", "title"],
  ["title sponsor", "title"],
  ["main", "main"],
  ["main partner", "main"],
  ["main partners", "main"],
  ["institutional", "institutional"],
  ["institutional partner", "institutional"],
  ["institutional partners", "institutional"],
  ["media", "media"],
  ["media partner", "media"],
  ["media partners", "media"],
  ["event", "event"],
  ["event sponsor", "event"],
  ["event sponsors", "event"],
  ["meeting sponsor", "event"],
  ["meeting sponsors", "event"],
  ["meeting's sponsor", "event"],
  ["meeting's sponsors", "event"],
  ["supplier", "supplier"],
  ["suppliers", "supplier"],
  ["supplier & partner", "supplier"],
  ["supplier & partners", "supplier"],
  ["suppliers & partners", "supplier"],
]);

function toKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/&/g, "and")
    .replace(/\band\b/g, "&")
    .replace(/\s+/g, " ");
}

export function toSponsorCategoryKey(value) {
  const normalizedValue = toKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalizedValue || "supplier";
}

export function normalizeSponsorCategories(categories) {
  const source = Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_SPONSOR_CATEGORIES;
  const seen = new Set();

  return source
    .map((category, index) => {
      const fallbackLabel = typeof category === "string" ? category : category?.label || category?.key || "";
      const key = toSponsorCategoryKey(typeof category === "string" ? category : category?.key || fallbackLabel);
      if (!key || seen.has(key)) return null;
      seen.add(key);

      const label = String(typeof category === "string" ? category : category?.label || key).trim() || key;
      const order = Number.isFinite(Number(category?.order)) ? Number(category.order) : index;

      return { key, label, order };
    })
    .filter(Boolean)
    .sort((left, right) => left.order - right.order);
}

export function normalizeSponsorCategory(category, categories = DEFAULT_SPONSOR_CATEGORIES) {
  const normalizedCategories = normalizeSponsorCategories(categories);
  const availableKeys = new Set(normalizedCategories.map((entry) => entry.key));
  const aliasKey = CATEGORY_ALIASES.get(toKey(category));
  if (aliasKey && availableKeys.has(aliasKey)) return aliasKey;

  const normalizedKey = toSponsorCategoryKey(category);
  if (availableKeys.has(normalizedKey)) return normalizedKey;

  return normalizedKey || normalizedCategories[0]?.key || "supplier";
}

export function sponsorCategoryLabel(category, categories = DEFAULT_SPONSOR_CATEGORIES) {
  const normalizedCategories = normalizeSponsorCategories(categories);
  const normalized = normalizeSponsorCategory(category, normalizedCategories);
  const match = normalizedCategories.find((entry) => entry.key === normalized);
  if (match?.label) return match.label;
  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sponsorCategorySortIndex(category, categories = DEFAULT_SPONSOR_CATEGORIES) {
  const normalizedCategories = normalizeSponsorCategories(categories);
  const normalized = normalizeSponsorCategory(category, normalizedCategories);
  const index = normalizedCategories.findIndex((entry) => entry.key === normalized);
  return index === -1 ? normalizedCategories.length : index;
}
