"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteOrderAction } from "@/app/actions/admin";

export default function DevOrderDetailTools({
  orderId,
  onError,
}: {
  orderId: string;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDeleteOrder() {
    const confirmed = window.confirm(
      "Delete Order?\n\nThis permanently removes the order and all related test data: items, payment proofs, payment events, delivered-code rows, and email logs. This cannot be undone.",
    );
    if (!confirmed) return;

    setBusy(true);
    const result = await deleteOrderAction(orderId);
    if (result.ok) {
      router.push("/admin");
      router.refresh();
      return;
    }
    onError(result.error ?? "Suppression impossible.");
    setBusy(false);
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleDeleteOrder}
      className="w-full rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
    >
      Delete Order
    </button>
  );
}
