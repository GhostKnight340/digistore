/**
 * AI Operations — per-"department" (module) detail snapshot for the Command
 * Center's department view (Phase 2).
 *
 * Read-only aggregator behind /admin/ai-operations/modules/[module]. Composes
 * the module's stored config with REAL performance figures computed from its
 * executions: a 7-day success rate, average response time, today's cost against
 * the module's daily cap, a sparkline, and the recent execution history. No
 * invented data — fields the design mocked (personality copy, etc.) are replaced
 * by the module's real description and tool grants. Server-only.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getModuleConfig, type AiModuleConfigDTO } from "./store";
import { getAiOpsSettings } from "./store";
import { MODULE_DEFINITIONS, isModuleKey, TOOL_NAMES, type ToolName } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const SPARK_DAYS = 7;

export interface DeptHistoryRow {
  id: string;
  trigger: string;
  status: string;
  startedAt: string;
  durationMs: number | null;
  summary: string | null;
  error: string | null;
}

export interface DeptPerformance {
  execToday: number;
  costTodayUsd: number;
  maxDailyCostUsd: number;
  budgetUsagePct: number;
  successRatePct: number | null;
  avgResponseMs: number | null;
  /** 7-day success ratio; null when the module has not run (no data). */
  health: number | null;
  spark: number[];
  totalRuns7d: number;
}

export interface DeptToolGrant {
  name: ToolName;
  granted: boolean;
}

export interface DepartmentDetail {
  config: AiModuleConfigDTO;
  defaultModel: string;
  color: string;
  /** Real "responsibilities" = the module's description split into points. */
  description: string;
  performance: DeptPerformance;
  tools: DeptToolGrant[];
  grantedCount: number;
  history: DeptHistoryRow[];
  lastSummary: string | null;
}

const DEPT_COLORS: Record<string, string> = {
  daily_reports: "#5b8cff",
  discord_assistant: "#818cf8",
  business_intelligence: "#a78bfa",
  marketing_assistant: "#f472b6",
  meta_ads_intelligence: "#38bdf8",
  supplier_intelligence: "#fb923c",
  support_assistant: "#4ade80",
};

function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function dayBucket(at: Date, todayStart: Date): number {
  const diffDays = Math.floor((todayStart.getTime() - startOfDayUtc(at).getTime()) / DAY_MS);
  if (diffDays < 0 || diffDays >= SPARK_DAYS) return -1;
  return SPARK_DAYS - 1 - diffDays;
}

/** Returns null for an unknown module (caller maps to a 404). */
export async function getDepartmentDetail(module: string): Promise<DepartmentDetail | null> {
  const config = await getModuleConfig(module);
  if (!config) return null;

  const now = new Date();
  const todayStart = startOfDayUtc(now);
  const weekStart = new Date(todayStart.getTime() - (SPARK_DAYS - 1) * DAY_MS);

  const [settings, execRows, historyRows] = await Promise.all([
    getAiOpsSettings(),
    prisma.aiExecution
      .findMany({
        where: { module, createdAt: { gte: weekStart } },
        select: { status: true, createdAt: true, durationMs: true, estimatedCostUsd: true },
      })
      .catch(() => [] as { status: string; createdAt: Date; durationMs: number | null; estimatedCostUsd: unknown }[]),
    prisma.aiExecution
      .findMany({
        where: { module },
        orderBy: { startedAt: "desc" },
        take: 12,
        select: { id: true, trigger: true, status: true, startedAt: true, durationMs: true, summary: true, error: true },
      })
      .catch(() => [] as { id: string; trigger: string; status: string; startedAt: Date; durationMs: number | null; summary: string | null; error: string | null }[]),
  ]);

  const spark = new Array(SPARK_DAYS).fill(0);
  let execToday = 0;
  let costTodayUsd = 0;
  let success7 = 0;
  let durSum = 0;
  let durCount = 0;
  for (const e of execRows) {
    const b = dayBucket(e.createdAt, todayStart);
    if (b >= 0) spark[b] += 1;
    if (e.status === "success") success7 += 1;
    if (e.durationMs != null) {
      durSum += e.durationMs;
      durCount += 1;
    }
    if (e.createdAt >= todayStart) {
      execToday += 1;
      costTodayUsd += e.estimatedCostUsd == null ? 0 : Number(e.estimatedCostUsd);
    }
  }
  const total7 = execRows.length;
  const successRatePct = total7 > 0 ? Math.round((success7 / total7) * 100) : null;
  const health = total7 > 0 ? Math.round((success7 / total7) * 100) : null;
  const maxDailyCostUsd = config.maxDailyCostUsd;
  const budgetUsagePct = maxDailyCostUsd > 0 ? Math.min(100, Math.round((costTodayUsd / maxDailyCostUsd) * 100)) : 0;

  const grantedSet = new Set<string>(config.grantedTools);
  const tools: DeptToolGrant[] = TOOL_NAMES.map((name) => ({ name, granted: grantedSet.has(name) }));

  const def = isModuleKey(module) ? MODULE_DEFINITIONS[module] : null;

  return {
    config,
    defaultModel: settings.defaultModel,
    color: DEPT_COLORS[module] ?? "#5b8cff",
    description: def?.description ?? config.description,
    performance: {
      execToday,
      costTodayUsd,
      maxDailyCostUsd,
      budgetUsagePct,
      successRatePct,
      avgResponseMs: durCount > 0 ? Math.round(durSum / durCount) : null,
      health,
      spark,
      totalRuns7d: total7,
    },
    tools,
    grantedCount: grantedSet.size,
    history: historyRows.map((h) => ({
      id: h.id,
      trigger: h.trigger,
      status: h.status,
      startedAt: h.startedAt.toISOString(),
      durationMs: h.durationMs,
      summary: h.summary,
      error: h.error,
    })),
    lastSummary: historyRows.find((h) => h.summary)?.summary ?? null,
  };
}
