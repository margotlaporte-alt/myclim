export const SPONSOR_CATEGORY_ORDER = ["title", "main", "institutional", "media", "event", "supplier"];

export const SPONSOR_CATEGORY_LABELS = {
  title: "Title Partner",
  main: "Main Partners",
  institutional: "Institutional Partners",
  media: "Media Partners",
  event: "Event Sponsors",
  supplier: "Suppliers & Partners",
};

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

export function normalizeSponsorCategory(category) {
  const normalized = CATEGORY_ALIASES.get(toKey(category));
  if (normalized) return normalized;
  return String(category || "").trim() || "supplier";
}

export function sponsorCategoryLabel(category) {
  const normalized = normalizeSponsorCategory(category);
  if (SPONSOR_CATEGORY_LABELS[normalized]) return SPONSOR_CATEGORY_LABELS[normalized];
  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sponsorCategorySortIndex(category) {
  const normalized = normalizeSponsorCategory(category);
  const index = SPONSOR_CATEGORY_ORDER.indexOf(normalized);
  return index === -1 ? SPONSOR_CATEGORY_ORDER.length : index;
}
