"use client";

import { useMemo, useState } from "react";
import { CoverageDetails } from "./GuideCoverage";
import type { CollectionProductOptionDTO } from "@/lib/dto";
import type { GuideCoverageSummary } from "@/lib/guides/coverage";

/**
 * "Produits concernés" — the guide editor's product-association panel.
 *
 * Two clearly separated concepts:
 *  1. REAL catalog products, picked from a searchable/filterable list. These
 *     become GuideProduct rows.
 *  2. "Produits attendus" — free-text labels for things we don't sell yet. These
 *     are documentation only and never create catalog records, so they're styled
 *     as dashed neutral chips, never as products.
 *
 * The availability breakdown shown here is the SAVED coverage (computed
 * server-side from live catalog state). We deliberately do NOT guess
 * availability for freshly-picked products: the option list only knows
 * `active`, so claiming "disponible" before saving could contradict the
 * storefront. Unsaved selections are reported as a neutral count instead.
 */
export default function GuideProductsSection({
  selectedProductIds,
  onChangeProducts,
  expectedProducts,
  onChangeExpected,
  options,
  coverage,
  isNewGuide,
}: {
  selectedProductIds: string[];
  onChangeProducts: (ids: string[]) => void;
  expectedProducts: string[];
  onChangeExpected: (labels: string[]) => void;
  options: CollectionProductOptionDTO[];
  coverage: GuideCoverageSummary;
  isNewGuide: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [expectedInput, setExpectedInput] = useState("");

  const categories = useMemo(
    () =>
      [...new Map(options.map((o) => [o.category, o.categoryName])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [options],
  );
  const regions = useMemo(
    () => [...new Set(options.map((o) => o.region).filter(Boolean))].sort(),
    [options],
  );

  const selected = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const byId = useMemo(() => new Map(options.map((o) => [o.productId, o])), [options]);

  const normalizedQuery = query
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const filtered = useMemo(() => {
    return options.filter((o) => {
      if (category && o.category !== category) return false;
      if (region && o.region !== region) return false;
      if (status === "active" && !o.active) return false;
      if (status === "inactive" && o.active) return false;
      if (!normalizedQuery) return true;
      const hay = `${o.name} ${o.categoryName} ${o.region} ${o.slug}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [options, category, region, status, normalizedQuery]);

  function toggleProduct(id: string) {
    onChangeProducts(
      selected.has(id) ? selectedProductIds.filter((p) => p !== id) : [...selectedProductIds, id],
    );
  }

  function addExpected() {
    const label = expectedInput.trim();
    if (!label) return;
    if (expectedProducts.some((e) => e.toLowerCase() === label.toLowerCase())) {
      setExpectedInput("");
      return;
    }
    onChangeExpected([...expectedProducts, label]);
    setExpectedInput("");
  }

  return (
    <div className="card space-y-5 p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Produits concernés</h3>
        <p className="mt-1 text-xs text-muted">
          Associez ce guide aux produits réels du catalogue. La disponibilité est calculée
          automatiquement à partir du catalogue — elle n&apos;est jamais figée ici.
        </p>
      </div>

      {/* Live selection summary — factual counts, not an availability claim. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-muted">
          <strong className="text-white">{selectedProductIds.length}</strong> produit
          {selectedProductIds.length === 1 ? "" : "s"} sélectionné
          {selectedProductIds.length === 1 ? "" : "s"}
        </span>
        {expectedProducts.length > 0 && (
          <span className="text-muted">
            · <strong className="text-white">{expectedProducts.length}</strong> attendu
            {expectedProducts.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Selected chips */}
      {selectedProductIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedProductIds.map((id) => {
            const opt = byId.get(id);
            return (
              <span
                key={id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                  opt?.active === false
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-border bg-surface text-muted"
                }`}
                title={opt?.active === false ? "Produit désactivé dans le catalogue" : undefined}
              >
                {opt ? opt.name : id}
                <button
                  type="button"
                  aria-label={`Retirer ${opt?.name ?? id}`}
                  onClick={() => toggleProduct(id)}
                  className="text-faint transition hover:text-white"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un produit…"
          aria-label="Rechercher un produit"
        />
        <select
          className="input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filtrer par catégorie"
        >
          <option value="">Toutes les catégories</option>
          {categories.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="Filtrer par région"
        >
          <option value="">Toutes les régions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | "active" | "inactive")}
          aria-label="Filtrer par statut"
        >
          <option value="">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Désactivés</option>
        </select>
      </div>

      {/* Picker list */}
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">Aucun produit trouvé.</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((o) => (
              <li key={o.productId}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition hover:bg-surface">
                  <input
                    type="checkbox"
                    checked={selected.has(o.productId)}
                    onChange={() => toggleProduct(o.productId)}
                    className="h-4 w-4 shrink-0 accent-[#3e7bfa]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{o.name}</span>
                    <span className="block truncate text-[11px] text-faint">
                      {o.categoryName} · {o.region}
                      {!o.active && " · désactivé"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Expected products — documentation only */}
      <div>
        <h4 className="text-xs font-semibold text-white">Produits attendus</h4>
        <p className="mt-1 text-xs text-muted">
          Produits ou gammes que ce guide couvre mais que Ghost.ma ne vend pas encore (ex.
          «&nbsp;Steam Wallet USA&nbsp;»). Simple référence de planification : aucun produit
          n&apos;est créé dans le catalogue.
        </p>
        {expectedProducts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {expectedProducts.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-surface px-2.5 py-1 text-xs text-muted"
              >
                {label}
                <button
                  type="button"
                  aria-label={`Retirer ${label}`}
                  onClick={() => onChangeExpected(expectedProducts.filter((e) => e !== label))}
                  className="text-faint transition hover:text-white"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <input
            className="input"
            value={expectedInput}
            onChange={(e) => setExpectedInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addExpected();
              }
            }}
            placeholder="ex. Steam Wallet USA"
            aria-label="Ajouter un produit attendu"
          />
          <button type="button" className="btn-ghost" onClick={addExpected}>
            Ajouter
          </button>
        </div>
      </div>

      {/* Saved coverage (authoritative, server-computed) */}
      <div className="border-t border-border pt-4">
        <h4 className="mb-2 text-xs font-semibold text-white">Couverture actuelle</h4>
        {isNewGuide ? (
          <p className="text-xs text-muted">
            La couverture sera calculée après l&apos;enregistrement.
          </p>
        ) : (
          <>
            <CoverageDetails coverage={coverage} />
            <p className="mt-2 text-[11px] text-faint">
              Reflète le dernier enregistrement — vos modifications ci-dessus seront prises en
              compte après «&nbsp;Enregistrer&nbsp;».
            </p>
          </>
        )}
      </div>
    </div>
  );
}
