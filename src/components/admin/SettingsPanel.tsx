"use client";

import { useEffect, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { defaultStoreSettings, type StoreSettings } from "@/lib/storeSettings";
import { getStorefrontProductsAction } from "@/app/actions/storefront";
import type { PaymentMethod, Product } from "@/lib/types";

const paymentLabels: Record<PaymentMethod, string> = {
  test: "Paiement test",
  bank: "Virement bancaire",
  crypto: "Crypto",
  paypal: "PayPal",
};

const sectionLabels: Record<keyof StoreSettings["homepage"], string> = {
  showHero: "Afficher le hero",
  showTrustStrip: "Afficher les indicateurs de confiance",
  showCategories: "Afficher les catégories",
  showFeaturedProducts: "Afficher les produits populaires",
  showWhyChooseUs: "Afficher Pourquoi nous choisir",
  showFooter: "Afficher le footer",
};

export default function SettingsPanel() {
  const { settings, ready, saveSettings, resetSettings } = useStoreSettings();
  const [draft, setDraft] = useState<StoreSettings>(settings);
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    getStorefrontProductsAction().then(setProducts);
  }, []);

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
      setMessage("Le titre hero est obligatoire.");
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
            <h2 className="text-xl font-bold text-white">Store settings</h2>
            <p className="mt-1 text-sm text-muted">
              Customize storefront copy, sections, payments, footer, and theme.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="btn-ghost">
              Reset to defaults
            </button>
            <button type="button" onClick={save} className="btn-primary">
              Save settings
            </button>
          </div>
        </div>
        {message && (
          <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-sm text-muted">
            {message}
          </p>
        )}
      </div>

      <Panel title="Branding">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Site name"
            value={draft.branding.siteName}
            onChange={(value) =>
              update("branding", { ...draft.branding, siteName: value })
            }
          />
          <TextField
            label="Logo text"
            value={draft.branding.logoText}
            onChange={(value) =>
              update("branding", { ...draft.branding, logoText: value })
            }
          />
          <TextField
            label="Hero title"
            value={draft.branding.heroTitle}
            onChange={(value) =>
              update("branding", { ...draft.branding, heroTitle: value })
            }
          />
          <TextField
            label="Hero subtitle"
            value={draft.branding.heroSubtitle}
            onChange={(value) =>
              update("branding", { ...draft.branding, heroSubtitle: value })
            }
          />
          <TextField
            label="Primary CTA label"
            value={draft.branding.primaryCtaLabel}
            onChange={(value) =>
              update("branding", { ...draft.branding, primaryCtaLabel: value })
            }
          />
          <TextField
            label="Secondary CTA label"
            value={draft.branding.secondaryCtaLabel}
            onChange={(value) =>
              update("branding", { ...draft.branding, secondaryCtaLabel: value })
            }
          />
        </div>
      </Panel>

      <Panel title="Homepage sections">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(draft.homepage) as Array<keyof StoreSettings["homepage"]>).map(
            (key) => (
              <Toggle
                key={key}
                label={sectionLabels[key]}
                checked={draft.homepage[key]}
                onChange={(checked) =>
                  update("homepage", { ...draft.homepage, [key]: checked })
                }
              />
            ),
          )}
        </div>
      </Panel>

      <Panel title="Trust strip">
        <div className="space-y-4">
          {draft.trustItems.map((item, index) => (
            <div key={item.id} className="rounded-xl border border-border bg-base p-4">
              <div className="mb-3">
                <Toggle
                  label="Enabled"
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
                  label="Title"
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

      <Panel title="Featured products">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Toggle
              key={product.id}
              label={`${product.name} (${product.id})`}
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

      <Panel title="Payment methods">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(draft.paymentMethods) as PaymentMethod[]).map((method) => (
            <Toggle
              key={method}
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

      <Panel title="Footer">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Contact email"
            value={draft.footer.contactEmail}
            onChange={(value) =>
              update("footer", { ...draft.footer, contactEmail: value })
            }
          />
          <TextField
            label="WhatsApp number"
            value={draft.footer.whatsappNumber}
            onChange={(value) =>
              update("footer", { ...draft.footer, whatsappNumber: value })
            }
          />
          <TextField
            label="Support text"
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
          <TextField
            label="Facebook URL"
            value={draft.footer.socialLinks.facebook}
            onChange={(value) =>
              update("footer", {
                ...draft.footer,
                socialLinks: { ...draft.footer.socialLinks, facebook: value },
              })
            }
          />
          <TextField
            label="X URL"
            value={draft.footer.socialLinks.x}
            onChange={(value) =>
              update("footer", {
                ...draft.footer,
                socialLinks: { ...draft.footer.socialLinks, x: value },
              })
            }
          />
        </div>
      </Panel>

      <Panel title="Theme">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Accent color"
            type="color"
            value={draft.theme.accentColor}
            onChange={(value) =>
              update("theme", { ...draft.theme, accentColor: value })
            }
          />
          <TextField
            label="Background color"
            type="color"
            value={draft.theme.backgroundColor}
            onChange={(value) =>
              update("theme", { ...draft.theme, backgroundColor: value })
            }
          />
          <TextField
            label="Card radius"
            value={draft.theme.cardRadius}
            onChange={(value) =>
              update("theme", { ...draft.theme, cardRadius: value })
            }
          />
          <TextField
            label="Button radius"
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-border bg-base px-3 py-3 text-sm text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#3e7bfa]"
      />
      <span>{label}</span>
    </label>
  );
}
