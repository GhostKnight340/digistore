/**
 * Database-backed conversation memory (spec §3). Replaces the old worker-RAM
 * store so context survives worker restarts and is shared across app instances.
 *
 * Composes the pure logic in conversationBuffer.ts (key/isolation, expiry,
 * trim+summary, redaction). Only the minimum is persisted; redaction runs before
 * any write; expired rows are pruned on access. Never throws (best-effort).
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  conversationKey,
  foldConversation,
  isExpired,
  nextExpiry,
  redactText,
  type ConversationIdentity,
  type ConvTurn,
} from "./conversationBuffer";

/** Defaults until wired to AI Operations settings (spec §10, later phase). */
export const CONVERSATION_DEFAULTS = { messageLimit: 10, ttlMinutes: 30 };

export interface ConversationOptions {
  messageLimit?: number;
  ttlMinutes?: number;
  activeRange?: string | null;
}

export interface LoadedConversation {
  history: ConvTurn[];
  summary: string | null;
  activeRange: string | null;
}

async function safely<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function toTurn(m: { role: string; content: string }): ConvTurn {
  return { role: m.role === "assistant" ? "assistant" : "user", content: m.content };
}

/** Recent turns + summary for a conversation. Prunes an expired row and returns empty. */
export async function loadConversation(
  identity: ConversationIdentity,
  now: Date = new Date(),
): Promise<LoadedConversation> {
  const key = conversationKey(identity);
  const conv = await safely(() =>
    prisma.aiConversation.findUnique({
      where: { key },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
  );
  if (!conv) return { history: [], summary: null, activeRange: null };
  if (isExpired(conv.expiresAt, now)) {
    await safely(() => prisma.aiConversation.delete({ where: { key } }));
    return { history: [], summary: null, activeRange: null };
  }
  return { history: conv.messages.map(toTurn), summary: conv.summary, activeRange: conv.activeRange };
}

/** Append a user+assistant turn, trim to the cap, fold overflow into the summary. */
export async function appendTurn(
  identity: ConversationIdentity,
  userText: string,
  assistantText: string,
  opts: ConversationOptions = {},
  now: Date = new Date(),
): Promise<void> {
  const messageLimit = opts.messageLimit ?? CONVERSATION_DEFAULTS.messageLimit;
  const ttlMinutes = opts.ttlMinutes ?? CONVERSATION_DEFAULTS.ttlMinutes;
  const key = conversationKey(identity);
  const incoming: ConvTurn[] = [
    { role: "user", content: redactText(userText) },
    { role: "assistant", content: redactText(assistantText) },
  ];

  await safely(() =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.aiConversation.findUnique({
        where: { key },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      const base =
        existing && !isExpired(existing.expiresAt, now)
          ? { messages: existing.messages.map(toTurn), summary: existing.summary }
          : { messages: [] as ConvTurn[], summary: null as string | null };
      const folded = foldConversation(base, incoming, messageLimit);
      const expiresAt = nextExpiry(ttlMinutes, now);

      const conv = await tx.aiConversation.upsert({
        where: { key },
        create: {
          key,
          guildId: identity.guildId,
          channelId: identity.channelId,
          threadId: identity.threadId ?? null,
          discordUserId: identity.discordUserId,
          module: identity.module,
          summary: folded.summary,
          activeRange: opts.activeRange ?? null,
          lastActivityAt: now,
          expiresAt,
        },
        update: {
          summary: folded.summary,
          activeRange: opts.activeRange ?? existing?.activeRange ?? null,
          lastActivityAt: now,
          expiresAt,
        },
      });
      // Replace the retained window; explicit incrementing createdAt preserves order.
      await tx.aiConversationMessage.deleteMany({ where: { conversationId: conv.id } });
      const baseMs = now.getTime();
      if (folded.messages.length > 0) {
        await tx.aiConversationMessage.createMany({
          data: folded.messages.map((m, i) => ({
            conversationId: conv.id,
            role: m.role,
            content: m.content,
            createdAt: new Date(baseMs + i),
          })),
        });
      }
    }),
  );
}

/** The `reset` command: forget a conversation. Returns whether one existed. */
export async function resetConversation(identity: ConversationIdentity): Promise<boolean> {
  const key = conversationKey(identity);
  const res = await safely(() => prisma.aiConversation.deleteMany({ where: { key } }));
  return (res?.count ?? 0) > 0;
}

// ── Admin inspection (metadata only — never message content or secrets) ───────

export interface ConversationMetadata {
  key: string;
  guildId: string;
  channelId: string;
  threadId: string | null;
  discordUserId: string;
  module: string;
  messageCount: number;
  hasSummary: boolean;
  activeRange: string | null;
  lastActivityAt: Date;
  expiresAt: Date;
}

/** Metadata for recent conversations (admin panel). No content is returned. */
export async function listConversationMetadata(limit = 50): Promise<ConversationMetadata[]> {
  const rows = await safely(() =>
    prisma.aiConversation.findMany({
      orderBy: { lastActivityAt: "desc" },
      take: Math.min(200, Math.max(1, limit)),
      select: {
        key: true,
        guildId: true,
        channelId: true,
        threadId: true,
        discordUserId: true,
        module: true,
        summary: true,
        activeRange: true,
        lastActivityAt: true,
        expiresAt: true,
        _count: { select: { messages: true } },
      },
    }),
  );
  return (rows ?? []).map((r) => ({
    key: r.key,
    guildId: r.guildId,
    channelId: r.channelId,
    threadId: r.threadId,
    discordUserId: r.discordUserId,
    module: r.module,
    messageCount: r._count.messages,
    hasSummary: Boolean(r.summary),
    activeRange: r.activeRange,
    lastActivityAt: r.lastActivityAt,
    expiresAt: r.expiresAt,
  }));
}

/** Admin action: clear one conversation by key. Returns whether it existed. */
export async function clearConversationByKey(key: string): Promise<boolean> {
  const res = await safely(() => prisma.aiConversation.deleteMany({ where: { key } }));
  return (res?.count ?? 0) > 0;
}
