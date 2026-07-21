/**
 * Daily Reports — the narrative prompt + structured-output schema (PURE).
 *
 * The AI is used ONLY for language: a short summary, recommendations, a trend
 * explanation, and the day's/period's top priorities. Every NUMBER is computed
 * deterministically and passed in as grounding — the model must never invent,
 * restate wrong, or estimate a figure. Structured JSON output keeps the prose
 * fields separate from the deterministic figures the formatter renders.
 *
 * Kept pure so the anti-hallucination rules and the schema are unit-testable.
 */

import { reportDefinition, type ReportType } from "./reportTypes";
import { NARRATIVE_BREVITY } from "../narrative";

/** The prose the model returns. Numbers live in the deterministic figures. */
export interface ReportNarrative {
  summary: string;
  recommendations: string[];
  trends: string;
  topPriorities: string[];
}

/** JSON schema the provider must satisfy (OpenRouter strict json_schema). */
export const REPORT_NARRATIVE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "recommendations", "trends", "topPriorities"],
  properties: {
    summary: { type: "string", description: "2-4 sentence executive summary of the period." },
    recommendations: {
      type: "array",
      items: { type: "string" },
      description: "Up to 4 concrete, actionable recommendations.",
    },
    trends: { type: "string", description: "One short paragraph explaining notable trends or 'stable' if none." },
    topPriorities: {
      type: "array",
      items: { type: "string" },
      description: "Up to 4 prioritized actions for the period ahead.",
    },
  },
};

/**
 * The system prompt for a report's narrative. `extra` is the module's admin-
 * configured instructions, appended beneath the hard rules. `language` is the
 * configured report language (ISO 639-1); the model writes prose in it.
 */
export function buildReportPrompt(type: ReportType, language: string, extra?: string): string {
  const def = reportDefinition(type);
  const lang = languageName(language);
  const base = [
    `You are the Ghost.ma executive assistant writing the ${def.title} for the company's leadership in Discord.`,
    "Ghost.ma is a Moroccan digital-goods store; all amounts are in Moroccan Dirham (MAD).",
    "",
    "You are given a JSON payload: `figures` (deterministic numbers already computed, covering the period named in `windowLabel`) and `unavailable` (a list of metric groups that could not be retrieved this run).",
    "",
    "Your job is the WORDS only — a brief executive read, not a dashboard. Speak like an assistant briefing a CEO.",
    "",
    NARRATIVE_BREVITY,
    "",
    "Hard rules:",
    "- NEVER invent, estimate, restate, or extrapolate any number. The formatter prints the figures itself; you reference them qualitatively (\"revenue was strong\", \"orders are waiting\") — do not repeat exact amounts you are unsure of, and never state a figure not present in `figures`.",
    "- If a figure is null, or its source is named in `unavailable`, treat that metric as 'could not be retrieved' — do not guess it.",
    `- Write ALL prose in ${lang}. Be concise; avoid walls of text and filler.`,
    "- Never reveal API keys, environment variables, database schema, internal tool names, or supplier/payment credentials.",
    "- Never expose personal customer data; the snapshot is aggregated by design.",
    "",
    "Output format: return ONLY a single JSON object — no markdown fences, no text before or after — with exactly these keys:",
    '{"summary": string, "recommendations": string[], "trends": string, "topPriorities": string[]}',
  ].join("\n");
  const trimmed = (extra ?? "").trim();
  return trimmed ? `${base}\n\nAdditional guidance from the operator:\n${trimmed}` : base;
}

function languageName(code: string): string {
  const c = (code ?? "").toLowerCase();
  if (c === "fr") return "French";
  if (c === "ar") return "Arabic";
  return "English";
}
