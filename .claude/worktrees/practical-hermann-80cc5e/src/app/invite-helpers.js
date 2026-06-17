function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function buildSearchPrefixes(value) {
  const normalized = normalizeSearchValue(value);
  if (!normalized) return [];
  const collapsed = normalized.replace(/\s+/g, " ");
  const tokens = collapsed.split(/[^a-z0-9]+/i).map((t) => t.trim()).filter(Boolean);
  const prefixes = new Set();
  for (const token of tokens) {
    for (let i = 2; i <= Math.min(token.length, 10); i++) prefixes.add(token.slice(0, i));
  }
  if (collapsed.length >= 2) prefixes.add(collapsed);
  return [...prefixes];
}

export function buildUserSearchTokens({ firstName, lastName, email }) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  return [...new Set(
    [firstName, lastName, email, fullName]
      .flatMap((v) => buildSearchPrefixes(v))
      .filter(Boolean),
  )];
}
