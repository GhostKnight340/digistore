/**
 * Conversation memory — the PURE core (no DB, no server-only).
 *
 * Owns the parts that must be exactly right and are unit-testable: the identity
 * KEY (so context never mixes across users/channels/threads/departments), TTL
 * expiry, the message-cap trim + rolling summary of dropped turns, and text
 * redaction applied before anything is persisted. The DB-backed store
 * (conversationStore.ts) composes these.
 */

export interface ConversationIdentity {
  guildId: string;
  channelId: string;
  threadId?: string | null;
  discordUserId: string;
  /** Department/module, e.g. "discord_assistant". */
  module: string;
}

export interface ConvTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Deterministic identity key. Distinct identities → distinct keys, so two users,
 * two channels, two threads, or two departments can never share a conversation.
 */
export function conversationKey(id: ConversationIdentity): string {
  return [id.guildId, id.channelId, id.threadId ?? "-", id.discordUserId, id.module]
    .map((p) => String(p).replace(/[:|]/g, "_"))
    .join(":");
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function nextExpiry(ttlMinutes: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + Math.max(1, ttlMinutes) * 60_000);
}

/** Fold dropped turns into a bounded, secret-free rolling summary. Deterministic. */
export function summarize(prev: string | null | undefined, dropped: ConvTurn[]): string {
  const parts: string[] = [];
  if (prev && prev.trim()) parts.push(prev.trim());
  for (const t of dropped) {
    const who = t.role === "user" ? "Q" : "A";
    parts.push(`${who}: ${t.content.replace(/\s+/g, " ").trim().slice(0, 120)}`);
  }
  return parts.join(" | ").slice(0, 1000);
}

/**
 * Append incoming turns to the retained messages, keep at most `messageLimit`
 * (the most recent), and fold any dropped older turns into the summary.
 */
export function foldConversation(
  existing: { messages: ConvTurn[]; summary?: string | null },
  incoming: ConvTurn[],
  messageLimit: number,
): { messages: ConvTurn[]; summary: string | null; dropped: ConvTurn[] } {
  const cap = Math.max(2, messageLimit);
  const all = [...existing.messages, ...incoming];
  if (all.length <= cap) {
    return { messages: all, summary: existing.summary ?? null, dropped: [] };
  }
  const dropped = all.slice(0, all.length - cap);
  const kept = all.slice(all.length - cap);
  return { messages: kept, summary: summarize(existing.summary, dropped), dropped };
}

/**
 * Strip obvious secrets from free text before it is stored or sent to the model
 * (bearer/API tokens, long hex/base64 blobs, activation codes). Business figures
 * and order numbers are intentionally preserved.
 */
export function redactText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9-_]{16,}\b/g, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, "Bearer [redacted]")
    .replace(/\bGHOST-[A-Z0-9]{6}\b/gi, "[code]")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted]")
    .slice(0, 2000);
}
