/**
 * Per-ticket pipeline — eligibility gate, auto-send authorization, batching-safe
 * sending, and internal-note trail.
 *
 * Flow for one ticket under a live coverage session:
 *   1. Eligibility (deterministic, pre-LLM): only purchasing-relationship tickets
 *      are handled; unmatched likely-buyers get ONE concise info request; anything
 *      out of scope is escalated to a human. This saves an LLM call and enforces
 *      the ownership boundary.
 *   2. For eligible tickets, one grounded completion → a structured decision.
 *   3. A draft_reply is AUTO-SENT only when the coverage session authorizes it
 *      (re-validated on fresh state) AND a per-ticket lock is held AND no newer
 *      customer message arrived since the sweep read the ticket (else it's left
 *      for the next cycle to regenerate). Otherwise it's staged as a draft.
 *   4. Escalations never send. Every decision leaves an internal note (never
 *      emailed, never shown to the customer).
 */

import "server-only";

import { callTool } from "../tools/service";
import { runModule, type ModuleRunContext, type ModuleRunOutput } from "../runner";
import { createApproval, recordAutoSend, countApprovalsForEntity } from "../approvalStore";
import type { RiskLevel } from "../types";
import { deliverSupportReply } from "@/lib/support/deliverReply";
import {
  addSupportInternalNote,
  claimTicketAiLock,
  releaseTicketAiLock,
  setTicketOwnership,
  getSupportTicketRecord,
  supportTicketAdminDTO,
} from "@/lib/db/supportTickets";
import { SUPPORT_ASSISTANT_MODULE } from "./module";
import { buildSupportPrompt } from "./prompt";
import { gatherSupportKnowledge } from "./knowledge";
import { parseSupportDecision, type SupportDecision } from "./decision";
import { canAutoSend, isSensitiveIssue } from "./coverageState";
import { getLiveSession, incrementSessionCounters, recordConfidenceSignal } from "./session";
import { notifyCoverage } from "./notify";
import type { NotifyMode } from "./coverageConfig";
import { assessEligibility, CLARIFY_MESSAGE } from "./eligibility";
import { lastCustomerMessageAt } from "./thread";
import { extractIdentitySignals } from "./identitySignals";
import { resolveIdentity, type ResolvedIdentity } from "./identity";

/** The only channel today; a covered channel must match this. */
export const SUPPORT_CHANNEL = "support_tickets";
const LOCK_TTL_MS = 60_000;

export interface PipelineTicket {
  id: string;
  reference: string;
  category: string;
  subIssueLabel: string;
  orderRef: string | null;
  message: string | null;
  replies: { author: string; body: string; createdAt: string }[];
  customerId: string | null;
  status: string;
  /** Sender email + phone — used SERVER-SIDE for identity resolution only (never
   *  passed to the model; the model gets the resolved order/customer instead). */
  email: string;
  phone: string | null;
  /** Newest customer-message time (ms) as seen by the sweep — the recheck baseline. */
  lastCustomerAt: number;
}

export interface PipelineSession {
  id: string;
  notifyMode: NotifyMode;
}

function riskFor(confidence: string): RiskLevel {
  return confidence === "high" ? "low" : "medium";
}

/** Read redacted business context for the resolved ids via the safe tool layer. */
async function contextForIdentity(
  identity: ResolvedIdentity,
  executionId: string | null,
): Promise<{ customer: unknown; order: unknown }> {
  const [customerRes, orderRes] = await Promise.all([
    identity.customerId
      ? callTool({ module: SUPPORT_ASSISTANT_MODULE, tool: "getCustomerHistory", input: { customerId: identity.customerId }, executionId })
      : Promise.resolve(null),
    identity.orderId
      ? callTool({ module: SUPPORT_ASSISTANT_MODULE, tool: "getOrderDetails", input: { orderId: identity.orderId }, executionId })
      : Promise.resolve(null),
  ]);
  return {
    customer: customerRes?.ok ? customerRes.data : null,
    order: orderRes?.ok ? orderRes.data : null,
  };
}

/** Escalate: stage a high-risk approval, note it, count it, notify per policy. */
async function emitEscalation(
  ticket: PipelineTicket,
  session: PipelineSession,
  opts: { issueType: string; note: string; sensitive: boolean },
): Promise<void> {
  const short = `${ticket.reference} · ${opts.issueType}`;
  await createApproval({
    module: SUPPORT_ASSISTANT_MODULE,
    actionType: "support_escalation",
    summary: `Escalade — ${short}`,
    proposedContent: opts.note || "À traiter manuellement.",
    entityType: "support_ticket",
    entityId: ticket.id,
    riskLevel: "high",
    coverageSessionId: session.id,
  });
  await addSupportInternalNote(ticket.id, "ai", `Escalade (${opts.issueType}) : ${opts.note}`);
  await setTicketOwnership(ticket.id, "awaiting_human");
  await incrementSessionCounters(session.id, { escalationsCreated: 1, casesProcessed: 1 });
  await notifyCoverage({
    notifyMode: session.notifyMode,
    category: opts.sensitive ? "urgent" : "approval",
    title: `${opts.sensitive ? "🚨 " : ""}Escalade support — ${short}`,
    description: opts.note.slice(0, 500),
  });
}

