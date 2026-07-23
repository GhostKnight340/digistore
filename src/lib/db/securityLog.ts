import "server-only";

import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { notifySystemAlert } from "@/lib/discord/notify";

/**
 * Audit trail for PUBLIC / guest security events — distinct from AdminAuditLog
 * (which is admin-scoped). Records suspicious activity on unauthenticated
 * surfaces (failed / unauthorized / rate-limited order lookups) into
 * SecurityEvent, and escalates to a Discord alert once a correlated identity or
 * IP crosses a threshold within the window.
 *
 * The raw lookup identifier (an email) is NEVER stored — only a salted hash, for
 * correlation. Discord alerts show a masked email, never the address.
 */

export type SecurityEventKind =
  | "order_lookup_failed"
  | "order_lookup_unauthorized"
  | "order_lookup_ratelimited";

const WINDOW_MS = 60 * 60 * 1000;
/** Fire a Discord alert on every Nth correlated suspicious event in the window. */
const ALERT_EVERY = 15;

function hashIdentifier(identifier: string): string {
  const salt = process.env.SECURITY_LOG_SALT || "ghost-security-log";
  return createHash("sha256").update(`${salt}:${identifier.trim().toLowerCase()}`).digest("hex");
}

/** "ab***@example.com" — enough to correlate in an alert without leaking the address. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}${local.length > 2 ? "***" : ""}@${domain}`;
}

/**
 * Record one suspicious event (best-effort; never throws — a logging failure must
 * not change the caller's security decision). Returns the count of correlated
 * events (same hashed identifier OR same IP) in the trailing window, so the
 * caller/escalation can reason about repetition.
 */
export async function logSecurityEvent(input: {
  kind: SecurityEventKind;
  ip?: string | null;
  /** Raw identifier (e.g. email). Hashed before storage; never persisted raw. */
  identifier?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<{ recentCount: number }> {
  const identifierHash = input.identifier ? hashIdentifier(input.identifier) : null;
  try {
    await prisma.securityEvent.create({
      data: {
        kind: input.kind,
        ip: input.ip ?? null,
        identifierHash,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    const or: Prisma.SecurityEventWhereInput[] = [];
    if (identifierHash) or.push({ identifierHash });
    if (input.ip && input.ip !== "unknown") or.push({ ip: input.ip });
    if (or.length === 0) return { recentCount: 0 };

    const recentCount = await prisma.securityEvent.count({
      where: { createdAt: { gte: new Date(Date.now() - WINDOW_MS) }, OR: or },
    });

    if (recentCount > 0 && recentCount % ALERT_EVERY === 0) {
      // notifySystemAlert never throws (fire-and-forget).
      notifySystemAlert({
        scope: "security",
        message: `Activité de recherche de commande suspecte (${input.kind})`,
        context: {
          recent: recentCount,
          ip: input.ip ?? "unknown",
          identifier: input.identifier ? maskEmail(input.identifier) : "n/a",
        },
      });
    }

    return { recentCount };
  } catch {
    return { recentCount: 0 };
  }
}
