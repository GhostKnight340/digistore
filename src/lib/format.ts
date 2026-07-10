/** Formats a number as Moroccan Dirham, e.g. "100 MAD".
 *  Internal/admin use only — the currency code stays MAD here. */
export function formatMAD(amount: number): string {
  return `${new Intl.NumberFormat("en-US").format(amount)} MAD`;
}

/** Customer-facing price label, e.g. "100 DH". Display-only: the underlying
 *  currency is still MAD everywhere else (pricing, DB, payments, admin) — the
 *  storefront just shows the Moroccan dirham to shoppers as "DH". */
export function formatDH(amount: number): string {
  return `${new Intl.NumberFormat("en-US").format(amount)} DH`;
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

/**
 * French relative time, e.g. "il y a 3 jours", "il y a 5 heures", "à l'instant".
 * Returns "jamais" for a null/undefined timestamp. Used for cost-sync freshness.
 */
export function timeAgoFr(iso: string | null | undefined): string {
  if (!iso) return "jamais";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "jamais";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "à l'instant";

  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  const month = Math.floor(day / 30);
  const year = Math.floor(day / 365);

  if (sec < 45) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (hour < 24) return `il y a ${hour} h`;
  if (day < 30) return `il y a ${day} jour${day > 1 ? "s" : ""}`;
  if (month < 12) return `il y a ${month} mois`;
  return `il y a ${year} an${year > 1 ? "s" : ""}`;
}
