/**
 * AI execution, tool-call, and usage logging (spec §9).
 *
 * Server-only. Every module run creates an AiExecution; every tool invocation
 * appends an AiToolCallLog; every provider call appends an AiUsageRecord. These
 * feed the dashboard, the budget guardrails, and the observability filters.
 *
 * All writes ALSO go through the shared structured logger (src/lib/ops/log.ts),
 * whose sanitizer guarantees no secret/token/code/PII reaches Vercel logs or
 * Sentry — so even a careless caller cannot leak here. Bookkeeping is best-effort
 * (`safely`): observability must never break the observed flow.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/ops/log";
import type {
  ExecutionStatus,
  ExecutionTrigger,
  ToolCallStatus,
} from "./types";
import { estimateCostUsd } from "./usage";

async function safely<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export interface StartExecutionInput {
  module: string;
  trigger: ExecutionTrigger;
  executionMode: string;
  provider?: string;
  model?: string;
  triggeredBy?: string | null;
  idempotencyKey?: string | null;
}

/** Opens an AiExecution row in `running` state and returns its id. */
export async function startExecution(input: StartExecutionInput): Promise<string | null> {
  const row = await safely(() =>
    prisma.aiExecution.create({
      data: {
        module: input.module,
        trigger: input.trigger,
        executionMode: input.executionMode,
        status: "running",
        provider: input.provider,
        model: input.model,
        triggeredBy: input.triggeredBy ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      select: { id: true },
    }),
  );
  log.info("ai execution started", {
    operation: `ai.${input.module}.execute`,
    result: "running",
    trigger: input.trigger,
    executionMode: input.executionMode,
  });
  return row?.id ?? null;
}

export interface FinishExecutionInput {
  status: Exclude<ExecutionStatus, "running">;
  summary?: string | null;
  error?: string | null;
  estimatedTokensIn?: number;
  estimatedTokensOut?: number;
  estimatedCostUsd?: number;
}

/** Closes an execution row, stamping duration and outcome. */
export async function finishExecution(
  executionId: string | null,
  module: string,
  startedAtMs: number,
  input: FinishExecutionInput,
): Promise<void> {
  const durationMs = Date.now() - startedAtMs;
  if (executionId) {
    await safely(() =>
      prisma.aiExecution.update({
        where: { id: executionId },
        data: {
          status: input.status,
          finishedAt: new Date(),
          durationMs,
          // Truncated + already-safe strings only.
          summary: input.summary?.slice(0, 500) ?? null,
          error: input.error?.slice(0, 300) ?? null,
          estimatedTokensIn: input.estimatedTokensIn,
          estimatedTokensOut: input.estimatedTokensOut,
          estimatedCostUsd: input.estimatedCostUsd,
        },
      }),
    );
  }
  // Denormalize last-run metadata onto the module for the dashboard.
  await safely(() =>
    prisma.aiModuleConfig.update({
      where: { module },
      data: {
        lastRunAt: new Date(),
        lastStatus: input.status,
        lastError: input.status === "failure" ? input.error?.slice(0, 300) ?? null : null,
        ...(input.status === "success" ? { lastSuccessAt: new Date() } : {}),
        ...(input.status === "failure" ? { lastFailureAt: new Date() } : {}),
      },
    }),
  );
  if (input.status === "failure") {
    log.error("ai execution failed", {
      operation: `ai.${module}.execute`,
      result: "failed",
      durationMs,
    });
  } else {
    log.info("ai execution finished", {
      operation: `ai.${module}.execute`,
      result: input.status,
      durationMs,
    });
  }
}

export interface ToolCallLogInput {
  module: string;
  tool: string;
  status: ToolCallStatus;
  reason?: string | null;
  durationMs?: number;
  executionId?: string | null;
}

/** Records one tool invocation (spec §4: "record which tool was called…"). */
export async function logToolCall(input: ToolCallLogInput): Promise<void> {
  await safely(() =>
    prisma.aiToolCallLog.create({
      data: {
        module: input.module,
        tool: input.tool,
        status: input.status,
        reason: input.reason?.slice(0, 200) ?? null,
        durationMs: input.durationMs,
        executionId: input.executionId ?? null,
      },
    }),
  );
  log.info("ai tool call", {
    operation: `ai.tool.${input.tool}`,
    result: input.status,
    module: input.module,
    ...(input.reason ? { code: input.reason } : {}),
  });
}

export interface RecordUsageInput {
  module: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  executionId?: string | null;
  costUsd?: number;
}

/** Appends a usage/cost record (spec §9). Cost is estimated if not supplied. */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const costUsd = input.costUsd ?? estimateCostUsd(input.model, input.tokensIn, input.tokensOut);
  await safely(() =>
    prisma.aiUsageRecord.create({
      data: {
        module: input.module,
        provider: input.provider,
        model: input.model,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        costUsd,
        executionId: input.executionId ?? null,
      },
    }),
  );
}

// ─── Spend / count aggregates for the budget guardrails ──────────────────────

function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
function startOfDayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toNum(value: { toNumber?: () => number } | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return typeof value.toNumber === "function" ? value.toNumber() : Number(value);
}

/** Total estimated spend this calendar month (UTC), across all modules. */
export async function monthSpendUsd(now = new Date()): Promise<number> {
  const agg = await safely(() =>
    prisma.aiUsageRecord.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: startOfMonthUtc(now) } },
    }),
  );
  return toNum(agg?._sum.costUsd ?? 0);
}

/** A module's estimated spend today (UTC). */
export async function moduleDaySpendUsd(module: string, now = new Date()): Promise<number> {
  const agg = await safely(() =>
    prisma.aiUsageRecord.aggregate({
      _sum: { costUsd: true },
      where: { module, createdAt: { gte: startOfDayUtc(now) } },
    }),
  );
  return toNum(agg?._sum.costUsd ?? 0);
}

/** A module's execution count today (UTC). */
export async function moduleExecutionsToday(module: string, now = new Date()): Promise<number> {
  const count = await safely(() =>
    prisma.aiExecution.count({
      where: { module, createdAt: { gte: startOfDayUtc(now) } },
    }),
  );
  return count ?? 0;
}
