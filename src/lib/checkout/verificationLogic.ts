import { createHmac, timingSafeEqual } from "crypto";

/**
 * Pure, dependency-free core of checkout email verification. No `server-only`,
 * Prisma, or Next imports live here so the security-critical decision logic is
 * unit-testable in isolation. The DB/cookie/email side effects live in
 * src/lib/checkout/emailVerification.ts, which composes these helpers.
 */

// A code can be confirmed for 10 minutes. Once confirmed, the resulting proof
// stays usable for the remainder of the checkout (PROOF_TTL_MS).
export const CODE_TTL_MS = 10 * 60 * 1000;
export const PROOF_TTL_MS = 60 * 60 * 1000;

// Brute-force + abuse limits.
export const MAX_ATTEMPTS = 5; // wrong-code guesses per code before it locks
export const RESEND_COOLDOWN_MS = 60 * 1000; // min delay between sends
export const SEND_WINDOW_MS = 15 * 60 * 1000;
export const MAX_SENDS_PER_EMAIL = 5; // per SEND_WINDOW_MS
export const MAX_SENDS_PER_IP = 20; // per SEND_WINDOW_MS

export type ConfirmCodeStatus =
  | "verified"
  | "incorrect"
  | "expired"
  | "too_many_attempts"
  | "session_mismatch";

export type VerificationRow = {
  codeHash: string;
  expiresAt: Date;
  attemptCount: number;
  verifiedAt: Date | null;
  consumedAt: Date | null;
};

export function verificationSecret() {
  const configured =
    process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET, NEXTAUTH_SECRET, or SESSION_SECRET must be configured.");
  }
  return "ghost.ma-development-session-secret";
}

/** HMAC of the code bound to the (normalized) email. The code is never stored. */
export function hashCode(email: string, code: string) {
  return createHmac("sha256", verificationSecret()).update(`${email}:${code}`).digest("hex");
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Format a random integer into a zero-padded six-digit code. */
export function formatCode(value: number) {
  return String(Math.abs(Math.trunc(value)) % 1_000_000).padStart(6, "0");
}

/**
 * Pure decision for confirming a code against the active row. Encodes every
 * security rule: expiry, single-use, the per-code attempt cap, a timing-safe
 * match, and idempotent re-verify. `matched === false` marks a wrong guess whose
 * attempt the caller must record.
 */
export function classifyConfirm(
  row: VerificationRow | null,
  email: string,
  code: string,
  now: Date,
): { status: ConfirmCodeStatus; attemptsLeft?: number; matched?: boolean } {
  // No active row, or one already spent, is indistinguishable from expiry.
  if (!row || row.consumedAt) return { status: "expired" };
  // Already verified and still within the proof window → idempotent success.
  if (row.verifiedAt && now.getTime() - row.verifiedAt.getTime() < PROOF_TTL_MS) {
    return { status: "verified" };
  }
  if (row.expiresAt < now) return { status: "expired" };
  if (row.attemptCount >= MAX_ATTEMPTS) return { status: "too_many_attempts" };

  const expected = Buffer.from(row.codeHash, "hex");
  const provided = Buffer.from(hashCode(email, code), "hex");
  const matched = expected.length === provided.length && timingSafeEqual(expected, provided);
  if (matched) return { status: "verified", matched: true };

  const attemptsLeft = MAX_ATTEMPTS - (row.attemptCount + 1);
  return attemptsLeft <= 0
    ? { status: "too_many_attempts", matched: false }
    : { status: "incorrect", attemptsLeft, matched: false };
}

/** Whether a verified row still constitutes a usable, unconsumed proof. */
export function proofIsValid(
  row: Pick<VerificationRow, "verifiedAt" | "consumedAt">,
  now: Date,
) {
  return Boolean(
    row.verifiedAt &&
      !row.consumedAt &&
      now.getTime() - row.verifiedAt.getTime() < PROOF_TTL_MS,
  );
}
