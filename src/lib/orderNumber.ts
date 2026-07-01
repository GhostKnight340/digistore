const PUBLIC_ORDER_NUMBER_LENGTH = 6;

export function formatPublicOrderNumber(sequence: number): string {
  return `#${String(sequence).padStart(PUBLIC_ORDER_NUMBER_LENGTH, "0")}`;
}

export function formatPublicOrderPathSegment(sequence: number): string {
  return String(sequence).padStart(PUBLIC_ORDER_NUMBER_LENGTH, "0");
}

export function publicOrderNumberToPathSegment(publicOrderNumber: string): string {
  return publicOrderNumber.trim().replace(/^#/, "");
}

export function getPublicOrderLabel(order: { publicOrderNumber?: string | null }): string {
  return order.publicOrderNumber || "Commande";
}

export function parsePublicOrderNumber(input: string): number | null {
  const decoded = decodeURIComponent(input.trim());
  const normalized = decoded.replace(/^#/, "").replace(/^0+/, "") || "0";
  if (!/^\d+$/.test(normalized)) return null;

  const sequence = Number(normalized);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return null;
  return sequence;
}

export function customerOrderRedirectPath(status: string, id: string): string {
  if (status === "delivered") return `/delivery/${id}`;
  if (status === "cancelled" || status === "refunded") return `/order/${id}`;
  return `/payment/${id}`;
}

export function appBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SITE_URL, APP_URL, or SITE_URL must be configured.",
    );
  }

  return "http://localhost:3000";
}

export function absoluteAppUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${appBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
