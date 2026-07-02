"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, ScanLine } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import AdminButton from "@/components/admin/ui/AdminButton";
import AdminCard from "@/components/admin/ui/AdminCard";
import KpiCard from "@/components/admin/ui/KpiCard";
import Segmented from "@/components/admin/ui/Segmented";
import EmptyState from "@/components/admin/ui/EmptyState";
import {
  formatAdminMAD,
  paymentMethodLabel,
  shortOrderRef,
  waitingSince,
} from "@/lib/adminStatus";
import type { AdminOrderSummaryDTO } from "@/lib/dto";

type Range = "today" | "7d" | "30d";

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

const RANGE_DAYS: Record<Range, number> = { today: 1, "7d": 7, "30d": 30 };

const REVENUE_STATUSES = new Set(["payment_confirmed", "delivered"]);

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default function OverviewScreen({
  orders,
  outOfStock,
  lowStock,
  adminName,
}: {
  orders: AdminOrderSummaryDTO[];
  outOfStock: number;
  lowStock: number;
  adminName: string;
}) {
  const router = useRouter();
  const [range, setRange] = useState<Range>("7d");

  const rangeStart = useMemo(() => {
    const start = startOfDay(new Date());
    start.setDate(start.getDate() - (RANGE_DAYS[range] - 1));
    return start.getTime();
  }, [range]);

  const inRange = useMemo(
    () => orders.filter((order) => new Date(order.createdAt).getTime() >= rangeStart),
    [orders, rangeStart],
  );

  const revenue = inRange
    .filter((order) => REVENUE_STATUSES.has(order.status))
    .reduce((sum, order) => sum + order.totalMad, 0);

  const reviewQueue = useMemo(
    () =>
      orders
        .filter((order) => order.status === "payment_submitted")
        .sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [orders],
  );

  const bars = useMemo(() => {
    const days: { label: string; total: number; isToday: boolean }[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = startOfDay(new Date());
      day.setDate(day.getDate() - offset);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const total = orders
        .filter((order) => {
          const time = new Date(order.createdAt).getTime();
          return (
            time >= day.getTime() &&
            time < next.getTime() &&
            REVENUE_STATUSES.has(order.status)
          );
        })
        .reduce((sum, order) => sum + order.totalMad, 0);
      days.push({
        label: day.toLocaleDateString("en-GB", { weekday: "short" }),
        total,
        isToday: offset === 0,
      });
    }
    return days;
  }, [orders]);

  const maxBar = Math.max(1, ...bars.map((bar) => bar.total));

  function exportReport() {
    const header = "day,revenue_mad";
    const lines = bars.map((bar) => `${bar.label},${bar.total}`);
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "revenue-report.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 18
        ? "Good afternoon"
        : "Good evening";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 py-6">
      <PageHeader
        title={`${greeting}, ${adminName.split(" ")[0]}`}
        subtitle={new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      >
        <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
        <AdminButton onClick={exportReport}>
          <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
          Export
        </AdminButton>
      </PageHeader>

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`Revenue · ${RANGE_OPTIONS.find((option) => option.value === range)?.label}`}
          value={formatAdminMAD(revenue)}
          detail={`${inRange.filter((order) => REVENUE_STATUSES.has(order.status)).length} paid orders`}
        />
        <KpiCard
          label="Orders"
          value={String(inRange.length)}
          detail={`${orders.length} all time`}
        />
        <KpiCard
          label="Awaiting review"
          value={String(reviewQueue.length)}
          tone={reviewQueue.length > 0 ? "warning" : undefined}
          detail={
            reviewQueue.length > 0
              ? `oldest waiting ${waitingSince(reviewQueue[0].createdAt)}`
              : "queue is clear"
          }
        />
        <KpiCard
          label="Out of stock"
          value={String(outOfStock)}
          tone={outOfStock > 0 ? "danger" : undefined}
          detail={lowStock > 0 ? `${lowStock} variants low` : "all variants stocked"}
        />
      </div>

      <div className="mt-3.5 grid gap-3.5 pb-8 xl:grid-cols-[1.55fr_1fr]">
        <AdminCard title="Revenue · last 7 days">
          <div className="flex h-52 items-end gap-3 pt-2">
            {bars.map((bar) => (
              <div
                key={bar.label}
                className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <div className="relative flex w-full flex-1 items-end">
                  <div
                    title={formatAdminMAD(bar.total)}
                    style={{ height: `${Math.max(2, (bar.total / maxBar) * 100)}%` }}
                    className={`w-full rounded-t-md transition-colors ${
                      bar.isToday
                        ? "bg-accent shadow-primary-glow"
                        : "bg-accent/25 group-hover:bg-accent/45"
                    }`}
                  />
                  <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-white/10 bg-admin-elevated px-2 py-1 font-mono text-[10.5px] text-text opacity-0 shadow-toast transition-opacity group-hover:opacity-100">
                    {formatAdminMAD(bar.total)}
                  </span>
                </div>
                <span
                  className={`font-mono text-[10.5px] ${bar.isToday ? "font-semibold text-text" : "text-faint"}`}
                >
                  {bar.label}
                </span>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard
          title="Payment review queue"
          actions={
            <Link
              href="/admin/orders/review"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#9FB8FF] hover:underline"
            >
              Open review queue
              <ArrowRight className="h-3 w-3" strokeWidth={1.8} />
            </Link>
          }
          padded
        >
          {reviewQueue.length === 0 ? (
            <EmptyState
              icon={<ScanLine className="h-5 w-5" strokeWidth={1.8} />}
              title="No payments waiting"
              description="New payment submissions land here for review."
            />
          ) : (
            <div className="-mx-1.5 flex flex-col">
              {reviewQueue.slice(0, 6).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => router.push(`/admin/orders/${order.id}`)}
                  className="flex items-center gap-3 rounded-lg px-1.5 py-2.5 text-left transition-colors hover:bg-admin-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="font-mono text-[12.5px] font-semibold text-text">
                        {shortOrderRef(order.id)}
                      </span>
                      <span className="font-mono text-[10.5px] text-warning">
                        {waitingSince(order.createdAt)}
                      </span>
                    </p>
                    <p className="truncate text-xs text-faint">
                      {order.customerName} · {paymentMethodLabel(order.paymentMethod)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[12.5px] text-text">
                    {formatAdminMAD(order.totalMad)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
