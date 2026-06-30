"use client";

import { useEffect, useMemo, useState } from "react";
import { getFeaturedVariantOptionsAction } from "@/app/actions/admin";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import type { FeaturedVariantOptionDTO } from "@/lib/dto";

export default function FeaturedProductsPanel() {
  const { settings, saveSettings } = useStoreSettings();
  const [options, setOptions] = useState<FeaturedVariantOptionDTO[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const selected = settings.featuredProductIds;

  useEffect(() => {
    getFeaturedVariantOptionsAction().then(setOptions).catch(() => setOptions([]));
  }, []);

  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const selectedOptions = selected.map((id) => byId.get(id)).filter(Boolean) as FeaturedVariantOptionDTO[];
  const filtered = options.filter((option) => {
    const haystack = `${option.displayName} ${option.categoryName}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  async function persist(ids: string[]) {
    const result = await saveSettings({ ...settings, featuredProductIds: ids });
    setMessage(result.ok ? "Produits populaires enregistrés." : result.error ?? "Enregistrement impossible.");
  }

  function add(id: string) {
    if (selected.includes(id)) return;
    persist([...selected, id]);
  }

  function remove(id: string) {
    persist(selected.filter((item) => item !== id));
  }

  function move(id: string, direction: -1 | 1) {
    const index = selected.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selected.length) return;
    const next = [...selected];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    persist(next);
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Produits populaires</h2>
          <p className="mt-1 text-sm text-muted">
            Sélectionnez les variantes affichées sur la page d'accueil, dans l'ordre sauvegardé.
          </p>
        </div>
        {message ? <p className="text-xs text-muted">{message}</p> : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input h-10 py-0 text-sm"
              placeholder="Rechercher une variante active..."
            />
          </div>
          <div className="divide-y divide-border">
            {filtered.map((option) => (
              <div key={option.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{option.displayName}</p>
                  <p className="mt-1 text-xs text-muted">
                    {option.categoryName} · {option.priceMad} MAD
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!option.productActive || !option.variantActive || selected.includes(option.id)}
                  onClick={() => add(option.id)}
                  className="btn-primary h-9 px-3 text-xs disabled:opacity-50"
                >
                  Ajouter
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="card h-fit overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h3 className="font-bold text-white">Ordre homepage</h3>
          </div>
          <div className="divide-y divide-border">
            {selectedOptions.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">Aucune variante mise en avant.</p>
            ) : (
              selectedOptions.map((option, index) => (
                <div key={option.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-white">{index + 1}. {option.displayName}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => move(option.id, -1)} className="btn-ghost h-8 px-2 text-xs">Monter</button>
                    <button type="button" onClick={() => move(option.id, 1)} className="btn-ghost h-8 px-2 text-xs">Descendre</button>
                    <button type="button" onClick={() => remove(option.id)} className="h-8 rounded-lg border border-red-500/40 px-2 text-xs text-red-300">Retirer</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
