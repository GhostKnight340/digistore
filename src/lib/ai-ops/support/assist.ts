/**
 * Per-conversation manual AI assistance (Phase D) — server-only.
 *
 * Tools an admin can invoke on a SINGLE ticket from the inbox, EVEN WHEN coverage
 * is inactive: draft a reply, summarize, detect the issue, retrieve the relevant
 * policy, rewrite, translate, or suggest the next action. These return TEXT to
 * the admin and NEVER send anything to the customer — sending stays a manual
 * click. They run through the guarded runner (so the module-enabled + budget +
 * logging guardrails still apply), independent of any coverage session.
 */

import "server-only";

import { runModule, type ModuleRunContext, type ModuleRunOutput } from "../runner";
import { getSupportTicketRecord, supportTicketAdminDTO } from "@/lib/db/supportTickets";
import { SUPPORT_ASSISTANT_MODULE } from "./module";
import { gatherSupportKnowledge } from "./knowledge";
import { resolveTicketContext, customerMessageText } from "./ticketContext";

export const ASSIST_TOOLS = [
  "draft_reply",
  "summarize",
  "detect_issue",
  "retrieve_policy",
  "rewrite",
  "translate",
  "suggest_next_action",
] as const;
export type AssistTool = (typeof ASSIST_TOOLS)[number];

export function isAssistTool(value: string): value is AssistTool {
  return (ASSIST_TOOLS as readonly string[]).includes(value);
}

export interface AssistInput {
  ticketId: string;
  tool: AssistTool;
  /** Free text the tool operates on (rewrite/translate) — usually a draft reply. */
  text?: string;
  /** Target language for translate (e.g. "en", "ar", "fr"). */
  targetLanguage?: string;
}

const LANGUAGE_LABEL: Record<string, string> = { fr: "French", en: "English", ar: "Arabic" };

/** Per-tool instruction — all share the same grounding + no-invention discipline. */
function toolInstruction(tool: AssistTool, lang: string, targetLanguage?: string): string {
  const L = LANGUAGE_LABEL[lang?.toLowerCase()] ?? "French";
  const T = LANGUAGE_LABEL[targetLanguage?.toLowerCase() ?? ""] ?? "English";
  switch (tool) {
    case "draft_reply":
      return `Draft a grounded, concise, professional customer reply in ${L}. Use only verified data provided. If you cannot answer safely, say what is missing instead of inventing.`;
    case "summarize":
      return `Summarize this conversation for the support agent in ${L}: the customer's issue, what has happened, and the current state. Be brief and factual.`;
    case "detect_issue":
      return `Identify the customer's real issue and a short category label, in ${L}. State briefly why. Do not solve it.`;
    case "retrieve_policy":
      return `From the provided Ghost.ma knowledge only, quote and explain the policy/instructions relevant to this ticket, in ${L}. If nothing relevant is provided, say so — do not invent policy.`;
    case "rewrite":
      return `Rewrite the agent's draft below to be clearer, warmer, and professional, in ${L}, keeping its meaning and any commitments intact. Do not add new promises.`;
    case "translate":
      return `Translate the text below into ${T} faithfully, preserving tone and meaning. Output only the translation.`;
    case "suggest_next_action":
      return `Recommend the single best next operational action for the human agent on this ticket, in ${L}, grounded in the data. If it needs escalation or a sensitive action (refund, payment confirmation, code replacement, account security), say so.`;
    default:
      return `Assist the agent in ${L}, grounded strictly in the provided data.`;
  }
}

const BASE = [
  "You are the Ghost.ma Customer Support Assistant helping a human agent with ONE ticket.",
  "Ground everything strictly in the verified data provided (ticket, order, customer history, knowledge).",
  "The `order` object, WHEN PRESENT, is the exact order this ticket is about (resolved from the",
  "customer's order number/reference) — use ITS status/items directly to answer. Do NOT look for the",
  "referenced order inside `customer.recentOrders`; that list is indexed differently and will not contain",
  "it by that number. Only say an order can't be verified if `order` is genuinely absent.",
  "Never invent order/payment/delivery status, delivery times, or policy. Output plain text only (no JSON).",
  "This output is for the AGENT and/or a draft they will review — nothing is sent automatically.",
].join("\n");

async function assistBody(
  dto: ReturnType<typeof supportTicketAdminDTO>,
  input: AssistInput,
  ctx: ModuleRunContext,
): Promise<ModuleRunOutput> {
  const [knowledge, resolved] = await Promise.all([
    gatherSupportKnowledge(),
    resolveTicketContext(
      { email: dto.email, orderRef: dto.orderRef, phone: dto.phone, text: customerMessageText(dto.message, dto.replies) },
      ctx.executionId,
    ),
  ]);

  const completion = await ctx.client.complete({
    model: ctx.model,
    cache: ctx.cache,
    system: `${BASE}\n\n${toolInstruction(input.tool, ctx.settings.reportLanguage, input.targetLanguage)}`,
    input: {
      ticket: {
        reference: dto.reference,
        category: dto.category,
        subIssue: dto.subIssueLabel,
        orderRef: dto.orderRef,
        firstMessage: dto.message,
        conversation: dto.replies.map((r) => ({ from: r.author, body: r.body })),
      },
      identity: { matchedVia: resolved.identity.via, ordersFound: resolved.identity.ordersFound },
      customer: resolved.customer,
      order: resolved.order,
      knowledge,
      agentText: input.text ?? null,
    },
    maxTokens: ctx.maxTokens ?? undefined,
    timeoutMs: ctx.settings.providerTimeoutMs,
  });

  return {
    provider: completion.provider,
    model: completion.model,
    summary: `assist ${input.tool} for ${dto.reference}`,
    text: completion.text.trim(),
    usage: {
      tokensIn: completion.usage.tokensIn,
      tokensOut: completion.usage.tokensOut,
      costUsd: completion.usage.estimatedCostUsd,
    },
    cache: completion.cache,
  };
}

export type AssistResult = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Run one manual assist tool on a ticket. Works regardless of coverage state
 * (this is the human-in-the-loop path). Requires the module to be enabled; the
 * runner enforces that and the budget/logging guardrails. Never sends.
 */
export async function assistConversation(input: AssistInput): Promise<AssistResult> {
  const record = await getSupportTicketRecord(input.ticketId);
  if (!record) return { ok: false, reason: "ticket_not_found" };
  const dto = supportTicketAdminDTO(record);

  const result = await runModule({
    module: SUPPORT_ASSISTANT_MODULE,
    trigger: "manual",
    body: (ctx) => assistBody(dto, input, ctx),
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  const text = result.text.trim();
  return text ? { ok: true, text } : { ok: false, reason: "empty_output" };
}
