/**
 * Shared AI-narrative contract for the report-style modules (Daily Reports,
 * Supplier Intelligence, …). PURE — no server-only, no DB, no provider.
 *
 * These modules use the AI for PROSE ONLY: a short summary, recommendations, a
 * trend explanation, and top priorities. Every number is computed
 * deterministically and printed by the formatter, so the model never states a
 * figure. To stay robust on small/free models (which often reject a strict
 * `response_format: json_schema`), the model is asked in the prompt to return a
 * plain JSON object and the text is parsed leniently here — with a deterministic
 * fallback so a parse miss or a provider outage never breaks the module.
 */

export interface AiNarrative {
  summary: string;
  recommendations: string[];
  trends: string;
  topPriorities: string[];
}

/** The output-format instruction appended to a module's system prompt. */
export const NARRATIVE_JSON_INSTRUCTION = [
  "Output format: return ONLY a single JSON object — no markdown fences, no text before or after — with exactly these keys:",
  '{"summary": string, "recommendations": string[], "trends": string, "topPriorities": string[]}',
].join("\n");

/**
 * Leniently extracts the first JSON object from a completion. Free/small models
 * often wrap JSON in prose or code fences, so we scan for a balanced `{…}` block
 * rather than trusting strict structured output. Returns null when nothing
 * parseable is found.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(t.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Coerces a completion's text into a narrative. When the model returned usable
 * prose (a JSON object with a non-empty summary), that is used; otherwise the
 * provided deterministic `fallback` is returned unchanged.
 */
export function coerceNarrative(text: string, fallback: AiNarrative): AiNarrative {
  const s = extractJsonObject(text);
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, 4) : [];

  const summary = s ? str(s.summary) : "";
  if (!summary) return fallback;
  return {
    summary,
    recommendations: arr(s!.recommendations),
    trends: str(s!.trends),
    topPriorities: arr(s!.topPriorities),
  };
}
