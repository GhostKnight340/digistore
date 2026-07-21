/**
 * Observability log queries with the admin filters (spec §9).
 *
 * Read-only, server-only. Surfaces AI executions and tool-call logs with filters
 * by module, status, date range, execution type (trigger), and severity. Returns
 * plain, already-safe DTOs (no payloads/tokens are stored in these tables to
 * begin with, but nothing sensitive is selected regardless).
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isModuleKey } from "./types";

export interface LogFilters {
  module?: string;
  status?: string;
  trigger?: string;
  /** ISO date (inclusive lower bound). */
  since?: string;
  /** ISO date (exclusive upper bound). */
  until?: string;
  limit?: number;
}

export interface ExecutionLogDTO {
  id: string;
  module: string;
  trigger: string;
  executionMode: string;
  status: string;
  provider: string | null;
  model: string | null;
  estimatedCostUsd: number | null;
  summary: string | null;
  error: string | null;
  createdAt: string;
}

export interface ToolCallLogDTO {
  id: string;
  module: string;
  tool: string;
  status: string;
  reason: string | null;
  durationMs: number | null;
  createdAt: string;
}

function dateWhere(since?: string, until?: string): { gte?: Date; lt?: Date } | undefined {
  const range: { gte?: Date; lt?: Date } = {};
  if (since) {
    const d = new Date(since);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (until) {
    const d = new Date(until);
    if (!Number.isNaN(d.getTime())) range.lt = d;
  }
  return range.gte || range.lt ? range : undefined;
}

function num(value: { toNumber?: () => number } | number | null): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return typeof value.toNumber === "function" ? value.toNumber() : Number(value);
}

export async function listExecutionLogs(filters: LogFilters): Promise<ExecutionLogDTO[]> {
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const createdAt = dateWhere(filters.since, filters.until);
  const rows = await prisma.aiExecution.findMany({
    where: {
      ...(filters.module && isModuleKey(filters.module) ? { module: filters.module } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.trigger ? { trigger: filters.trigger } : {}),
      ...(createdAt ? { createdAt } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    module: r.module,
    trigger: r.trigger,
    executionMode: r.executionMode,
    status: r.status,
    provider: r.provider,
    model: r.model,
    estimatedCostUsd: num(r.estimatedCostUsd),
    summary: r.summary,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listToolCallLogs(filters: LogFilters): Promise<ToolCallLogDTO[]> {
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const createdAt = dateWhere(filters.since, filters.until);
  const rows = await prisma.aiToolCallLog.findMany({
    where: {
      ...(filters.module && isModuleKey(filters.module) ? { module: filters.module } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(createdAt ? { createdAt } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    module: r.module,
    tool: r.tool,
    status: r.status,
    reason: r.reason,
    durationMs: r.durationMs,
    createdAt: r.createdAt.toISOString(),
  }));
}
