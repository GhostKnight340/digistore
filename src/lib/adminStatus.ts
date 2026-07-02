// Admin redesign status vocabularies — docs/admin-redesign/10-Data-Model-Mapping.md §2.
// The Badge component consumes these maps so screens never hard-code labels.

export type Tone = "accent" | "success" | "warning" | "danger" | "neutral";

export const ORDER_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending_payment: { label: "Awaiting payment", tone: "neutral" },
  pending: { label: "Awaiting payment", tone: "neutral" },
  awaiting_payment: { label: "Awaiting payment", tone: "neutral" },
  payment_submitted: { label: "Payment review", tone: "warning" },
  payment_confirmed: { label: "To fulfill", tone: "accent" },
  processing: { label: "To fulfill", tone: "accent" },
  delivered: { label: "Delivered", tone: "success" },
  payment_issue: { label: "Payment issue", tone: "danger" },
  rejected: { label: "Rejected", tone: "danger" },
  refunded: { label: "Refunded", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function orderStatusMeta(status: string): { label: string; tone: Tone } {
  return ORDER_STATUS_META[status] ?? { label: status, tone: "neutral" };
}

export const CODE_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  unused: { label: "Unused", tone: "success" },
  reserved: { label: "Reserved", tone: "warning" },
  used: { label: "Used", tone: "neutral" },
  disabled: { label: "Disabled", tone: "danger" },
};

export const EMAIL_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  sent: { label: "Sent", tone: "success" },
  simulated: { label: "Simulated", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  bounce: { label: "Bounced", tone: "danger" },
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank: "Bank transfer",
  usdt: "USDT",
  paypal: "PayPal",
  card: "Card",
  test: "Test",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

/** Mono currency with thin-space grouping, per mockups: "48 920 MAD". */
export function formatAdminMAD(amount: number): string {
  const grouped = new Intl.NumberFormat("en-US")
    .format(Math.round(amount))
    .replace(/,/g, " ");
  return `${grouped} MAD`;
}

/** Short mono order reference from a cuid, e.g. "#GH-9F3K2A". */
export function shortOrderRef(id: string): string {
  return `#GH-${id.slice(-6).toUpperCase()}`;
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Mono waiting timer like "2h 14m" since a timestamp. */
export function waitingSince(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
