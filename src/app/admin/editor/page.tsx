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
  getStorefrontFeaturedAction,
  getStorefrontProductsByIdsAction,
  getCategoryCountsAction,
} from "@/app/actions/storefront";
import type { Product } from "@/lib/types";

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
  { n: 2, title: "Paiement sécurisé", text: "Entrez votre email et payez simplement." },
  { n: 3, title: "Recevez le code", text: "Votre code apparaît instantanément." },
];

function EditorCanvas() {
  const { draft, previewMode, set } = useEditor();
  const { categories } = useProductCatalog();
  const s = draft;

  const [featured, setFeatured] = useState<Product[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [countsReady, setCountsReady] = useState(false);

  useEffect(() => {
    getCategoryCountsAction().then((counts) => {
      setCategoryCounts(counts);
      setCountsReady(true);
    });
  }, []);

  useEffect(() => {
    if (s.featuredProductIds.length > 0) {
      getStorefrontProductsByIdsAction(s.featuredProductIds).then(setFeatured);
    } else {
      getStorefrontFeaturedAction().then(setFeatured);
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
                      {["Livraison instantanée", "Paiement sécurisé", "Support local"].map(
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
                .map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    count={categoryCounts[category.id]}
                    thumbnail={s.categoryMedia?.[category.id]}
                  />
                ))}
            </div>
          </section>
        </SectionWrapper>

        {/* Featured Products */}
        <SectionWrapper sectionKey="showFeaturedProducts" label="Featured products">
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
