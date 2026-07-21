/**
 * AI Operations overview snapshot (spec §1).
 *
 * Server-only aggregator that assembles everything the overview page shows:
 * global status, per-module status, last success/failure, pending approvals,
 * recent activity, estimated usage & cost, integration + Discord health, and
 * module warnings. Read-only; safe to call on every page load.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isDiscordEnabled } from "@/lib/discord/config";
import type { OpsHealthStatus } from "@/lib/dto";
import { getAiOpsSettings, listModuleConfigs, type AiModuleConfigDTO } from "./store";
import { countPendingApprovals } from "./approvalStore";
import { monthSpendUsd } from "./executions";
import { isProviderConfigured } from "./config";
import { isAiProvider } from "./types";

export interface ModuleStatusDTO {
  module: string;
  label: string;
  enabled: boolean;
  executionMode: string;
  status: OpsHealthStatus;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  grantedToolCount: number;
  warning: string | null;
}

export interface RecentActivityDTO {
  kind: "execution" | "tool_call" | "approval";
  module: string;
  label: string;
  status: string;
  at: string;
}

export interface AiOpsSnapshot {
  globalEnabled: boolean;
  globalStatus: OpsHealthStatus;
  providerConfigured: boolean;
  defaultProvider: string;
  defaultModel: string;
  timezone: string;
  discordConnected: boolean;
  modules: ModuleStatusDTO[];
  pendingApprovals: number;
  recentActivity: RecentActivityDTO[];
  usage: {
    monthSpendUsd: number;
    monthlyBudgetUsd: number;
    warningThresholdUsd: number;
    hardLimitUsd: number;
    executionsToday: number;
    toolCallsToday: number;
  };
  warnings: { severity: "critical" | "warning" | "info"; title: string; description: string }[];
  generatedAt: string;
}

function moduleStatus(m: AiModuleConfigDTO): OpsHealthStatus {
  if (!m.enabled) return "unknown";
  if (m.lastStatus === "failure") return "offline";
  if (m.grantedTools.length === 0) return "warning";
  if (m.lastStatus === "success" || m.lastStatus == null) return "healthy";
  return "healthy";
}

function moduleWarning(m: AiModuleConfigDTO): string | null {
  if (m.enabled && m.grantedTools.length === 0) return "Enabled but has no tool permissions.";
  if (m.lastStatus === "failure" && m.lastError) return `Last run failed: ${m.lastError}`;
  return null;
}

function startOfDayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getAiOpsSnapshot(): Promise<AiOpsSnapshot> {
  const now = new Date();
  const [settings, modules, pendingApprovals, spend] = await Promise.all([
    getAiOpsSettings(),
    listModuleConfigs(),
    countPendingApprovals(),
    monthSpendUsd(now),
  ]);

  const dayStart = startOfDayUtc(now);
  const [executionsToday, toolCallsToday, recentExecutions, recentApprovals] = await Promise.all([
    prisma.aiExecution.count({ where: { createdAt: { gte: dayStart } } }).catch(() => 0),
    prisma.aiToolCallLog.count({ where: { createdAt: { gte: dayStart } } }).catch(() => 0),
    prisma.aiExecution
      .findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { module: true, status: true, trigger: true, createdAt: true } })
      .catch(() => []),
    prisma.aiApproval
      .findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { module: true, actionType: true, status: true, createdAt: true } })
      .catch(() => []),
  ]);

  const moduleStatuses: ModuleStatusDTO[] = modules.map((m) => ({
    module: m.module,
    label: m.label,
    enabled: m.enabled,
    executionMode: m.executionMode,
    status: moduleStatus(m),
    lastRunAt: m.lastRunAt?.toISOString() ?? null,
    lastSuccessAt: m.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: m.lastFailureAt?.toISOString() ?? null,
    lastError: m.lastError,
    grantedToolCount: m.grantedTools.length,
    warning: moduleWarning(m),
  }));

  const providerConfigured = isAiProvider(settings.defaultProvider)
    ? isProviderConfigured(settings.defaultProvider)
    : false;

  const globalStatus: OpsHealthStatus = !settings.globalEnabled
    ? "unknown"
    : moduleStatuses.some((m) => m.status === "offline")
      ? "warning"
      : "healthy";

  const recentActivity: RecentActivityDTO[] = [
    ...recentExecutions.map((e) => ({
      kind: "execution" as const,
      module: e.module,
      label: `Execution (${e.trigger})`,
      status: e.status,
      at: e.createdAt.toISOString(),
    })),
    ...recentApprovals.map((a) => ({
      kind: "approval" as const,
      module: a.module,
      label: `Approval: ${a.actionType}`,
      status: a.status,
      at: a.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  const warnings: AiOpsSnapshot["warnings"] = [];
  if (!settings.globalEnabled) {
    warnings.push({ severity: "info", title: "AI Operations is disabled", description: "The global kill switch is off; no module runs." });
  }
  if (settings.globalEnabled && !providerConfigured) {
    warnings.push({
      severity: "warning",
      title: "No AI provider configured",
      description: `Provider "${settings.defaultProvider}" has no API key; the mock provider is used.`,
    });
  }
  if (settings.globalEnabled && !isDiscordEnabled()) {
    warnings.push({ severity: "info", title: "Discord not connected", description: "Discord integration is disabled; channel routing is inactive." });
  }
  if (settings.hardLimitUsd > 0 && spend >= settings.hardLimitUsd) {
    warnings.push({ severity: "critical", title: "Monthly hard limit reached", description: "AI executions are blocked until the limit is raised or the month rolls over." });
  } else if (settings.warningThresholdUsd > 0 && spend >= settings.warningThresholdUsd) {
    warnings.push({ severity: "warning", title: "AI budget warning threshold crossed", description: `Estimated month spend $${spend.toFixed(2)} of $${settings.monthlyBudgetUsd.toFixed(2)}.` });
  }
  for (const m of moduleStatuses) {
    if (m.warning) warnings.push({ severity: m.status === "offline" ? "critical" : "warning", title: `${m.label}`, description: m.warning });
  }

  return {
    globalEnabled: settings.globalEnabled,
    globalStatus,
    providerConfigured,
    defaultProvider: settings.defaultProvider,
    defaultModel: settings.defaultModel,
    timezone: settings.timezone,
    discordConnected: isDiscordEnabled(),
    modules: moduleStatuses,
    pendingApprovals,
    recentActivity,
    usage: {
      monthSpendUsd: spend,
      monthlyBudgetUsd: settings.monthlyBudgetUsd,
      warningThresholdUsd: settings.warningThresholdUsd,
      hardLimitUsd: settings.hardLimitUsd,
      executionsToday,
      toolCallsToday,
    },
    warnings,
    generatedAt: now.toISOString(),
  };
}
