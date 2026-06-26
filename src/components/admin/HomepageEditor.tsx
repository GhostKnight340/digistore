"use client";

import Link from "next/link";
import { useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import ProductCard from "@/components/ProductCard";
import CategoryCard from "@/components/CategoryCard";

export default function HomepageEditor() {
  const { settings, saveSettings } = useStoreSettings();
  const { categories, products } = useProductCatalog();
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await saveSettings(draft);
    setSaving(false);
    setMessage(result.ok ? "Homepage saved." : result.error ?? "Save failed.");
  }

  const featured = draft.featuredProductIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is (typeof products)[number] => Boolean(product));

  return (
    <section className="space-y-6">
      <div className="card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Homepage editor</h2>
            <p className="mt-1 text-sm text-muted">
              Inline visual editor for the storefront homepage.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin" className="btn-ghost">
              Dashboard
            </Link>
            <button type="button" onClick={save} className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save homepage"}
            </button>
          </div>
        </div>
        {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-semibold text-white">Hero</h3>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <Field
              label="Hero title"
              value={draft.branding.heroTitle}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  branding: { ...current.branding, heroTitle: value },
                }))
              }
            />
            <Field
              label="Hero subtitle"
              value={draft.branding.heroSubtitle}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  branding: { ...current.branding, heroSubtitle: value },
                }))
              }
            />
            <Field
              label="Primary CTA"
              value={draft.branding.primaryCtaLabel}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  branding: { ...current.branding, primaryCtaLabel: value },
                }))
              }
            />
          </div>
          <div className="rounded-2xl border border-border bg-base p-6">
            <span className="chip">Cartes & codes numeriques</span>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight text-text">
              {draft.branding.heroTitle}
            </h1>
            <p className="mt-4 max-w-lg text-muted">{draft.branding.heroSubtitle}</p>
            <button type="button" className="btn-primary mt-6">
              {draft.branding.primaryCtaLabel}
            </button>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-semibold text-white">Featured products</h3>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[360px_1fr]">
          <div className="space-y-2">
            {products.map((product) => (
              <label
                key={product.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-base px-3 py-3 text-sm text-muted"
              >
                <input
                  type="checkbox"
                  checked={draft.featuredProductIds.includes(product.id)}
                  onChange={(event) =>
                    setDraft((current) => {
                      const ids = event.target.checked
                        ? [...current.featuredProductIds, product.id]
                        : current.featuredProductIds.filter((id) => id !== product.id);
                      return { ...current, featuredProductIds: Array.from(new Set(ids)) };
                    })
                  }
                />
                {product.name}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            {(featured.length > 0 ? featured : products.slice(0, 6)).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-semibold text-white">Categories preview</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
          {categories.slice(0, 4).map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      </section>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white">{label}</span>
      <textarea
        className="input min-h-20"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
