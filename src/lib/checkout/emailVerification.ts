import "server-only";

import { cookies, headers } from "next/headers";
import { randomBytes, randomInt } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import { normalizeEmail } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import {
  CODE_TTL_MS,
  PROOF_TTL_MS,
  RESEND_COOLDOWN_MS,
  SEND_WINDOW_MS,
  MAX_SENDS_PER_EMAIL,
  MAX_SENDS_PER_IP,
  classifyConfirm,
  formatCode,
  hashCode,
  isValidEmail,
  type ConfirmCodeStatus,
} from "./verificationLogic";

/**
 * Pre-account email verification for inline checkout registration.
 *
 * A six-digit, single-use code is emailed to the address a new customer enters.
 * The code is NEVER returned to the client and NEVER stored in plaintext — only
 * an HMAC of `${email}:${code}` is persisted. Verification is bound to the
 * normalized email AND a per-browser checkout-session cookie, and expires after
 * ten minutes. Successful confirmation records a server-side PROOF row that the
 * atomic account+order creation independently re-validates and consumes exactly
 * once. A client boolean like `emailVerified: true` is never trusted.
 */

const CHECKOUT_SESSION_COOKIE = "ghost_checkout_session";

export type RequestCodeStatus =
  | "sent"
  | "account_exists"
  | "invalid_email"
  | "rate_limited";

export type RequestCodeResult = {
  status: RequestCodeStatus;
  /** Seconds until another code may be requested (resend cooldown). */
  cooldownSec: number;
  /** Seconds until the sent code expires (only when status === "sent"). */
  expiresInSec?: number;
  /** Seconds to wait when rate limited. */
  retryAfterSec?: number;
};

export type ConfirmCodeResult = {
  status: ConfirmCodeStatus;
  /** Remaining attempts before the code locks (only when status === "incorrect"). */
  attemptsLeft?: number;
};

// ── In-memory abuse limiters ────────────────────────────────────────────────
// These reset on a serverless cold start, exactly like the login limiter in
// src/app/actions/auth.ts. They are a first line of defence; the durable limits
// (per-code attempt cap, single-use consumption, expiry) live in the database.
const sendTimestampsByEmail = new Map<string, number[]>();
const sendTimestampsByIp = new Map<string, number[]>();
const lastSendByKey = new Map<string, number>();

function prune(list: number[], now: number): number[] {
  return list.filter((t) => now - t < SEND_WINDOW_MS);
}

async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return (fwd ? fwd.split(",")[0] : h.get("x-real-ip") || "").trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** Read the checkout-session id from the cookie, creating one if absent. */
export async function getOrCreateCheckoutSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CHECKOUT_SESSION_COOKIE)?.value;
  if (existing && existing.length >= 16) return existing;
  const id = randomBytes(24).toString("base64url");
  store.set(CHECKOUT_SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24, // one day is ample for a checkout session
  });
  return id;
}

/** Read the checkout-session id without creating one. */
export async function getCheckoutSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(CHECKOUT_SESSION_COOKIE)?.value ?? null;
}

/**
 * True when a REAL account (any usable credential) already exists for this
 * email. A guest customer row created by a past guest order — email present but
 * no password / Google / Discord — is NOT a real account and can still register.
 */
async function realAccountExists(email: string): Promise<boolean> {
  const customer = await prisma.customer.findUnique({
    where: { email },
    select: { passwordHash: true, googleId: true, discordId: true },
  });
  return Boolean(customer && (customer.passwordHash || customer.googleId || customer.discordId));
}

/**
 * Best-effort cleanup of stale verification rows. Deletes only rows that are
 * safely finished — consumed, or long-expired and never verified — so an active
 * code or a still-valid proof is never removed. Called opportunistically; safe
 * to run concurrently.
 */
export async function cleanupExpiredCheckoutVerifications(): Promise<number> {
  const cutoff = new Date(Date.now() - PROOF_TTL_MS);
  const result = await prisma.checkoutEmailVerification.deleteMany({
    where: {
      OR: [
        { consumedAt: { not: null, lt: cutoff } },
        { verifiedAt: null, expiresAt: { lt: cutoff } },
      ],
    },
  });
  return result.count;
}

/**
 * Request a verification code for `emailRaw`, bound to the current checkout
 * session. Never sends the code back to the caller. Returns a coarse status so
 * the UI can react without the server leaking whether an unrelated address is
 * registered beyond the deliberate, soft "account may exist" hint.
 */
