"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import CategoryCard from "@/components/CategoryCard";
import ProductCard from "@/components/ProductCard";
import HeroDeliveryCard from "@/components/HeroDeliveryCard";
import { EditorProvider, useEditor } from "@/lib/editor/EditorContext";
import EditorToolbar from "@/components/editor/EditorToolbar";
import EditableText from "@/components/editor/EditableText";
import SectionWrapper from "@/components/editor/SectionWrapper";
import {
  getStorefrontProductsByIdsAction,
  getCategoryCountsAction,
  getCategoryStockStatusesAction,
} from "@/app/actions/storefront";
import { getFeaturedVariantOptionsAction } from "@/app/actions/admin";
import type { Product, StockStatus } from "@/lib/types";
import type { FeaturedVariantOptionDTO } from "@/lib/dto";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5",
  "aria-hidden": true as const,
};

const trustIcons = [
  <svg key="bolt" {...iconProps}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>,
  <svg key="lock" {...iconProps}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>,
  <svg key="save" {...iconProps}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>,
  <svg key="support" {...iconProps}>
    <path d="M4 18v-6a8 8 0 0 1 16 0v6" />
    <path d="M20 18a2 2 0 0 1-2 2h-1v-5h3zM4 18a2 2 0 0 0 2 2h1v-5H4z" />
  </svg>,
];

const howItWorksSteps = [
  { n: 1, title: "Choisissez un produit", text: "Sélectionnez une carte et la quantité." },
  { n: 2, title: "Paiement sécurisé", text: "Renseignez votre e-mail et choisissez un mode de paiement." },
  { n: 3, title: "Recevez le code", text: "Votre code est livré après confirmation du paiement." },
];

