"use client";

/**
 * AI approval queue (spec §7). Lists items and lets an admin approve, reject
 * (with a reason), or cancel PENDING items. The same transitions are exposed so
 * a Discord button flow can call the identical server action later. No customer
 * message is sent from here.
 */

import { useState, useTransition } from "react";
import { OpsCard, StatusBadge, relativeTime } from "@/components/admin/operations/shared";
import type { OpsHealthStatus } from "@/lib/dto";
import { moduleLabel } from "@/lib/ai-ops/types";
import { decideApprovalAction } from "@/app/actions/aiOperations";

export interface ApprovalItem {
  id: string;
  module: string;
  actionType: string;
  summary: string;
  proposedContent: string;
  riskLevel: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

const STATUS_TONE: Record<string, OpsHealthStatus> = {
  PENDING: "warning",
  APPROVED: "healthy",
  EXECUTING: "healthy",
  COMPLETED: "healthy",
  REJECTED: "offline",
  FAILED: "offline",
  EXPIRED: "unknown",
  CANCELLED: "unknown",
};

export default function AiApprovalsView({ approvals }: { approvals: ApprovalItem[] }) {
  const [items, setItems] = useState(approvals);
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const decide = (id: string, decision: "APPROVED" | "REJECTED" | "CANCELLED", rejectionReason?: string) => {
    startTransition(async () => {
      const res = await decideApprovalAction(id, decision, { rejectionReason });
      if (res.ok) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: decision } : i)));
        setRejecting(null);
        setReason("");
      }
    });
  };

  if (items.length === 0) {
    return (
      <OpsCard title="File d'approbation">
        <p className="text-sm text-muted">Aucune approbation. La file est utilisée par les futurs modules (ex. réponses support).</p>
      </OpsCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => {
        const isPending = item.status === "PENDING";
        return (
          <OpsCard
            key={item.id}
            title={item.summary}
            status={STATUS_TONE[item.status] ?? "unknown"}
            headerRight={<StatusBadge status={STATUS_TONE[item.status] ?? "unknown"} label={item.status} />}
          >
            <p className="text-xs text-muted">
              {moduleLabel(item.module)} · {item.actionType} · risque {item.riskLevel} · {relativeTime(item.createdAt)}
              {item.expiresAt ? ` · expire ${relativeTime(item.expiresAt)}` : ""}
            </p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface2/40 p-3 text-[13px] text-white">
              {item.proposedContent}
            </pre>
            {isPending && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => decide(item.id, "APPROVED")} disabled={pending} className="btn-primary text-xs">
                  Approuver
                </button>
                {rejecting === item.id ? (
                  <>
                    <input
                      className="flex-1 rounded-lg border border-border bg-surface2/40 px-3 py-1.5 text-sm text-white"
                      placeholder="Raison du rejet"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <button type="button" onClick={() => decide(item.id, "REJECTED", reason)} disabled={pending} className="btn-ghost text-xs">
                      Confirmer le rejet
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setRejecting(item.id)} className="btn-ghost text-xs">
                    Rejeter
                  </button>
                )}
                <button type="button" onClick={() => decide(item.id, "CANCELLED")} disabled={pending} className="btn-ghost text-xs">
                  Annuler
                </button>
              </div>
            )}
          </OpsCard>
        );
      })}
    </div>
  );
}