/** Emit a customer reply: auto-send if authorized (with lock + pre-send recheck),
 *  else stage a draft. Returns the outcome label for the run summary. */
async function emitReply(
  ticket: PipelineTicket,
  session: PipelineSession,
  opts: { reply: string; issueType: string; confidence: string; sensitive: boolean },
): Promise<string> {
  const short = `${ticket.reference} · ${opts.issueType} · ${opts.confidence}`;
  const fresh = await getLiveSession();
  const gate = fresh
    ? canAutoSend(fresh.core, fresh.effState, {
        channel: SUPPORT_CHANNEL,
        category: ticket.category,
        confidence: opts.confidence,
        sensitive: opts.sensitive,
      })
    : { allowed: false, reason: "no_live_session" };

  if (gate.allowed && (await claimTicketAiLock(ticket.id, `ai:${session.id}`, LOCK_TTL_MS))) {
    try {
      // Recheck immediately before sending: a newer customer message means the
      // situation changed — do not send a stale reply; the next cycle regenerates.
      const cur = await getSupportTicketRecord(ticket.id);
      if (cur) {
        const dto = supportTicketAdminDTO(cur);
        if (lastCustomerMessageAt(dto.replies, dto.createdAt) > ticket.lastCustomerAt) {
          await addSupportInternalNote(ticket.id, "ai", "Envoi annulé : nouveau message client avant l'envoi. Régénération au prochain cycle.");
          return "superseded";
        }
      }
      const res = await deliverSupportReply(ticket.id, opts.reply);
      if (res.ok) {
        await recordAutoSend({
          module: SUPPORT_ASSISTANT_MODULE,
          summary: `Réponse auto — ${short}`,
          content: opts.reply,
          entityId: ticket.id,
          coverageSessionId: session.id,
        });
        await addSupportInternalNote(ticket.id, "ai", `Réponse envoyée automatiquement (${opts.issueType}).`);
        await setTicketOwnership(ticket.id, "ai");
        await incrementSessionCounters(session.id, { messagesAutoSent: 1, casesProcessed: 1 });
        return "auto_sent";
      }
      await incrementSessionCounters(session.id, { failures: 1 });
      await addSupportInternalNote(ticket.id, "ai", `Échec de l'envoi automatique : ${res.error ?? "inconnu"}.`);
    } finally {
      await releaseTicketAiLock(ticket.id);
    }
  }

  // Draft path (draft-only mode, gate denied, lock contended, or send failed).
  await createApproval({
    module: SUPPORT_ASSISTANT_MODULE,
    actionType: "support_reply",
    summary: `Réponse proposée — ${short}`,
    proposedContent: opts.reply,
    entityType: "support_ticket",
    entityId: ticket.id,
    riskLevel: riskFor(opts.confidence),
    coverageSessionId: session.id,
  });
  await addSupportInternalNote(ticket.id, "ai", `Brouillon préparé (${opts.issueType}, ${gate.reason}).`);
  await setTicketOwnership(ticket.id, "ai");
  await incrementSessionCounters(session.id, { messagesDrafted: 1, casesProcessed: 1 });
  return "drafted";
}