function FeaturedProductsManager({
  selectedIds,
  onChange,
  onSave,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onSave: () => void;
}) {
  const [options, setOptions] = useState<FeaturedVariantOptionDTO[]>([]);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getFeaturedVariantOptionsAction().then(setOptions);
  }, []);

  const byId = new Map(options.map((option) => [option.id, option]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((option): option is FeaturedVariantOptionDTO => Boolean(option));
  const selectedSet = new Set(selectedIds);
  const search = query.trim().toLowerCase();
  const available = options
    .filter((option) => option.productActive && option.variantActive)
    .filter((option) => !selectedSet.has(option.id))
    .filter((option) => {
      if (!search) return true;
      return [
        option.id,
        option.productName,
        option.variantName,
        option.displayName,
        option.categoryName,
      ].join(" ").toLowerCase().includes(search);
    })
    .slice(0, 8);

  function move(id: string, direction: -1 | 1) {
    const index = selectedIds.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
    setSaved(false);
  }

  function add(id: string) {
    onChange([...selectedIds, id]);
    setQuery("");
    setSaved(false);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((item) => item !== id));
    setSaved(false);
  }

  function saveOrder() {
    onSave();
    setSaved(true);
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Featured Products</h3>
          <p className="mt-1 text-xs text-muted">
            Manage storefront featured variants and their homepage order.
          </p>
        </div>
        <button type="button" onClick={saveOrder} className="btn-primary h-9 px-4 text-xs">
          Save order
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="mb-2 text-xs font-medium uppercase text-muted">Currently featured</p>
          <div className="space-y-2">
            {selected.length === 0 ? (
              <div className="rounded-lg border border-border bg-base px-4 py-6 text-center text-xs text-muted">
                No featured variants selected.
              </div>
            ) : (
              selected.map((option, index) => (
                <div
                  key={option.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-base px-3 py-2"
                >
                  <span className="w-5 text-xs text-muted">{index + 1}</span>
                  <VariantSummary option={option} />
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(option.id, -1)}
                      disabled={index === 0}
                      className="btn-ghost h-8 px-2 text-xs disabled:opacity-40"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => move(option.id, 1)}
                      disabled={index === selected.length - 1}
                      className="btn-ghost h-8 px-2 text-xs disabled:opacity-40"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(option.id)}
                      className="h-8 rounded-lg px-2 text-xs font-medium text-red-300 hover:bg-red-500/10"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {saved ? <p className="mt-2 text-xs text-green-400">Featured order saved.</p> : null}
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium uppercase text-muted">
            Search active variants
          </label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="input h-10 py-0 text-sm"
            placeholder="Search by product, variant, SKU, category..."
          />
          <div className="mt-3 space-y-2">
            {available.length === 0 ? (
              <div className="rounded-lg border border-border bg-base px-4 py-6 text-center text-xs text-muted">
                No matching active variants.
              </div>
            ) : (
              available.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-base px-3 py-2"
                >
                  <VariantSummary option={option} />
                  <button
                    type="button"
                    onClick={() => add(option.id)}
                    className="btn-ghost ml-auto h-8 px-3 text-xs"
                  >
                    Add
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VariantSummary({ option }: { option: FeaturedVariantOptionDTO }) {
  const visible = option.productActive && option.variantActive;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="truncate text-sm font-medium text-white">{option.displayName}</p>
        <span className={`chip ${visible ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-500"}`}>
          {visible ? "Visible" : "Hidden"}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">
        {option.productName} · {option.categoryName} · {option.priceMad} MAD · {option.id}
      </p>
    </div>
  );
}

function EditorCanvas() {
  const { draft, previewMode, set, save } = useEditor();
  const { categories } = useProductCatalog();
  const s = draft;

  const [featured, setFeatured] = useState<Product[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [autoStockStatuses, setAutoStockStatuses] = useState<Record<string, StockStatus>>({});
  const [countsReady, setCountsReady] = useState(false);

  useEffect(() => {
    Promise.all([getCategoryCountsAction(), getCategoryStockStatusesAction()]).then(
      ([counts, stockStatuses]) => {
        setCategoryCounts(counts);
        setAutoStockStatuses(stockStatuses);
        setCountsReady(true);
      },
    );
  }, []);

  useEffect(() => {
    if (s.featuredProductIds.length > 0) {
      getStorefrontProductsByIdsAction(s.featuredProductIds).then(setFeatured);
    } else {
      Promise.resolve<Product[]>([]).then(setFeatured);
    }
  }, [s.featuredProductIds]);

  function setBranding(key: keyof typeof s.branding, value: string) {
    set((prev) => ({ ...prev, branding: { ...prev.branding, [key]: value } }));
  }

  function setHomepage(key: keyof typeof s.homepage, value: string | boolean) {
    set((prev) => ({ ...prev, homepage: { ...prev.homepage, [key]: value } }));
  }

  const editing = !previewMode;

  return (
    <>
      {/* Hero */}
      <SectionWrapper sectionKey="showHero" label="Hero">
        <div className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at top right, rgba(59,130,246,0.16) 0%, rgba(59,130,246,0.10) 20%, rgba(59,130,246,0.05) 40%, rgba(59,130,246,0.02) 60%, transparent 80%)",
              maskImage: "linear-gradient(to bottom, black 30%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 30%, transparent 100%)",
            }}
          />
          <div className="container-page">
            <section className="relative pb-10 pt-16 sm:pb-14 sm:pt-24">
              <div className="relative grid items-center gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
                <div>
                  <span className="chip">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--tw-shadow-color)] shadow-accent" />
                    Cartes &amp; codes numériques
                  </span>
                  <EditableText
                    as="h1"
                    value={s.branding.heroTitle}
                    onChange={(v) => setBranding("heroTitle", v)}
                    disabled={!editing}
                    className="mt-6 max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.035em] text-text sm:text-6xl"
                  />
                  <EditableText
                    as="p"
                    value={s.branding.heroSubtitle}
                    onChange={(v) => setBranding("heroSubtitle", v)}
                    disabled={!editing}
                    className="mt-5 max-w-lg text-lg leading-relaxed text-muted"
                  />
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <EditableText
                      as="span"
                      value={s.branding.primaryCtaLabel}
                      onChange={(v) => setBranding("primaryCtaLabel", v)}
                      disabled={!editing}
                      className="btn-primary h-12 px-6 text-[15px] flex items-center"
                    />
                    <EditableText
                      as="span"
                      value={s.branding.secondaryCtaLabel}
                      onChange={(v) => setBranding("secondaryCtaLabel", v)}
                      disabled={!editing}
                      className="btn-ghost h-12 px-6 text-[15px] flex items-center"
                    />
                  </div>
                  {s.homepage.showTrustStrip && (
                    <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3">
                      {["Livraison rapide", "Paiement sécurisé", "Support local"].map(
                        (text) => (
                          <span key={text} className="flex items-center gap-2 text-sm text-muted">
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2.2}
                              className="h-4 w-4 text-accent"
                              aria-hidden
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            {text}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </div>
                <HeroDeliveryCard />
              </div>
            </section>
          </div>
        </div>
      </SectionWrapper>

      <div className="container-page space-y-0">
        {/* Categories */}
        <SectionWrapper sectionKey="showCategories" label="Categories">
          <section className="mt-7">
            <div className="flex items-end justify-between gap-6">
              <div>
                <EditableText
                  as="h2"
                  value={s.homepage.categoriesTitle}
                  onChange={(v) => setHomepage("categoriesTitle", v)}
                  disabled={!editing}
                  className="text-2xl font-semibold tracking-tight text-text"
                />
                <EditableText
                  as="p"
                  value={s.homepage.categoriesSubtitle}
                  onChange={(v) => setHomepage("categoriesSubtitle", v)}
                  disabled={!editing}
                  className="mt-1 text-sm text-muted"
                />
              </div>
              <Link
                href="/products"
                className="hidden text-sm font-medium text-accent hover:text-accent-hover sm:block"
              >
                Tout voir -&gt;
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-[18px] md:grid-cols-4">
              {(countsReady
                ? categories.filter((cat) => (categoryCounts[cat.id] ?? 0) > 0)
                : categories
              )
                .slice(0, 4)
                .map((category) => {
                  const mode = s.categoryStockModes?.[category.id] ?? "automatic";
                  const autoStatus = autoStockStatuses[category.id];
                  const stockStatus: StockStatus | undefined = countsReady
                    ? mode === "force_in_stock"
                      ? "in_stock"
                      : mode === "force_out_of_stock"
                        ? "out_of_stock"
                        : autoStatus
                    : undefined;
                  return (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      count={categoryCounts[category.id]}
                      thumbnail={s.categoryMedia?.[category.id]}
                      stockStatus={stockStatus}
                    />
                  );
                })}
            </div>
          </section>
        </SectionWrapper>

        {/* Featured Products */}
        <SectionWrapper sectionKey="showFeaturedProducts" label="Produits populaires">
          <section className="mt-10">
            <div className="flex items-end justify-between gap-6">
              <div>
                <EditableText
                  as="h2"
                  value={s.homepage.featuredTitle}
                  onChange={(v) => setHomepage("featuredTitle", v)}
                  disabled={!editing}
                  className="text-2xl font-semibold tracking-tight text-text"
                />
                <EditableText
                  as="p"
                  value={s.homepage.featuredSubtitle}
                  onChange={(v) => setHomepage("featuredSubtitle", v)}
                  disabled={!editing}
                  className="mt-1 text-sm text-muted"
                />
              </div>
              <Link
                href="/products"
                className="hidden text-sm font-medium text-accent hover:text-accent-hover sm:block"
              >
                Tout voir -&gt;
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
              {(s.featuredOutOfStock === "hide"
                ? featured.filter((p) => p.stockStatus === "in_stock")
                : featured
              ).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            {editing ? (
              <FeaturedProductsManager
                selectedIds={s.featuredProductIds}
                onChange={(ids) =>
                  set((prev) => ({
                    ...prev,
                    featuredProductIds: ids,
                  }))
                }
                onSave={save}
              />
            ) : null}
          </section>
        </SectionWrapper>

        {/* How it works */}
        <SectionWrapper sectionKey="showHowItWorks" label="How it works">
          <section className="mt-16 scroll-mt-20">
            <EditableText
              as="h2"
              value={s.homepage.howItWorksTitle}
              onChange={(v) => setHomepage("howItWorksTitle", v)}
              disabled={!editing}
              className="text-2xl font-semibold tracking-tight text-text"
            />
            <EditableText
              as="p"
              value={s.homepage.howItWorksSubtitle}
              onChange={(v) => setHomepage("howItWorksSubtitle", v)}
              disabled={!editing}
              className="mt-1 text-sm text-muted"
            />
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {howItWorksSteps.map((step) => (
                <div key={step.n} className="card p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-lg font-bold text-accent">
                    {step.n}
                  </span>
                  <h3 className="mt-4 font-semibold text-white">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted">{step.text}</p>
                </div>
              ))}
            </div>
          </section>
        </SectionWrapper>

        {/* Why choose us */}
        <SectionWrapper sectionKey="showWhyChooseUs" label="Why choose us">
          <section className="mt-16">
            <div className="rounded-[20px] border border-border bg-gradient-to-b from-surface to-surface/40 px-6 py-10 sm:px-11 sm:py-12">
              <EditableText
                as="h2"
                value={s.homepage.whyChooseUsTitle}
                onChange={(v) => setHomepage("whyChooseUsTitle", v)}
                disabled={!editing}
                className="text-center text-2xl font-semibold tracking-tight text-text"
              />
              <EditableText
                as="p"
                value={s.homepage.whyChooseUsSubtitle}
                onChange={(v) => setHomepage("whyChooseUsSubtitle", v)}
                disabled={!editing}
                className="mx-auto mt-1 max-w-md text-center text-sm text-muted"
              />
              <div className="mt-10 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
                {s.trustItems
                  .filter((item) => item.enabled)
                  .map((item, index) => (
                    <article
                      key={item.id}
                      className="rounded-[14px] border border-border bg-surface2 p-6"
                    >
                      <span className="mb-[18px] grid h-[42px] w-[42px] place-items-center rounded-[11px] bg-accent-soft text-accent">
                        {trustIcons[index % trustIcons.length]}
                      </span>
                      <EditableText
                        as="h3"
                        value={item.title}
                        onChange={(v) =>
                          set((prev) => ({
                            ...prev,
                            trustItems: prev.trustItems.map((t) =>
                              t.id === item.id ? { ...t, title: v } : t,
                            ),
                          }))
                        }
                        disabled={!editing}
                        className="text-[15.5px] font-semibold text-text"
                      />
                      <EditableText
                        as="p"
                        value={item.description}
                        onChange={(v) =>
                          set((prev) => ({
                            ...prev,
                            trustItems: prev.trustItems.map((t) =>
                              t.id === item.id ? { ...t, description: v } : t,
                            ),
                          }))
                        }
                        disabled={!editing}
                        className="mt-1.5 text-[13.5px] leading-relaxed text-muted"
                      />
                    </article>
                  ))}
              </div>
            </div>
          </section>
        </SectionWrapper>

        {/* CTA */}
        <section className="mt-16 pb-16">
          <div className="relative overflow-hidden rounded-[20px] border border-accent/30 bg-gradient-to-br from-accent/20 to-surface px-6 py-12 text-center sm:py-16">
            <EditableText
              as="h2"
              value={s.homepage.ctaTitle}
              onChange={(v) => setHomepage("ctaTitle", v)}
              disabled={!editing}
              className="text-2xl font-semibold tracking-tight text-text sm:text-3xl"
            />
            <EditableText
              as="p"
              value={s.homepage.ctaSubtitle}
              onChange={(v) => setHomepage("ctaSubtitle", v)}
              disabled={!editing}
              className="mx-auto mt-2 max-w-md text-sm text-muted"
            />
            <Link href="/products" className="btn-primary mt-6">
              {s.branding.primaryCtaLabel}
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

export default function HomepageEditorPage() {
  return (
    <EditorProvider>
      <EditorToolbar />
      <EditorCanvas />
    </EditorProvider>
  );
}
