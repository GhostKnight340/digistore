/**
 * Coverage session persistence (server-only).
 *
 * The single source of truth for "is coverage authorizing anything right now".
 * Enforces one live session at a time, applies LAZY EXPIRY (a session past its
 * scheduled end is marked EXPIRED on read, so the gate never trusts a stale
 * ACTIVE state), and owns the counters the dashboard + handoff summary read.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  effectiveState,
  isTerminalCoverage,
  type CoverageState,
  type CoverageSessionCore,
  type EffectiveState,
} from "./coverageState";
import type { CoverageConfig, NotifyMode } from "./coverageConfig";
import { buildHandoff, type CoverageHandoff } from "./handoff";
import { notifyCoverage } from "./notify";

type SessionRow = {
  id: string;
  state: string;
  activatedBy: string;
  activatedAt: Date;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  actualEndAt: Date | null;
  channels: string[];
  languages: string[];
  categories: string[];
  automationMode: string;
  draftOnly: boolean;
  allowAutoReply: boolean;
  confidenceThreshold: string;
  notifyMode: string;
  escalationBehavior: string;
  fallbackMessage: string | null;
  casesProcessed: number;
  messagesDrafted: number;
  messagesAutoSent: number;
  escalationsCreated: number;
  failures: number;
  pauseReason: string | null;
  deactivationReason: string | null;
  handoff: unknown;
  consecutiveLowConfidence: number;
  createdAt: Date;
  updatedAt: Date;
};

/** A live session plus its freshly computed effective state. */
export interface LiveSession {
  row: SessionRow;
  core: CoverageSessionCore;
  effState: CoverageState;
}

function toCore(row: SessionRow): CoverageSessionCore {
  return {
    state: row.state as CoverageState,
    automationMode: row.automationMode,
    draftOnly: row.draftOnly,
    allowAutoReply: row.allowAutoReply,
    confidenceThreshold: row.confidenceThreshold,
    channels: row.channels,
    categories: row.categories,
    scheduledStartAt: row.scheduledStartAt,
    scheduledEndAt: row.scheduledEndAt,
  };
}

/** The most recent non-terminal session row, if any (there is at most one). */
async function currentNonTerminal(): Promise<SessionRow | null> {
  const row = await prisma.supportCoverageSession.findFirst({
    where: { state: { notIn: ["EXPIRED", "ERROR", "DEACTIVATED"] } },
    orderBy: { activatedAt: "desc" },
  });
  return row;
}

/**
 * The live session authorizing actions right now, or null. Applies lazy expiry:
 * if the current row is past its scheduled end, it is marked EXPIRED here and
 * null is returned — so callers can never act on an expired session.
 */
export async function getLiveSession(now: Date = new Date()): Promise<LiveSession | null> {
  const row = await currentNonTerminal();
  if (!row) return null;
  const core = toCore(row);
  const effState = effectiveState(core, now);
  if (effState === "EXPIRED") {
    // Lazy expiry also produces the handoff + end notification (once).
    await finalizeSession(row, "EXPIRED", "Expiration automatique", now);
    return null;
  }
  return { row, core, effState };
}

/**
 * End a session: compute + store the handoff snapshot, set the final state, and
 * fire the "coverage ended" notification. Idempotent — a row already terminal is
 * left untouched. Shared by manual deactivation and (lazy/cron) expiry.
 */
async function finalizeSession(
  row: SessionRow,
  finalState: Extract<CoverageState, "EXPIRED" | "DEACTIVATED" | "ERROR">,
  reason: string | null,
  now: Date,
): Promise<CoverageHandoff | null> {
  if (isTerminalCoverage(row.state as CoverageState)) return (row.handoff as CoverageHandoff | null) ?? null;
  const handoff = await buildHandoff(row, now);
  await prisma.supportCoverageSession.update({
    where: { id: row.id },
    data: {
      state: finalState,
      actualEndAt: now,
      deactivationReason: reason?.slice(0, 300) ?? null,
      handoff: handoff as unknown as object,
    },
  });
  await notifyCoverage({
    notifyMode: row.notifyMode as NotifyMode,
    category: "ended",
    title: finalState === "EXPIRED" ? "Couverture support IA expirée" : "Couverture support IA désactivée",
    description: `${handoff.casesResolved} cas résolus · ${handoff.draftsAwaiting} brouillon(s) en attente · ${handoff.escalations} escalade(s).`,
    fields: [
      { name: "En attente", value: `${handoff.draftsAwaiting + handoff.escalations}` },
      { name: "Envois auto", value: `${handoff.autoReplied}` },
      { name: "Échecs", value: `${handoff.failedOutgoing}` },
    ],
  });
  return handoff;
}

