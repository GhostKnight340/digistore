"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Search, ExternalLink, PencilLine } from "lucide-react";

export default function AdminTopbar() {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-3 border-b border-white/[0.06] bg-admin-app/60 px-5 backdrop-blur-xl">
      <div className="relative w-full max-w-[420px]">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
          strokeWidth={1.8}
        />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search or jump to… orders, products, customers"
          className="h-[38px] w-full rounded-control border border-white/10 bg-admin-input pl-9 pr-12 text-[13px] text-text placeholder:text-faint outline-none transition-colors focus:border-accent/30 focus:ring-2 focus:ring-accent/20"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-chip border border-white/[0.08] bg-admin-elevated px-1.5 py-0.5 font-mono text-[10.5px] text-faint">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/"
          target="_blank"
          className="inline-flex h-[34px] items-center gap-[7px] rounded-control border border-white/[0.12] bg-admin-input px-3.5 text-[13px] font-medium text-text transition-colors hover:bg-admin-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
          View store
        </Link>
        <Link
          href="/admin/editor"
          className="inline-flex h-[34px] items-center gap-[7px] rounded-control border border-accent/30 bg-accent/[0.13] px-3.5 text-[13px] font-semibold text-[#9FB8FF] transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <PencilLine className="h-3.5 w-3.5" strokeWidth={1.8} />
          Homepage Editor
        </Link>
        <span className="ml-1 inline-flex items-center gap-1.5 rounded-chip border border-success/[0.28] bg-success/[0.14] px-2 py-1 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-success-fg">
          <span className="h-1.5 w-1.5 rounded-full bg-success-fg" />
          LIVE
        </span>
      </div>
    </header>
  );
}
