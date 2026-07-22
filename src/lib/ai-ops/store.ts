/**
 * AI Operations persistence — global settings, module configs, permissions.
 *
 * Server-only data access over the singleton AiOpsSettings row and the
 * per-module AiModuleConfig / AiModulePermission rows. Mirrors the repo's
 * src/lib/db/* convention: thin, typed helpers over the shared prisma client,
 * returning plain DTOs (Decimals coerced to numbers) so callers never juggle
 * Prisma.Decimal.
 *
 * Defaults come from src/lib/ai-ops/types.ts (MODULE_DEFINITIONS,
 * DEFAULT_TOOL_GRANTS) so the seed and the spec stay in lockstep.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_TOOL_GRANTS,
  MODULE_DEFINITIONS,
  MODULE_KEYS,
  isModuleKey,
  isExecutionMode,
  type ExecutionMode,
  type ModuleKey,
  type ToolName,
} from "./types";
import { normalizeGrants } from "./permissions";
import { isCacheStrategy, isCacheTtl, type CacheStrategy, type CacheTtl } from "./caching";

const SETTINGS_ID = "default";

export interface AiOpsSettingsDTO {
  globalEnabled: boolean;
  timezone: string;
  reportLanguage: string;
  defaultProvider: string;
  defaultModel: string;
  monthlyBudgetUsd: number;
  warningThresholdUsd: number;
  hardLimitUsd: number;
  discordGuildId: string | null;
  defaultReportChannelId: string | null;
  defaultAlertChannelId: string | null;
  defaultApprovalChannelId: string | null;
  logRetentionDays: number;
  redactSensitive: boolean;
  conversationTtlMinutes: number;
  conversationMessageLimit: number;
  maxToolRounds: number;
  maxToolCallsPerExecution: number;
  providerTimeoutMs: number;
  providerMaxRetries: number;
  userRateLimitPerMin: number;
  globalRateLimitPerMin: number;
  supportBatchingWindowSec: number;
  supportEmailFallbackDelaySec: number;
}

export interface AiModuleConfigDTO {
  module: ModuleKey;
  label: string;
  description: string;
  enabled: boolean;
  executionMode: ExecutionMode;
  providerOverride: string | null;
  modelOverride: string | null;
  discordChannelId: string | null;
  schedule: string | null;
  maxExecutionsPerDay: number;
  maxDailyCostUsd: number;
  notifyOnFailure: boolean;
  /** Anthropic prompt caching (see src/lib/ai-ops/caching.ts). */
  promptCachingEnabled: boolean;
  promptCachingStrategy: CacheStrategy;
  promptCacheTtl: CacheTtl;
  instructions: string;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  grantedTools: ToolName[];
}

function num(value: { toNumber?: () => number } | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return typeof value.toNumber === "function" ? value.toNumber() : Number(value);
}

// ─── Global settings ─────────────────────────────────────────────────────────

/**
 * Reads the singleton settings row, creating it with defaults on first access
 * (idempotent upsert, like ensureDatabaseReady's StoreSetting seed).
 */
export async function getAiOpsSettings(): Promise<AiOpsSettingsDTO> {
  const row = await prisma.aiOpsSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
  return {
    globalEnabled: row.globalEnabled,
    timezone: row.timezone,
    reportLanguage: row.reportLanguage,
    defaultProvider: row.defaultProvider,
    defaultModel: row.defaultModel,
    monthlyBudgetUsd: num(row.monthlyBudgetUsd),
    warningThresholdUsd: num(row.warningThresholdUsd),
    hardLimitUsd: num(row.hardLimitUsd),
    discordGuildId: row.discordGuildId,
    defaultReportChannelId: row.defaultReportChannelId,
    defaultAlertChannelId: row.defaultAlertChannelId,
    defaultApprovalChannelId: row.defaultApprovalChannelId,
    logRetentionDays: row.logRetentionDays,
    redactSensitive: row.redactSensitive,
    conversationTtlMinutes: row.conversationTtlMinutes,
    conversationMessageLimit: row.conversationMessageLimit,
    maxToolRounds: row.maxToolRounds,
    maxToolCallsPerExecution: row.maxToolCallsPerExecution,
    providerTimeoutMs: row.providerTimeoutMs,
    providerMaxRetries: row.providerMaxRetries,
    userRateLimitPerMin: row.userRateLimitPerMin,
    globalRateLimitPerMin: row.globalRateLimitPerMin,
    supportBatchingWindowSec: row.supportBatchingWindowSec,
    supportEmailFallbackDelaySec: row.supportEmailFallbackDelaySec,
  };
}

export type AiOpsSettingsUpdate = Partial<AiOpsSettingsDTO>;

/** Persists a partial settings update. Only known columns are written. */
export async function updateAiOpsSettings(
  patch: AiOpsSettingsUpdate,
): Promise<AiOpsSettingsDTO> {
  await prisma.aiOpsSettings.upsert({
    where: { id: SETTINGS_ID },
    update: patch,
    create: { id: SETTINGS_ID, ...patch },
  });
  return getAiOpsSettings();
}

// ─── Module configs ──────────────────────────────────────────────────────────

/**
 * Ensures every module has a config row (seeded from MODULE_DEFINITIONS) and a
 * default permission grant set. Idempotent: existing rows are left untouched.
 * Safe to call on every dashboard load.
 */
