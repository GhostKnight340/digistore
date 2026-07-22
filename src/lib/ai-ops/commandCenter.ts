/**
 * AI Operations Command Center snapshot.
 *
 * A richer read-only aggregator for the redesigned overview ("command center"):
 * it composes the existing {@link getAiOpsSnapshot} (global status, usage,
 * warnings, recent activity) and enriches it with the per-"department" figures
 * the new UI shows — today's executions/cost, a 7-day sparkline, a derived
 * health score — plus the reports, conversations and pending approvals panels.
 *
 * EVERY figure here is real (Prisma / the existing stores). Panels the design
 * mocks but for which no data source exists yet (AI "memory" size, integration
 * latencies, time saved) are intentionally omitted rather than invented.
 * Server-only; safe to call on every page load.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getAiOpsSnapshot, type AiOpsSnapshot } from "./dashboard";
import { listModuleConfigs } from "./store";
import { listApprovals } from "./approvalStore";
import { listReportSchedules, nextRunAt } from "./reports/reportStore";
import { listConversationMetadata } from "./discord/conversationStore";
import { MODULE_DEFINITIONS, moduleLabel, isModuleKey, type ExecutionMode } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const SPARK_DAYS = 7;

/** Design status for a module card — drives its colour + label in the UI. */
export type DeptStatus = "autonomous" | "active" | "idle" | "error" | "off";

