"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShoppingBag, Download } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import AdminButton from "@/components/admin/ui/AdminButton";
import Badge from "@/components/admin/ui/Badge";
import EmptyState from "@/components/admin/ui/EmptyState";
import Modal from "@/components/admin/ui/Modal";
import Pagination from "@/components/admin/ui/Pagination";
import { useToast } from "@/components/admin/ui/Toast";
import { changeOrderStatusAction } from "@/app/actions/admin";
import {
  formatAdminMAD,
  formatShortDate,
  orderStatusMeta,
  paymentMethodLabel,
  shortOrderRef,
} from "@/lib/adminStatus";
import type { AdminOrderSummaryDTO } from "@/lib/dto";

const PAGE_SIZE = 10;

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "payment_submitted", label: "Payment review" },
  { value: "pending_payment", label: "Awaiting payment" },
  { value: "payment_confirmed", label: "To fulfill" },
  { value: "delivered", label: "Delivered" },
  { value: "payment_issue", label: "Issues" },
  { value: "rejected", label: "Rejected" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
];

function normalizeTabStatus(status: string): string {
  if (status === "pending" || status === "awaiting_payment") return "pending_payment";
  if (status === "processing") return "payment_confirmed";
  return status;
}

function itemsSummary(order: AdminOrderSummaryDTO): string {
  const [first, ...rest] = order.items;
  if (!first) return "—";
  const qty = first.quantity > 1 ? ` ×${first.quantity}` : "";
  return rest.length > 0 ? `${first.name}${qty} +${rest.length}` : `${first.name}${qty}`;
}

