"use client";

import { useEffect, useMemo, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { getProductListAction } from "@/app/actions/admin";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import type { StoreSettings } from "@/lib/storeSettings";
import type { ProductListItemDTO } from "@/lib/dto";

type ProductLink = StoreSettings["footer"]["productLinks"][number];

export default function FooterProductsPanel() {
  const { settings, saveSettings } = useStoreSettings();
  const [links, setLinks] = useState<ProductLink[]>(settings.footer.productLinks);
  const [maxItems, setMaxItems] = useState(settings.footer.productLinksMaxItems);
  const [products, setProducts] = useState<ProductListItemDTO[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [toAdd, setToAdd] = useState("");

  useEffect(() => {
    getProductListAction()
      .then(setProducts)
      .catch((error) => console.error("Failed to load products", error));
  }, []);

  useEffect(() => {
    setLinks(settings.footer.productLinks);
    setMaxItems(settings.footer.productLinksMaxItems);
  }, [settings.footer.productLinks, settings.footer.productLinksMaxItems]);

  const bySlug = useMemo(
    () => new Map(products.map((product) => [product.slug, product])),
    [products],
  );
  const sortedLinks = useMemo(
    () => [...links].sort((a, b) => a.sortOrder - b.sortOrder),
    [links],
  );
  const usedSlugs = useMemo(() => new Set(links.map((link) => link.productSlug)), [links]);
  const available = useMemo(
    () => products.filter((product) => product.active && !usedSlugs.has(product.slug)),
    [products, usedSlugs],
  );

  function addProduct(slug: string) {
    if (!slug || usedSlugs.has(slug)) return;
    const maxOrder = links.reduce((max, link) => Math.max(max, link.sortOrder), -1);
    setLinks([...links, { productSlug: slug, enabled: true, sortOrder: maxOrder + 1 }]);
    setToAdd("");
  }

  function updateLink(slug: string, patch: Partial<ProductLink>) {
    setLinks(links.map((link) => (link.productSlug === slug ? { ...link, ...patch } : link)));
  }

  function removeLink(slug: string) {
    setLinks(links.filter((link) => link.productSlug !== slug));
  }

  function moveLink(slug: string, direction: -1 | 1) {
    const ordered = [...links].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((link) => link.productSlug === slug);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setLinks(ordered.map((link, position) => ({ ...link, sortOrder: position })));
  }

  async function save() {
    setSaving(true);
    const result = await saveSettings({
      ...settings,
      footer: {
        ...settings.footer,
        productLinks: links,
        productLinksMaxItems: Math.max(0, Math.floor(maxItems || 0)),
      },
    });
    setSaving(false);
    setMessage(result.ok ? "Liens produits du footer enregistrés." : result.error ?? "Enregistrement impossible.");
  }

  const enabledCount = sortedLinks.filter((link) => link.enabled).length;
  const shownCount = maxItems > 0 ? Math.min(enabledCount, maxItems) : enabledCount;

  return (
    <section className="space-y-5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-base/95 p-4 backdrop-blur">
        <div>
          <h2 className="text-xl font-bold text-white">Liens produits du footer</h2>
          <p className="text-sm text-muted">
            Choisissez exactement quels produits parents apparaissent dans la colonne « Produits »
            du pied de page, et dans quel ordre. Liste 100 % manuelle.
          </p>
        </div>
        <button type="button" onClick={save} disabled={saving} className="btn-primary h-10 px-4 text-xs disabled:opacity-60">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {message ? <p className="w-full text-xs text-muted">{message}</p> : null}
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">Ajouter un produit</span>
            <select
              value={toAdd}
              onChange={(event) => addProduct(event.target.value)}
              className="input h-10 min-w-64 py-0 text-sm"
            >
              <option value="">
                {available.length ? "Sélectionnez un produit…" : "Aucun produit disponible"}
              </option>
              {available.map((product) => (
                <option key={product.slug} value={product.slug}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">Nombre max. affiché</span>
            <input
              type="number"
              min={0}
              value={maxItems}
              onChange={(event) => setMaxItems(Number(event.target.value))}
              className="input h-10 w-32 py-0 text-sm"
            />
            <span className="mt-1 block text-xs text-muted">0 = illimité</span>
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">
          {enabledCount} activé{enabledCount > 1 ? "s" : ""} · {shownCount} affiché
          {shownCount > 1 ? "s" : ""} dans le footer
        </p>
      </section>

      <section className="card p-5">
        <p className="text-sm font-semibold text-white">Produits sélectionnés</p>
        <div className="mt-3 space-y-2">
          {sortedLinks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
              Aucun produit. Le footer affichera « Bientôt disponible » jusqu&apos;à ce que vous en ajoutiez.
            </p>
          ) : (
            sortedLinks.map((link, index) => {
              const product = bySlug.get(link.productSlug);
              const missing = !product;
              const inactive = product && !product.active;
              return (
                <div
                  key={link.productSlug}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-base px-3 py-2.5"
                >
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label="Monter"
                      disabled={index === 0}
                      onClick={() => moveLink(link.productSlug, -1)}
                      className="text-muted transition hover:text-white disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label="Descendre"
                      disabled={index === sortedLinks.length - 1}
                      onClick={() => moveLink(link.productSlug, 1)}
                      className="text-muted transition hover:text-white disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {product?.name ?? link.productSlug}
                    </p>
                    <p className="truncate text-xs text-faint">/products/{link.productSlug}</p>
                  </div>
                  {missing ? (
                    <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400">
                      Introuvable
                    </span>
                  ) : inactive ? (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                      Inactif (masqué)
                    </span>
                  ) : null}
                  <ToggleSwitch
                    label={link.enabled ? "Activé" : "Désactivé"}
                    checked={link.enabled}
                    onChange={(checked) => updateLink(link.productSlug, { enabled: checked })}
                  />
                  <button
                    type="button"
                    onClick={() => removeLink(link.productSlug)}
                    className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                  >
                    Retirer
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </section>
  );
}
