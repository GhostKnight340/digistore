import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { Prisma, type SocialIntegration } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { INSTAGRAM_PROVIDER } from "./constants";
import type { InstagramCapability } from "./capabilities";
import type { SocialIntegrationStatus } from "./status";

/**
 * Data-access layer for the Instagram integration. Owns every read/write of the
 * SocialIntegration row and the InstagramActionRecord idempotency ledger. Keeps
 * the raw Composio ids inside the server: nothing here is returned to the browser
 * unshaped (see toStatusDTO in service.ts).
 */

/** The single Instagram integration row, or null when never connected. */
export function getInstagramRow(): Promise<SocialIntegration | null> {
  return prisma.socialIntegration.findUnique({ where: { provider: INSTAGRAM_PROVIDER } });
}

export interface ConnectionWrite {
  connectedAccountId: string;
  authConfigId?: string | null;
  composioUserId: string;
  status: SocialIntegrationStatus;
}

/** Records (or replaces) the Composio connected-account association. */
export async function writeConnection(input: ConnectionWrite): Promise<void> {
  const now = new Date();
  const base = {
    status: input.status,
    connectedAccountId: input.connectedAccountId,
    authConfigId: input.authConfigId ?? null,
    composioUserId: input.composioUserId,
    connectedAt: now,
    disconnectedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  };
  await prisma.socialIntegration.upsert({
    where: { provider: INSTAGRAM_PROVIDER },
    create: { provider: INSTAGRAM_PROVIDER, ...base },
    update: base,
  });
}

export interface ProfileWrite {
  status: SocialIntegrationStatus;
  accountId?: string | null;
  username?: string | null;
  profileName?: string | null;
  profilePictureUrl?: string | null;
  accountType?: string | null;
  facebookPageId?: string | null;
  facebookPageName?: string | null;
  capabilities: InstagramCapability[];
  verifiedAt?: boolean;
  syncedAt?: boolean;
  error?: { code: string; message: string } | null;
}

/** Updates safe profile metadata + capabilities after a verify/sync. */
export async function writeProfile(input: ProfileWrite): Promise<void> {
  const now = new Date();
  const data: Prisma.SocialIntegrationUpdateInput = {
    status: input.status,
    capabilities: input.capabilities,
    ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.profileName !== undefined ? { profileName: input.profileName } : {}),
    ...(input.profilePictureUrl !== undefined ? { profilePictureUrl: input.profilePictureUrl } : {}),
    ...(input.accountType !== undefined ? { accountType: input.accountType } : {}),
    ...(input.facebookPageId !== undefined ? { facebookPageId: input.facebookPageId } : {}),
    ...(input.facebookPageName !== undefined ? { facebookPageName: input.facebookPageName } : {}),
    ...(input.verifiedAt ? { lastVerifiedAt: now } : {}),
    ...(input.syncedAt ? { lastSyncAt: now } : {}),
    lastErrorCode: input.error?.code ?? null,
    lastErrorMessage: input.error?.message ?? null,
  };
  await prisma.socialIntegration.update({ where: { provider: INSTAGRAM_PROVIDER }, data });
}

/** Records a sanitized error and a status without touching profile fields. */
export async function writeError(
  status: SocialIntegrationStatus,
  error: { code: string; message: string },
): Promise<void> {
  await prisma.socialIntegration.updateMany({
    where: { provider: INSTAGRAM_PROVIDER },
    data: { status, lastErrorCode: error.code, lastErrorMessage: error.message },
  });
}

/**
 * Unlinks the integration from Ghost.ma. Clears the Composio ids and marks the
 * row DISCONNECTED. Does NOT delete the Instagram account or the Composio
 * connection itself (that is a separate, explicitly-confirmed revoke).
 */
