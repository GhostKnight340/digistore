/** Formats a number as Moroccan Dirham, e.g. "100 MAD". */
export function formatMAD(amount: number): string {
  return `${new Intl.NumberFormat("en-US").format(amount)} MAD`;
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