export async function requestVerificationCode(
  emailRaw: string,
  name?: string,
  options?: { selfEmail?: string | null },
): Promise<RequestCodeResult> {
  await ensureDatabaseReady();
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) {
    return { status: "invalid_email", cooldownSec: 0 };
  }

  const sessionId = await getOrCreateCheckoutSessionId();
  const now = Date.now();

  // A real account already owns this address → guide to login, never create a
  // duplicate. Deliberate soft disclosure per the checkout spec. Exception: a
  // logged-in customer verifying their OWN (still-unverified) account email is
  // expected to receive a code — that is precisely how they get verified.
  const isSelfVerification =
    options?.selfEmail != null && normalizeEmail(options.selfEmail) === email;
  if (!isSelfVerification && (await realAccountExists(email))) {
    return { status: "account_exists", cooldownSec: 0 };
  }

  // Resend cooldown (per email + session).
  const cooldownKey = `${email}:${sessionId}`;
  const lastSend = lastSendByKey.get(cooldownKey) ?? 0;
  const sinceLast = now - lastSend;
  if (sinceLast < RESEND_COOLDOWN_MS) {
    return {
      status: "rate_limited",
      cooldownSec: Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000),
      retryAfterSec: Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000),
    };
  }

  // Windowed frequency caps by email and by IP.
  const emailSends = prune(sendTimestampsByEmail.get(email) ?? [], now);
  if (emailSends.length >= MAX_SENDS_PER_EMAIL) {
    return { status: "rate_limited", cooldownSec: 60, retryAfterSec: 60 };
  }
  const ip = await clientIp();
  const ipSends = prune(sendTimestampsByIp.get(ip) ?? [], now);
  if (ip !== "unknown" && ipSends.length >= MAX_SENDS_PER_IP) {
    return { status: "rate_limited", cooldownSec: 60, retryAfterSec: 60 };
  }

  const code = formatCode(randomInt(0, 1_000_000));
  const expiresAt = new Date(now + CODE_TTL_MS);

  // Invalidate any earlier un-consumed code for this email+session, then create
  // the new one — a resend always makes the previous code stop working.
  await prisma.$transaction(async (tx) => {
    await tx.checkoutEmailVerification.updateMany({
      where: { email, sessionId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.checkoutEmailVerification.create({
      data: { email, sessionId, codeHash: hashCode(email, code), expiresAt },
    });
  });

  // Record the send for the in-memory limiters.
  emailSends.push(now);
  sendTimestampsByEmail.set(email, emailSends);
  if (ip !== "unknown") {
    ipSends.push(now);
    sendTimestampsByIp.set(ip, ipSends);
  }
  lastSendByKey.set(cooldownKey, now);

  // Send the code. The code is NEVER logged or returned; sendTransactionalEmail
  // records the rendered email, so we deliberately avoid putting the code in any
  // metadata field.
  await sendTransactionalEmail({
    to: email,
    templateKey: "checkout_email_verification",
    type: "checkout_email_verification",
    variables: {
      customer_name: name?.trim() || "client",
      verification_code: code,
      expiry_minutes: Math.round(CODE_TTL_MS / 60000),
    },
    metadata: { auth_event: "checkout_email_verification" },
  });

  // Opportunistic cleanup — never block the request on it.
  void cleanupExpiredCheckoutVerifications().catch(() => {});

  return {
    status: "sent",
    cooldownSec: Math.round(RESEND_COOLDOWN_MS / 1000),
    expiresInSec: Math.round(CODE_TTL_MS / 1000),
  };
}

/**
 * Confirm a six-digit code for `emailRaw` against the active row for the current
 * checkout session. On success the row is marked verified (the proof) and, when
 * a matching logged-in customer exists, their account is marked email-verified.
 */
export async function confirmVerificationCode(
  emailRaw: string,
  codeRaw: string,
  loggedInCustomer?: { id: string; email: string } | null,
): Promise<ConfirmCodeResult> {
  await ensureDatabaseReady();
  const email = normalizeEmail(emailRaw);
  const code = codeRaw.replace(/\D/g, "");
  const sessionId = await getCheckoutSessionId();
  if (!sessionId) return { status: "session_mismatch" };
  if (!isValidEmail(email) || code.length !== 6) {
    return { status: "incorrect", attemptsLeft: undefined };
  }

  const now = new Date();
  const row = await prisma.checkoutEmailVerification.findFirst({
    where: { email, sessionId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const decision = classifyConfirm(row, email, code, now);

  // A wrong guess: record the attempt against the durable per-code counter.
  if (decision.matched === false && row) {
    await prisma.checkoutEmailVerification.update({
      where: { id: row.id },
      data: { attemptCount: { increment: 1 } },
    });
    return { status: decision.status, attemptsLeft: decision.attemptsLeft };
  }

  // Fresh correct match: record the verification proof.
  if (decision.status === "verified" && decision.matched && row) {
    await prisma.checkoutEmailVerification.update({
      where: { id: row.id },
      data: { verifiedAt: now },
    });
    // A logged-in customer verifying their own account email: mark the account
    // verified directly (and consume the proof — it has served its purpose).
    if (loggedInCustomer && normalizeEmail(loggedInCustomer.email) === email) {
      await prisma.$transaction(async (tx) => {
        await tx.customer.update({
          where: { id: loggedInCustomer.id },
          data: { emailVerified: true, emailVerifiedAt: now },
        });
        await tx.checkoutEmailVerification.update({
          where: { id: row.id },
          data: { consumedAt: now },
        });
      });
    }
    return { status: "verified" };
  }

  // Idempotent success (already verified) or a terminal status (expired/locked).
  return { status: decision.status };
}

/** True when a fresh, un-consumed verification proof exists for this email+session. */
export async function hasVerifiedProof(email: string, sessionId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - PROOF_TTL_MS);
  const row = await prisma.checkoutEmailVerification.findFirst({
    where: {
      email: normalizeEmail(email),
      sessionId,
      consumedAt: null,
      verifiedAt: { not: null, gt: cutoff },
    },
    select: { id: true },
  });
  return Boolean(row);
}

type TxClient = Prisma.TransactionClient | PrismaClient;

/**
 * Inside the account+order transaction: re-validate the verification proof for
 * (email, sessionId) and CONSUME it (single-use). Returns true when a valid,
 * unconsumed, unexpired proof was found and marked consumed. The server relies
 * on this — never on any client-sent flag — before creating the account.
 */
export async function consumeVerifiedProofTx(
  tx: TxClient,
  emailRaw: string,
  sessionId: string,
): Promise<boolean> {
  const email = normalizeEmail(emailRaw);
  const cutoff = new Date(Date.now() - PROOF_TTL_MS);
  const row = await tx.checkoutEmailVerification.findFirst({
    where: {
      email,
      sessionId,
      consumedAt: null,
      verifiedAt: { not: null, gt: cutoff },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!row) return false;
  // Guard against a concurrent double-submit: only the update that flips
  // consumedAt from null wins.
  const consumed = await tx.checkoutEmailVerification.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return consumed.count === 1;
}
