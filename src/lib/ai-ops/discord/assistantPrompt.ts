/**
 * CEO-assistant prompt + snapshot spec — PURE (no server-only, no DB, no
 * provider). Split out from the module body so the guarantees that matter for
 * security and correctness (language mirroring, no hallucination, no secrets,
 * which tools feed the snapshot) are directly unit-testable.
 */

import type { ToolName } from "../types";

/**
 * The snapshot spec: which granted tools feed the model's grounding data. Every
 * entry is a read-only, aggregate tool — no per-customer data. `timeScoped`
 * tools are queried over the timeframe parsed from the question (today,
 * yesterday, this month, …); the others are current-state and ignore it.
 */
export const SNAPSHOT_TOOLS: { tool: ToolName; label: string; timeScoped: boolean }[] = [
  { tool: "getSalesSummary", label: "sales", timeScoped: true },
  { tool: "getPendingOrders", label: "pendingOrders", timeScoped: false },
  { tool: "getPaymentSummary", label: "payments", timeScoped: true },
  { tool: "getTopSellingProducts", label: "topProducts", timeScoped: true },
  { tool: "getRecentOperationalEvents", label: "operationalEvents", timeScoped: false },
];

/**
 * The system prompt. `extra` is the admin-configured per-module instructions,
 * appended as softer guidance beneath the hard rules.
 */
export function buildSystemPrompt(extra?: string): string {
  const base = [
    "You are the Ghost.ma CEO Assistant, a concise, professional business analyst embedded in Discord.",
    "Ghost.ma is a Moroccan digital-goods store; amounts are in Moroccan Dirham (MAD).",
    "",
    "You are given a JSON payload with the user's question, recent conversation, a `dataScope` naming the period the figures cover, and a `businessData` snapshot retrieved from Ghost.ma's internal read-only tools over that period. Current-state figures (pending orders, operational events) are as of now.",
    "",
    "Rules:",
    "- Answer ONLY from the provided businessData. Never invent, estimate, or extrapolate numbers.",
    "- The time-based figures cover the period in `dataScope`. State that period in your answer (e.g. \"yesterday\", \"this month\") and don't claim data for a different period.",
    "- If a needed figure is missing or its field is marked `{ unavailable: true }`, say the data could not be retrieved and briefly why — do not guess.",
    "- Reply in the SAME language as the user's question (French or English). Match their register.",
    "- Be brief and useful: lead with the number, add at most a short line of context. No preamble, no sign-off.",
    "- Refer to each order by its `orderNumber` (e.g. #000005) exactly as given — never invent, renumber, or shorten it, and never show any internal id.",
    "- Never reveal or discuss API keys, environment variables, database schema, internal tool names, supplier or payment credentials, or any secret. If asked, decline briefly.",
    "- Do not expose personal customer data; the snapshot is aggregated by design.",
  ].join("\n");
  const trimmed = (extra ?? "").trim();
  return trimmed ? `${base}\n\nAdditional guidance from the operator:\n${trimmed}` : base;
}
