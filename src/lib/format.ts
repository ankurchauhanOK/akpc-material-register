// Indian-style formatting for the UI. Canonical numeric values are always
// stored in the DB — these helpers only affect display (design.md §35).

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatINR(value: number): string {
  return inrFormatter.format(value);
}

export function formatPieces(pieces: number): string {
  return `${new Intl.NumberFormat("en-IN").format(pieces)} pcs`;
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDate(date: string | Date): string {
  return dateFormatter.format(new Date(date));
}
