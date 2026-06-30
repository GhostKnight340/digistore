"use client";

import { useState } from "react";
import {
  clearAllOrdersAction,
  deleteOrderAction,
} from "@/app/actions/admin";

export function DevOrderRowDelete({
  orderId,
  onSuccess,
  onError,
}: {
  orderId: string;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleDeleteOrder() {
    const confirmed = window.confirm(
      "Delete Order?\n\nThis permanently removes the order and all related test data: items, payment proofs, payment events, delivered-code rows, and email logs. This cannot be undone.",
    );
    if (!confirmed) return;

    setBusy(true);
    const result = await deleteOrderAction(orderId);
    if (result.ok) onSuccess("Commande supprimée.");
    else onError(result.error ?? "Suppression impossible.");
    setBusy(false);
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleDeleteOrder}
      className="text-xs font-medium text-red-300 hover:text-red-200 disabled:opacity-50"
    >
      Delete Order
    </button>
  );
}

export default function DevOrderListTools({
  onSuccess,
  onError,
}: {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearPhrase, setClearPhrase] = useState("");
  const [resetOrderNumbering, setResetOrderNumbering] = useState(true);
  const [busy, setBusy] = useState(false);

  async function handleClearAllOrders() {
    setBusy(true);
    const result = await clearAllOrdersAction(resetOrderNumbering);
    if (result.ok) {
      onSuccess(
        resetOrderNumbering
          ? "Toutes les commandes ont été supprimées. La prochaine commande sera #000001."
          : "Toutes les commandes ont été supprimées.",
      );
      setClearModalOpen(false);
      setClearPhrase("");
    } else {
      onError(result.error ?? "Purge impossible.");
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setClearModalOpen(true)}
        className="rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
      >
        Clear All Orders
      </button>

      {clearModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 py-8">
          <div className="w-full max-w-xl rounded-2xl border border-red-500/40 bg-card p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-red-300">Danger zone</p>
                <h3 className="mt-1 text-xl font-bold text-white">Clear All Orders</h3>
              </div>
              <button
                type="button"
                onClick={() => setClearModalOpen(false)}
                className="text-sm text-muted hover:text-white"
              >
                Fermer
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-4 text-sm leading-relaxed text-red-100">
                This permanently deletes every order and related test data: order items,
                payment proofs, payment events, delivered-code rows, and order email logs.
                Products, inventory records, settings, categories, and payment methods are left untouched.
              </div>

              <label className="block text-sm">
                <span className="mb-2 block text-xs uppercase tracking-wide text-muted">
                  Type DELETE ALL ORDERS to continue
                </span>
                <input
                  value={clearPhrase}
                  onChange={(event) => setClearPhrase(event.target.value)}
                  className="input h-11 py-0"
                  placeholder="DELETE ALL ORDERS"
                />
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-white">
                <input
                  type="checkbox"
                  checked={resetOrderNumbering}
                  onChange={(event) => setResetOrderNumbering(event.target.checked)}
                  className="h-4 w-4"
                />
                Reset order numbering so the next order is #000001
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setClearModalOpen(false)}
                  className="btn-ghost w-full justify-center"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={clearPhrase !== "DELETE ALL ORDERS" || busy}
                  onClick={handleClearAllOrders}
                  className="w-full rounded-lg border border-red-500/60 bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear All Orders
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
