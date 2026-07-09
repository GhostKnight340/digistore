import "server-only";

import { createHash, randomInt } from "crypto";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";

/**
 * Discord DM activation codes. A customer generates a code, sends it to the
 * Ghost.ma bot, and the DM worker calls verifyAndActivate() with the verified
 * Discord sender id. Only then is DM delivery enabled — being OAuth-linked is
 * never enough.
 *
 * Only the SHA-256 hash of a code is persisted. Codes are single-use, expire
 * after ACTIVATION_TTL_MINUTES, and generating a new code invalidates the
 * customer's previous unused codes.
 */

const ACTIVATION_TTL_MINUTES = 15;
const CODE_PREFIX = "GHOST-";
// Unambiguous alphabet (no 0/O/1/I) — codes are typed by hand into Discord.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_BODY_LENGTH = 6;

// Anchored, case-insensitive: the worker upper-cases before matching. Exposed
// so the worker's DM filter and the server stay on the same format.
export const ACTIVATION_CODE_REGEX = /^GHOST-[A-Z0-9]{6}$/;

export type ActivationResult =
  | { status: "activated"; customerId: string }
  | { status: "invalid" }
  | { status: "expired" };

function hashCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function randomCode() {
  let body = "";
  for (let i = 0; i < CODE_BODY_LENGTH; i += 1) {
    body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `${CODE_PREFIX}${body}`;
}

/**
 * Issues a fresh activation code for a customer, invalidating any earlier
 * unused codes in the same transaction. Returns the plaintext code, shown to
 * the customer once (never stored in plaintext).
 */
export async function generateActivationCode(customerId: string): Promise<{
  code: string;
  expiresAt: Date;
}> {
  await ensureDatabaseReady();
  const code = randomCode();
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.discordActivationCode.updateMany({
      where: { customerId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    await tx.discordActivationCode.create({
      data: { customerId, codeHash: hashCode(code), expiresAt },
    });
  });

  return { code, expiresAt };
}

/**
 * Verifies a code received by the bot and, on success, records the VERIFIED
 * Discord sender identity on the customer and marks DM delivery active. The
 * Discord ids/metadata come from the bot's DM event — never from customer
 * input. Idempotent-ish: a used or expired code returns a typed non-success.
 */
export async function verifyAndActivate(input: {
  code: string;
  discordUserId: string;
  discordUsername?: string | null;
  discordDisplayName?: string | null;
  discordAvatar?: string | null;
}): Promise<ActivationResult> {
  await ensureDatabaseReady();
  const trimmed = input.code.trim().toUpperCase();
  if (!ACTIVATION_CODE_REGEX.test(trimmed) || !input.discordUserId) {
    return { status: "invalid" };
  }

  const record = await prisma.discordActivationCode.findUnique({
    where: { codeHash: hashCode(trimmed) },
  });
  if (!record || record.usedAt) return { status: "invalid" };
  if (record.expiresAt < new Date()) return { status: "expired" };

  const now = new Date();
  const claimed = await prisma.$transaction(async (tx) => {
    // Atomically claim the code so a race can't activate twice.
    const claim = await tx.discordActivationCode.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claim.count !== 1) return false;

    await tx.customer.update({
      where: { id: record.customerId },
      data: {
        discordDmUserId: input.discordUserId,
        discordDmUsername: input.discordUsername ?? null,
        discordDmDisplayName: input.discordDisplayName ?? null,
        discordDmAvatar: input.discordAvatar ?? null,
        discordDmActivated: true,
        discordDmActivatedAt: now,
      },
    });

    // Invalidate any other still-pending codes for this customer.
    await tx.discordActivationCode.updateMany({
      where: { customerId: record.customerId, usedAt: null },
      data: { usedAt: now },
    });
    return true;
  });

  if (!claimed) return { status: "invalid" };
  return { status: "activated", customerId: record.customerId };
}
