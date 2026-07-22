/**
 * Prompt-caching metrics for the AI Operations usage interface.
 *
 * Aggregates the per-call caching accounting on AiUsageRecord over a time range,
 * grouped overall and by model / module / provider. Uses ONLY the recorded token
 * counts and the centralized price table (usage.ts) — never prompt contents.
 *
 * The figures deliberately distinguish four states so the admin is never misled
 * (spec: "Do not label every cache-enabled request as a hit"):
 *   - caching enabled  — the module wanted caching (cacheEnabled = true);
 *   - cache created    — a write happened (the ~1.25×/2× premium was paid);
 *   - cache hit        — a read happened (the real win);
 *   - no cache activity — enabled but both token counts were zero.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { priceFor } from "./usage";
import { cacheWriteMultiplier, CACHE_READ_MULTIPLIER, isCacheTtl, type CacheTtl } from "./caching";

export interface CacheMetricGroup {
  key: string;
  cacheEnabledRequests: number;
  cacheHitRequests: number;
  cacheWriteRequests: number;
  noCacheActivityRequests: number;
  /** hits ÷ enabled, 0–1. */
  hitRate: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  uncachedInputTokens: number;
  /** Gross saved on reads (vs paying full price for those tokens). */
  estimatedSavedUsd: number;
  /** Extra paid on writes (the premium above base input price). */
  estimatedWriteCostUsd: number;
  /** estimatedSaved − estimatedWriteCost. */
  netSavingsUsd: number;
}

export interface CacheMetrics {
  rangeDays: number;
  overall: CacheMetricGroup;
  byModel: CacheMetricGroup[];
  byModule: CacheMetricGroup[];
  byProvider: CacheMetricGroup[];
  generatedAt: string;
}

interface UsageRow {
  module: string;
  provider: string;
  model: string;
  tokensIn: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cacheHit: boolean;
  cacheCreated: boolean;
  cacheTtl: string | null;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Mutable accumulator, finalized into a CacheMetricGroup. */
interface Acc {
  key: string;
  enabled: number;
  hit: number;
  write: number;
  noActivity: number;
  readTokens: number;
  writeTokens: number;
  uncachedTokens: number;
  saved: number;
  writeCost: number;
}

function newAcc(key: string): Acc {
  return { key, enabled: 0, hit: 0, write: 0, noActivity: 0, readTokens: 0, writeTokens: 0, uncachedTokens: 0, saved: 0, writeCost: 0 };
}

function accumulate(acc: Acc, row: UsageRow): void {
  const inRate = priceFor(row.model).inPerMTok / 1_000_000;
  const ttl: CacheTtl = isCacheTtl(row.cacheTtl) ? row.cacheTtl : "5m";
  acc.enabled += 1;
  if (row.cacheHit) acc.hit += 1;
  if (row.cacheCreated) acc.write += 1;
  if (!row.cacheHit && !row.cacheCreated) acc.noActivity += 1;
  acc.readTokens += row.cacheReadTokens;
  acc.writeTokens += row.cacheCreationTokens;
  acc.uncachedTokens += row.tokensIn;
  // Reads cost 0.1× base → saved 0.9× base per read token.
  acc.saved += row.cacheReadTokens * inRate * (1 - CACHE_READ_MULTIPLIER);
  // Writes cost writeMult× base → premium is (writeMult−1)× base per write token.
  acc.writeCost += row.cacheCreationTokens * inRate * (cacheWriteMultiplier(ttl) - 1);
}

function finalize(acc: Acc): CacheMetricGroup {
  const saved = round6(acc.saved);
  const writeCost = round6(acc.writeCost);
  return {
    key: acc.key,
    cacheEnabledRequests: acc.enabled,
    cacheHitRequests: acc.hit,
    cacheWriteRequests: acc.write,
    noCacheActivityRequests: acc.noActivity,
    hitRate: acc.enabled > 0 ? acc.hit / acc.enabled : 0,
    cacheReadTokens: acc.readTokens,
    cacheCreationTokens: acc.writeTokens,
    uncachedInputTokens: acc.uncachedTokens,
    estimatedSavedUsd: saved,
    estimatedWriteCostUsd: writeCost,
    netSavingsUsd: round6(saved - writeCost),
  };
}

function groupBy(rows: UsageRow[], keyOf: (r: UsageRow) => string): CacheMetricGroup[] {
  const map = new Map<string, Acc>();
  for (const row of rows) {
    const key = keyOf(row);
    let acc = map.get(key);
    if (!acc) {
      acc = newAcc(key);
      map.set(key, acc);
    }
    accumulate(acc, row);
  }
  return [...map.values()].map(finalize).sort((a, b) => b.netSavingsUsd - a.netSavingsUsd);
}

/** Aggregates cache-enabled usage records over the last `rangeDays` (UTC). */
export async function getCacheMetrics(rangeDays = 7): Promise<CacheMetrics> {
  const since = new Date(Date.now() - Math.max(1, rangeDays) * 24 * 60 * 60 * 1000);
  const raw = await prisma.aiUsageRecord
    .findMany({
      where: { cacheEnabled: true, createdAt: { gte: since } },
      select: {
        module: true,
        provider: true,
        model: true,
        tokensIn: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        cacheHit: true,
        cacheCreated: true,
        cacheTtl: true,
      },
      take: 20_000,
    })
    .catch(() => []);

  const rows: UsageRow[] = raw.map((r) => ({
    module: r.module,
    provider: r.provider,
    model: r.model,
    tokensIn: r.tokensIn,
    cacheCreationTokens: r.cacheCreationTokens,
    cacheReadTokens: r.cacheReadTokens,
    cacheHit: r.cacheHit,
    cacheCreated: r.cacheCreated,
    cacheTtl: r.cacheTtl,
  }));

  const overallAcc = newAcc("overall");
  for (const row of rows) accumulate(overallAcc, row);

  return {
    rangeDays,
    overall: finalize(overallAcc),
    byModel: groupBy(rows, (r) => r.model),
    byModule: groupBy(rows, (r) => r.module),
    byProvider: groupBy(rows, (r) => r.provider),
    generatedAt: new Date().toISOString(),
  };
}
