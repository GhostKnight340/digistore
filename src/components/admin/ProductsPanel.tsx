"use client";

import { useState } from "react";
import Link from "next/link";
import { parentProducts, getCategory } from "@/lib/products";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import { formatMAD, formatFaceValue, variantTitle } from "@/lib/format";
import type { ParentProduct, ProductVariant } from "@/lib/types";

export default function ProductsPanel() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { overrides } = useProductCatalog();

  const filtered = parentProducts.filter((p) => {
    if (search.trim() === "") return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.brand?.toLowerCase().includes(q) ?? false) ||
      p.variants.some((v) => v.id.toLowerCase().includes(q))
    );
  });

  const totalVariants = parentProducts.reduce((s, p) => s + p.variants.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Products</h2>
          <p className="mt-1 text-sm text-muted">
            {parentProducts.length} parent products · {totalVariants} variants defined in{" "}
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
          {filtered.map((parent) => (
            <ParentProductRow
              key={parent.id}
              parent={parent}
              variantOverrides={parent.variants.reduce(
                (acc, v) => ({ ...acc, [v.id]: !!overrides[v.id] }),
                {} as Record<string, boolean>,
              )}
              open={openId === parent.id}
              onToggle={() =>
                setOpenId((id) => (id === parent.id ? null : parent.id))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ParentProductRow({
  parent,
  variantOverrides,
  open,
  onToggle,
}: {
  parent: ParentProduct;
  variantOverrides: Record<string, boolean>;
  open: boolean;
  onToggle: () => void;
}) {
  const cat = getCategory(parent.category);
  const activeCount = parent.variants.filter((v) => v.active !== false).length;
  const anyOverride = Object.values(variantOverrides).some(Boolean);

  return (
    <section className="card overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-2 px-5 py-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-white">{parent.name}</span>
              {parent.brand && (
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-faint">
                  {parent.brand}
                </span>
              )}
              {parent.active === false && (
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                  Inactive
                </span>
              )}
              {anyOverride && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                  Modified
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
              <span className="font-mono">{parent.id}</span>
              <span>{cat?.name}</span>
              <span>{parent.region}</span>
              <span>
                {activeCount}/{parent.variants.length} variants active
              </span>
            </div>
          </div>

          <div className="shrink-0 text-right text-xs text-faint">
            {parent.variants
              .filter((v) => v.active !== false)
              .map((v) => formatMAD(v.price))
              .join(" · ")}
          </div>

          <span className="shrink-0 text-xs text-faint">{open ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Expanded: variants list */}
      {open && (
        <div className="border-t border-border px-5 py-5 space-y-4">
          {/* Parent info */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Meta label="Parent ID" value={parent.id} mono />
            <Meta label="Category" value={cat?.name ?? parent.category} />
            <Meta label="Brand" value={parent.brand ?? "—"} />
            <Meta label="Region" value={parent.region} />
            <Meta label="Delivery" value={parent.deliveryType} />
          </div>

          {/* Variants */}
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-faint">
              Variants
            </p>
            <div className="space-y-2">
              {parent.variants.map((v) => (
                <VariantRow
                  key={v.id}
                  variant={v}
                  parentName={parent.name}
                  hasOverride={variantOverrides[v.id] ?? false}
                />
              ))}
            </div>
          </div>

          {/* Descriptions */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                Short description
              </p>
              <p className="text-[13.5px] text-text">
                {parent.shortDescription ?? parent.description}
              </p>
            </div>
            {parent.longDescription && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Long description
                </p>
                <p className="text-[13.5px] text-text">{parent.longDescription}</p>
              </div>
            )}
          </div>

          {/* Instructions */}
          {parent.instructions && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Comment utiliser (Instructions)
              </p>
              <div className="space-y-1.5">
                {parent.instructions
                  .split("\n")
                  .filter(Boolean)
                  .map((line, i) => (
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
        </div>
      )}
    </section>
  );
}

function VariantRow({
  variant,
  parentName,
  hasOverride,
}: {
  variant: ProductVariant;
  parentName: string;
  hasOverride: boolean;
}) {
  const title = variantTitle(parentName, variant.faceValue, variant.faceCurrency);
  const hasForeignFace = variant.faceCurrency !== "MAD";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-base px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-white">{title}</span>
          {variant.featured && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
              Featured
            </span>
          )}
          {variant.active === false && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
              Inactive
            </span>
          )}
          {hasOverride && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
              Modified
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-faint">{variant.id}</span>
      </div>

      <div className="shrink-0 text-right">
        {hasForeignFace ? (
          <div className="text-xs text-muted">
            <span className="text-white">
              {formatFaceValue(variant.faceValue, variant.faceCurrency)}
            </span>
            {" → "}
            <span className="font-semibold text-accent">{formatMAD(variant.price)}</span>
          </div>
        ) : (
          <span className="text-sm font-semibold text-white">{formatMAD(variant.price)}</span>
        )}
      </div>

      <Link
        href={`/admin/products/${variant.id}`}
        className="btn-ghost shrink-0 h-8 px-3 text-xs"
      >
        Edit
      </Link>
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
