export function getEditionDisplayNumber(edition) {
  if (!edition) return null;

  const rawEdition = Number(edition.edition);
  const year = Number(edition.year ?? edition.id);

  if (!Number.isFinite(rawEdition)) return null;
  if (year === 2022 || edition.cancelled) return null;

  return year >= 2023 ? rawEdition - 1 : rawEdition;
}

export function formatEditionLabel(edition, options = {}) {
  const { prefix = "Edition ", withHash = false, fallback = null } = options;
  const displayNumber = getEditionDisplayNumber(edition);

  if (!displayNumber) return fallback;

  return `${prefix}${withHash ? "#" : ""}${displayNumber}`;
}
