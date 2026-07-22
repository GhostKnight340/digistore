/**
 * Daily Reports — the intelligence-brief prompt + structured-output schema (PURE).
 *
 * These reports must read like an intelligent employee briefing the owner, NOT a
 * dashboard exported to Discord. The admin dashboard already shows revenue,
 * order counts, and payment splits, so the report's job is interpretation:
 * what changed, what is unusual, why it might be happening, and what to do next.
 *
 * The AI writes the WORDS. Every NUMBER is computed deterministically upstream
 * (in metrics/comparison) and passed in as `figures` + `comparison`; the model
 * may only QUOTE a number that appears verbatim there — never invent, estimate,
 * or compute one (percentages included). Kept pure so the anti-hallucination
 * rules, the whitelist rule, and the schema stay unit-testable.
 */

import { extractJsonObject } from "../narrative";
import { reportDefinition, type ReportType } from "./reportTypes";

/**
 * The briefing prose the model returns — the spec's report structure. Any array
 * or string may be empty: the formatter OMITS sections with no content, because
 * a report should never pad with observations that carry no insight.
 */
export interface ReportNarrative {
  /** The single most important development, in 1-3 sentences. */
  executiveSummary: string;
  /** Meaningful differences from the previous period (bullets). */
  whatChanged: string[];
  /** Unusual patterns, failures, unresolved work, developing risks (bullets). */
  anomalies: string[];
  /** The probable reason, clearly marked as inference. Empty if evidence is thin. */
  likelyExplanation: string;
  /** At most three specific, data-connected actions. */
  recommendedActions: string[];
  /** What is working and should be left alone (weekly/monthly). Empty otherwise. */
  keepUnchanged: string;
  /** What to monitor over the next period. */
  watchList: string;
}

/** JSON schema the provider must satisfy (OpenRouter strict json_schema). */
export const REPORT_NARRATIVE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["executiveSummary", "whatChanged", "anomalies", "likelyExplanation", "recommendedActions", "keepUnchanged", "watchList"],
  properties: {
    executiveSummary: { type: "string", description: "1-3 sentences on the single most important development." },
    whatChanged: { type: "array", items: { type: "string" }, description: "Meaningful differences vs the previous period. Empty if nothing changed." },
    anomalies: { type: "array", items: { type: "string" }, description: "Unusual patterns, failures, unresolved work, risks. Empty if none." },
    likelyExplanation: { type: "string", description: "Probable reason, marked as inference. Empty if evidence is thin." },
    recommendedActions: { type: "array", items: { type: "string" }, description: "At most 3 specific, data-connected actions." },
    keepUnchanged: { type: "string", description: "What is working and should be left alone. Empty if nothing notable." },
    watchList: { type: "string", description: "What to monitor next period." },
  },
};

/** What each report is FOR — steers the model's altitude and time horizon. */
const REPORT_FOCUS: Record<ReportType, string> = {
  morning:
    "Prepare the owner for the day: what happened overnight, what is still unresolved, what deserves attention first, and what to watch today.",
  evening:
    "Evaluate the day, do not summarize totals: what materially improved or worsened, what created friction, what remains unresolved, and what carries into tomorrow.",
  weekly:
    "Focus on trends and decisions: what pattern became visible this week, what improved or deteriorated, where the business is becoming dependent, what to change next week, and what to leave unchanged.",
  monthly:
    "Be strategic: what the business learned this month, which systems are becoming bottlenecks, which opportunities look repeatable, where it is too dependent, and what deserves investment next month.",
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
    `You are the Ghost.ma executive assistant writing the ${def.title} for the company's owner in Discord.`,
    "Ghost.ma is a Moroccan digital-goods store; all amounts are in Moroccan Dirham (MAD).",
    "",
    "This report is an intelligence brief, NOT a dashboard. The owner already sees revenue, order counts, payment splits, and top products in the admin dashboard — do NOT restate them. A KPI dump is a failure. Your job is to answer: What changed? What is unusual? What needs attention? Why might it be happening? What should I do next?",
    "",
    `Focus of THIS report — ${REPORT_FOCUS[type]}`,
    "",
    "You are given a JSON payload:",
    "- `figures`: deterministic numbers already computed for the current window (`windowLabel`).",
    "- `comparison`: period-over-period deltas vs the previous window (`baselineLabel`). `available:false` means the baseline could not be read — then make NO 'what changed' claims. `currentIsPartial:true` means the window is still in progress, so do not read too much into absolute totals.",
    "- `unavailable`: metric groups that could not be retrieved this run.",
    "",
    "The number whitelist (hard rule):",
    "- You may state a number ONLY if it appears verbatim in `figures` or `comparison`. Never invent, estimate, extrapolate, or restate a figure that is not there.",
    "- Percentages: use ONLY the pre-formatted `deltaPct` strings in `comparison`. Never compute your own percentage.",
    "- Most sentences need NO number at all. Include a figure only when it is required to make an insight land (spec: 'Two of yesterday's eight orders were delayed by payment review'). Otherwise describe the movement qualitatively.",
    "- If a figure is null, or its source is named in `unavailable`, treat it as 'could not be retrieved' — do not guess it.",
    "",
    "Writing rules:",
    "- Prioritize interpretation over repetition. Compare against the baseline. Explain why an issue matters.",
    "- Separate fact from inference. For any cause, use hedged phrasing ('this likely indicates…', 'a possible explanation is…'); never state speculation as fact.",
    "- recommendedActions: at most 3, each specific and tied to the observed data. No generic advice.",
    "- Omit any section with no meaningful insight (return an empty string/array). Do NOT pad, do NOT praise normal operation, do NOT repeat the same point across sections.",
    "- When nothing meaningful happened, say so plainly in executiveSummary and leave the other sections empty. That is better than filler.",
    "- The whole thing must be readable in under a minute.",
    `- Write ALL prose in ${lang}.`,
    "- Never reveal API keys, environment variables, database schema, internal tool names, or supplier/payment credentials. Never expose personal customer data.",
    "",
    "Output format: return ONLY a single JSON object — no markdown fences, no text before or after — with exactly these keys:",
    '{"executiveSummary": string, "whatChanged": string[], "anomalies": string[], "likelyExplanation": string, "recommendedActions": string[], "keepUnchanged": string, "watchList": string}',
  ].join("\n");
  const trimmed = (extra ?? "").trim();
  return trimmed ? `${base}\n\nAdditional guidance from the operator:\n${trimmed}` : base;
}

/**
 * Coerces a completion's text into a briefing narrative. When the model returned
 * usable prose (a JSON object with a non-empty executiveSummary), that is used;
 * otherwise the provided deterministic `fallback` is returned unchanged.
 */
export function coerceReportNarrative(text: string, fallback: ReportNarrative): ReportNarrative {
  const s = extractJsonObject(text);
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown, cap: number): string[] =>
    Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, cap) : [];

  const executiveSummary = s ? str(s.executiveSummary) : "";
  if (!executiveSummary) return fallback;
  return {
    executiveSummary,
    whatChanged: arr(s!.whatChanged, 4),
    anomalies: arr(s!.anomalies, 4),
    likelyExplanation: str(s!.likelyExplanation),
    recommendedActions: arr(s!.recommendedActions, 3),
    keepUnchanged: str(s!.keepUnchanged),
    watchList: str(s!.watchList),
  };
}

function languageName(code: string): string {
  const c = (code ?? "").toLowerCase();
  if (c === "fr") return "French";
  if (c === "ar") return "Arabic";
  return "English";
}
