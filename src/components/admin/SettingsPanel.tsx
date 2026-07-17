"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import {
  defaultStoreSettings,
  isInventoryEnabled,
  isOrderingEnabled,
  type StoreSettings,
} from "@/lib/storeSettings";
import { getStorefrontProductsAction, getCategoryStockStatusesAction } from "@/app/actions/storefront";
import { getAdminPaymentConfigAction } from "@/app/actions/payments";
import { footerBadgeOptions } from "@/lib/footerConfig";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import { adminSectionId } from "@/lib/admin/adminSections";
import { uploadImageFile } from "@/lib/clientUpload";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { PaymentMethodDTO } from "@/lib/dto";
import type { Product, StockMode, StockStatus } from "@/lib/types";

// Fallback when a legacy/cached settings blob lacks the `features` section, so
// the editor never reads undefined. Save re-merges via mergeStoreSettings.
const FEATURE_DEFAULTS = {
  wishlistEnabled: true,
  recentlyViewedOnHomepage: false,
  recentlyViewedMax: 12,
} as const;

const homepageSectionKeys = [
  "showHero",
  "showTrustStrip",
  "showStats",
  "showBrandNav",
  "showCategories",
  "showFeaturedProducts",
  "showHowItWorks",
  "showWhyChooseUs",
  "showWhyGhost",
  "showReviews",
  "showDelivery",
  "showPaymentMethods",
  "showFaq",
  "showFooter",
] as const;

const sectionLabels: Record<(typeof homepageSectionKeys)[number], string> = {
  showHero: "Bannière",
  showTrustStrip: "Indicateurs de confiance",
  showStats: "Statistiques",
  showBrandNav: "Marques",
  showCategories: "Catégories populaires",
  showFeaturedProducts: "Produits populaires",
  showHowItWorks: "Comment ça marche",
  showWhyChooseUs: "Pourquoi nous choisir",
  showWhyGhost: "Pourquoi ghost.ma",
  showReviews: "Avis clients",
  showDelivery: "Livraison (produit/FAQ)",
  showPaymentMethods: "Moyens de paiement",
  showFaq: "FAQ",
  showFooter: "Pied de page",
};

// ── Tabs (design handoff: 6-tab layout) ─────────────────────────────────────

type SettingsTab = "general" | "homepage" | "featured" | "payments" | "footer" | "theme";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "Général" },
  { id: "homepage", label: "Page d'accueil" },
  { id: "featured", label: "Produits populaires" },
  { id: "payments", label: "Paiements" },
  { id: "footer", label: "Pied de page" },
  { id: "theme", label: "Thème" },
];

/** Card-anchor → tab, so ?section= deep links (command palette) still land on
 *  the right card: we open its tab, then AdminDashboard's poll-scroll finds it. */
const SECTION_TAB: Record<string, SettingsTab> = {
  [adminSectionId("Commandes clients")]: "general",
  [adminSectionId("Système d'inventaire")]: "general",
  [adminSectionId("Identité")]: "general",
  [adminSectionId("Sections de la page d'accueil")]: "homepage",
  [adminSectionId("Découverte & engagement")]: "homepage",
  [adminSectionId("Images des catégories")]: "homepage",
  [adminSectionId("Arguments de confiance")]: "homepage",
  [adminSectionId("Affichage des produits populaires")]: "featured",
  [adminSectionId("Produits populaires")]: "featured",
  [adminSectionId("Stock des catégories")]: "featured",
  [adminSectionId("Modes de paiement")]: "payments",
  [adminSectionId("Pied de page")]: "footer",
  [adminSectionId("Thème")]: "theme",
};

// Theme swatches from the handoff.
const ACCENT_SWATCHES = ["#3E7BFA", "#7C5CFC", "#2EA067", "#E8A838", "#E5484D"];
const BACKGROUND_SWATCHES = ["#070809", "#0E0F13", "#12100C"];