function exportCsv(orders: AdminOrderSummaryDTO[]) {
  const header = "order,customer,email,items,method,total_mad,status,date";
  const lines = orders.map((order) =>
    [
      shortOrderRef(order.id),
      order.customerName,
      order.customerEmail,
      order.items.map((item) => `${item.name} x${item.quantity}`).join("; "),
      order.paymentMethod,
      order.totalMad,
      order.status,
      order.createdAt,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "orders.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function OrdersTableScreen({
  orders,
  title,
  subtitle,
  showTabs = true,
  emptyTitle = "No orders yet",
  emptyDescription = "Orders appear here as soon as customers check out.",
}: {
  orders: AdminOrderSummaryDTO[];
  title: string;
  subtitle?: string;
  showTabs?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(orders);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length };
    for (const order of rows) {
      const key = normalizeTabStatus(order.status);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return rows.filter((order) => {
      if (tab !== "all" && normalizeTabStatus(order.status) !== tab) return false;
      if (!text) return true;
      return [
        order.id,
        shortOrderRef(order.id),
        order.customerName,
        order.customerEmail,
        order.paymentMethod,
        ...order.items.map((item) => item.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }, [rows, tab, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selected.has(row.id));

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allPageSelected) pageRows.forEach((row) => next.delete(row.id));
      else pageRows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function cancelSelected() {
    setBusy(true);
    const ids = [...selected];
    let failed = 0;
    for (const id of ids) {
      const result = await changeOrderStatusAction(id, "cancelled", "Bulk cancel from orders list");
      if (!result.ok) failed += 1;
    }
    setRows((current) =>
      current.map((order) =>
        selected.has(order.id) && failed === 0 ? { ...order, status: "cancelled" } : order,
      ),
    );
    setBusy(false);
    setConfirmCancel(false);
    setSelected(new Set());
    if (failed > 0) toast("danger", `Couldn't cancel ${failed} order${failed > 1 ? "s" : ""}`);
    else toast("success", `${ids.length} order${ids.length > 1 ? "s" : ""} cancelled`);
    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 py-6">
      <PageHeader
        title={title}
        subtitle={subtitle ?? `${filtered.length} order${filtered.length === 1 ? "" : "s"}`}
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
            strokeWidth={1.8}
          />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search orders…"
            className="h-9 w-64 rounded-control border border-white/10 bg-admin-input pl-8 pr-3 text-[13px] text-text placeholder:text-faint outline-none transition-colors focus:border-accent/30 focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <AdminButton onClick={() => exportCsv(filtered)} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
          Export
        </AdminButton>
      </PageHeader>

      {showTabs ? (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.filter(
            (item) => item.value === "all" || (tabCounts[item.value] ?? 0) > 0,
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setTab(item.value);
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                tab === item.value
                  ? "bg-accent/[0.13] font-semibold text-[#EAF0FF] ring-1 ring-inset ring-accent/20"
                  : "text-muted hover:bg-white/[0.04] hover:text-text"
              }`}
            >
              {item.label}
              <span className="font-mono text-[10.5px] text-faint">
                {tabCounts[item.value] ?? 0}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="mb-3 flex items-center gap-3 rounded-card border border-accent/[0.22] bg-accent/[0.06] px-4 py-2.5">
          <p className="text-[13px] font-medium text-text">
            <span className="font-mono font-semibold">{selected.size}</span> selected
          </p>
          <div className="ml-auto flex items-center gap-2">
            <AdminButton variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
              Cancel orders
            </AdminButton>
            <AdminButton variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </AdminButton>
          </div>
        </div>
      ) : null}

      <div className="min-w-0 overflow-x-auto rounded-card border border-white/[0.07] bg-admin-surface">
        {pageRows.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="h-5 w-5" strokeWidth={1.8} />}
            title={query || tab !== "all" ? "No orders match" : emptyTitle}
            description={
              query || tab !== "all"
                ? "Try a different search or status filter."
                : emptyDescription
            }
          />
        ) : (
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="w-[34px] px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleAll}
                    aria-label="Select all on page"
                    className="h-3.5 w-3.5 accent-[#3E7BFA]"
                  />
                </th>
                {["Order", "Customer", "Items", "Method", "Total", "Status", "Date"].map(
                  (label) => (
                    <th
                      key={label}
                      className={`px-3 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fainter ${
                        label === "Total" ? "text-right" : ""
                      }`}
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((order) => {
                const meta = orderStatusMeta(order.status);
                const isSelected = selected.has(order.id);
                return (
                  <tr
                    key={order.id}
                    onClick={() => router.push(`/admin/orders/${order.id}`)}
                    className={`cursor-pointer border-b border-white/[0.04] transition-colors last:border-b-0 ${
                      isSelected ? "bg-accent/[0.06]" : "hover:bg-white/[0.025]"
                    }`}
                  >
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(order.id)}
                        aria-label={`Select ${shortOrderRef(order.id)}`}
                        className="h-3.5 w-3.5 accent-[#3E7BFA]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-[12.5px] font-medium text-text">
                      {shortOrderRef(order.id)}
                    </td>
                    <td className="max-w-[220px] px-3 py-3">
                      <p className="truncate text-[13px] font-medium text-text">
                        {order.customerName}
                      </p>
                      <p className="truncate text-xs text-faint">{order.customerEmail}</p>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-3 text-[13px] text-muted">
                      {itemsSummary(order)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[13px] text-muted">
                      {paymentMethodLabel(order.paymentMethod)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-[13px] text-text">
                      {formatAdminMAD(order.totalMad)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge tone={meta.tone} dot>
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-faint">
                      {formatShortDate(order.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-end pt-4">
        <Pagination
          page={safePage}
          pageCount={pageCount}
          total={filtered.length}
          rangeLabel={
            filtered.length === 0
              ? "0"
              : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)}`
          }
          onChange={setPage}
        />
      </div>

      {confirmCancel ? (
        <Modal
          title={`Cancel ${selected.size} order${selected.size > 1 ? "s" : ""}?`}
          description="Each order's status becomes Cancelled and an audit event is recorded. No emails are sent automatically."
          onClose={() => setConfirmCancel(false)}
        >
          <div className="flex justify-end gap-2 pt-2">
            <AdminButton size="sm" onClick={() => setConfirmCancel(false)}>
              Keep orders
            </AdminButton>
            <AdminButton variant="danger" size="sm" disabled={busy} onClick={cancelSelected}>
              {busy ? "Cancelling…" : "Cancel orders"}
            </AdminButton>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
