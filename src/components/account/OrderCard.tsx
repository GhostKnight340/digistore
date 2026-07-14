import Link from "next/link";
import { BagIcon, ArrowRightIcon } from "@/components/account/icons";
import { orderCardSummary, orderItemCountLabel } from "@/lib/account/orderCard";
import { getPublicOrderLabel } from "@/lib/orderNumber";
import { formatDH } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusShort } from "@/lib/orderStatus";

type OrderCardOrder = {
  status: string;
  totalMad: number;
  createdAt: Date;
  publicOrderNumber?: string | null;
  publicOrderPathSegment: string;
  items: { quantity: number; product: { name: string }; variant: { name: string } | null }[];
};

function formatFrenchDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);
}

/**
 * One order in the account area, shared by the dashboard and the orders list.
 *
 * Mobile: stacks into summary + status on top, order number / date / item count
 * beneath, then total and a full-width "Voir la commande" affordance — nothing
 * is clipped and the whole card stays one tap target.
 * Desktop (sm+): collapses back to the original single row with the status
 * badge and total right-aligned.
 */
export default function OrderCard({ order }: { order: OrderCardOrder }) {
  const summary = orderCardSummary(order);
  const orderLabel = getPublicOrderLabel(order);
  const status = orderStatusShort(order.status);
  const total = formatDH(order.totalMad);

  const badge = (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${orderStatusBadgeClass(
        order.status,
      )}`}
    >
      {status}
    </span>
  );

  return (
    <Link
      href={`/order/${order.publicOrderPathSegment}`}
      aria-label={`${summary} — ${orderLabel}, ${status}, ${total}`}
      className="flex flex-col gap-3 rounded-[13px] border border-border bg-canvas p-3.5 transition-colors hover:border-border-strong sm:flex-row sm:items-center sm:gap-3.5 sm:px-4 sm:py-3"
    >
      <div className="flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center sm:gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] border border-border bg-surface text-faint">
          <BagIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-white sm:truncate">{summary}</p>
          {/* On mobile the badge sits under the title so it never competes for
              the title's width; on desktop it moves to the right column. */}
          <span className="mt-1.5 flex sm:hidden">{badge}</span>
          <p className="mt-1 break-words font-mono text-[12px] text-faint sm:mt-0.5 sm:truncate">
            {orderLabel} · {formatFrenchDate(order.createdAt)} · {orderItemCountLabel(order)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3 sm:shrink-0 sm:flex-col sm:items-end sm:gap-1 sm:border-0 sm:pt-0">
        <span className="hidden sm:inline">{badge}</span>
        <span className="font-mono text-sm font-semibold text-white">{total}</span>
        <span
          aria-hidden
          className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong px-3 py-1.5 text-[13px] font-medium text-text sm:hidden"
        >
          Voir la commande
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