// ─── Overview DTO (for the admin UI) ─────────────────────────────────────────

export interface CoverageOverviewDTO {
  effectiveState: EffectiveState;
  session: {
    id: string;
    activatedBy: string;
    activatedAt: string;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    channels: string[];
    languages: string[];
    categories: string[];
    automationMode: string;
    draftOnly: boolean;
    allowAutoReply: boolean;
    confidenceThreshold: string;
    notifyMode: string;
    fallbackMessage: string | null;
    casesProcessed: number;
    messagesDrafted: number;
    messagesAutoSent: number;
    escalationsCreated: number;
    failures: number;
    pauseReason: string | null;
  } | null;
}

function toSessionDTO(row: SessionRow): NonNullable<CoverageOverviewDTO["session"]> {
  return {
    id: row.id,
    activatedBy: row.activatedBy,
    activatedAt: row.activatedAt.toISOString(),
    scheduledStartAt: row.scheduledStartAt?.toISOString() ?? null,
    scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
    channels: row.channels,
    languages: row.languages,
    categories: row.categories,
    automationMode: row.automationMode,
    draftOnly: row.draftOnly,
    allowAutoReply: row.allowAutoReply,
    confidenceThreshold: row.confidenceThreshold,
    notifyMode: row.notifyMode,
    fallbackMessage: row.fallbackMessage,
    casesProcessed: row.casesProcessed,
    messagesDrafted: row.messagesDrafted,
    messagesAutoSent: row.messagesAutoSent,
    escalationsCreated: row.escalationsCreated,
    failures: row.failures,
    pauseReason: row.pauseReason,
  };
}

