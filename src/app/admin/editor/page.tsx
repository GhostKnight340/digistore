"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { categories, products as allProducts } from "@/lib/products";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import {
  defaultStoreSettings,
  type StoreSettings,
  type TrustItemSetting,
  type HowItWorksStep,
} from "@/lib/storeSettings";
import { formatMAD } from "@/lib/format";
import EditableText from "@/components/EditableText";
import HeroDeliveryCard from "@/components/HeroDeliveryCard";
import ProductArt from "@/components/ProductArt";

// ── Icons reused from TrustStrip ──────────────────────────────────────────────

const trustIcons = [
  <svg key="tag" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>,
  <svg key="shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>,
  <svg key="archive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
    <rect x="3" y="3" width="18" height="4" rx="1" />
    <path d="M4 7v12a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7" />
    <path d="M10 12h4" />
  </svg>,
  <svg key="headphones" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
    <path d="M4 18v-6a8 8 0 0 1 16 0v6" />
    <path d="M20 18a2 2 0 0 1-2 2h-1v-5h3zM4 18a2 2 0 0 0 2 2h1v-5H4z" />
  </svg>,
];

// ── Deep-clone helper ─────────────────────────────────────────────────────────

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ── Editor page ───────────────────────────────────────────────────────────────

export default function EditorPage() {
  const { settings, ready, saveSettings } = useStoreSettings();

  const [draft, setDraft] = useState<StoreSettings>(defaultStoreSettings);
  const [undoSnapshot, setUndoSnapshot] = useState<StoreSettings | null>(null);

  useEffect(() => {
    if (ready) setDraft(deepClone(settings));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = ready && JSON.stringify(draft) !== JSON.stringify(settings);

  function handleSave() {
    setUndoSnapshot(deepClone(settings));
    saveSettings(draft);
  }
  function handleUndo() {
    if (!undoSnapshot) return;
    saveSettings(undoSnapshot);
    setDraft(deepClone(undoSnapshot));
    setUndoSnapshot(null);
  }
  function handleCancel() {
    setDraft(deepClone(settings));
  }
  function handleReset() {
    if (!confirm("Réinitialiser tout le contenu de la page d'accueil aux valeurs par défaut ?")) return;
    setDraft(deepClone(defaultStoreSettings));
  }

  // Patch helpers — memoised so they don't re-create on every render
  const patchBranding = useCallback(
    (p: Partial<StoreSettings["branding"]>) =>
      setDraft((prev) => ({ ...prev, branding: { ...prev.branding, ...p } })),
    [],
  );
  const patchHiw = useCallback(
    (p: Partial<StoreSettings["howItWorks"]>) =>
      setDraft((prev) => ({ ...prev, howItWorks: { ...prev.howItWorks, ...p } })),
    [],
  );
  const patchHiwStep = useCallback(
    (i: number, p: Partial<HowItWorksStep>) =>
      setDraft((prev) => ({
        ...prev,
        howItWorks: {
          ...prev.howItWorks,
          steps: prev.howItWorks.steps.map((s, idx) => (idx === i ? { ...s, ...p } : s)),
        },
      })),
    [],
  );
  const patchTrust = useCallback(
    (p: Partial<StoreSettings["trust"]>) =>
      setDraft((prev) => ({ ...prev, trust: { ...prev.trust, ...p } })),
    [],
  );
  const patchTrustItem = useCallback(
    (i: number, p: Partial<TrustItemSetting>) =>
      setDraft((prev) => ({
        ...prev,
        trustItems: prev.trustItems.map((item, idx) => (idx === i ? { ...item, ...p } : item)),
      })),
    [],
  );

  const b = draft.branding;
  const hiw = draft.howItWorks;
  const enabledTrustItems = draft.trustItems.filter((item) => item.enabled);

  const featuredProducts = (
    draft.featuredProductIds.length > 0
      ? draft.featuredProductIds
          .map((id) => allProducts.find((p) => p.id === id))
          .filter(Boolean)
      : allProducts.filter((p) => p.featured)
  ).slice(0, 6) as (typeof allProducts)[number][];

  return (
    <div className="min-h-screen bg-base">

      {/* ── Slim sticky toolbar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 border-b border-border bg-base/95 backdrop-blur-sm">
        <div className="container-page flex flex-wrap items-center gap-3 py-2.5">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-sm text-muted hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Admin
          </Link>

          <span className="text-border/60">|</span>
          <span className="text-sm font-medium text-white">Homepage editor</span>

          {dirty && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Unsaved changes
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {dirty && (
              <button type="button" onClick={handleCancel} className="btn-ghost h-8 px-3 text-xs">
                Cancel
              </button>
            )}
            {undoSnapshot && (
              <button type="button" onClick={handleUndo} className="btn-ghost h-8 px-3 text-xs">
                Undo save
              </button>
            )}
            <button type="button" onClick={handleReset} className="btn-ghost h-8 px-3 text-xs text-muted">
              Reset defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty}
              className="btn-primary h-8 px-4 text-xs disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>

        {/* Hint bar */}
        <div className="border-t border-border/40 bg-accent/5 py-1.5 text-center text-[11px] text-accent/80">
          Cliquez sur n'importe quel texte souligné pour le modifier • Entrée ou clic en dehors pour confirmer • Échap pour annuler
        </div>
      </div>

      {!ready ? (
        <div className="container-page py-16 text-sm text-muted">Loading…</div>
      ) : (
        <div className="container-page">

          {/* ── HERO ──────────────────────────────────────────────────────── */}
          {draft.homepage.showHero && (
            <section className="relative overflow-hidden py-16 sm:py-24">
              <div className="pointer-events-none absolute -right-10 -top-10 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
              <div className="relative grid items-center gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
                <div>
                  <span className="chip">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--tw-shadow-color)] shadow-accent" />
                    Cartes &amp; codes numériques
                  </span>

                  <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.035em] text-text sm:text-6xl">
                    <EditableText
                      value={b.heroTitle}
                      onChange={(v) => patchBranding({ heroTitle: v })}
                      className="text-5xl font-semibold leading-[1.04] tracking-[-0.035em] text-text sm:text-6xl"
                      multiline
                    />
                  </h1>

                  <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
                    <EditableText
                      value={b.heroSubtitle}
                      onChange={(v) => patchBranding({ heroSubtitle: v })}
                      className="text-lg leading-relaxed text-muted"
                      multiline
                    />
                  </p>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    {/* Primary CTA — rendered as a non-navigating button in editor */}
                    <span className="btn-primary inline-flex h-12 cursor-default items-center px-6 text-[15px]">
                      <EditableText
                        value={b.primaryCtaLabel}
                        onChange={(v) => patchBranding({ primaryCtaLabel: v })}
                        className="text-[15px] font-medium text-white"
                      />
                    </span>
                    <span className="btn-ghost inline-flex h-12 cursor-default items-center px-6 text-[15px]">
                      <EditableText
                        value={b.secondaryCtaLabel}
                        onChange={(v) => patchBranding({ secondaryCtaLabel: v })}
                        className="text-[15px] font-medium"
                      />
                    </span>
                  </div>

                  {draft.homepage.showTrustStrip && (
                    <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3">
                      {["Livraison instantanée", "Paiement sécurisé", "Support local"].map((text) => (
                        <span key={text} className="flex items-center gap-2 text-sm text-muted">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4 text-accent" aria-hidden>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          {text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <HeroDeliveryCard />
              </div>
            </section>
          )}

          {/* ── CATEGORIES (visual only) ───────────────────────────────── */}
          {draft.homepage.showCategories && (
            <section className="mt-10">
              <StaticSectionLabel>Catégories — non éditable</StaticSectionLabel>
              <div className="pointer-events-none select-none">
                <div className="flex items-end justify-between gap-6">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-text">
                      Catégories populaires
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      Les plateformes les plus demandées au Maroc.
                    </p>
                  </div>
                  <span className="hidden text-sm font-medium text-accent sm:block">
                    Tout voir →
                  </span>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-[18px] md:grid-cols-4">
                  {categories.slice(0, 4).map((cat) => (
                    <div
                      key={cat.id}
                      className="overflow-hidden rounded-[14px] border border-border bg-surface"
                    >
                      <ProductArt category={cat.id} className="aspect-[16/10] w-full" />
                      <div className="flex items-center justify-between px-[18px] py-4">
                        <span className="text-[15px] font-medium text-text">{cat.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── FEATURED PRODUCTS (visual only) ───────────────────────── */}
          {draft.homepage.showFeaturedProducts && (
            <section className="mt-16">
              <StaticSectionLabel>Produits populaires — non éditable</StaticSectionLabel>
              <div className="pointer-events-none select-none">
                <div className="flex items-end justify-between gap-6">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-text">
                      Produits populaires
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      Sélection vérifiée, codes livrés par email.
                    </p>
                  </div>
                  <span className="hidden text-sm font-medium text-accent sm:block">
                    Tout voir →
                  </span>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
                  {featuredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface"
                    >
                      <ProductArt category={product.category} className="aspect-[3/2] w-full" />
                      <div className="flex flex-1 flex-col p-4">
                        <span className="mb-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5" aria-hidden>
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                          </svg>
                          Instantané
                        </span>
                        <h3 className="line-clamp-2 text-[14.5px] font-medium leading-snug text-text">
                          {product.name}
                        </h3>
                        <div className="mt-3 flex items-baseline justify-between">
                          <span className="font-mono text-lg font-semibold tracking-tight text-text">
                            {formatMAD(product.price)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── HOW IT WORKS (editable) ────────────────────────────────── */}
          <section id="how-it-works" className="mt-16 scroll-mt-20">
            <EditableText
              as="h2"
              value={hiw.title}
              onChange={(v) => patchHiw({ title: v })}
              className="text-2xl font-semibold tracking-tight text-text"
            />
            <p className="mt-1">
              <EditableText
                value={hiw.subtitle}
                onChange={(v) => patchHiw({ subtitle: v })}
                className="text-sm text-muted"
              />
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {hiw.steps.map((step, i) => (
                <div key={i} className="card p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-lg font-bold text-accent">
                    {i + 1}
                  </span>
                  <h3 className="mt-4">
                    <EditableText
                      value={step.title}
                      onChange={(v) => patchHiwStep(i, { title: v })}
                      className="font-semibold text-white"
                    />
                  </h3>
                  <p className="mt-1">
                    <EditableText
                      value={step.description}
                      onChange={(v) => patchHiwStep(i, { description: v })}
                      className="text-sm text-muted"
                      multiline
                    />
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ── TRUST STRIP / POURQUOI KARTA (editable) ───────────────── */}
          {draft.homepage.showWhyChooseUs && enabledTrustItems.length > 0 && (
            <section className="mt-16">
              <div className="rounded-[20px] border border-border bg-gradient-to-b from-surface to-surface/40 px-6 py-10 sm:px-11 sm:py-12">
                <EditableText
                  as="h2"
                  value={draft.trust.title}
                  onChange={(v) => patchTrust({ title: v })}
                  className="block text-center text-2xl font-semibold tracking-tight text-text"
                />
                <p className="mx-auto mt-1 max-w-md text-center">
                  <EditableText
                    value={draft.trust.subtitle}
                    onChange={(v) => patchTrust({ subtitle: v })}
                    className="text-sm text-muted"
                  />
                </p>
                <div className="mt-10 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
                  {draft.trustItems.map((item, index) => {
                    if (!item.enabled) return null;
                    return (
                      <article
                        key={item.id}
                        className="rounded-[14px] border border-border bg-surface2 p-6"
                      >
                        <span className="mb-[18px] grid h-[42px] w-[42px] place-items-center rounded-[11px] bg-accent-soft text-accent">
                          {trustIcons[index % trustIcons.length]}
                        </span>
                        <h3 className="text-[15.5px]">
                          <EditableText
                            value={item.title}
                            onChange={(v) => patchTrustItem(index, { title: v })}
                            className="font-semibold text-text"
                          />
                        </h3>
                        <p className="mt-1.5">
                          <EditableText
                            value={item.description}
                            onChange={(v) => patchTrustItem(index, { description: v })}
                            className="text-[13.5px] leading-relaxed text-muted"
                            multiline
                          />
                        </p>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ── FINAL CTA (visual only) ────────────────────────────────── */}
          <section className="mt-16 mb-16">
            <StaticSectionLabel>Bannière finale — non éditable</StaticSectionLabel>
            <div className="pointer-events-none select-none relative overflow-hidden rounded-[20px] border border-accent/30 bg-gradient-to-br from-accent/20 to-surface px-6 py-12 text-center sm:py-16">
              <h2 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">
                Prêt à jouer?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Choisissez une carte et recevez votre code en quelques secondes.
              </p>
              <span className="btn-primary mt-6 inline-flex h-10 items-center px-5 text-sm">
                {b.primaryCtaLabel}
              </span>
            </div>
          </section>

        </div>
      )}
    </div>
  );
}

/** Thin label shown above non-editable sections so the admin knows what they are. */
function StaticSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
      <div className="h-px flex-1 bg-border/40" />
      <span>{children}</span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}
