"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ParentProduct } from "@/lib/types";
import { getCategory, getProduct } from "@/lib/products";
import { formatMAD, formatFaceValue, variantTitle } from "@/lib/format";
import ProductArt from "@/components/ProductArt";
import ProductCard from "@/components/ProductCard";
import AddToCartForm from "@/components/AddToCartForm";

export default function ProductDetailClient({
  parent,
  initialVariantId,
  stockStatus,
  related,
}: {
  parent: ParentProduct;
  initialVariantId?: string;
  stockStatus: Record<string, { unused: number; stockControl: string }>;
  related: ParentProduct[];
}) {
  const router = useRouter();
  const activeVariants = parent.variants.filter((v) => v.active !== false);

  const defaultVariant =
    (initialVariantId
      ? activeVariants.find((v) => v.id === initialVariantId)
      : undefined) ??
    activeVariants.find((v) => v.featured) ??
    activeVariants[0];

  const [selectedId, setSelectedId] = useState(defaultVariant?.id ?? "");

  const selected = activeVariants.find((v) => v.id === selectedId) ?? activeVariants[0];

  useEffect(() => {
    if (!selected) return;
    router.replace(`/products/${parent.id}?v=${selected.id}`, { scroll: false });
  }, [selected?.id, parent.id, router]);

  function isOutOfStock(slug: string) {
    const s = stockStatus[slug];
    return !!s && s.stockControl === "auto" && s.unused === 0;
  }

  const category = getCategory(parent.category);
  const outOfStock = selected ? isOutOfStock(selected.id) : false;
  const title = selected
    ? variantTitle(parent.name, selected.faceValue, selected.faceCurrency)
    : parent.name;

  return (
    <div className="container-page py-8 sm:py-10">
      <nav className="mb-9 flex flex-wrap items-center gap-2 text-[13.5px] text-faint">
        <Link href="/" className="text-muted transition hover:text-white">
          Accueil
        </Link>
        <span>/</span>
        <Link href="/products" className="text-muted transition hover:text-white">
          Produits
        </Link>
        <span>/</span>
        <span className="text-text">{title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
        <div>
          <ProductArt
            category={parent.category}
            backgroundPreset={parent.backgroundPreset}
            className="aspect-[1.4] w-full rounded-[18px] border border-border"
          />

          {parent.longDescription && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold tracking-tight text-text">
                Description
              </h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
                {parent.longDescription}
              </p>
            </section>
          )}

          {parent.instructions && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold tracking-tight text-text">
                Comment utiliser
              </h2>
              <div className="mt-4 flex flex-col gap-2">
                {parent.instructions
                  .split("\n")
                  .filter(Boolean)
                  .map((line, i) => (
                    <div
                      key={i}
                      className="flex gap-4 rounded-[14px] border border-border bg-surface p-4"
                    >
                      <span className="w-6 shrink-0 font-mono text-[13px] text-accent">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="text-[13.5px] text-muted">
                        {line.replace(/^\d+\.\s*/, "")}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="h-3 w-3"
              aria-hidden
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Livraison instantanée
          </span>

          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-text">
            {title}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            {parent.shortDescription ?? parent.description}
          </p>

          {selected &&
            selected.faceValue !== undefined &&
            selected.faceCurrency !== undefined &&
            selected.faceCurrency !== "MAD" && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
                <span className="text-muted">Valeur faciale</span>
                <span className="font-semibold text-white">
                  {formatFaceValue(selected.faceValue, selected.faceCurrency)}
                </span>
                <span className="text-border">→</span>
                <span className="font-semibold text-accent">
                  {formatMAD(selected.price)}
                </span>
              </div>
            )}

          {activeVariants.length > 1 && (
            <div className="mt-5">
              <p className="mb-2.5 text-sm font-medium text-faint">Montant</p>
              <div className="flex flex-wrap gap-2">
                {activeVariants.map((v) => {
                  const label =
                    v.faceCurrency === "MAD"
                      ? formatMAD(v.faceValue)
                      : formatFaceValue(v.faceValue, v.faceCurrency);
                  const active = v.id === selectedId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className={`rounded-[10px] border px-4 py-2 text-sm font-medium transition ${
                        active
                          ? "border-accent bg-accent/15 text-white"
                          : "border-border text-muted hover:border-border-strong hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {parent.brand && <span className="chip">{parent.brand}</span>}
            <span className="chip">Région: {parent.region}</span>
            <span className="chip">{parent.deliveryType}</span>
          </div>

          <div className="mt-7 rounded-2xl border border-border bg-surface p-6">
            {selected ? (
              <AddToCartForm
                productId={selected.id}
                price={selected.price}
                outOfStock={outOfStock}
              />
            ) : (
              <p className="text-sm text-muted">Aucune variante disponible.</p>
            )}
            <div className="mt-4 flex items-center gap-2 text-xs text-faint">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Paiement sécurisé - Visa, Mastercard, PayPal
            </div>
          </div>

          <div className="mt-[18px] grid gap-2.5 sm:grid-cols-2">
            {["Reçu par email", "Support local"].map((text) => (
              <div
                key={text}
                className="flex items-center gap-2.5 rounded-[11px] border border-border bg-surface px-3.5 py-3 text-[13px] text-muted"
              >
                <span className="h-2 w-2 rounded-full bg-accent" />
                {text}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-semibold tracking-tight text-text">
            Plus de {category?.name}
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
            {related.map((rel) => {
              const featuredVariant =
                rel.variants.find((v) => v.featured && v.active !== false) ??
                rel.variants.find((v) => v.active !== false);
              if (!featuredVariant) return null;
              const flatProduct = getProduct(featuredVariant.id);
              if (!flatProduct) return null;
              return (
                <ProductCard
                  key={rel.id}
                  product={flatProduct}
                  outOfStock={isOutOfStock(featuredVariant.id)}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