/** The current coverage state for the admin UI (INACTIVE when no live session). */
export async function getCoverageOverview(now: Date = new Date()): Promise<CoverageOverviewDTO> {
  const live = await getLiveSession(now);
  if (!live) return { effectiveState: "INACTIVE", session: null };
  return { effectiveState: live.effState, session: toSessionDTO(live.row) };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface ActivationResult {
  ok: boolean;
  error?: string;
  sessionId?: string;
}

/**
 * Create a new coverage session from a validated config. Refuses if a live
 * session already exists (one at a time). The stored state reflects the schedule:
 * SCHEDULED if the start is still in the future, else the active mode.
 */
export async function createSession(config: CoverageConfig, activatedBy: string, now: Date = new Date()): Promise<ActivationResult> {
  const existing = await getLiveSession(now);
  if (existing) return { ok: false, error: "Une session de couverture est déjà active." };

  const started = config.scheduledStartAt.getTime() <= now.getTime();
  const initialState: CoverageState = !started
    ? "SCHEDULED"
    : config.automationMode === "auto_reply"
    ? "ACTIVE_AUTO_REPLY"
    : "ACTIVE_DRAFT_ONLY";

  const row = await prisma.supportCoverageSession.create({
    data: {
      state: initialState,
      activatedBy,
      scheduledStartAt: config.scheduledStartAt,
      scheduledEndAt: config.scheduledEndAt,
      channels: config.channels,
      languages: config.languages,
      categories: config.categories,
      automationMode: config.automationMode,
      draftOnly: config.draftOnly,
      allowAutoReply: config.allowAutoReply,
      confidenceThreshold: config.confidenceThreshold,
      notifyMode: config.notifyMode,
      escalationBehavior: config.escalationBehavior,
      fallbackMessage: config.fallbackMessage,
    },
    select: { id: true },
  });
  return { ok: true, sessionId: row.id };
}

/** Manually deactivate the live session immediately. Returns its handoff. */
export async function deactivateSession(reason: string | null, now: Date = new Date()): Promise<CoverageHandoff | null> {
  const live = await getLiveSession(now);
  if (!live) return null;
  return finalizeSession(live.row, "DEACTIVATED", reason ?? "Désactivation manuelle", now);
}

/** The handoff of the most recently ended session, for the "what happened" panel. */
export async function getLastHandoff(): Promise<CoverageHandoff | null> {
  const row = await prisma.supportCoverageSession.findFirst({
    where: { state: { in: ["EXPIRED", "DEACTIVATED"] }, handoff: { not: Prisma.DbNull } },
    orderBy: { actualEndAt: "desc" },
    select: { handoff: true },
  });
  return (row?.handoff as CoverageHandoff | null) ?? null;
}

// ─── Pause / resume (safety pause, Phase C) ──────────────────────────────────

/** Pause the live session: stops new drafts + all auto-sends. Inbox unaffected. */
export async function pauseSession(reason: string, now: Date = new Date()): Promise<boolean> {
  const live = await getLiveSession(now);
  if (!live) return false;
  await prisma.supportCoverageSession.update({
    where: { id: live.row.id },
    data: { state: "PAUSED", pauseReason: reason.slice(0, 300) },
  });
  await notifyCoverage({
    notifyMode: live.row.notifyMode as NotifyMode,
    category: "urgent",
    title: "⏸️ Couverture support IA mise en pause",
    description: reason.slice(0, 500),
  });
  return true;
}

/** Resume a paused session back to its active mode (unless it has since expired). */
export async function resumeSession(now: Date = new Date()): Promise<{ ok: boolean; error?: string }> {
  const row = await currentNonTerminal();
  if (!row || row.state !== "PAUSED") return { ok: false, error: "Aucune session en pause." };
  if (row.scheduledEndAt && now.getTime() >= row.scheduledEndAt.getTime()) {
    await finalizeSession(row, "EXPIRED", "Expiration automatique", now);
    return { ok: false, error: "La session avait déjà expiré." };
  }
  const active: CoverageState = row.automationMode === "auto_reply" ? "ACTIVE_AUTO_REPLY" : "ACTIVE_DRAFT_ONLY";
  await prisma.supportCoverageSession.update({ where: { id: row.id }, data: { state: active, pauseReason: null } });
  return { ok: true };
}

/**
 * Record a decision's confidence signal for the auto-pause heuristic: a low
 * confidence bumps the consecutive counter, anything higher resets it.
 */
export async function recordConfidenceSignal(id: string, isLow: boolean): Promise<void> {
  await prisma.supportCoverageSession.update({
    where: { id },
    data: isLow ? { consecutiveLowConfidence: { increment: 1 } } : { consecutiveLowConfidence: 0 },
  });
}

/** Read the counters the auto-pause evaluator needs (fresh). */
export async function getSessionSafetyState(id: string): Promise<{ failures: number; consecutiveLowConfidence: number; state: CoverageState } | null> {
  const row = await prisma.supportCoverageSession.findUnique({
    where: { id },
    select: { failures: true, consecutiveLowConfidence: true, state: true },
  });
  return row ? { failures: row.failures, consecutiveLowConfidence: row.consecutiveLowConfidence, state: row.state as CoverageState } : null;
}

/** Move a session to a state directly (used by the safety pause, later phases). */
export async function setSessionState(id: string, state: CoverageState, extra: { pauseReason?: string | null } = {}): Promise<void> {
  await prisma.supportCoverageSession.update({
    where: { id },
    data: {
      state,
      ...(extra.pauseReason !== undefined ? { pauseReason: extra.pauseReason } : {}),
      ...(isTerminalCoverage(state) ? { actualEndAt: new Date() } : {}),
    },
  });
}

export interface CounterPatch {
  casesProcessed?: number;
  messagesDrafted?: number;
  messagesAutoSent?: number;
  escalationsCreated?: number;
  failures?: number;
}

/** Atomically increment a session's live counters. */
export async function incrementSessionCounters(id: string, patch: CounterPatch): Promise<void> {
  const data: Record<string, { increment: number }> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "number" && v !== 0) data[k] = { increment: v };
  }
  if (Object.keys(data).length === 0) return;
  await prisma.supportCoverageSession.update({ where: { id }, data });
}
