import "server-only";

/**
 * Cache for the generated CEO Briefing — a single `StoreSetting` row (id
 * "ceo-briefing-cache"), the project's standard home for singleton blobs (no
 * schema change / migration). Survives serverless cold starts, unlike an
 * in-process cache. Only the non-sensitive briefing DTO + generation metadata is
 * stored — never the sanitized snapshot payload.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CeoBriefingDTO } from "@/lib/dto";

const SETTING_ID = "ceo-briefing-cache";

export interface CachedBriefing {
  briefing: CeoBriefingDTO;
  /** Epoch millis of generation, for TTL comparison. */
  generatedAtMs: number;
  /** Model that produced it, or null for the deterministic fallback. */
  model: string | null;
}

function isBriefing(v: unknown): v is CeoBriefingDTO {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return typeof b.state === "string" && typeof b.title === "string" && typeof b.snapshotHash === "string" && Array.isArray(b.actions);
}

export async function readBriefingCache(): Promise<CachedBriefing | null> {
  try {
    const row = await prisma.storeSetting.findUnique({ where: { id: SETTING_ID } });
    if (!row) return null;
    const value = row.value as Record<string, unknown> | null;
    if (!value || !isBriefing(value.briefing)) return null;
    return {
      briefing: value.briefing,
      generatedAtMs: typeof value.generatedAtMs === "number" ? value.generatedAtMs : 0,
      model: typeof value.model === "string" ? value.model : null,
    };
  } catch {
    return null; // cache is best-effort; a read failure just forces regeneration
  }
}

export async function writeBriefingCache(entry: CachedBriefing): Promise<void> {
  try {
    // Plain JSON for the Prisma Json column (the DTO is fully serializable).
    const value = {
      briefing: entry.briefing,
      generatedAtMs: entry.generatedAtMs,
      model: entry.model,
    } as unknown as Prisma.InputJsonValue;
    await prisma.storeSetting.upsert({
      where: { id: SETTING_ID },
      update: { value },
      create: { id: SETTING_ID, value },
    });
  } catch {
    /* best-effort; never let a cache write break the response */
  }
}
