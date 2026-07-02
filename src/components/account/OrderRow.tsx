import Link from "next/link";
import type { OrderRowData } from "./orderView";

// Pure presentational row. Fed a serializable view-model so it renders in both
// server (dashboard) and client (orders list) components without pulling in
// any server-only code.
export default function OrderRow({ data }: { data: OrderRowData }) {
  return (
    <Link
      href={data.href}
      className="acct-well flex items-center gap-3.5 px-3.5 py-3.5 hover:border-white/[0.14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
    >
      <span
        className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[11px] bg-[#15171f] font-mono text-[11px] tracking-[0.08em] text-[#5a6070]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 6px, transparent 6px 12px)",
        }}
      >
        {data.code}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-[-0.01em] text-white">{data.product}</p>
        <p className="mt-0.5 truncate font-mono text-xs text-[#8891a3]">{data.meta}</p>
      </div>
      <span
        className={`hidden flex-shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold sm:inline-flex ${data.statusClass}`}
      >
        {data.statusLabel}
      </span>
      <span className="flex-shrink-0 whitespace-nowrap text-right font-mono text-sm font-semibold text-white sm:min-w-[74px]">
        {data.amount}
      </span>
      {data.showAction && (
        <span className="hidden flex-shrink-0 items-center gap-1.5 rounded-[9px] border border-accent/30 bg-accent/[0.10] px-3 py-1.5 text-[12.5px] font-semibold text-accent-strong sm:inline-flex">
          Voir le code
        </span>
      )}
    </Link>
  );
}
