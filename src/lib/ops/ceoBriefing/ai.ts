/**
 * CEO Briefing — prompt construction, strict response validation, and assembly
 * of the final DTO from a validated AI decision.
 *
 * PURE (no provider/DB import) so validation is unit-testable in isolation. The
 * orchestrator does the actual `client.complete()` call and hands the raw result
 * here. The AI is a WRITER + PRIORITIZER only: it must pick a candidate type and
 * approved action ids that were given to it, and it may never lower a genuine
 * critical — any violation throws and the caller falls back deterministically.
 */

import type { CeoBriefingDTO } from "@/lib/dto";
import { isActionId, resolveActions } from "./actions";
import { EYEBROW, PRIORITY_LABEL } from "./fallback";
import type { ActionId, AiBriefingDecision, BriefingAiPayload, CandidateIssue } from "./types";

/** Stable, cacheable system prompt. Lists the contract + closed enums generically. */
export const BRIEFING_SYSTEM_PROMPT = `Tu es l'assistant de direction de Ghost.ma, une boutique de cartes cadeaux et de crédits numériques. Tu rédiges un briefing exécutif d'UNE seule situation : la chose la plus importante à traiter maintenant, et l'action suivante recommandée.

Règles STRICTES :
- N'invente jamais de faits, de chiffres, de routes ou d'actions. Utilise uniquement les faits fournis.
- Choisis UNE situation parmi les "candidates" fournies. "primaryIssueType" doit être un des "type" de la liste "candidates" (ou "HEALTHY" si tout va bien).
- Ne rétrograde jamais un problème critique : s'il existe un candidat de sévérité "critical", l'état doit être "critical" et primaryIssueType doit désigner un candidat critique.
- "primaryActionId" et "secondaryActionId" doivent provenir UNIQUEMENT de "allowedActionIds". secondaryActionId peut être null.
- Sois concis, en français. Ne répète pas une liste d'alertes : synthétise. Ne dépasse pas les limites de longueur.
- "reasoningSummary" est une justification factuelle courte (pas de raisonnement interne).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
{
  "state": "critical" | "attention" | "opportunity" | "healthy",
  "eyebrow": string | null,        // catégorie courte, ≤ 24 caractères
  "title": string,                  // ≤ 70 caractères
  "summary": string,                // ≤ 180 caractères
  "context": string | null,         // ≤ 120 caractères
  "primaryIssueType": string,       // un "type" de candidates, ou "HEALTHY"
  "primaryActionId": string,        // un id de allowedActionIds
  "secondaryActionId": string | null,
  "reasoningSummary": string,       // ≤ 200 caractères, factuel
  "confidence": number              // 0.0 à 1.0
}`;

/** Build the {system, input} pair for the completion. */
export function buildBriefingPrompt(payload: BriefingAiPayload): { system: string; input: BriefingAiPayload } {
  return { system: BRIEFING_SYSTEM_PROMPT, input: payload };
}

const VALID_STATES = new Set(["critical", "attention", "opportunity", "healthy"]);

/** Minimal balanced-brace JSON extractor (tolerates code fences / surrounding prose). */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
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
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(start, i + 1));
          return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Validate a raw AI response (already-parsed object from `structured`, or a text
 * blob) into a safe {@link AiBriefingDecision}. THROWS on any violation so the
 * orchestrator falls back. `candidates` and `allowedActionIds` are the eligible
 * sets the model was given; anything outside them is rejected.
 */
