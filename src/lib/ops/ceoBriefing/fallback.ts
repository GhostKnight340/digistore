/**
 * Deterministic briefing renderer — the fallback that runs when the AI is
 * unavailable, times out, is rate-limited, or returns something invalid. It also
 * powers the instant client-side view while the AI briefing loads. It NEVER
 * produces an empty card or an error string; it always picks the highest-priority
 * candidate and writes a useful, factual briefing.
 *
 * PURE and client-safe (no AI, no DB, no network).
 */

import type { CeoBriefingDTO, CeoBriefingState } from "@/lib/dto";
import type { OperationsSnapshotDTO } from "@/lib/dto";
import { resolveActions } from "./actions";
import { computeCandidates, materialFactsHash, pickTopCandidate } from "./candidates";
import type { CandidateExtras, CandidateIssue, CandidateType, IssueSeverity } from "./types";

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export const EYEBROW: Partial<Record<CandidateType, string>> = {
  SYSTEM_HEALTH: "Système",
  SUPPLIER_OFFLINE: "Fournisseurs",
  SUPPLIER_BALANCE_CRITICAL: "Fournisseurs",
  SUPPLIER_BALANCE_LOW: "Fournisseurs",
  ORDERS_PAYMENT_ISSUE: "Commandes",
  ORDERS_STUCK: "Commandes",
  FAILED_PURCHASES: "Livraison",
  PAYMENT_PROVIDER_WARNING: "Paiements",
  PAYMENT_MISCONFIGURED: "Paiements",
  PAYMENT_REVIEW_BACKLOG: "Paiements",
  EMAIL_FAILURES: "E-mails",
  SUPPORT_BACKLOG: "Support",
  PRODUCTS_COVERAGE: "Catalogue",
  LAUNCH_BLOCKER: "Lancement",
  GROWTH_OPPORTUNITY: "Opportunité",
};

export const PRIORITY_LABEL: Record<IssueSeverity, string> = {
  critical: "Priorité urgente",
  high: "Priorité élevée",
  medium: "Priorité moyenne",
  opportunity: "Opportunité",
  healthy: "Tout est opérationnel",
};

/** Map a candidate to the presentational state. */
export function stateForCandidate(c: CandidateIssue): CeoBriefingState {
  if (c.type === "HEALTHY") return "healthy";
  if (c.type === "GROWTH_OPPORTUNITY") return "opportunity";
  if (c.type === "LAUNCH_BLOCKER") return "launch";
  if (c.severity === "critical") return "critical";
  return "attention";
}

/** A short factual justification (never chain-of-thought). */
function reasoningFor(top: CandidateIssue): string {
  if (top.count > 0) {
    return truncate(`${top.description} ${top.count} élément(s) concerné(s).`, 180);
  }
  return truncate(top.description, 180);
}

/** A concise combined supporting fact, or null. */
function contextFor(top: CandidateIssue, all: CandidateIssue[]): string | null {
  if (top.count > 0 && ["SUPPLIER_OFFLINE", "SUPPLIER_BALANCE_CRITICAL", "FAILED_PURCHASES"].includes(top.type)) {
    return truncate(`${top.count} commande(s) en attente de livraison.`, 120);
  }
  // Surface a second, distinct high/critical concern so the CEO sees breadth.
  const second = all.find((c) => c !== top && (c.severity === "critical" || c.severity === "high"));
  return second ? truncate(second.title, 120) : null;
}

/**
 * Build a full briefing DTO from candidates deterministically. Exposed so the
 * orchestrator can reuse it as the fallback and the client can render instantly.
 */
export function fallbackBriefingFromCandidates(
  candidates: CandidateIssue[],
  now: string,
  snapshotHash: string,
): CeoBriefingDTO {
  const top = pickTopCandidate(candidates);
  return {
    state: stateForCandidate(top),
    eyebrow: EYEBROW[top.type] ?? null,
    title: truncate(top.title, 70),
    summary: truncate(top.description, 180),
    context: contextFor(top, candidates),
    priorityLabel: PRIORITY_LABEL[top.severity],
    reasoningSummary: reasoningFor(top),
    actions: resolveActions(top.allowedActionIds, top),
    source: "fallback",
    confidence: null,
    generatedAt: now,
    snapshotHash,
  };
}

/**
 * Convenience: compute candidates from a snapshot and render the deterministic
 * briefing. This is what the client component calls for its instant view.
 */
export function briefingFromSnapshot(
  snapshot: OperationsSnapshotDTO,
  extras: CandidateExtras = { supportOpen: 0 },
  now?: string,
): CeoBriefingDTO {
  const candidates = computeCandidates(snapshot, extras);
  const at = now ?? snapshot.generatedAt;
  return fallbackBriefingFromCandidates(candidates, at, materialFactsHash(candidates));
}
