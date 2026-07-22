"use server";

/**
 * Server actions for AI Operations (/admin/ai-operations).
 *
 * Every action requires an admin session (requireAdminCustomer redirects
 * otherwise) and returns a typed result. Mutations validate their inputs
 * server-side, persist through the src/lib/ai-ops/* stores, and revalidate the
 * affected admin routes. No secret is ever accepted or returned here — provider
 * keys live only in env. Same-origin protection comes from Next server actions
 * (the session cookie is sameSite=lax), matching the rest of the admin.
 */

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import type { ActionResult } from "@/lib/dto";
import {
  getAiOpsSettings,
  updateAiOpsSettings,
  updateModuleConfig,
  setModuleGrants,
  type AiOpsSettingsUpdate,
  type AiModuleConfigUpdate,
} from "@/lib/ai-ops/store";
import { setChannelMapping } from "@/lib/ai-ops/discordChannels";
import { testDiscordConnection, type ConnectionTestResult } from "@/lib/ai-ops/discordChannels";
import { testAiProvider, type ProviderTestResult } from "@/lib/ai-ops/providerHealth";
import {
  listConversationMetadata,
  clearConversationByKey,
  type ConversationMetadata,
} from "@/lib/ai-ops/discord/conversationStore";
import { transitionApproval, getApproval } from "@/lib/ai-ops/approvalStore";
import { SUPPORT_ASSISTANT_MODULE } from "@/lib/ai-ops/support/module";
import { replySupportTicketAction } from "@/app/actions/supportAdmin";
import { setJobEnabled } from "@/lib/ai-ops/jobStore";
import { isCacheStrategy, isCacheTtl } from "@/lib/ai-ops/caching";
import { runModule } from "@/lib/ai-ops/runner";
import {
  isExecutionMode,
  isModuleKey,
  isAiProvider,
  isToolName,
  type ApprovalStatus,
} from "@/lib/ai-ops/types";

const AI_OPS_PATH = "/admin/ai-operations";

function revalidateAiOps(): void {
  revalidatePath(AI_OPS_PATH);
  revalidatePath(`${AI_OPS_PATH}/settings`);
}

// ─── Global settings ─────────────────────────────────────────────────────────

/**
 * Persists the global settings. Every field is coerced/validated server-side;
 * unknown providers/timezones are rejected rather than stored. Budgets are
 * clamped to non-negative.
 */
export async function saveAiOpsSettingsAction(
  input: AiOpsSettingsUpdate,
): Promise<ActionResult> {
  await requireAdminCustomer();
  try {
    const patch: AiOpsSettingsUpdate = {};
    if (typeof input.globalEnabled === "boolean") patch.globalEnabled = input.globalEnabled;
    if (typeof input.timezone === "string" && input.timezone.length <= 64) patch.timezone = input.timezone;
    if (typeof input.reportLanguage === "string" && /^[a-z]{2}$/i.test(input.reportLanguage)) {
      patch.reportLanguage = input.reportLanguage.toLowerCase();
    }
    if (typeof input.defaultProvider === "string") {
      if (!isAiProvider(input.defaultProvider)) return { ok: false, error: "Unknown AI provider." };
      patch.defaultProvider = input.defaultProvider;
    }
    if (typeof input.defaultModel === "string" && input.defaultModel.length <= 80) patch.defaultModel = input.defaultModel;
    for (const key of ["monthlyBudgetUsd", "warningThresholdUsd", "hardLimitUsd"] as const) {
      const v = input[key];
      if (typeof v === "number" && Number.isFinite(v)) patch[key] = Math.max(0, v);
    }
    if (typeof input.logRetentionDays === "number") patch.logRetentionDays = Math.min(3650, Math.max(1, Math.trunc(input.logRetentionDays)));
    if (typeof input.redactSensitive === "boolean") patch.redactSensitive = input.redactSensitive;
    // Tunable runtime knobs (spec §10), each clamped to a safe integer range.
    const clampInt = (v: unknown, lo: number, hi: number): number | undefined =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.trunc(v))) : undefined;
    const KNOBS: [keyof AiOpsSettingsUpdate, number, number][] = [
      ["conversationTtlMinutes", 1, 1440],
      ["conversationMessageLimit", 2, 50],
      ["maxToolRounds", 1, 10],
      ["maxToolCallsPerExecution", 1, 30],
      ["providerTimeoutMs", 1000, 120000],
      ["providerMaxRetries", 0, 5],
      ["userRateLimitPerMin", 1, 1000],
      ["globalRateLimitPerMin", 1, 100000],
    ];
    for (const [key, lo, hi] of KNOBS) {
      const c = clampInt(input[key], lo, hi);
      if (c !== undefined) (patch[key] as number) = c;
    }
    for (const key of ["discordGuildId", "defaultReportChannelId", "defaultAlertChannelId", "defaultApprovalChannelId"] as const) {
      const v = input[key];
      if (v === null || (typeof v === "string" && v.length <= 32)) patch[key] = v;
    }
    await updateAiOpsSettings(patch);
    revalidateAiOps();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save settings." };
  }
}

