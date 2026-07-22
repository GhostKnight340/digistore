"use server";

/**
 * Server actions for AI Support Coverage (/admin/ai-operations/support).
 *
 * Manual activation is the top-level authorization boundary: activating creates
 * a coverage session (the authority the sweep + auto-send re-check server-side),
 * deactivating ends it immediately. Auto-send requires an EXPLICIT confirmation
 * flag in addition to the config. Every action requires an admin session.
 */

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import type { ActionResult } from "@/lib/dto";
import { getAiOpsSettings } from "@/lib/ai-ops/store";
import {
  validateCoverageConfig,
  summarizeCoverage,
  type CoverageConfigInput,
} from "@/lib/ai-ops/support/coverageConfig";
import {
  getCoverageOverview,
  createSession,
  deactivateSession,
  pauseSession,
  resumeSession,
  type CoverageOverviewDTO,
} from "@/lib/ai-ops/support/session";
import type { CoverageHandoff } from "@/lib/ai-ops/support/handoff";
import { assistConversation, isAssistTool } from "@/lib/ai-ops/support/assist";
import { coverageReadiness, type CoverageReadiness } from "@/lib/ai-ops/support/readiness";

const SUPPORT_PATH = "/admin/ai-operations/support";

function revalidateSupport(): void {
  revalidatePath(SUPPORT_PATH);
  revalidatePath("/admin/ai-operations");
  revalidatePath(`/admin/ai-operations/approvals`);
}

export async function getCoverageOverviewAction(): Promise<CoverageOverviewDTO> {
  await requireAdminCustomer();
  return getCoverageOverview();
}

export async function getCoverageReadinessAction(): Promise<CoverageReadiness> {
  await requireAdminCustomer();
  return coverageReadiness();
}

/**
 * Validate an activation request and return the confirmation summary WITHOUT
 * activating — powers the confirmation step of the activation modal.
 */
export async function previewCoverageAction(
  input: CoverageConfigInput,
): Promise<{ ok: true; summary: string[]; autoSend: boolean } | { ok: false; error: string }> {
  await requireAdminCustomer();
  const now = new Date();
  const parsed = validateCoverageConfig(input, now);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const settings = await getAiOpsSettings();
  return {
    ok: true,
    summary: summarizeCoverage(parsed.value, settings.timezone),
    autoSend: parsed.value.allowAutoReply,
  };
}

/**
 * Activate coverage: create the session. If the config enables auto-send, the
 * caller MUST pass confirmAutoSend=true (the explicit confirmation the spec
 * requires before automatic sending is allowed).
 */
export async function activateCoverageAction(
  input: CoverageConfigInput,
  confirmAutoSend: boolean,
): Promise<ActionResult & { overview?: CoverageOverviewDTO }> {
  const admin = await requireAdminCustomer();
  const now = new Date();
  const parsed = validateCoverageConfig(input, now);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.value.allowAutoReply && confirmAutoSend !== true) {
    return { ok: false, error: "Confirmation explicite requise pour l'envoi automatique." };
  }
  // Health gate: never activate if a critical dependency is missing.
  const readiness = await coverageReadiness();
  if (!readiness.canActivate) {
    const missing = readiness.checks.filter((c) => c.critical && !c.ok).map((c) => c.label);
    return { ok: false, error: `Activation impossible — éléments requis manquants : ${missing.join(", ")}.` };
  }
  const created = await createSession(parsed.value, admin.name, now);
  if (!created.ok) return { ok: false, error: created.error ?? "Activation impossible." };
  revalidateSupport();
  return { ok: true, overview: await getCoverageOverview(now) };
}

/** Deactivate the live session immediately. Returns the handoff summary. */
export async function deactivateCoverageAction(
  reason?: string,
): Promise<ActionResult & { handoff?: CoverageHandoff; overview?: CoverageOverviewDTO }> {
  await requireAdminCustomer();
  const handoff = await deactivateSession(typeof reason === "string" ? reason : null);
  revalidateSupport();
  if (!handoff) return { ok: false, error: "Aucune session active à désactiver." };
  return { ok: true, handoff, overview: await getCoverageOverview() };
}

/** Manual emergency pause — stops outgoing AI activity; inbox stays live. */
export async function emergencyPauseCoverageAction(
  reason?: string,
): Promise<ActionResult & { overview?: CoverageOverviewDTO }> {
  await requireAdminCustomer();
  const paused = await pauseSession(typeof reason === "string" && reason.trim() ? reason.trim() : "Pause d'urgence manuelle");
  revalidateSupport();
  if (!paused) return { ok: false, error: "Aucune session active à mettre en pause." };
  return { ok: true, overview: await getCoverageOverview() };
}

/** Resume a paused session back to its active mode. */
export async function resumeCoverageAction(): Promise<ActionResult & { overview?: CoverageOverviewDTO }> {
  await requireAdminCustomer();
  const res = await resumeSession();
  revalidateSupport();
  if (!res.ok) return { ok: false, error: res.error ?? "Reprise impossible." };
  return { ok: true, overview: await getCoverageOverview() };
}

// ─── Per-conversation manual AI assistance (works even when INACTIVE) ─────────

/**
 * Run one manual assist tool on a ticket (draft/summarize/detect/policy/rewrite/
 * translate/next-action). Returns TEXT for the agent — never sends. Available
 * regardless of coverage state; requires the Assistant module to be enabled.
 */
export async function assistConversationAction(input: {
  ticketId: string;
  tool: string;
  text?: string;
  targetLanguage?: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await requireAdminCustomer();
  if (!input?.ticketId || typeof input.ticketId !== "string") return { ok: false, error: "Ticket manquant." };
  if (!isAssistTool(input.tool)) return { ok: false, error: "Outil invalide." };
  const res = await assistConversation({
    ticketId: input.ticketId,
    tool: input.tool,
    text: typeof input.text === "string" ? input.text.slice(0, 4000) : undefined,
    targetLanguage: typeof input.targetLanguage === "string" ? input.targetLanguage : undefined,
  });
  if (res.ok) return { ok: true, text: res.text };
  const friendly =
    res.reason === "module_disabled" || res.reason === "global_disabled"
      ? "Activez le module « Assistant support » dans les réglages IA."
      : res.reason === "ticket_not_found"
      ? "Ticket introuvable."
      : `Échec de l'assistant (${res.reason}).`;
  return { ok: false, error: friendly };
}
