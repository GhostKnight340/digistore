/**
 * Stateless-session revocation check. Sessions are self-signed HMAC cookies (no
 * DB session table); to support admin "force logout / revoke sessions" and
 * account-disable, each cookie carries an issued-at (`iat`) and the Customer row
 * carries a `sessionsValidAfter` anchor. A session is valid only if it was issued
 * at or after that anchor.
 *
 * Pure + client-safe so it can be unit-tested without the auth/server layer.
 */
export function isSessionActive(
  iat: number | undefined,
  sessionsValidAfter: Date | null | undefined,
): boolean {
  // No revocation anchor set → every session is valid (backward compatible).
  if (!sessionsValidAfter) return true;
  const cutoff = sessionsValidAfter.getTime();
  // Legacy cookie with no issued-at cannot be proven newer than the anchor, so
  // once an admin revokes, such cookies are treated as revoked (fail closed).
  if (typeof iat !== "number" || !Number.isFinite(iat)) return false;
  return iat >= cutoff;
}