/** Convenience toggle for the global kill switch (used by the overview header). */
export async function setGlobalEnabledAction(enabled: boolean): Promise<ActionResult> {
  await requireAdminCustomer();
  try {
    await updateAiOpsSettings({ globalEnabled: enabled });
    revalidateAiOps();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update global status." };
  }
}

// ─── Module config ───────────────────────────────────────────────────────────

export async function saveModuleConfigAction(
  module: string,
  input: AiModuleConfigUpdate & { grantedTools?: string[] },
): Promise<ActionResult> {
  await requireAdminCustomer();
  if (!isModuleKey(module)) return { ok: false, error: "Unknown module." };
  try {
    const patch: AiModuleConfigUpdate = {};
    if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
    if (typeof input.executionMode === "string") {
      if (!isExecutionMode(input.executionMode)) return { ok: false, error: "Invalid execution mode." };
      patch.executionMode = input.executionMode;
    }
    if (input.providerOverride === null || typeof input.providerOverride === "string") {
      if (typeof input.providerOverride === "string" && input.providerOverride && !isAiProvider(input.providerOverride)) {
        return { ok: false, error: "Unknown provider override." };
      }
      patch.providerOverride = input.providerOverride || null;
    }
    if (input.modelOverride === null || typeof input.modelOverride === "string") patch.modelOverride = input.modelOverride || null;
    if (input.discordChannelId === null || typeof input.discordChannelId === "string") patch.discordChannelId = input.discordChannelId || null;
    if (input.schedule === null || typeof input.schedule === "string") patch.schedule = input.schedule || null;
    if (typeof input.maxExecutionsPerDay === "number") patch.maxExecutionsPerDay = Math.min(10_000, Math.max(0, Math.trunc(input.maxExecutionsPerDay)));
    if (typeof input.maxDailyCostUsd === "number") patch.maxDailyCostUsd = Math.max(0, input.maxDailyCostUsd);
    if (typeof input.notifyOnFailure === "boolean") patch.notifyOnFailure = input.notifyOnFailure;
    if (typeof input.promptCachingEnabled === "boolean") patch.promptCachingEnabled = input.promptCachingEnabled;
    if (typeof input.promptCachingStrategy === "string") {
      if (!isCacheStrategy(input.promptCachingStrategy)) return { ok: false, error: "Invalid caching strategy." };
      patch.promptCachingStrategy = input.promptCachingStrategy;
    }
    if (typeof input.promptCacheTtl === "string") {
      if (!isCacheTtl(input.promptCacheTtl)) return { ok: false, error: "Invalid cache TTL." };
      patch.promptCacheTtl = input.promptCacheTtl;
    }
    if (typeof input.instructions === "string") patch.instructions = input.instructions.slice(0, 8000);

    await updateModuleConfig(module, patch);

    if (Array.isArray(input.grantedTools)) {
      const clean = input.grantedTools.filter((t) => typeof t === "string" && isToolName(t));
      await setModuleGrants(module, clean);
    }
    revalidateAiOps();
    revalidatePath(`${AI_OPS_PATH}/modules/${module}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save module." };
  }
}

// ─── Discord channels ────────────────────────────────────────────────────────

export async function setChannelMappingAction(
  purpose: string,
  channelId: string,
): Promise<ActionResult> {
  await requireAdminCustomer();
  const result = await setChannelMapping(purpose, channelId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateAiOps();
  return { ok: true };
}

export async function testDiscordConnectionAction(): Promise<ConnectionTestResult> {
  await requireAdminCustomer();
  return testDiscordConnection();
}

/** Live-test the configured AI provider + model (one tiny completion). */
export async function testAiProviderAction(): Promise<ProviderTestResult> {
  await requireAdminCustomer();
  return testAiProvider();
}

/** Inspect recent conversation memory — metadata only, never message content. */
export async function listConversationsAction(): Promise<ConversationMetadata[]> {
  await requireAdminCustomer();
  return listConversationMetadata();
}

/** Clear one conversation by its identity key (no content is exposed). */
export async function clearConversationAction(key: string): Promise<ActionResult> {
  await requireAdminCustomer();
  if (typeof key !== "string" || !key) return { ok: false, error: "Missing conversation key." };
  const cleared = await clearConversationByKey(key);
  revalidateAiOps();
  return cleared ? { ok: true } : { ok: false, error: "Conversation introuvable." };
}

// ─── Approvals ───────────────────────────────────────────────────────────────

export async function decideApprovalAction(
  id: string,
  decision: "APPROVED" | "REJECTED" | "CANCELLED",
  extra?: { rejectionReason?: string; editedContent?: string },
): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  if (typeof id !== "string" || !id) return { ok: false, error: "Missing approval id." };
  try {
    await transitionApproval(id, decision as ApprovalStatus, {
      approvedBy: decision === "APPROVED" ? admin.name : undefined,
      rejectedBy: decision === "REJECTED" ? admin.name : undefined,
      rejectionReason: extra?.rejectionReason?.slice(0, 500),
      editedContent: extra?.editedContent,
    });
    // Approving a support action is where it finally happens: a drafted reply is
    // sent to the customer (the exact same path as a manual admin reply — Discord
    // + email), an escalation is acknowledged. Rejecting/cancelling never sends.
    let execError: string | null = null;
    if (decision === "APPROVED") {
      const approval = await getApproval(id);
      if (approval?.module === SUPPORT_ASSISTANT_MODULE) {
        execError = await executeSupportApproval(approval);
      }
    }
    revalidatePath(`${AI_OPS_PATH}/approvals`);
    revalidatePath(`${AI_OPS_PATH}/support`);
    revalidateAiOps();
    return execError ? { ok: false, error: execError } : { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Transition failed." };
  }
}

/**
 * Executes an APPROVED support approval. Drives it APPROVED→EXECUTING→COMPLETED
 * (or FAILED) so the queue always reflects what actually happened. Returns a
 * human error string when the send fails, else null. Never throws.
 */
async function executeSupportApproval(
  approval: NonNullable<Awaited<ReturnType<typeof getApproval>>>,
): Promise<string | null> {
  try {
    await transitionApproval(approval.id, "EXECUTING");
    if (approval.actionType === "support_reply") {
      if (!approval.entityId) throw new Error("Ticket introuvable pour ce brouillon.");
      const body = (approval.editedContent ?? approval.proposedContent ?? "").trim();
      if (!body) throw new Error("La réponse proposée est vide.");
      const res = await replySupportTicketAction(approval.entityId, body);
      if (!res.ok) throw new Error(res.error ?? "Envoi impossible.");
      await transitionApproval(approval.id, "COMPLETED", { executionResult: "Réponse envoyée au client." });
    } else {
      // Escalations (and any non-sending action): approving just acknowledges.
      await transitionApproval(approval.id, "COMPLETED", {
        executionResult: "Escalade prise en charge manuellement.",
      });
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Exécution impossible.";
    try {
      await transitionApproval(approval.id, "FAILED", { executionResult: message });
    } catch {
      // Already terminal or a race — the error string is still returned below.
    }
    return message;
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export async function setJobEnabledAction(key: string, enabled: boolean): Promise<ActionResult> {
  await requireAdminCustomer();
  try {
    await setJobEnabled(key, enabled);
    revalidateAiOps();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update job." };
  }
}

/** Manual "Run now" for a module (spec §8). Honors all guardrails. */
export async function runModuleNowAction(module: string): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  if (!isModuleKey(module)) return { ok: false, error: "Unknown module." };
  // daily_reports isn't a single placeholder run — "Run now" from the overview
  // generates and posts the Morning Brief (the four reports are configured
  // individually on /admin/ai-operations/reports).
  if (module === "daily_reports") {
    const { generateReport } = await import("@/lib/ai-ops/modules/dailyReports");
    const report = await generateReport({
      reportType: "morning",
      trigger: "manual",
      deliver: true,
      triggeredBy: admin.name,
    });
    if (!report.ok) return { ok: false, error: `Run blocked: ${report.reason}` };
    revalidateAiOps();
    return { ok: true };
  }
  // Other modules run their real body when one is registered (e.g. Supplier
  // Intelligence); modules without a body still exercise the placeholder path.
  const { bodyForModule } = await import("@/lib/ai-ops/moduleBodies");
  const result = await runModule({ module, trigger: "manual", triggeredBy: admin.name, body: bodyForModule(module) });
  if (!result.ok) return { ok: false, error: `Run blocked: ${result.reason}` };
  revalidateAiOps();
  return { ok: true };
}

// ─── Read actions (for client polling) ───────────────────────────────────────

export async function getAiOpsSettingsAction() {
  await requireAdminCustomer();
  return getAiOpsSettings();
}
