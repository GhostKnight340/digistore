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
  /** Optional agent explanation/translation of the customer's message — trusted.
   *  Use when the message is in Moroccan Arabic (Darija) or otherwise unclear. */
  agentContext?: string;
}

const LANGUAGE_LABEL: Record<string, string> = { fr: "French", en: "English", ar: "Arabic" };

/** Rare separator joining a draft reply and its agent note through runModule. */
const NOTE_SEP = "␞";

/** Per-tool instruction — all share the same grounding + no-invention discipline. */
function toolInstruction(tool: AssistTool, lang: string, targetLanguage?: string): string {
  const L = LANGUAGE_LABEL[lang?.toLowerCase()] ?? "French";
  const T = LANGUAGE_LABEL[targetLanguage?.toLowerCase() ?? ""] ?? "English";
  switch (tool) {
    case "draft_reply":
      return [
        `Produce TWO things about this ticket, grounded strictly in the verified data:`,
        `1. "reply": a customer-facing reply in ${L} that is FRIENDLY, PROFESSIONAL and HUMAN — warm and`,
        `   natural, like a real Ghost.ma support person, not a robot. Concise: one greeting, the answer/next`,
        `   step, one short sign-off. No over-apologizing, no filler, no invented facts.`,
        `2. "agentNote": a short note FOR THE AGENT (the human reading this, in ${L}): exactly what is going`,
        `   on and what YOU need to do next — e.g. "Payment still pending review; confirm it before promising",`,
        `   or "Order delivered ${"—"} no action needed", or "Refund requested ${"—"} escalate, don't promise".`,
        `   Be direct and specific.`,
        `If you cannot answer safely, put a brief holding reply in "reply" and say what's missing in "agentNote".`,
        `Return ONLY a JSON object: {"reply": "...", "agentNote": "..."} and nothing else.`,
      ].join("\n");
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
  "If `agentContext` is provided, it is the AGENT's own explanation or translation of the customer's",
  "message (e.g. the ticket was written in Moroccan Arabic / Darija). Treat it as ACCURATE and use it to",
  "understand what the customer is asking — it is a trusted instruction from staff, not a customer claim.",
  "RESOLUTION DISCIPLINE: You ARE Ghost.ma support — NEVER tell the customer to contact support / WhatsApp",
  "/ email as the resolution; they are already talking to us. Do NOT suggest a step they already tried or",
  "said didn't work (e.g. if they can't find the delivery e-mail, don't tell them to check spam again). A",
  "DELIVERED order whose code/e-mail the customer can't find → the fix is that WE re-send the delivery; say",
  "we're re-sending it (never paste the code), and in agentNote tell the agent to resend it.",
  "Never invent order/payment/delivery status, delivery times, or policy. Output plain text — except the",
  "draft_reply tool, which returns the JSON object it specifies.",
  "This output is for the AGENT and/or a draft they will review — nothing is sent automatically.",
].join("\n");

/** Pull the first balanced JSON object out of possibly-fenced text. */
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        const v = JSON.parse(text.slice(start, i + 1));
        return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

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
      agentContext: input.agentContext ?? null,
    },
    maxTokens: ctx.maxTokens ?? undefined,
    timeoutMs: ctx.settings.providerTimeoutMs,
  });

  // draft_reply returns {reply, agentNote} — join with a rare separator so the
  // agent note survives runModule (which only carries `text`); split back later.
  let text = completion.text.trim();
  if (input.tool === "draft_reply") {
    const parsed = extractJson(completion.text);
    const reply = parsed && typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    const agentNote = parsed && typeof parsed.agentNote === "string" ? parsed.agentNote.trim() : "";
    if (reply) text = agentNote ? `${reply}${NOTE_SEP}${agentNote}` : reply;
  }

  return {
    provider: completion.provider,
    model: completion.model,
    summary: `assist ${input.tool} for ${dto.reference}`,
    text,
    usage: {
      tokensIn: completion.usage.tokensIn,
      tokensOut: completion.usage.tokensOut,
      costUsd: completion.usage.estimatedCostUsd,
    },
    cache: completion.cache,
  };
}

export type AssistResult =
  | { ok: true; text: string; note?: string }
  | { ok: false; reason: string };

/**
 * Run one manual assist tool on a ticket. Works regardless of coverage state
 * (this is the human-in-the-loop path). Requires the module to be enabled; the
 * runner enforces that and the budget/logging guardrails. Never sends.
 *
 * For draft_reply, `text` is the customer-facing reply and `note` is the
 * agent-facing "what's wrong / what to do" summary (split from the joined text).
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
  const raw = result.text.trim();
  if (!raw) return { ok: false, reason: "empty_output" };
  const [text, note] = raw.includes(NOTE_SEP) ? raw.split(NOTE_SEP) : [raw, undefined];
  return { ok: true, text: text.trim(), note: note?.trim() || undefined };
}