export async function writeUnlink(): Promise<void> {
  await prisma.socialIntegration.updateMany({
    where: { provider: INSTAGRAM_PROVIDER },
    data: {
      status: "DISCONNECTED",
      connectedAccountId: null,
      authConfigId: null,
      accountId: null,
      username: null,
      profileName: null,
      profilePictureUrl: null,
      accountType: null,
      facebookPageId: null,
      facebookPageName: null,
      capabilities: [],
      disconnectedAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Write-action idempotency ledger (comment replies + publishes)
// ---------------------------------------------------------------------------

export type InstagramActionKind = "COMMENT_REPLY" | "PUBLISH_MEDIA";

export type ActionClaim =
  | { claimed: true }
  | { claimed: false; status: "PENDING" | "SUCCESS"; resultId: string | null };

const ACTION_CLAIM_LEASE_MS = 5 * 60 * 1000;

/**
 * Atomically claims a public write before Composio is called. A plain
 * check-then-execute can race when two confirmations arrive together and post
 * twice; the unique key makes the initial create the lock. A recorded failure
 * may be retried, but only one caller can move it back to PENDING.
 */
export async function claimAction(input: {
  kind: InstagramActionKind;
  idempotencyKey: string;
  adminId: string;
  adminName: string;
  targetId?: string | null;
  caption?: string | null;
}): Promise<ActionClaim> {
  const data = {
    kind: input.kind,
    idempotencyKey: input.idempotencyKey,
    adminId: input.adminId,
    adminName: input.adminName,
    status: "PENDING",
    targetId: input.targetId ?? null,
    caption: input.caption ?? null,
  };
  try {
    await prisma.instagramActionRecord.create({ data });
    return { claimed: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
  }

  const retry = await prisma.instagramActionRecord.updateMany({
    where: {
      idempotencyKey: input.idempotencyKey,
      OR: [
        { status: "FAILED" },
        { status: "PENDING", updatedAt: { lt: new Date(Date.now() - ACTION_CLAIM_LEASE_MS) } },
      ],
    },
    data: { ...data, resultId: null, errorMessage: null },
  });
  if (retry.count === 1) return { claimed: true };

  const existing = await prisma.instagramActionRecord.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { status: true, resultId: true },
  });
  return {
    claimed: false,
    status: existing?.status === "SUCCESS" ? "SUCCESS" : "PENDING",
    resultId: existing?.resultId ?? null,
  };
}

export interface RecordActionInput {
  kind: InstagramActionKind;
  idempotencyKey: string;
  adminId: string;
  adminName: string;
  status: "SUCCESS" | "FAILED";
  targetId?: string | null;
  resultId?: string | null;
  caption?: string | null;
  errorMessage?: string | null;
}

/**
 * Persists the outcome of an action previously reserved by {@link claimAction}.
 * The upsert also degrades safely if an older caller did not create a claim.
 */
export async function recordAction(input: RecordActionInput): Promise<void> {
  const data = {
    kind: input.kind,
    adminId: input.adminId,
    adminName: input.adminName,
    status: input.status,
    targetId: input.targetId ?? null,
    resultId: input.resultId ?? null,
    caption: input.caption ?? null,
    errorMessage: input.errorMessage ?? null,
  };
  await prisma.instagramActionRecord.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: { idempotencyKey: input.idempotencyKey, ...data },
    update: data,
  });
}

// ---------------------------------------------------------------------------
// Signed references for browser-supplied connected-account selection
// ---------------------------------------------------------------------------

function signingKey(): string {
  // AUTH_SECRET already gates the session cookie; reuse it so no new secret is
  // required. Falls back to a constant only in the (test) case where it's unset.
  return process.env.AUTH_SECRET || "composio-instagram-ref";
}

/**
 * Opaque, NON-reversible reference for a Composio connected-account id, handed to
 * the browser during discovery. It is an HMAC of the id — the raw id never leaves
 * the server. The browser echoes the ref back to link; we recover the id by
 * matching the ref against the (server-listed) candidate ids, so a
 * forged/arbitrary connected-account id from the client can never be linked.
 */
export function accountRef(connectedAccountId: string): string {
  return createHmac("sha256", signingKey()).update(connectedAccountId).digest("base64url");
}

/** Constant-time compare of two refs. */
function refEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Given a ref from the browser and the server's list of candidate connected-
 * account ids, returns the matching id (or null). The id set comes from Composio
 * server-side — the client only ever holds the opaque ref.
 */
export function matchAccountRef(ref: string, candidateIds: string[]): string | null {
  if (!ref) return null;
  for (const id of candidateIds) {
    if (refEquals(accountRef(id), ref)) return id;
  }
  return null;
}
