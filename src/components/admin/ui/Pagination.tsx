"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({
  page,
  pageCount,
  total,
  rangeLabel,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  rangeLabel: string;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <p className="font-mono text-xs text-faint">
        {rangeLabel} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
          className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-white/[0.08] bg-admin-input text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
        <span className="px-1.5 font-mono text-xs text-muted">
          {page} / {Math.max(1, pageCount)}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
          className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-white/[0.08] bg-admin-input text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
