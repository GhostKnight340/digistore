/**
 * Coverage handoff summary (Phase B) — server-only.
 *
 * Computed once when a session ends (deactivated or expired) and stored on the
 * session row, so the admin gets a concise operational picture of what happened
 * while they were away and what still needs a human. Figures are grounded in the
 * session's own AiApproval records (linked by coverageSessionId) plus the
 * tickets it touched — no invented numbers.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";

export interface CoverageHandoff {
  newConversations: number;
  casesResolved: number;
  autoReplied: number;
  humanApproved: number;
  draftsAwaiting: number;
  escalations: number;
  sensitiveApprovals: number;
  waitingForCustomer: number;
  stillOpen: number;
  repliedAfterAiReply: number;
  failedOutgoing: number;
  unclassified: number;
  recommendedNextActions: string[];
  generatedAt: string;
}

const AI_AUTHOR = "AI (couverture)";

export async function buildHandoff(
  session: { id: string; activatedAt: Date; casesProcessed: number; failures: number },
  now: Date,
): Promise<CoverageHandoff> {
  const [approvals, newConversations] = await Promise.all([
    prisma.aiApproval.findMany({
      where: { coverageSessionId: session.id },
      select: { actionType: true, status: true, riskLevel: true, entityId: true, approvedBy: true, summary: true, createdAt: true },
    }),
    prisma.supportTicket.count({ where: { createdAt: { gte: session.activatedAt, lte: now } } }),
  ]);

  const autoReplied = approvals.filter((a) => a.status === "COMPLETED" && a.approvedBy === AI_AUTHOR).length;
  const humanApproved = approvals.filter((a) => a.status === "COMPLETED" && a.approvedBy !== AI_AUTHOR).length;
  const draftsAwaiting = approvals.filter((a) => a.status === "PENDING" && a.actionType === "support_reply").length;
  const escalations = approvals.filter((a) => a.actionType === "support_escalation").length;
  const sensitiveApprovals = approvals.filter((a) => a.status === "PENDING" && a.riskLevel === "high").length;
  const failedOutgoing = approvals.filter((a) => a.status === "FAILED").length + session.failures;
  const unclassified = approvals.filter((a) => a.summary?.includes("unparseable")).length;

  // Current status of the tickets this session touched.
  const ticketIds = [...new Set(approvals.map((a) => a.entityId).filter((v): v is string => !!v))];
  const latestApprovalFor = new Map<string, Date>();
  for (const a of approvals) {
    if (!a.entityId) continue;
    const prev = latestApprovalFor.get(a.entityId);
    if (!prev || a.createdAt > prev) latestApprovalFor.set(a.entityId, a.createdAt);
  }
  const touched = ticketIds.length
    ? await prisma.supportTicket.findMany({
        where: { id: { in: ticketIds } },
        select: { id: true, status: true, updatedAt: true },
      })
    : [];

  let waitingForCustomer = 0;
  let stillOpen = 0;
  let repliedAfterAiReply = 0;
  for (const t of touched) {
    if (t.status === "answered") waitingForCustomer += 1;
    else if (t.status === "open") {
      stillOpen += 1;
      const last = latestApprovalFor.get(t.id);
      if (last && t.updatedAt.getTime() > last.getTime()) repliedAfterAiReply += 1;
    }
  }

  const recommendedNextActions: string[] = [];
  if (draftsAwaiting) recommendedNextActions.push(`Relire et envoyer ${draftsAwaiting} brouillon(s) en attente.`);
  if (escalations) recommendedNextActions.push(`Traiter ${escalations} cas escaladé(s).`);
  if (repliedAfterAiReply) recommendedNextActions.push(`${repliedAfterAiReply} client(s) ont répondu après une réponse IA.`);
  if (failedOutgoing) recommendedNextActions.push(`Vérifier ${failedOutgoing} envoi(s) en échec.`);
  if (recommendedNextActions.length === 0) recommendedNextActions.push("Aucune action requise — tout est à jour.");

  return {
    newConversations,
    casesResolved: autoReplied + humanApproved,
    autoReplied,
    humanApproved,
    draftsAwaiting,
    escalations,
    sensitiveApprovals,
    waitingForCustomer,
    stillOpen,
    repliedAfterAiReply,
    failedOutgoing,
    unclassified,
    recommendedNextActions,
    generatedAt: now.toISOString(),
  };
}
