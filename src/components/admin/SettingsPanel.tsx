"use client";

import { useEffect, useRef, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import {
  defaultStoreSettings,
  isInventoryEnabled,
  isOrderingEnabled,
  type FooterPaymentBadgeSetting,
  type StoreSettings,
} from "@/lib/storeSettings";
import { getStorefrontProductsAction, getCategoryStockStatusesAction } from "@/app/actions/storefront";
import { getAdminPaymentConfigAction } from "@/app/actions/payments";
import { announcedPaymentMethods } from "@/lib/paymentMethod";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import { uploadImageFile } from "@/lib/clientUpload";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import type { PaymentMethod, Product, StockMode, StockStatus } from "@/lib/types";

const paymentLabels: Record<PaymentMethod, string> = {
  test: "Paiement test",
  bank: "Virement bancaire",
  usdt: "USDT",
  crypto: "Crypto",
  paypal: "PayPal",
  card: "Carte bancaire",
};

const homepageSectionKeys = [
  "showHero",
  "showTrustStrip",
  "showStats",
  "showBrandNav",
  "showCategories",
  "showFeaturedProducts",
  "showHowItWorks",
  "showWhyChooseUs",
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
  showFooter: "Pied de page",
};

export default function SettingsPanel() {
  const { settings, ready, saveSettings, resetSettings } = useStoreSettings();
  const { categories } = useProductCatalog();
  const [draft, setDraft] = useState<StoreSettings>(settings);
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [autoStockStatuses, setAutoStockStatuses] = useState<Record<string, StockStatus>>({});
  const [methodBadgeOptions, setMethodBadgeOptions] = useState<FooterPaymentBadgeSetting[]>([]);

  useEffect(() => {
    getStorefrontProductsAction().then(setProducts);
    getCategoryStockStatusesAction().then(setAutoStockStatuses);
    // Offer one badge toggle per customer-facing payment method (banks
    // collapsed into the single "Virement bancaire" entry). New options start
    // disabled; they only persist once the admin toggles and saves.
    // Admin-gated source (unaffected by the public "orders unavailable" guard).
    // Mirror the customer-visible filter so badge options match checkout.
    getAdminPaymentConfigAction()
      .then((config) => {
        const usable = config.methods.filter(
          (method) => method.status === "active" && method.visible && !method.archivedAt,
        );
        setMethodBadgeOptions(
          announcedPaymentMethods(usable).map((method) => ({
            id: `method:${method.id}`,
            label: method.name,
            enabled: false,
          })),
        );
      })
      .catch(() => {});
  }, []);

  const footerBadgeOptions = [
    ...draft.footer.paymentBadges,
    ...methodBadgeOptions.filter(
      (option) =>
        !draft.footer.paymentBadges.some(
          (badge) =>
            badge.id === option.id ||
            badge.label.trim().toLowerCase() === option.label.trim().toLowerCase(),
        ),
    ),
  ];

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

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
    if (!Object.values(draft.paymentMethods).some(Boolean)) {
      setMessage("Activez au moins une méthode de paiement.");
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

  if (!ready) {
    return <p className="card p-6 text-sm text-muted">Chargement...</p>;
  }

  return (
    <section className="space-y-6">
      <div className="card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Paramètres de la boutique</h2>
            <p className="mt-1 text-sm text-muted">
              Personnalisez les textes, sections, paiements, pied de page et thème.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="btn-ghost">
              Réinitialiser
            </button>
            <button type="button" onClick={save} className="btn-primary">
              Enregistrer
            </button>
          </div>
        </div>
        {message && (
          <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-sm text-muted">
            {message}
          </p>
        )}
      </div>

      <Panel title="Commandes clients">
        <ToggleSwitch
          className="rounded-xl border border-border bg-base px-3 py-3"
          label="Accepter les commandes clients"
          checkedLabel="Commandes ouvertes"
          uncheckedLabel="Commandes suspendues"
          checked={isOrderingEnabled(draft)}
          onChange={(checked) => update("ordersEnabled", checked)}
        />
        <p className="mt-3 text-sm text-muted">
          Lorsque les commandes sont suspendues, le catalogue et les prix restent visibles, mais
          l&apos;ajout au panier, le paiement et les justificatifs sont désactivés (côté client et
          serveur), et aucune coordonnée de paiement n&apos;est exposée. Les commandes déjà payées
          restent accessibles. Réactivez pour rétablir immédiatement l&apos;achat, sans redéploiement.
        </p>
      </Panel>

      <Panel title="Système d'inventaire">
        <ToggleSwitch
          className="rounded-xl border border-border bg-base px-3 py-3"
          label="Système d'inventaire"
          checked={isInventoryEnabled(draft)}
          onChange={(checked) => update("inventoryEnabled", checked)}
        />
        <p className="mt-3 text-sm text-muted">
          Lorsque l&apos;inventaire est désactivé, les produits ne sont plus bloqués par le stock et
          les outils de stock sont masqués.
        </p>
      </Panel>

      <Panel title="Identité">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nom du site"
            value={draft.branding.siteName}
            onChange={(value) =>
              update("branding", { ...draft.branding, siteName: value })
            }
          />
          <TextField
            label="Texte du logo"
            value={draft.branding.logoText}
            onChange={(value) =>
              update("branding", { ...draft.branding, logoText: value })
            }
          />
          <TextField
            label="Titre de la bannière"
            value={draft.branding.heroTitle}
            onChange={(value) =>
              update("branding", { ...draft.branding, heroTitle: value })
            }
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

      <Panel title="Sections de la page d'accueil">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {homepageSectionKeys.map((key) => (
              <ToggleSwitch
                key={key}
                className="rounded-xl border border-border bg-base px-3 py-3"
                label={sectionLabels[key]}
                checked={draft.homepage[key]}
                onChange={(checked) =>
                  update("homepage", { ...draft.homepage, [key]: checked })
                }
              />
            ))}
        </div>
      </Panel>

      <Panel title="Images des catégories">
        <p className="mb-4 text-sm text-muted">
          Importez ou indiquez une image pour chaque catégorie affichée en page d'accueil. Laissez vide pour utiliser le visuel par défaut.
        </p>
        <div className="space-y-4">
          {categories.map((cat) => (
            <CategoryMediaRow
              key={cat.id}
              label={cat.name}
              value={draft.categoryMedia?.[cat.id] ?? null}
              onChange={(url) =>
                update("categoryMedia", {
                  ...draft.categoryMedia,
                  [cat.id]: url,
                })
              }
            />
          ))}
        </div>
      </Panel>

      <Panel title="Arguments de confiance">
        <div className="space-y-4">
          {draft.trustItems.map((item, index) => (
            <div key={item.id} className="rounded-xl border border-border bg-base p-4">
              <div className="mb-3">
                <ToggleSwitch
                  className="rounded-xl border border-border bg-base px-3 py-3"
                  label="Élément de confiance"
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

      <Panel title="Produits populaires">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ToggleSwitch
              key={product.id}
              className="rounded-xl border border-border bg-base px-3 py-3"
              label={`${product.name} (${product.id})`}
              checkedLabel="Mis en avant"
              uncheckedLabel="Non mis en avant"
              checked={draft.featuredProductIds.includes(product.id)}
              onChange={(checked) => {
                const ids = checked
                  ? [...draft.featuredProductIds, product.id]
                  : draft.featuredProductIds.filter((id) => id !== product.id);
                update("featuredProductIds", Array.from(new Set(ids)));
              }}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Affichage des produits populaires">
        <p className="mb-4 text-sm text-muted">
          Définissez le comportement des produits en rupture dans la section populaire.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["show", "hide"] as const).map((opt) => (
            <label
              key={opt}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                draft.featuredOutOfStock === opt
                  ? "border-accent bg-accent/5"
                  : "border-border bg-base hover:border-border-strong"
              }`}
            >
              <input
                type="radio"
                name="featuredOutOfStock"
                value={opt}
                checked={draft.featuredOutOfStock === opt}
                onChange={() => update("featuredOutOfStock", opt)}
                className="mt-0.5 accent-[#3e7bfa]"
              />
              <div>
                <p className="text-sm font-medium text-white">
                  {opt === "show" ? "Afficher les produits en rupture" : "Masquer les produits en rupture"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {opt === "show"
                    ? "Les produits en rupture restent visibles avec leur badge."
                    : "Les produits en rupture sont masqués de la section Produits populaires."}
                </p>
              </div>
            </label>
          ))}
        </div>
      </Panel>

      <Panel title="Stock des catégories">
        <p className="mb-4 text-sm text-muted">
          Remplacez l'affichage du stock pour chaque catégorie de la page d'accueil.
        </p>
        <div className="space-y-3">
          {categories.map((cat) => {
            const mode: StockMode = draft.categoryStockModes?.[cat.id] ?? "automatic";
            const autoStatus = autoStockStatuses[cat.id];
            return (
              <div key={cat.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-base p-4">
                <div className="min-w-[120px]">
                  <p className="text-sm font-medium text-white">{cat.name}</p>
                  {autoStatus && (
                    <p className={`mt-0.5 text-xs ${autoStatus === "in_stock" ? "text-green-400" : "text-yellow-500"}`}>
                      Auto : {autoStatus === "in_stock" ? "En stock" : "En rupture"}
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
                  <option value="force_in_stock">Toujours en stock</option>
                  <option value="force_out_of_stock">Toujours en rupture</option>
                </select>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Modes de paiement">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(draft.paymentMethods) as PaymentMethod[]).map((method) => (
            <ToggleSwitch
              key={method}
              className="rounded-xl border border-border bg-base px-3 py-3"
              label={paymentLabels[method]}
              checked={draft.paymentMethods[method]}
              onChange={(checked) =>
                update("paymentMethods", {
                  ...draft.paymentMethods,
                  [method]: checked,
                })
              }
            />
          ))}
        </div>
      </Panel>

      <Panel title="Pied de page">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="E-mail de contact"
            value={draft.footer.contactEmail}
            onChange={(value) =>
              update("footer", { ...draft.footer, contactEmail: value })
            }
          />
          <TextField
            label="Numéro WhatsApp"
            value={draft.footer.whatsappNumber}
            onChange={(value) =>
              update("footer", { ...draft.footer, whatsappNumber: value })
            }
          />
          <TextField
            label="Texte de support"
            value={draft.footer.supportText}
            onChange={(value) =>
              update("footer", { ...draft.footer, supportText: value })
            }
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
            {footerBadgeOptions.map((badge) => (
              <ToggleSwitch
                key={badge.id}
                className="rounded-xl border border-border bg-base px-3 py-3"
                label={badge.label}
                checked={badge.enabled}
                onChange={(checked) =>
                  update("footer", {
                    ...draft.footer,
                    paymentBadges: footerBadgeOptions.map((item) =>
                      item.id === badge.id ? { ...item, enabled: checked } : item,
                    ),
                  })
                }
              />
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Thème">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Couleur d'accent"
            type="color"
            value={draft.theme.accentColor}
            onChange={(value) =>
              update("theme", { ...draft.theme, accentColor: value })
            }
          />
          <TextField
            label="Couleur de fond"
            type="color"
            value={draft.theme.backgroundColor}
            onChange={(value) =>
              update("theme", { ...draft.theme, backgroundColor: value })
            }
          />
          <TextField
            label="Arrondi des cartes"
            value={draft.theme.cardRadius}
            onChange={(value) =>
              update("theme", { ...draft.theme, cardRadius: value })
            }
          />
          <TextField
            label="Arrondi des boutons"
            value={draft.theme.buttonRadius}
            onChange={(value) =>
              update("theme", { ...draft.theme, buttonRadius: value })
            }
          />
        </div>
      </Panel>
    </section>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h3 className="mb-4 text-lg font-semibold text-white">{title}</h3>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white">{label}</span>
      <input
        type={type}
        className="input"
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
    <div className="rounded-xl border border-border bg-base p-4">
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
