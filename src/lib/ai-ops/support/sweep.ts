/**
 * Support coverage sweep — the cron entry point.
 *
 * On each AI-ops cron tick, IF a live coverage session authorizes it, this picks
 * up the open tickets it covers (channel + category) and processes each once
 * (bounded per run). It is idempotent: a ticket that already has an approval
 * created since its last update is skipped. With no live session it does
 * nothing — manual activation is the top-level authorization boundary, so no
 * background pass may act outside a session.
 */

import "server-only";

import { log } from "@/lib/ops/log";
import { listSupportTickets } from "@/lib/db/supportTickets";
import { hasApprovalForEntitySince } from "../approvalStore";
import { getAiOpsSettings } from "../store";
import { getLiveSession, getSessionSafetyState, pauseSession } from "./session";
import { coverageCoversTicket } from "./coverageState";
import { evaluateAutoPause } from "./safety";
import { draftForTicket, SUPPORT_CHANNEL, type PipelineTicket } from "./pipeline";
import { lastCustomerMessageAt } from "./thread";
import type { NotifyMode } from "./coverageConfig";

/** Max tickets handled per cron tick — bounds cost + run time; the rest wait. */
const MAX_PER_SWEEP = 8;

export interface SweepResult {
  coverageActive: boolean;
  candidates: number;
  processed: number;
  skipped: number;
  failed: number;
}

export async function sweepSupportCoverage(now: Date = new Date()): Promise<SweepResult> {
  const base: SweepResult = { coverageActive: false, candidates: 0, processed: 0, skipped: 0, failed: 0 };

  const live = await getLiveSession(now);
  // Only the two live ACTIVE states draft; SCHEDULED/PAUSED/etc. do nothing.
  if (!live || (live.effState !== "ACTIVE_DRAFT_ONLY" && live.effState !== "ACTIVE_AUTO_REPLY")) {
    return base;
  }
  base.coverageActive = true;

  // Batching window: let a ticket's newest customer message settle before we
  // reply, so rapid consecutive messages are grouped into one analysis.
  const settings = await getAiOpsSettings();
  const batchMs = Math.max(0, settings.supportBatchingWindowSec) * 1000;
  const nowMs = now.getTime();

  // "open" = a new ticket or one the customer just replied to (admin replies
  // flip it to "answered"). Oldest-waiting first so nobody is starved.
  const open = await listSupportTickets({ status: "open" });
  const covered = open.filter((t) => coverageCoversTicket(live.core, live.effState, SUPPORT_CHANNEL, t.category));
  base.candidates = covered.length;
  const ordered = [...covered].reverse();

  for (const t of ordered) {
    if (base.processed >= MAX_PER_SWEEP) break;

    const lastCustomerAt = lastCustomerMessageAt(t.replies, t.createdAt);
    // Still within the batching window → wait for it to settle (next tick).
    if (batchMs > 0 && lastCustomerAt > 0 && nowMs - lastCustomerAt < batchMs) {
      base.skipped += 1;
      continue;
    }
    if (await hasApprovalForEntitySince("support_ticket", t.id, new Date(t.updatedAt))) {
      base.skipped += 1;
      continue;
    }

    const ticket: PipelineTicket = {
      id: t.id,
      reference: t.reference,
      category: t.category,
      subIssueLabel: t.subIssueLabel,
      orderRef: t.orderRef,
      message: t.message,
      replies: t.replies,
      customerId: t.customerId,
      status: t.status,
      email: t.email,
      phone: t.phone,
      lastCustomerAt,
    };

    try {
      const result = await draftForTicket(ticket, { id: live.row.id, notifyMode: live.row.notifyMode as NotifyMode });
      if (result.ok) base.processed += 1;
      else base.failed += 1;
    } catch (error) {
      base.failed += 1;
      log.error("support sweep draft failed", {
        operation: "ai.support_assistant.sweep",
        result: "error",
        code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
      });
    }
  }

  // Automatic safety pause: after the cycle, pause outgoing AI activity if this
  // run failed too much or produced a run of low-confidence classifications.
  const safety = await getSessionSafetyState(live.row.id);
  if (safety && safety.state !== "PAUSED") {
    const decision = evaluateAutoPause({ failedThisSweep: base.failed, consecutiveLowConfidence: safety.consecutiveLowConfidence });
    if (decision.pause && decision.reason) await pauseSession(decision.reason);
  }

  return base;
}