export async function ensureModulesSeeded(): Promise<void> {
  for (const key of MODULE_KEYS) {
    const def = MODULE_DEFINITIONS[key];
    const existing = await prisma.aiModuleConfig.findUnique({ where: { module: key } });
    if (!existing) {
      await prisma.aiModuleConfig.create({
        data: {
          module: key,
          enabled: false,
          executionMode: def.defaultMode,
          schedule: def.defaultSchedule,
          permissions: {
            create: DEFAULT_TOOL_GRANTS[key].map((tool) => ({ tool })),
          },
        },
      });
    }
  }
}

function toModuleDTO(
  row: {
    module: string;
    enabled: boolean;
    executionMode: string;
    providerOverride: string | null;
    modelOverride: string | null;
    discordChannelId: string | null;
    schedule: string | null;
    maxExecutionsPerDay: number;
    maxDailyCostUsd: { toNumber?: () => number } | number;
    notifyOnFailure: boolean;
    promptCachingEnabled: boolean;
    promptCachingStrategy: string;
    promptCacheTtl: string;
    instructions: string;
    lastRunAt: Date | null;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastStatus: string | null;
    lastError: string | null;
    permissions?: { tool: string }[];
  },
): AiModuleConfigDTO | null {
  if (!isModuleKey(row.module)) return null;
  const def = MODULE_DEFINITIONS[row.module];
  const mode = isExecutionMode(row.executionMode) ? row.executionMode : def.defaultMode;
  return {
    module: row.module,
    label: def.label,
    description: def.description,
    enabled: row.enabled,
    executionMode: mode,
    providerOverride: row.providerOverride,
    modelOverride: row.modelOverride,
    discordChannelId: row.discordChannelId,
    schedule: row.schedule,
    maxExecutionsPerDay: row.maxExecutionsPerDay,
    maxDailyCostUsd: num(row.maxDailyCostUsd),
    notifyOnFailure: row.notifyOnFailure,
    promptCachingEnabled: row.promptCachingEnabled,
    promptCachingStrategy: isCacheStrategy(row.promptCachingStrategy) ? row.promptCachingStrategy : "automatic",
    promptCacheTtl: isCacheTtl(row.promptCacheTtl) ? row.promptCacheTtl : "5m",
    instructions: row.instructions,
    lastRunAt: row.lastRunAt,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: row.lastFailureAt,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    grantedTools: normalizeGrants((row.permissions ?? []).map((p) => p.tool)),
  };
}

export async function listModuleConfigs(): Promise<AiModuleConfigDTO[]> {
  await ensureModulesSeeded();
  const rows = await prisma.aiModuleConfig.findMany({
    include: { permissions: true },
    orderBy: { module: "asc" },
  });
  return rows.map(toModuleDTO).filter((m): m is AiModuleConfigDTO => m !== null);
}

export async function getModuleConfig(module: string): Promise<AiModuleConfigDTO | null> {
  if (!isModuleKey(module)) return null;
  await ensureModulesSeeded();
  const row = await prisma.aiModuleConfig.findUnique({
    where: { module },
    include: { permissions: true },
  });
  return row ? toModuleDTO(row) : null;
}

export interface AiModuleConfigUpdate {
  enabled?: boolean;
  executionMode?: ExecutionMode;
  providerOverride?: string | null;
  modelOverride?: string | null;
  discordChannelId?: string | null;
  schedule?: string | null;
  maxExecutionsPerDay?: number;
  maxDailyCostUsd?: number;
  notifyOnFailure?: boolean;
  promptCachingEnabled?: boolean;
  promptCachingStrategy?: CacheStrategy;
  promptCacheTtl?: CacheTtl;
  instructions?: string;
}

export async function updateModuleConfig(
  module: string,
  patch: AiModuleConfigUpdate,
): Promise<AiModuleConfigDTO | null> {
  if (!isModuleKey(module)) return null;
  await ensureModulesSeeded();
  await prisma.aiModuleConfig.update({ where: { module }, data: patch });
  return getModuleConfig(module);
}

// ─── Permissions ─────────────────────────────────────────────────────────────

/** The set of tools a module has been granted (from the DB). */
export async function getModuleGrants(module: string): Promise<ToolName[]> {
  if (!isModuleKey(module)) return [];
  const rows = await prisma.aiModulePermission.findMany({ where: { module } });
  return normalizeGrants(rows.map((r) => r.tool));
}

/**
 * Replaces a module's tool grants with exactly `tools` (validated). Used by the
 * module config page. Removes revoked grants and adds new ones atomically.
 */
export async function setModuleGrants(
  module: string,
  tools: string[],
): Promise<ToolName[]> {
  if (!isModuleKey(module)) return [];
  await ensureModulesSeeded();
  const next = normalizeGrants(tools);
  await prisma.$transaction([
    prisma.aiModulePermission.deleteMany({
      where: { module, tool: { notIn: next.length ? next : ["__none__"] } },
    }),
    ...next.map((tool) =>
      prisma.aiModulePermission.upsert({
        where: { module_tool: { module, tool } },
        update: {},
        create: { module, tool },
      }),
    ),
  ]);
  return getModuleGrants(module);
}