export function validateAiDecision(
  raw: unknown,
  candidates: CandidateIssue[],
  allowedActionIds: ActionId[],
): AiBriefingDecision {
  const obj = typeof raw === "string" ? extractJsonObject(raw) : (raw as Record<string, unknown> | null);
  if (!obj || typeof obj !== "object") throw new Error("briefing: response is not a JSON object");

  const state = obj.state;
  if (typeof state !== "string" || !VALID_STATES.has(state)) throw new Error(`briefing: invalid state ${String(state)}`);

  const title = str(obj.title);
  const summary = str(obj.summary);
  if (!title || !summary) throw new Error("briefing: missing title/summary");
  // Reject grossly-oversized text (garbage); tolerate minor overage by trimming.
  if (title.length > 100 || summary.length > 260) throw new Error("briefing: text exceeds limits");

  const context = str(obj.context);
  if (context && context.length > 220) throw new Error("briefing: context too long");
  const eyebrow = str(obj.eyebrow);
  const reasoningSummary = str(obj.reasoningSummary);

  const candidateTypes = new Set<string>(candidates.map((c) => c.type));
  const primaryIssueType = obj.primaryIssueType;
  if (typeof primaryIssueType !== "string" || (primaryIssueType !== "HEALTHY" && !candidateTypes.has(primaryIssueType))) {
    throw new Error(`briefing: unknown primaryIssueType ${String(primaryIssueType)}`);
  }

  const allowed = new Set<string>(allowedActionIds);
  const primaryActionId = obj.primaryActionId;
  if (typeof primaryActionId !== "string" || !isActionId(primaryActionId) || !allowed.has(primaryActionId)) {
    throw new Error(`briefing: unapproved primaryActionId ${String(primaryActionId)}`);
  }
  let secondaryActionId: ActionId | null = null;
  if (obj.secondaryActionId != null) {
    const sid = obj.secondaryActionId;
    if (typeof sid !== "string" || !isActionId(sid) || !allowed.has(sid)) {
      throw new Error(`briefing: unapproved secondaryActionId ${String(sid)}`);
    }
    if (sid !== primaryActionId) secondaryActionId = sid;
  }

  // Safety: the deterministic layer decides severity. If a real critical exists,
  // the AI must keep it critical and point at a critical candidate.
  const criticalTypes = new Set<string>(candidates.filter((c) => c.severity === "critical").map((c) => c.type));
  if (criticalTypes.size > 0) {
    if (state !== "critical") throw new Error("briefing: AI downgraded a critical issue");
    if (!criticalTypes.has(primaryIssueType)) throw new Error("briefing: AI ignored the critical issue");
  }

  const confRaw = typeof obj.confidence === "number" && Number.isFinite(obj.confidence) ? obj.confidence : 0.5;
  const confidence = Math.min(1, Math.max(0, confRaw));

  return {
    state: state as AiBriefingDecision["state"],
    eyebrow: eyebrow ? eyebrow.slice(0, 24) : null,
    title: title.slice(0, 70),
    summary: summary.slice(0, 180),
    context: context ? context.slice(0, 120) : null,
    primaryIssueType: primaryIssueType as AiBriefingDecision["primaryIssueType"],
    primaryActionId,
    secondaryActionId,
    reasoningSummary: (reasoningSummary ?? "").slice(0, 200),
    confidence,
  };
}

/**
 * Assemble the final public DTO from a validated decision. Actions are resolved
 * server-side from the approved ids against the matched candidate (for entity
 * hrefs); priority label and eyebrow come from the deterministic candidate.
 */
export function assembleFromDecision(
  decision: AiBriefingDecision,
  candidates: CandidateIssue[],
  now: string,
  snapshotHash: string,
): CeoBriefingDTO {
  const matched = candidates.find((c) => c.type === decision.primaryIssueType);
  const priorityLabel = matched ? PRIORITY_LABEL[matched.severity] : PRIORITY_LABEL.healthy;
  const eyebrow = decision.eyebrow ?? (matched ? EYEBROW[matched.type] ?? null : null);
  return {
    state: decision.state,
    eyebrow,
    title: decision.title,
    summary: decision.summary,
    context: decision.context,
    priorityLabel,
    reasoningSummary: decision.reasoningSummary || (matched ? matched.description : null),
    actions: resolveActions([decision.primaryActionId, decision.secondaryActionId], matched),
    source: "ai",
    confidence: decision.confidence,
    generatedAt: now,
    snapshotHash,
  };
}