async function supportBody(ticket: PipelineTicket, session: PipelineSession, ctx: ModuleRunContext): Promise<ModuleRunOutput> {
  const zeroUsage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  const noLlm = (summary: string, text = ""): ModuleRunOutput => ({ provider: ctx.provider, model: ctx.model, summary, text, usage: zeroUsage });

  // 1. IDENTIFY the customer/order from ALL signals before deciding anything —
  // a guest checkout (no account) is identified by their order email just like a
  // registered customer. Only a genuine non-match falls through to needs_info.
  const customerText = [ticket.message, ...ticket.replies.filter((r) => r.author === "customer").map((r) => r.body)]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
  const signals = extractIdentitySignals({ email: ticket.email, orderRef: ticket.orderRef, phone: ticket.phone, text: customerText });
  const identity = await resolveIdentity(signals);
  const { customer, order } = await contextForIdentity(identity, ctx.executionId);
  await addSupportInternalNote(
    ticket.id,
    "ai",
    identity.identified
      ? `Identité : identifié via ${identity.via.join(", ")} (client ${identity.customerId ?? "—"}, commande ${identity.orderId ?? "—"}, ${identity.ordersFound} commande(s)).`
      : `Identité : non identifié (signaux essayés : ${identity.via.join(", ") || "aucun"}).`,
  );

  // 2. Eligibility. An identified purchasing relationship is eligible — including
  // guests. Only fall back to the category heuristic when nothing matched.
  const eligibility = identity.identified
    ? "eligible"
    : assessEligibility({ orderRef: ticket.orderRef, customerId: ticket.customerId, category: ticket.category, ordersTotal: identity.ordersFound });

  if (eligibility === "route_manual") {
    await emitEscalation(ticket, session, {
      issueType: "hors_perimetre",
      note: "Aucun lien d'achat identifiable — hors périmètre du support IA. À trier manuellement.",
      sensitive: false,
    });
    return noLlm(`Support route_manual for ${ticket.reference}.`);
  }

  if (eligibility === "needs_info") {
    // Ask ONCE. If we've already engaged this ticket and still can't match, a human takes over.
    if ((await countApprovalsForEntity("support_ticket", ticket.id)) > 0) {
      await emitEscalation(ticket, session, {
        issueType: "non_apparie",
        note: "Informations demandées mais commande toujours introuvable — intervention humaine requise.",
        sensitive: false,
      });
      return noLlm(`Support needs_info→escalate for ${ticket.reference}.`);
    }
    const outcome = await emitReply(ticket, session, { reply: CLARIFY_MESSAGE, issueType: "demande_infos", confidence: "high", sensitive: false });
    return noLlm(`Support needs_info (${outcome}) for ${ticket.reference}.`, CLARIFY_MESSAGE);
  }

  // 3. Eligible → LLM decision, grounded on the resolved order + customer.
  const knowledge = await gatherSupportKnowledge();
  const completion = await ctx.client.complete({
    model: ctx.model,
    cache: ctx.cache,
    system: buildSupportPrompt(ctx.settings.reportLanguage, ctx.config.instructions),
    input: {
      ticket: {
        reference: ticket.reference,
        category: ticket.category,
        subIssue: ticket.subIssueLabel,
        orderRef: ticket.orderRef,
        firstMessage: ticket.message,
        conversation: ticket.replies.map((r) => ({ from: r.author, body: r.body })),
      },
      identity: { matchedVia: identity.via, ordersFound: identity.ordersFound },
      customer,
      order,
      knowledge,
    },
    maxTokens: ctx.maxTokens ?? undefined,
    timeoutMs: ctx.settings.providerTimeoutMs,
  });

  const decision = parseSupportDecision(completion.text);
  const sensitive = isSensitiveIssue(decision.issueType, ticket.category);
  await recordConfidenceSignal(session.id, decision.confidence === "low");

  const usage = { tokensIn: completion.usage.tokensIn, tokensOut: completion.usage.tokensOut, costUsd: completion.usage.estimatedCostUsd };
  const base = { provider: completion.provider, model: completion.model, usage, cache: completion.cache };

  let outcome: string;
  if (decision.outcome === "escalate") {
    await emitEscalation(ticket, session, { issueType: decision.issueType, note: decision.internalNote || "À traiter manuellement.", sensitive });
    outcome = "escalade";
  } else {
    outcome = await emitReply(ticket, session, { reply: decision.reply, issueType: decision.issueType, confidence: decision.confidence, sensitive });
  }

  // Operational "why" summary (not chain-of-thought) — the debugging trail.
  const orderStatus =
    order && typeof order === "object" && "order" in order && (order as { order?: { status?: string } }).order?.status
      ? (order as { order: { status: string } }).order.status
      : null;
  const orderLabel = identity.orderId
    ? `commande ${identity.orderId}${orderStatus ? ` (statut ${orderStatus})` : ""}`
    : ticket.orderRef
    ? `réf ${ticket.orderRef}`
    : "commande —";
  await addSupportInternalNote(
    ticket.id,
    "ai",
    [
      `Décision : ${outcome}`,
      `Problème : ${decision.issueType} (confiance ${decision.confidence})`,
      orderLabel,
      `identité via ${identity.via.join(", ") || "—"}`,
      `connaissances ${knowledge.revision}`,
      decision.internalNote ? `note : ${decision.internalNote}` : null,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 1200),
  );

  return {
    ...base,
    summary: `Support ${outcome} for ${ticket.reference} (${decision.issueType}).`,
    text: decision.outcome === "escalate" ? decision.internalNote : decision.reply,
  };
}

/** Handle one ticket through the guarded runner under an authorizing session. */
export async function draftForTicket(ticket: PipelineTicket, session: PipelineSession) {
  return runModule({
    module: SUPPORT_ASSISTANT_MODULE,
    trigger: "schedule",
    body: (ctx) => supportBody(ticket, session, ctx),
  });
}
