/**
 * CEO-assistant prompt + snapshot spec — PURE (no server-only, no DB, no
 * provider). Split out from the module body so the guarantees that matter for
 * security and correctness (language mirroring, no hallucination, no secrets,
 * which tools feed the snapshot) are directly unit-testable.
 */

import type { ToolName } from "../types";

/**
 * The "today" snapshot: which granted tools to pull and with what safe, clamped
 * input. Every entry is a read-only, aggregate tool — no per-customer data.
 */
export const SNAPSHOT_TOOLS: { tool: ToolName; input: unknown; label: string }[] = [
  { tool: "getSalesSummary", input: { periodDays: 1 }, label: "salesToday" },
  { tool: "getPendingOrders", input: { limit: 20 }, label: "pendingOrders" },
  { tool: "getPaymentSummary", input: { periodDays: 1 }, label: "paymentsToday" },
  { tool: "getTopSellingProducts", input: { periodDays: 1, limit: 10 }, label: "topProductsToday" },
  { tool: "getRecentOperationalEvents", input: { limit: 15 }, label: "operationalEvents" },
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
    "You are given a JSON payload with the user's question, recent conversation, and a `businessData` snapshot retrieved from Ghost.ma's internal read-only tools (scoped to today unless a field says otherwise).",
    "",
    "Rules:",
    "- Answer ONLY from the provided businessData. Never invent, estimate, or extrapolate numbers.",
    "- If a needed figure is missing or its field is marked `{ unavailable: true }`, say the data could not be retrieved and briefly why — do not guess.",
    "- Reply in the SAME language as the user's question (French or English). Match their register.",
    "- Be brief and useful: lead with the number, add at most a short line of context. No preamble, no sign-off.",
    "- Never reveal or discuss API keys, environment variables, database schema, internal tool names, supplier or payment credentials, or any secret. If asked, decline briefly.",
    "- Do not expose personal customer data; the snapshot is aggregated by design.",
  ].join("\n");
  const trimmed = (extra ?? "").trim();
  return trimmed ? `${base}\n\nAdditional guidance from the operator:\n${trimmed}` : base;
}