export interface DeptDTO {
  module: string;
  label: string;
  description: string;
  model: string;
  executionMode: ExecutionMode | string;
  status: DeptStatus;
  /** Short line under the title: last error, "never run", or the description. */
  currentActivity: string;
  execToday: number;
  costTodayUsd: number;
  grantedToolCount: number;
  /** 0-100 health from the module's 7-day success ratio; null when it has not
   *  run in the last 7 days (no data — shown as "—", excluded from the average). */
  health: number | null;
  /** 7 daily execution counts, oldest → today. */
  spark: number[];
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export interface DeptReportDTO {
  reportType: string;
  name: string;
  enabled: boolean;
  status: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface DeptApprovalDTO {
  id: string;
  module: string;
  deptLabel: string;
  actionType: string;
  summary: string;
  createdAt: string;
}

export interface DeptConversationDTO {
  key: string;
  module: string;
  label: string;
  preview: string;
  messageCount: number;
  lastActivityAt: string;
}

export interface IntegrationDTO {
  name: string;
  ok: boolean;
  detail: string;
}

export interface UsageSeriesDTO {
  /** 7 daily buckets, oldest → today. */
  executions: number[];
  toolCalls: number[];
  costUsd: number[];
}

export interface CommandCenterSnapshot {
  base: AiOpsSnapshot;
  departments: DeptDTO[];
  reports: DeptReportDTO[];
  approvals: DeptApprovalDTO[];
  conversations: DeptConversationDTO[];
  integrations: IntegrationDTO[];
  usageSeries: UsageSeriesDTO;
  insights: string[];
  /** Average health of modules that HAVE run in the last 7 days; null if none have. */
  healthScore: number | null;
  activeConversations: number;
  generatedAt: string;
}

function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Bucket index 0..SPARK_DAYS-1 (today = last) for an instant, or -1 if older. */
function dayBucket(at: Date, todayStart: Date): number {
  const diffDays = Math.floor((todayStart.getTime() - startOfDayUtc(at).getTime()) / DAY_MS);
  if (diffDays < 0 || diffDays >= SPARK_DAYS) return -1;
  return SPARK_DAYS - 1 - diffDays;
}

function deptStatus(enabled: boolean, mode: string, lastStatus: string | null, lastRunAt: Date | null): DeptStatus {
  if (!enabled) return "off";
  if (lastStatus === "failure") return "error";
  if (mode === "AUTONOMOUS") return "autonomous";
  if (!lastRunAt) return "idle";
  return "active";
}

export async function getCommandCenterSnapshot(): Promise<CommandCenterSnapshot> {
  const now = new Date();
  const todayStart = startOfDayUtc(now);
  const weekStart = new Date(todayStart.getTime() - (SPARK_DAYS - 1) * DAY_MS);

  const [base, configs, execRows, toolRows, reportSchedules, approvalRows, conversationRows] = await Promise.all([
    getAiOpsSnapshot(),
    listModuleConfigs(),
    prisma.aiExecution
      .findMany({
        where: { createdAt: { gte: weekStart } },
        select: { module: true, status: true, createdAt: true, estimatedCostUsd: true },
      })
      .catch(() => [] as { module: string; status: string; createdAt: Date; estimatedCostUsd: unknown }[]),
    prisma.aiToolCallLog
      .findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } })
      .catch(() => [] as { createdAt: Date }[]),
    listReportSchedules().catch(() => []),
    listApprovals("PENDING").catch(() => []),
    listConversationMetadata(6).catch(() => []),
  ]);

  const configByModule = new Map(configs.map((c) => [c.module, c]));

  // Per-module 7-day rollups from a single execution scan.
  interface Roll {
    spark: number[];
    execToday: number;
    costTodayUsd: number;
    success7: number;
    total7: number;
  }
  const rolls = new Map<string, Roll>();
  const roll = (m: string): Roll => {
    let r = rolls.get(m);
    if (!r) {
      r = { spark: new Array(SPARK_DAYS).fill(0), execToday: 0, costTodayUsd: 0, success7: 0, total7: 0 };
      rolls.set(m, r);
    }
    return r;
  };
  for (const e of execRows) {
    const r = roll(e.module);
    const b = dayBucket(e.createdAt, todayStart);
    if (b >= 0) r.spark[b] += 1;
    r.total7 += 1;
    if (e.status === "success") r.success7 += 1;
    if (e.createdAt >= todayStart) {
      r.execToday += 1;
      r.costTodayUsd += e.estimatedCostUsd == null ? 0 : Number(e.estimatedCostUsd);
    }
  }

  const departments: DeptDTO[] = base.modules.map((m) => {
    const cfg = configByModule.get(m.module as never);
    const def = isModuleKey(m.module) ? MODULE_DEFINITIONS[m.module] : null;
    const r = rolls.get(m.module) ?? { spark: new Array(SPARK_DAYS).fill(0), execToday: 0, costTodayUsd: 0, success7: 0, total7: 0 };
    const lastStatus = cfg?.lastStatus ?? null;
    const status = deptStatus(m.enabled, m.executionMode, lastStatus, cfg?.lastRunAt ?? null);
    const health = r.total7 > 0 ? Math.round((r.success7 / r.total7) * 100) : null;
    const currentActivity =
      status === "error" && m.lastError
        ? m.lastError
        : !m.lastSuccessAt && !m.lastFailureAt
          ? "Jamais exécuté"
          : def?.description ?? m.label;
    return {
      module: m.module,
      label: m.label,
      description: def?.description ?? "",
      model: cfg?.modelOverride || base.defaultModel,
      executionMode: m.executionMode,
      status,
      currentActivity,
      execToday: r.execToday,
      costTodayUsd: r.costTodayUsd,
      grantedToolCount: m.grantedToolCount,
      health,
      spark: r.spark,
      lastSuccessAt: m.lastSuccessAt,
      lastFailureAt: m.lastFailureAt,
    };
  });

  // 7-day totals for the usage charts.
  const executions = new Array(SPARK_DAYS).fill(0);
  const costUsd = new Array(SPARK_DAYS).fill(0);
  for (const e of execRows) {
    const b = dayBucket(e.createdAt, todayStart);
    if (b < 0) continue;
    executions[b] += 1;
    costUsd[b] += e.estimatedCostUsd == null ? 0 : Number(e.estimatedCostUsd);
  }
  const toolCalls = new Array(SPARK_DAYS).fill(0);
  for (const t of toolRows) {
    const b = dayBucket(t.createdAt, todayStart);
    if (b >= 0) toolCalls[b] += 1;
  }

  const reports: DeptReportDTO[] = reportSchedules.map((s) => ({
    reportType: s.reportType,
    name: reportName(s.reportType),
    enabled: s.enabled,
    status: s.status,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    nextRunAt: s.enabled ? (nextRunAt(s, base.timezone, now)?.toISOString() ?? null) : null,
  }));

  const approvals: DeptApprovalDTO[] = approvalRows.map((a) => ({
    id: a.id,
    module: a.module,
    deptLabel: moduleLabel(a.module),
    actionType: a.actionType,
    summary: a.summary,
    createdAt: a.createdAt.toISOString(),
  }));

  const conversations: DeptConversationDTO[] = conversationRows.map((c) => ({
    key: c.key,
    module: c.module,
    label: moduleLabel(c.module),
    preview: c.activeRange ? `Plage active : ${c.activeRange}` : `${c.messageCount} message(s) mémorisés`,
    messageCount: c.messageCount,
    lastActivityAt: c.lastActivityAt.toISOString(),
  }));

  const integrations: IntegrationDTO[] = [
    { name: `Provider · ${base.defaultProvider}`, ok: base.providerConfigured, detail: base.providerConfigured ? "clé configurée" : "mock (aucune clé)" },
    { name: "Discord", ok: base.discordConnected, detail: base.discordConnected ? "connecté" : "désactivé" },
    { name: "Scheduler", ok: base.globalEnabled, detail: base.globalEnabled ? "actif" : "désactivé" },
    { name: "Base de données", ok: true, detail: "connectée" },
  ];

  // Insights: real signals only (warnings + a couple of derived facts).
  const enabledCount = departments.filter((d) => d.status !== "off").length;
  const insights: string[] = [
    ...base.warnings.map((w) => `${w.title} — ${w.description}`),
    `${enabledCount} module(s) actif(s) sur ${departments.length} configurés.`,
    base.pendingApprovals > 0
      ? `${base.pendingApprovals} approbation(s) en attente de votre revue.`
      : "Aucune approbation en attente.",
  ].slice(0, 6);

  // Honest score: average only modules that actually ran (health !== null), so an
  // idle module that has never executed doesn't inflate the score with a fake 100.
  const scored = departments.filter((d): d is DeptDTO & { health: number } => d.health !== null);
  const healthScore = scored.length
    ? Math.round(scored.reduce((sum, d) => sum + d.health, 0) / scored.length)
    : null;

  const activeConversations = conversations.filter(
    (c) => now.getTime() - new Date(c.lastActivityAt).getTime() < 60 * 60 * 1000,
  ).length;

  return {
    base,
    departments,
    reports,
    approvals,
    conversations,
    integrations,
    usageSeries: { executions, toolCalls, costUsd },
    insights,
    healthScore,
    activeConversations,
    generatedAt: now.toISOString(),
  };
}

function reportName(type: string): string {
  switch (type) {
    case "morning":
      return "Morning Brief";
    case "evening":
      return "Rapport de fin de journée";
    case "weekly":
      return "Rapport hebdomadaire";
    case "monthly":
      return "Rapport mensuel";
    default:
      return type;
  }
}
