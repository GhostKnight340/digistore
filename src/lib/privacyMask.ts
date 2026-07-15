/**
 * Least-privilege display masking for the admin customer area. Pure + client-safe
 * so both server DTOs and client components can mask consistently, and so it can
 * be unit-tested. Masking is presentational only — the underlying value is still
 * available to authorized server code when an operation genuinely needs it.
 */

/** Mask a phone number, keeping the last 2 digits: "+212 6•• •• •• 12". */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length <= 2) return "••";
  const last2 = digits.slice(-2);
  const plus = trimmed.startsWith("+") ? "+" : "";
  return `${plus}${"•".repeat(Math.max(2, digits.length - 2))}${last2}`;
}

/** Mask an email local part: "za••••@gmail.com". Domain preserved. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

/**
 * Mask a payment/provider/capture reference, keeping a short recognizable tail:
 * "••••••4F2A". Used for PayPal capture ids, provider order ids, etc.
 */
export function maskReference(ref: string | null | undefined, keep = 4): string {
  if (!ref) return "";
  const trimmed = ref.trim();
  if (trimmed.length <= keep) return "•".repeat(trimmed.length);
  return `${"•".repeat(Math.max(6, trimmed.length - keep))}${trimmed.slice(-keep)}`;
}

/** Mask an IP address (keep the first octet/segment only). */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return "";
  if (ip.includes(".")) {
    const [first] = ip.split(".");
    return `${first}.•••.•••.•••`;
  }
  if (ip.includes(":")) {
    const [first] = ip.split(":");
    return `${first}:••••`;
  }
  return "•••";
}
