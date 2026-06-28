const PUBLIC_ORDER_NUMBER_LENGTH = 6;

export function formatPublicOrderNumber(sequence: number): string {
  return `#${String(sequence).padStart(PUBLIC_ORDER_NUMBER_LENGTH, "0")}`;
}

export function parsePublicOrderNumber(input: string): number | null {
  const normalized = input.trim().replace(/^#/, "").replace(/^0+/, "") || "0";
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
