"use client";

import { useState } from "react";
import { products, getCategory } from "@/lib/products";
import { formatMAD, formatFaceValue } from "@/lib/format";
import type { Product } from "@/lib/types";

export default function ProductsPanel() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = products.filter(
    (p) =>
      search.trim() === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand?.toLowerCase().includes(search.toLowerCase()) ?? false),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Products</h2>
          <p className="mt-1 text-sm text-muted">
            {products.length} products defined in{" "}
            <code className="font-mono text-xs text-accent">src/lib/products.ts</code>.
          </p>
        </div>
        <input
          type="search"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input h-9 w-56 py-0 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No products match "{search}".</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              open={openId === product.id}
              onToggle={() =>
                setOpenId((id) => (id === product.id ? null : product.id))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductRow({
  product,
  open,
  onToggle,
}: {
  product: Product;
  open: boolean;
  onToggle: () => void;
}) {
  const cat = getCategory(product.category);
  const hasForeignFaceValue =
    product.faceValue !== undefined &&
    product.faceCurrency !== undefined &&
    product.faceCurrency !== "MAD";

  return (
    <section className="card overflow-hidden">
      {/* Row header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white">{product.name}</span>
            {product.brand && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-faint">
                {product.brand}
              </span>
            )}
            {product.featured && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                Featured
              </span>
            )}
            {product.active === false && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                Inactive
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
            <span className="font-mono">{product.id}</span>
            <span>{cat?.name}</span>
            <span>{product.region}</span>
          </div>
        </div>

        {/* Pricing summary */}
        <div className="shrink-0 text-right">
          {hasForeignFaceValue ? (
            <div className="text-xs text-muted">
              <span className="text-white">
                {formatFaceValue(product.faceValue!, product.faceCurrency!)}
              </span>
              {" → "}
              <span className="font-semibold text-accent">{formatMAD(product.price)}</span>
            </div>
          ) : (
            <span className="text-sm font-semibold text-white">{formatMAD(product.price)}</span>
          )}
        </div>

        <span className="shrink-0 text-faint text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="space-y-6 border-t border-border px-5 py-5">
          {/* Pricing breakdown */}
          <div className="grid gap-4 sm:grid-cols-3">
            <InfoCard
              title="Face Value"
              value={
                product.faceValue !== undefined && product.faceCurrency
                  ? formatFaceValue(product.faceValue, product.faceCurrency)
                  : "—"
              }
              note="Original card denomination"
            />
            <div className="hidden place-items-center sm:grid">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-6 w-6 text-muted"
                aria-hidden
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <InfoCard
              title="Customer pays"
              value={formatMAD(product.price)}
              note="Selling price in MAD"
              highlight
            />
          </div>

          {/* Supplier cost — admin only */}
          <div className="rounded-xl border border-border bg-base p-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">
              Supplier cost (admin only — never shown publicly)
            </p>
            {product.supplierCost !== undefined && product.supplierCurrency ? (
              <span className="text-sm font-medium text-white">
                {product.supplierCost} {product.supplierCurrency}
              </span>
            ) : (
              <span className="text-sm text-faint">Not set</span>
            )}
          </div>

          {/* Description fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                Short description
              </p>
              <p className="text-[13.5px] text-text">
                {product.shortDescription ?? product.description}
              </p>
            </div>
            {product.longDescription && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Long description
                </p>
                <p className="text-[13.5px] text-text">{product.longDescription}</p>
              </div>
            )}
          </div>

          {/* Instructions */}
          {product.instructions && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Comment utiliser (Instructions)
              </p>
              <div className="space-y-1.5">
                {product.instructions.split("\n").filter(Boolean).map((line, i) => (
                  <div
                    key={i}
                    className="flex gap-3 rounded-lg border border-border bg-base px-3.5 py-2.5"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-accent">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="text-[13px] text-muted">
                      {line.replace(/^\d+\.\s*/, "")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* General info */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Meta label="Slug" value={product.id} mono />
            <Meta label="Category" value={cat?.name ?? product.category} />
            <Meta label="Brand" value={product.brand ?? "—"} />
            <Meta label="Region" value={product.region} />
            <Meta label="Delivery" value={product.deliveryType} />
            <Meta label="Featured" value={product.featured ? "Yes" : "No"} />
            <Meta label="Active" value={product.active === false ? "No" : "Yes"} />
            <Meta
              label="Face currency"
              value={product.faceCurrency ?? "MAD"}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function InfoCard({
  title,
  value,
  note,
  highlight = false,
}: {
  title: string;
  value: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${highlight ? "border-accent/30 bg-accent/5" : "border-border bg-base"}`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{title}</p>
      <p className={`mt-1.5 text-xl font-semibold ${highlight ? "text-accent" : "text-white"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-faint">{note}</p>
    </div>
  );
}

function Meta({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-base px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 text-[13px] text-white ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
