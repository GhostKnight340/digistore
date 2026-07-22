/**
 * The support assistant's structured decision — pure, no DB, unit-testable.
 *
 * Every processed ticket ends in exactly one decision. The model is asked to
 * return JSON matching this contract; `parseSupportDecision` extracts and
 * validates it. The cardinal rule is FAIL SAFE: any malformed, missing, or
 * empty-reply output collapses to an `escalate` decision, never a fabricated
 * customer reply. Escalating is always better than sending something wrong.
 *
 * Two outcomes only (the four vision outcomes fold into these for v1):
 *   - draft_reply : a customer-facing reply is proposed for human approval.
 *                   Covers "resolve" and "ask the customer for more info".
 *   - escalate    : the assistant will not draft a customer reply; it records
 *                   why and hands the ticket to a human. Covers "escalate" and
 *                   "prepare for human review".
 */

export type SupportOutcome = "draft_reply" | "escalate";
export type SupportConfidence = "low" | "medium" | "high";

export interface SupportDecision {
  outcome: SupportOutcome;
  /** Short label for the identified issue, e.g. "order_status", "refund_request". */
  issueType: string;
  confidence: SupportConfidence;
  /** Customer-facing reply. Non-empty only when outcome === "draft_reply". */
  reply: string;
  /** Internal reasoning / what a human should do. Never shown to the customer. */
  internalNote: string;
}

const CONFIDENCES: readonly SupportConfidence[] = ["low", "medium", "high"];

/** Build the fail-safe escalation used whenever the model output can't be trusted. */
export function escalation(issueType: string, internalNote: string): SupportDecision {
  return {
    outcome: "escalate",
    issueType: issueType.slice(0, 60) || "unknown",
    confidence: "low",
    reply: "",
    internalNote: internalNote.slice(0, 2000),
  };
}

/** Pull the first balanced `{...}` JSON object out of a possibly-fenced string. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse the model's raw text into a validated decision. Never throws — anything
 * it can't confidently read becomes an escalation carrying a short diagnostic so
 * a human sees why the assistant stepped back.
 */
export function parseSupportDecision(raw: string): SupportDecision {
  const json = extractJsonObject(raw ?? "");
  if (!json) return escalation("unparseable", "Assistant produced no structured decision; needs a human reply.");

  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return escalation("unparseable", "Assistant output was not a JSON object; needs a human reply.");
    }
    obj = parsed as Record<string, unknown>;
  } catch {
    return escalation("unparseable", "Assistant output was not valid JSON; needs a human reply.");
  }

  const issueType = typeof obj.issueType === "string" ? obj.issueType.slice(0, 60) : "unknown";
  const internalNote = typeof obj.internalNote === "string" ? obj.internalNote.slice(0, 2000) : "";
  const confidence: SupportConfidence = CONFIDENCES.includes(obj.confidence as SupportConfidence)
    ? (obj.confidence as SupportConfidence)
    : "low";

  // Anything other than an explicit, non-empty draft_reply is treated as an escalation.
  if (obj.outcome !== "draft_reply") {
    return {
      outcome: "escalate",
      issueType,
      confidence,
      reply: "",
      internalNote: internalNote || "Assistant chose to escalate.",
    };
  }

  const reply = typeof obj.reply === "string" ? obj.reply.trim() : "";
  if (!reply) {
    return escalation(issueType, "Assistant intended a reply but produced none; needs a human reply.");
  }

  return {
    outcome: "draft_reply",
    issueType,
    confidence,
    reply: reply.slice(0, 4000),
    internalNote,
  };
}
