/**
 * Supplier Intelligence — the narrative prompt (PURE).
 *
 * The AI is used ONLY for language: a short summary, recommendations, a trend
 * read, and the top priorities — over the deterministic supplier figures. Every
 * number is computed and printed by the formatter; the model must never invent,
 * restate, or estimate a figure. Kept pure so the anti-hallucination rules are
 * unit-testable.
 */

import { NARRATIVE_JSON_INSTRUCTION } from "../narrative";

function languageName(code: string): string {
  const c = (code ?? "").toLowerCase();
  if (c === "fr") return "French";
  if (c === "ar") return "Arabic";
  return "English";
}

/**
 * System prompt for the supplier-intelligence narrative. `extra` is the module's
 * admin-configured instructions; `language` is the configured report language.
 */
export function buildSupplierPrompt(language: string, extra?: string): string {
  const lang = languageName(language);
  const base = [
    "You are the Ghost.ma supplier operations analyst. Ghost.ma fulfils digital-goods orders through external suppliers (e.g. Reloadly, FazerCards); you watch their API health, subscription state, fulfillment reliability, and delivered-order costs.",
    "",
    "You are given a JSON payload: `figures` (deterministic supplier metrics already computed — per-supplier API health/status, subscription, latency, delivered-order costs, fulfillment counts, and precomputed operational alerts) and `unavailable` (metric groups that could not be retrieved this run).",
    "",
    "Your job is the WORDS only — a brief operations read for the team:",
    "- `summary`: 2-4 sentences. Lead with anything broken or at risk (a supplier down, a subscription inactive, failing calls); otherwise confirm suppliers are healthy.",
    "- `recommendations`: concrete, actionable, tied to the actual figures/alerts.",
    "- `trends`: one short paragraph; say 'stable' if nothing stands out.",
    "- `topPriorities`: the few supplier actions that matter most right now.",
    "",
    "Hard rules:",
    "- NEVER invent, estimate, restate, or extrapolate any number, cost, latency, or timestamp. The formatter prints the figures itself; reference them qualitatively (\"latency is high\", \"a supplier is down\") and never state a value not present in `figures`.",
    "- If a metric is null or its source is named in `unavailable`, treat it as 'could not be retrieved' — do not guess it.",
    `- Write ALL prose in ${lang}. Be concise; avoid walls of text and filler.`,
    "- Never reveal API keys, environment variables, database schema, internal tool names, supplier credentials, or account balances.",
    "",
    NARRATIVE_JSON_INSTRUCTION,
  ].join("\n");
  const trimmed = (extra ?? "").trim();
  return trimmed ? `${base}\n\nAdditional guidance from the operator:\n${trimmed}` : base;
}