export default function SettingsPanel() {
  const { settings, ready, saveSettings, resetSettings } = useStoreSettings();
  const { categories } = useProductCatalog();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<StoreSettings>(settings);
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [autoStockStatuses, setAutoStockStatuses] = useState<Record<string, StockStatus>>({});
  // Live payment-method registry ("Modes de paiement") — single source of
  // truth for both the read-only Paiements summary and the footer badge list.
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDTO[] | null>(null);

  const sectionParam = searchParams.get("section");
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    () => (sectionParam && SECTION_TAB[sectionParam]) || "general",
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // A later ?section= navigation (command palette while already here) must
  // also switch tabs so the anchor exists for the dashboard's scroll poll.
  useEffect(() => {
    if (sectionParam && SECTION_TAB[sectionParam]) setActiveTab(SECTION_TAB[sectionParam]);
  }, [sectionParam]);

  useEffect(() => {
    getStorefrontProductsAction().then(setProducts);
    getCategoryStockStatusesAction().then(setAutoStockStatuses);
    // Admin-gated source (unaffected by the public "orders unavailable" guard).
    getAdminPaymentConfigAction()
      .then((config) => setPaymentMethods(config.methods.filter((method) => !method.archivedAt)))
      .catch(() => setPaymentMethods([]));
  }, []);

  // One badge toggle per customer-visible method (banks collapsed into the
  // single "Virement bancaire" entry, linked by method id so renames follow)
  // plus the static Visa/Mastercard network badges. Stale stored badges whose
  // method disappeared are dropped automatically.
  const customerVisibleMethods = (paymentMethods ?? []).filter(
    (method) => method.status === "active" && method.visible,
  );
  const badgeOptions = footerBadgeOptions(draft.footer.paymentBadges, customerVisibleMethods);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  // Dirty when the draft diverges from the last-saved settings; save/reset
  // update the context which resets the draft (effect above) and clears this.
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(settings),
    [draft, settings],
  );

  // Live accent for the header controls (save button, tab underline, swatches);
  // the site-wide theme still only changes after Enregistrer via applyTheme.
  const accent = /^#[0-9a-fA-F]{6}$/.test(draft.theme.accentColor)
    ? draft.theme.accentColor
    : "#3E7BFA";

  function update<K extends keyof StoreSettings>(
    section: K,
    value: StoreSettings[K],
  ) {
    setDraft((current) => ({ ...current, [section]: value }));
  }

  function save() {
    if (!draft.branding.siteName.trim() || !draft.branding.logoText.trim()) {
      setMessage("Le nom du site et le logo texte sont obligatoires.");
      return;
    }
    if (!draft.branding.heroTitle.trim()) {
      setMessage("Le titre de la bannière est obligatoire.");
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.theme.accentColor)) {
      setMessage("La couleur accent doit être un code hexadécimal valide.");
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.theme.backgroundColor)) {
      setMessage("La couleur de fond doit être un code hexadécimal valide.");
      return;
    }
    saveSettings(draft);
    setMessage("Paramètres sauvegardés.");
  }

  function reset() {
    resetSettings();
    setDraft(defaultStoreSettings);
    setMessage("Paramètres réinitialisés.");
  }

  function selectTab(tab: SettingsTab) {
    setActiveTab(tab);
    setMessage("");
    // Handoff: switching tabs scrolls the content back to the top.
    scrollRef.current?.scrollIntoView({ block: "start" });
  }

  if (!ready) {
    return <p className="card p-6 text-sm text-muted">Chargement...</p>;
  }

  return (
    <section>
      {/* Sticky header: title, dirty pill, actions, tab row (handoff layout). */}
      <div className="sticky top-0 z-10 -mx-1 border-b border-border bg-canvas/95 px-1 pt-1 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.025em] text-white">
              Paramètres de la boutique
            </h2>
            <p className="mt-1 text-sm text-muted">
              Personnalisez les textes, sections, paiements, pied de page et thème.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="inline-flex items-center gap-2 rounded-full border border-[#E8A838]/30 bg-[#E8A838]/10 px-3 py-1 text-[12px] font-medium text-[#E8B85C]">
                <span className="size-1.5 rounded-full bg-[#E8A838]" />
                Modifications non enregistrées
              </span>
            )}
            <button
              type="button"
              onClick={reset}
              disabled={!dirty}
              className="btn-ghost disabled:pointer-events-none disabled:opacity-50"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty}
              className="btn-primary disabled:pointer-events-none disabled:opacity-[0.55]"
              style={
                dirty
                  ? { backgroundColor: accent, boxShadow: `0 6px 18px ${accent}52` }
                  : { backgroundColor: accent }
              }
            >
              Enregistrer
            </button>
          </div>
        </div>
        {message && (
          <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm text-muted">{message}</p>
        )}
        <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="Sections des paramètres">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={`h-10 whitespace-nowrap border-b-2 px-3.5 text-sm transition-colors ${
                  active
                    ? "font-semibold text-[#EAF0FF]"
                    : "border-transparent font-medium text-[#8A909C] hover:text-white"
                }`}
                style={active ? { borderBottomColor: accent } : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div ref={scrollRef} className="scroll-mt-24 space-y-5 pt-5">
        {activeTab === "general" && (
          <>
            <Panel title="Commandes clients">
              <ToggleSwitch
                className="rounded-xl border border-border bg-canvas px-3 py-3"
                label="Accepter les commandes clients"
                checkedLabel="Commandes ouvertes"
                uncheckedLabel="Commandes suspendues"
                checked={isOrderingEnabled(draft)}
                onChange={(checked) => update("ordersEnabled", checked)}
              />
              {!isOrderingEnabled(draft) && (
                <div className="mt-3 flex items-start gap-3 rounded-xl border border-[#E8A838]/[0.24] bg-[#E8A838]/[0.08] px-4 py-3">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#E8A838"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden
                  >
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-[13px] leading-relaxed text-[#D9B87A]">
                    Commandes suspendues. Le catalogue et les prix restent visibles, mais le
                    paiement et l&apos;ajout au panier sont désactivés. Réactivez à tout moment,
                    sans redéploiement.
                  </p>
                </div>
              )}
            </Panel>

            <Panel title="Système d'inventaire">
              <ToggleSwitch
                className="rounded-xl border border-border bg-canvas px-3 py-3"
                label="Système d'inventaire"
                checked={isInventoryEnabled(draft)}
                onChange={(checked) => update("inventoryEnabled", checked)}
              />
              <p className="mt-3 text-sm text-muted">
                Lorsque l&apos;inventaire est désactivé, les produits ne sont plus bloqués par le
                stock et les outils de stock sont masqués.
              </p>
            </Panel>

            <Panel title="Identité">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Nom du site"
                  value={draft.branding.siteName}
                  onChange={(value) => update("branding", { ...draft.branding, siteName: value })}
                />
                <TextField
                  label="Texte du logo"
                  value={draft.branding.logoText}
                  onChange={(value) => update("branding", { ...draft.branding, logoText: value })}
                />
                <TextField
                  label="Titre de la bannière"
                  value={draft.branding.heroTitle}
                  onChange={(value) => update("branding", { ...draft.branding, heroTitle: value })}
                />
                <TextField
                  label="Sous-titre de la bannière"
                  value={draft.branding.heroSubtitle}
                  onChange={(value) =>
                    update("branding", { ...draft.branding, heroSubtitle: value })
                  }
                />
                <TextField
                  label="Bouton principal"
                  value={draft.branding.primaryCtaLabel}
                  onChange={(value) =>
                    update("branding", { ...draft.branding, primaryCtaLabel: value })
                  }
                />
                <TextField
                  label="Bouton secondaire"
                  value={draft.branding.secondaryCtaLabel}
                  onChange={(value) =>
                    update("branding", { ...draft.branding, secondaryCtaLabel: value })
                  }
                />
              </div>
            </Panel>
          </>
        )}

        {activeTab === "homepage" && (
          <>
            <Panel title="Sections de la page d'accueil">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {homepageSectionKeys.map((key) => (
                  <ToggleSwitch
                    key={key}
                    className="rounded-xl border border-border bg-canvas px-3 py-3"
                    label={sectionLabels[key]}
                    checked={draft.homepage[key]}
                    onChange={(checked) =>
                      update("homepage", { ...draft.homepage, [key]: checked })
                    }
                  />
                ))}
              </div>
            </Panel>

            <Panel title="Découverte & engagement">
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleSwitch
                  className="rounded-xl border border-border bg-canvas px-3 py-3"
                  label="Liste de favoris (cœur)"
                  checked={(draft.features ?? FEATURE_DEFAULTS).wishlistEnabled}
                  onChange={(checked) =>
                    update("features", {
                      ...FEATURE_DEFAULTS,
                      ...draft.features,
                      wishlistEnabled: checked,
                    })
                  }
                />
                <ToggleSwitch
                  className="rounded-xl border border-border bg-canvas px-3 py-3"
                  label="« Consultés récemment » en page d'accueil"
                  checked={(draft.features ?? FEATURE_DEFAULTS).recentlyViewedOnHomepage}
                  onChange={(checked) =>
                    update("features", {
                      ...FEATURE_DEFAULTS,
                      ...draft.features,
                      recentlyViewedOnHomepage: checked,
                    })
                  }
                />
                <label className="block rounded-xl border border-border bg-canvas px-3 py-3">
                  <span className="mb-1 block text-xs font-medium text-muted">
                    Nombre max. de produits récents
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    className="input"
                    value={(draft.features ?? FEATURE_DEFAULTS).recentlyViewedMax}
                    onChange={(e) =>
                      update("features", {
                        ...FEATURE_DEFAULTS,
                        ...draft.features,
                        recentlyViewedMax: Math.min(24, Math.max(1, Number(e.target.value) || 12)),
                      })
                    }
                  />
                </label>
              </div>
            </Panel>

            <Panel title="Images des catégories">
              <p className="mb-4 text-sm text-muted">
                Importez ou indiquez une image pour chaque catégorie affichée en page d&apos;accueil.
                Laissez vide pour utiliser le visuel par défaut.
              </p>
              <div className="space-y-4">
                {categories.map((cat) => (
                  <CategoryMediaRow
                    key={cat.id}
                    label={cat.name}
                    value={draft.categoryMedia?.[cat.id] ?? null}
                    onChange={(url) =>
                      update("categoryMedia", { ...draft.categoryMedia, [cat.id]: url })
                    }
                  />
                ))}
              </div>
            </Panel>

            <Panel title="Arguments de confiance">
              <div className="space-y-4">
                {draft.trustItems.map((item, index) => (
                  <div key={item.id} className="rounded-xl border border-border bg-canvas p-4">
                    <div className="mb-3">
                      <ToggleSwitch
                        label={item.title || "Élément de confiance"}
                        checkedLabel="Activé"
                        uncheckedLabel="Désactivé"
                        checked={item.enabled}
                        onChange={(checked) => {
                          const next = [...draft.trustItems];
                          next[index] = { ...item, enabled: checked };
                          update("trustItems", next);
                        }}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField
                        label="Titre"
                        value={item.title}
                        onChange={(value) => {
                          const next = [...draft.trustItems];
                          next[index] = { ...item, title: value };
                          update("trustItems", next);
                        }}
                      />
                      <TextField
                        label="Description"
                        value={item.description}
                        onChange={(value) => {
                          const next = [...draft.trustItems];
                          next[index] = { ...item, description: value };
                          update("trustItems", next);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </>
        )}

        {activeTab === "featured" && (
          <>
            <Panel title="Affichage des produits populaires">
              <p className="mb-4 text-sm text-muted">
                Définissez le comportement des produits en rupture dans la section populaire.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["show", "hide"] as const).map((opt) => {
                  const selected = draft.featuredOutOfStock === opt;
                  return (
                    <label
                      key={opt}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                        selected
                          ? "border-accent bg-accent/5"
                          : "border-border bg-canvas hover:border-border-strong"
                      }`}
                    >
                      <input
                        type="radio"
                        name="featuredOutOfStock"
                        value={opt}
                        checked={selected}
                        onChange={() => update("featuredOutOfStock", opt)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={`mt-0.5 size-4 shrink-0 rounded-full ${
                          selected ? "border-[5px]" : "border-2 border-[#3a3f4a]"
                        }`}
                        style={selected ? { borderColor: accent } : undefined}
                      />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {opt === "show"
                            ? "Afficher les produits en rupture"
                            : "Masquer les produits en rupture"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {opt === "show"
                            ? "Les produits en rupture restent visibles avec leur badge."
                            : "Les produits en rupture sont masqués de la section Produits populaires."}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Produits populaires">
              <FeaturedProductsPicker
                products={products}
                featuredIds={draft.featuredProductIds}
                onChange={(ids) => update("featuredProductIds", ids)}
              />
            </Panel>

            <Panel title="Stock des catégories">
              <p className="mb-4 text-sm text-muted">
                Remplacez l&apos;affichage du stock pour chaque catégorie de la page d&apos;accueil.
              </p>
              <div className="space-y-3">
                {categories.map((cat) => {
                  const mode: StockMode = draft.categoryStockModes?.[cat.id] ?? "automatic";
                  const autoStatus = autoStockStatuses[cat.id];
                  return (
                    <div
                      key={cat.id}
                      className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-canvas p-4"
                    >
                      <div className="min-w-[120px]">
                        <p className="text-sm font-medium text-white">{cat.name}</p>
                        {autoStatus && (
                          <p
                            className={`mt-0.5 text-xs ${
                              autoStatus === "in_stock" ? "text-[#2EA067]" : "text-yellow-500"
                            }`}
                          >
                            Auto · {autoStatus === "in_stock" ? "En stock" : "En rupture"}
                          </p>
                        )}
                      </div>
                      <select
                        className="input flex-1 text-sm"
                        value={mode}
                        onChange={(e) =>
                          update("categoryStockModes", {
                            ...draft.categoryStockModes,
                            [cat.id]: e.target.value as StockMode,
                          })
                        }
                      >
                        <option value="automatic">Automatique</option>
                        <option value="force_in_stock">Forcer : en stock</option>
                        <option value="force_out_of_stock">Forcer : rupture</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </>
        )}

        {activeTab === "payments" && (
          <Panel title="Modes de paiement">
            {/* Read-only mirror of the "Modes de paiement" registry — the
                single source of truth used by le checkout, le pied de page et
                les e-mails. Editing happens on its dedicated page. */}
            <p className="text-xs text-muted">
              Les modes de paiement sont gérés depuis la page{" "}
              <span className="font-medium text-white">Paiements → Modes de paiement</span>. Ce
              sont eux qui apparaissent au checkout, dans le pied de page et les e-mails.
            </p>
            <div className="mt-4 space-y-2">
              {paymentMethods === null ? (
                <p className="text-sm text-muted">Chargement…</p>
              ) : paymentMethods.length === 0 ? (
                <p className="text-sm text-muted">Aucun mode de paiement configuré.</p>
              ) : (
                paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{method.name}</p>
                      {method.subtitle && (
                        <p className="truncate text-xs text-muted">{method.subtitle}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[11px] font-semibold">
                      <span
                        className={
                          method.status === "active"
                            ? "rounded-full border border-[#2EA067]/40 bg-[#2EA067]/15 px-2 py-0.5 text-[#4CC38A]"
                            : "rounded-full border border-border bg-surface px-2 py-0.5 text-muted"
                        }
                      >
                        {method.status === "active" ? "Actif" : "Inactif"}
                      </span>
                      {!method.visible && (
                        <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-muted">
                          Masqué
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <Link
              href="/admin?tab=payment-settings"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-white transition hover:border-accent/50"
            >
              Gérer les modes de paiement
            </Link>
          </Panel>
        )}

        {activeTab === "footer" && (
          <Panel title="Pied de page">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="E-mail de contact"
                value={draft.footer.contactEmail}
                onChange={(value) => update("footer", { ...draft.footer, contactEmail: value })}
              />
              <TextField
                label="Numéro WhatsApp"
                value={draft.footer.whatsappNumber}
                onChange={(value) => update("footer", { ...draft.footer, whatsappNumber: value })}
              />
              <TextField
                label="Texte de support"
                value={draft.footer.supportText}
                onChange={(value) => update("footer", { ...draft.footer, supportText: value })}
              />
              <TextField
                label="Instagram URL"
                value={draft.footer.socialLinks.instagram}
                onChange={(value) =>
                  update("footer", {
                    ...draft.footer,
                    socialLinks: { ...draft.footer.socialLinks, instagram: value },
                  })
                }
              />
            </div>
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-sm font-semibold text-white">Badges de paiement du pied de page</p>
              <p className="mt-1 text-xs text-muted">
                Ces badges sont affichés dans le pied de page du site et des e-mails.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {badgeOptions.map((badge) => (
                  <ToggleSwitch
                    key={badge.id}
                    className="rounded-xl border border-border bg-canvas px-3 py-3"
                    label={badge.label}
                    checked={badge.enabled}
                    onChange={(checked) =>
                      update("footer", {
                        ...draft.footer,
                        // Persist the full option list (linked by method id);
                        // labels are snapshots — rendering re-resolves live.
                        paymentBadges: badgeOptions.map((item) =>
                          item.id === badge.id ? { ...item, enabled: checked } : item,
                        ),
                      })
                    }
                  />
                ))}
              </div>
            </div>
          </Panel>
        )}

        {activeTab === "theme" && (
          <Panel title="Thème">
            <div className="space-y-6">
              <SwatchRow
                label="Couleur d'accent"
                swatches={ACCENT_SWATCHES}
                value={draft.theme.accentColor}
                onChange={(value) => update("theme", { ...draft.theme, accentColor: value })}
              />
              <SwatchRow
                label="Couleur de fond"
                swatches={BACKGROUND_SWATCHES}
                value={draft.theme.backgroundColor}
                onChange={(value) => update("theme", { ...draft.theme, backgroundColor: value })}
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:max-w-md">
                <TextField
                  label="Arrondi des cartes"
                  mono
                  value={draft.theme.cardRadius}
                  onChange={(value) => update("theme", { ...draft.theme, cardRadius: value })}
                />
                <TextField
                  label="Arrondi des boutons"
                  mono
                  value={draft.theme.buttonRadius}
                  onChange={(value) => update("theme", { ...draft.theme, buttonRadius: value })}
                />
              </div>
            </div>
          </Panel>
        )}
      </div>
    </section>
  );
}

// ── Featured products picker (search + filter + scrollable list) ────────────

function FeaturedProductsPicker({
  products,
  featuredIds,
  onChange,
}: {
  products: Product[];
  featuredIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "on" | "off">("all");

  const featuredCount = featuredIds.length;
  const query = search.trim().toLowerCase();

  const visible = products.filter((product) => {
    const isOn = featuredIds.includes(product.id);
    if (filter === "on" && !isOn) return false;
    if (filter === "off" && isOn) return false;
    if (!query) return true;
    return (
      product.name.toLowerCase().includes(query) || product.id.toLowerCase().includes(query)
    );
  });

  function toggle(productId: string, checked: boolean) {
    const ids = checked
      ? [...featuredIds, productId]
      : featuredIds.filter((id) => id !== productId);
    onChange(Array.from(new Set(ids)));
  }

  return (
    <div>
      <p className="text-sm text-accent">
        {featuredCount} produit{featuredCount > 1 ? "s" : ""} mis en avant sur la page
        d&apos;accueil.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            className="input pl-9"
            placeholder="Rechercher un produit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Tous" },
            { value: "on", label: "Mis en avant" },
            { value: "off", label: "Autres" },
          ]}
        />
      </div>
      <div className="mt-3 max-h-[440px] space-y-2 overflow-y-auto pr-1">
        {visible.map((product) => {
          const isOn = featuredIds.includes(product.id);
          return (
            <div
              key={product.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-canvas px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{product.name}</p>
                <p className="truncate font-mono text-[11.5px] text-[#5a606d]">{product.id}</p>
              </div>
              <span className={`text-xs ${isOn ? "text-accent" : "text-faint"}`}>
                {isOn ? "Mis en avant" : "Non affiché"}
              </span>
              <ToggleSwitch
                showState={false}
                size="sm"
                checked={isOn}
                onChange={(checked) => toggle(product.id, checked)}
              />
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-faint">
            Aucun produit ne correspond.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Theme swatches ───────────────────────────────────────────────────────────

function SwatchRow({
  label,
  swatches,
  value,
  onChange,
}: {
  label: string;
  swatches: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const normalized = value.toLowerCase();
  // A custom color saved before the swatch UI stays selectable so the admin
  // never loses their current value just by opening this tab.
  const options = swatches.some((swatch) => swatch.toLowerCase() === normalized)
    ? swatches
    : [...swatches, value];

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-white">{label}</p>
      <div className="flex flex-wrap gap-3">
        {options.map((swatch) => {
          const selected = swatch.toLowerCase() === normalized;
          return (
            <button
              key={swatch}
              type="button"
              onClick={() => onChange(swatch)}
              aria-label={`${label} ${swatch}`}
              aria-pressed={selected}
              className="size-9 rounded-[9px] border border-white/10 transition-shadow"
              style={{
                backgroundColor: swatch,
                boxShadow: selected ? `0 0 0 2px #070809, 0 0 0 4px ${swatch}` : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // Stable anchor derived from the title so the command palette can deep-link
  // to this exact card via ?section=<id>. scroll-mt keeps the heading clear of
  // the sticky panel top when scrolled into view.
  return (
    <section id={adminSectionId(title)} className="card scroll-mt-40 p-5">
      <h3 className="mb-4 text-[17px] font-semibold tracking-[-0.01em] text-white">{title}</h3>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white">{label}</span>
      <input
        type={type}
        className={`input ${mono ? "font-mono" : ""}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function CategoryMediaRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-canvas p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white">{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-faint hover:text-white"
          >
            Supprimer
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={label}
            className="h-20 w-32 shrink-0 rounded-lg border border-border object-cover"
          />
        ) : (
          <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-surface text-xs text-faint">
            Aucune image
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2">
          <input
            type="text"
            className="input text-sm"
            placeholder="URL de l'image..."
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="btn-ghost h-8 px-3 text-xs disabled:opacity-50"
            >
              {uploading ? "Envoi..." : "Choisir un fichier"}
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}
