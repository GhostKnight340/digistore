/**
 * Only allow a same-origin relative path as a post-auth redirect target — it
 * must start with a single "/" (rejecting "//host" protocol-relative and
 * absolute URLs) and contain no whitespace/backslash. Prevents open redirects.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\s\\]/.test(value)) return null;
  return value;
}
