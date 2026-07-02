"use client";

import { useMemo, useState } from "react";
import OrderRow from "./OrderRow";
import type { OrderRowData } from "./orderView";

type Filter = "all" | "delivered" | "processing";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "delivered", label: "Livrées" },
  { value: "processing", label: "En cours" },
];

export default function OrdersView({ orders }: { orders: OrderRowData[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter !== "all" && order.statusGroup !== filter) return false;
      if (needle && !order.search.includes(needle)) return false;
      return true;
    });
  }, [orders, query, filter]);

  return (
    <div className="acct-panel p-[22px] sm:px-[26px]">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex h-[42px] min-w-[200px] flex-1 items-center gap-2.5 rounded-[11px] border border-white/[0.09] bg-[#0c0d11] px-3.5">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="flex-shrink-0 text-faint"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.6" y2="16.6" />
          </svg>
          <label className="sr-only" htmlFor="orders-search">
            Rechercher une commande
          </label>
          <input
            id="orders-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une commande…"
            className="h-full flex-1 bg-transparent text-[13.5px] text-text outline-none placeholder:text-faint"
          />
        </div>
        <div className="flex gap-1.5 rounded-[11px] border border-white/[0.08] bg-[#0c0d11] p-1">
          {FILTERS.map((option) => {
            const isActive = filter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`h-[34px] rounded-lg px-3.5 text-[12.5px] transition-colors ${
                  isActive
                    ? "bg-accent font-semibold text-white"
                    : "font-medium text-muted hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted">
          Aucune commande ne correspond à votre recherche.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((order) => (
            <OrderRow key={order.id} data={order} />
          ))}
        </div>
      )}
    </div>
  );
}
