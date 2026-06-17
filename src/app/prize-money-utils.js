export const DEFAULT_PRIZE_MONEY_SYSTEMS = {
  A: [
    { place: "1st Place", amount: 1500, currency: "EUR" },
    { place: "2nd Place", amount: 1000, currency: "EUR" },
    { place: "3rd Place", amount: 700, currency: "EUR" },
    { place: "4th Place", amount: 500, currency: "EUR" },
    { place: "5th Place", amount: 300, currency: "EUR" },
    { place: "6th Place", amount: 200, currency: "EUR" },
  ],
  B: [],
};

function normalizePrizeMoneyRow(row, index) {
  const amount =
    typeof row?.amount === "number"
      ? row.amount
      : Number(String(row?.amount ?? "").replace(",", "."));

  return {
    place: String(row?.place || "").trim() || `Place ${index + 1}`,
    amount: Number.isFinite(amount) ? amount : 0,
    currency: String(row?.currency || "EUR").trim() || "EUR",
  };
}

export function getPrizeMoneySystemKeys(value) {
  const extraKeys =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value)
      : [];

  return Array.from(new Set([...Object.keys(DEFAULT_PRIZE_MONEY_SYSTEMS), ...extraKeys]))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export function createPrizeMoneySystemsDraft(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return getPrizeMoneySystemKeys(source).reduce((accumulator, key) => {
    const rows = Array.isArray(source[key]) && source[key].length > 0
      ? source[key]
      : DEFAULT_PRIZE_MONEY_SYSTEMS[key] || [];

    accumulator[key] = rows.map(normalizePrizeMoneyRow);
    return accumulator;
  }, {});
}

export function serializePrizeMoneySystems(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return Object.entries(source).reduce((accumulator, [key, rows]) => {
    if (!Array.isArray(rows)) {
      accumulator[key] = [];
      return accumulator;
    }

    accumulator[key] = rows
      .map((row, index) => ({
        place: String(row?.place || "").trim(),
        amount: Number(String(row?.amount ?? "").replace(",", ".")),
        currency: String(row?.currency || "EUR").trim() || "EUR",
        _index: index,
      }))
      .filter((row) => row.place || Number.isFinite(row.amount))
      .map((row) => ({
        place: row.place || `Place ${row._index + 1}`,
        amount: Number.isFinite(row.amount) ? row.amount : 0,
        currency: row.currency,
      }));

    return accumulator;
  }, {});
}

export function formatPrizeMoneyAmount(amount, currency = "EUR") {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return null;

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(numericAmount);
}
