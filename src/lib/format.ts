/** Formats a number as Moroccan Dirham, e.g. "100 MAD". */
export function formatMAD(amount: number): string {
  return `${new Intl.NumberFormat("en-US").format(amount)} MAD`;
}

/** Formats a face value with its currency, e.g. "10 EUR", "800 Robux". */
export function formatFaceValue(value: number, currency: string): string {
  // ISO currency codes get number-first formatting; others (Robux, VP) get number-first too
  return `${new Intl.NumberFormat("en-US").format(value)} ${currency}`;
}

/** Short, human-friendly date used across order views. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
