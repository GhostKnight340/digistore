"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createAdminRefundAction,
  getOrderRefundsAction,
} from "@/app/actions/adminRefunds";
import {
  refundReasonLabel,
  refundResolutionLabel,
  refundStatusBadgeClass,
} from "@/lib/refunds/status";
import { formatMAD } from "@/lib/format";

type Row = Awaited<ReturnType<typeof getOrderRefundsAction>>[number];

/**
 * Compact refunds panel for the admin order-detail page: lists every refund
 * case attached to the order (linking to the case) and lets an admin open a new
 * one. Refunds live in their own workflow — this is a read/entry surface only.
 */
export default function OrderRefundsPanel({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = async () => setRows(await getOrderRefundsAction(orderId));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await createAdminRefundAction({
        orderId,
        source: "ADMIN_CREATED",
        reason: "other",
        description: "Demande de remboursement créée depuis la commande.",
      });
      if (res.ok) window.location.href = `/admin/refunds/${res.id}`;
      else setError(res.error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Remboursements</h3>
        <button
          type="button"
          onClick={create}
          disabled={creating}
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground disabled:opacity-50"
        >
          {creating ? "…" : "Créer une demande"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {rows === null ? (
        <p className="mt-2 text-xs text-muted">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Aucune demande de remboursement pour cette commande.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/refunds/${r.id}`}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:border-accent/40"
              >
                <span className="text-sm text-foreground">
                  {r.number} · {refundReasonLabel(r.reason)}
                  {r.resolutionType ? ` · ${refundResolutionLabel(r.resolutionType)}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted">{formatMAD(r.amountMad)}</span>
                  <span className={`chip border ${refundStatusBadgeClass(r.status)}`}>
                    {r.statusLabel}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
