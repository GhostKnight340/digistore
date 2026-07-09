"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatMAD } from "@/lib/format";
import { REGION_LIST } from "@/lib/regions";
import {
  searchReloadlyImportCatalogAction,
  getReloadlyImportDetailAction,
  previewReloadlyDenominationsAction,
  getImportCategoryOptionsAction,
  importReloadlyProductAction,
} from "@/app/actions/catalog-import";
import type {
  AdminCategoryDTO,
  ImportReloadlyResultDTO,
  ReloadlyDenominationPreviewDTO,
  ReloadlyImportDetailDTO,
  ReloadlyImportMappingStatus,
  ReloadlyImportSearchRowDTO,
} from "@/lib/dto";

const MAPPING_META: Record<ReloadlyImportMappingStatus, { label: string; cls: string }> = {
  added: { label: "Déjà au catalogue", cls: "border-green-500/40 text-green-400" },
  partial: { label: "Partiellement ajouté", cls: "border-amber-500/50 text-amber-400" },
  not_added: { label: "Non ajouté", cls: "border-border-strong text-muted" },
};

type RowState = {
  faceValue: number;
  faceCurrency: string;
  preview: ReloadlyDenominationPreviewDTO | null;
  publishedPriceMad: string;
  marginOverride: string;
  include: boolean;
};

export default function ReloadlyImporter() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  return selectedId == null ? (
    <SearchView onSelect={setSelectedId} />
  ) : (
    <ImportView productId={selectedId} onBack={() => setSelectedId(null)} />
  );
}

// ─── Search view ─────────────────────────────────────────────────────────────

function SearchView({ onSelect }: { onSelect: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [denomType, setDenomType] = useState<"" | "FIXED" | "RANGE">("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ReloadlyImportSearchRowDTO[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await searchReloadlyImportCatalogAction({
      page,
      query: query || undefined,
      countryCode: country || undefined,
      denominationType: denomType || undefined,
      includeInactive,
    });
    if (res.ok) {
      setRows(res.data.rows);
      setTotalPages(res.data.totalPages);
    } else {
      setError(res.error);
      setRows([]);
    }
    setLoading(false);
  }, [page, query, country, denomType, includeInactive]);

  useEffect(() => {
    search();
  }, [page, includeInactive, denomType]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Importer depuis Reloadly</h2>
        <p className="mt-1 text-sm text-muted">
          Recherchez un produit Reloadly, choisissez la région et les dénominations, puis ajoutez-le
          au catalogue. Aucune commande Reloadly n&apos;est passée ici.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-muted">Recherche (nom, marque, ID)</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(0), search())}
            placeholder="Steam, PlayStation, 15802…"
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-muted">Pays (ISO)</label>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            placeholder="FR, US, GB…"
            maxLength={2}
            className="mt-1 w-24 rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-muted">Type</label>
          <select
            value={denomType}
            onChange={(e) => setDenomType(e.target.value as "" | "FIXED" | "RANGE")}
            className="mt-1 rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white"
          >
            <option value="">Tous</option>
            <option value="FIXED">FIXED</option>
            <option value="RANGE">RANGE</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Inclure inactifs
        </label>
        <button
          type="button"
          onClick={() => (setPage(0), search())}
          className="rounded-lg border border-accent/50 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent-strong"
        >
          Rechercher
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Aucun produit. Ajustez la recherche.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-strong">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface2 text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-3 py-3">Produit</th>
                <th className="px-3 py-3">Marque</th>
                <th className="px-3 py-3">Catégorie</th>
                <th className="px-3 py-3">Pays</th>
                <th className="px-3 py-3">Devise</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Dénominations</th>
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = MAPPING_META[r.mappingStatus];
                return (
                  <tr key={r.productId} className="border-t border-border">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {r.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                        )}
                        <span className="text-white">{r.productName}</span>
                        {r.status !== "ACTIVE" && (
                          <span className="text-xs text-red-400">({r.status})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted">{r.brandName}</td>
                    <td className="px-3 py-3 text-muted">{r.categoryName ?? "—"}</td>
                    <td className="px-3 py-3 text-muted">
                      <span className="flex items-center gap-1">
                        {r.flagUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.flagUrl} alt="" className="h-3 w-4 object-cover" />
                        )}
                        {r.country}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted">{r.recipientCurrency}</td>
                    <td className="px-3 py-3 text-muted">{r.denominationType}</td>
                    <td className="px-3 py-3 text-muted">
                      {r.denominationType === "RANGE"
                        ? `${r.minDenomination}–${r.maxDenomination}`
                        : r.fixedDenominations.join(", ")}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-faint">{r.productId}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => onSelect(r.productId)}
                        className="rounded-lg border border-accent/50 bg-accent/20 px-3 py-1 text-xs font-semibold text-accent-strong"
                      >
                        Configurer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-border-strong px-3 py-1 text-muted disabled:opacity-40"
          >
            Précédent
          </button>
          <span className="text-faint">
            Page {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-border-strong px-3 py-1 text-muted disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Import / detail view ────────────────────────────────────────────────────

function ImportView({ productId, onBack }: { productId: number; onBack: () => void }) {
  const [detail, setDetail] = useState<ReloadlyImportDetailDTO | null>(null);
  const [categories, setCategories] = useState<AdminCategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportReloadlyResultDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Product settings
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [active, setActive] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [useLogo, setUseLogo] = useState(false);
  const [stockControl, setStockControl] = useState<"reloadly" | "manual">("reloadly");

  // Denomination rows
  const [rows, setRows] = useState<RowState[]>([]);
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [detailRes, cats] = await Promise.all([
        getReloadlyImportDetailAction(productId),
        getImportCategoryOptionsAction(),
      ]);
      if (cancelled) return;
      setCategories(cats);
      if (!detailRes.ok) {
        setError(detailRes.error);
        setLoading(false);
        return;
      }
      const d = detailRes.data;
      setDetail(d);
      setName(d.productName);
      setSlug(d.suggestedSlug);
      setCategoryId(d.suggestedCategoryId ?? cats[0]?.id ?? "");
      setBrand(d.brandName);
      setInstructions(d.redeemInstructionVerbose ?? "");
      setRegionCode(d.suggestedRegionCode);
      setRows(
        d.denominations.map((p) => ({
          faceValue: p.faceValue,
          faceCurrency: p.faceCurrency,
          preview: p,
          publishedPriceMad: p.suggestedPriceMad != null ? String(p.suggestedPriceMad) : "",
          marginOverride: "",
          include: !p.alreadyExists && p.suggestedPriceMad != null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Auto-slug from name until the admin edits the slug directly.
  useEffect(() => {
    if (!slugTouched && name) {
      setSlug(
        name
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 80),
      );
    }
  }, [name, slugTouched]);

  const isRange = detail?.denominationType === "RANGE";

  const repriceRow = useCallback(
    async (faceValue: number, marginOverride: string) => {
      if (!detail) return;
      const res = await previewReloadlyDenominationsAction({
        productId,
        faceValues: [faceValue],
        categoryId: categoryId || null,
        marginOverride: marginOverride.trim() === "" ? null : Number(marginOverride),
      });
      if (res.ok && res.data[0]) {
        const preview = res.data[0];
        setRows((prev) =>
          prev.map((r) =>
            r.faceValue === faceValue
              ? {
                  ...r,
                  preview,
                  publishedPriceMad:
                    r.publishedPriceMad === "" && preview.suggestedPriceMad != null
                      ? String(preview.suggestedPriceMad)
                      : r.publishedPriceMad,
                }
              : r,
          ),
        );
      }
    },
    [detail, productId, categoryId],
  );

  const addCustomRow = useCallback(async () => {
    const fv = Number(customValue);
    if (!Number.isFinite(fv) || fv <= 0 || !detail) return;
    if (rows.some((r) => r.faceValue === fv)) {
      setCustomValue("");
      return;
    }
    const res = await previewReloadlyDenominationsAction({
      productId,
      faceValues: [fv],
      categoryId: categoryId || null,
      marginOverride: null,
    });
    const preview = res.ok ? res.data[0] : null;
    setRows((prev) => [
      ...prev,
      {
        faceValue: fv,
        faceCurrency: detail.recipientCurrency,
        preview,
        publishedPriceMad: preview?.suggestedPriceMad != null ? String(preview.suggestedPriceMad) : "",
        marginOverride: "",
        include: preview?.withinBounds !== false && !preview?.alreadyExists,
      },
    ]);
    setCustomValue("");
  }, [customValue, detail, productId, categoryId, rows]);

  const includedRows = rows.filter((r) => r.include && r.preview?.withinBounds !== false);

  const submit = useCallback(async () => {
    if (!detail) return;
    setSubmitting(true);
    setError(null);
    const res = await importReloadlyProductAction({
      reloadlyProductId: detail.productId,
      reloadlyCountryCode: detail.country,
      name,
      slug,
      categoryId,
      brand,
      description,
      instructions,
      regionCode,
      active,
      featured,
      imageUrl: useLogo ? detail.logoUrl : null,
      variants: includedRows.map((r) => ({
        faceValue: r.faceValue,
        faceCurrency: r.faceCurrency,
        publishedPriceMad: Number(r.publishedPriceMad) || 0,
        marginPctOverride: r.marginOverride.trim() === "" ? null : Number(r.marginOverride),
        active: true,
        stockControl,
      })),
    });
    setResult(res);
    if (!res.ok) setError(res.error);
    setSubmitting(false);
  }, [
    detail, name, slug, categoryId, brand, description, instructions, regionCode, active,
    featured, useLogo, includedRows, stockControl,
  ]);

  if (loading) return <p className="text-sm text-muted">Chargement du produit…</p>;
  if (error && !detail) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-sm text-accent-strong">
          ← Retour
        </button>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }
  if (!detail) return null;

  if (result?.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-5">
          <h3 className="text-lg font-semibold text-green-300">Ajouté au catalogue</h3>
          <p className="mt-1 text-sm text-muted">
            {result.createdProduct ? "Produit créé" : "Produit existant mis à jour"} :{" "}
            {result.createdVariants} variante(s) créée(s)
            {result.skippedVariants > 0
              ? `, ${result.skippedVariants} déjà présente(s) (${result.skippedFaceValues.join(", ")})`
              : ""}
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/products/${result.productSlug}`}
              className="rounded-lg border border-accent/50 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent-strong"
            >
              Voir dans le catalogue
            </Link>
            <Link
              href="/admin?tab=products"
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted"
            >
              Modifier dans l&apos;admin
            </Link>
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted"
            >
              Importer un autre produit
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="text-sm text-accent-strong">
        ← Retour à la recherche
      </button>

      {/* Product header */}
      <div className="flex items-start gap-4 rounded-2xl border border-border-strong bg-card p-5">
        {detail.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={detail.logoUrl} alt="" className="h-14 w-14 rounded-lg object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-white">{detail.productName}</h3>
          <p className="text-sm text-muted">
            {detail.brandName} · {detail.categoryName ?? "—"} · {detail.countryName} (
            {detail.country}) · {detail.denominationType}
          </p>
          <p className="mt-1 text-xs text-faint">
            Reloadly #{detail.productId} · devise carte {detail.recipientCurrency} · devise
            fournisseur {detail.senderCurrency} · remise {detail.discountPercentage}% · frais{" "}
            {detail.senderFee}+{detail.senderFeePercentage}% · coût synchro{" "}
            {detail.costSyncedAt ? new Date(detail.costSyncedAt).toLocaleString() : "jamais"}
          </p>
          {detail.userIdRequired && (
            <p className="mt-1 text-xs text-amber-400">
              ⚠ Ce produit exige un identifiant utilisateur à la commande.
            </p>
          )}
        </div>
      </div>

      {/* Product settings */}
      <section className="rounded-2xl border border-border-strong bg-card p-5">
        <h4 className="text-sm font-semibold text-white">Paramètres du produit</h4>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Labeled label="Titre">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Labeled>
          <Labeled label="Slug">
            <input
              value={slug}
              onChange={(e) => (setSlug(e.target.value), setSlugTouched(true))}
              className={inputCls}
            />
          </Labeled>
          <Labeled label="Catégorie">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Marque">
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} />
          </Labeled>
          <Labeled label="Région">
            <select value={regionCode} onChange={(e) => setRegionCode(e.target.value)} className={inputCls}>
              <option value="">Région ? (à compléter)</option>
              {REGION_LIST.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Fulfillment">
            <select
              value={stockControl}
              onChange={(e) => setStockControl(e.target.value as "reloadly" | "manual")}
              className={inputCls}
            >
              <option value="reloadly">Reloadly (API)</option>
              <option value="manual">Manuel / local</option>
            </select>
          </Labeled>
        </div>
        <div className="mt-4">
          <Labeled label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Labeled>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-5 text-sm text-muted">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Actif / visible
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            Populaire (featured)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} />
            Utiliser le logo Reloadly comme image temporaire
          </label>
        </div>
        <p className="mt-2 text-xs text-faint">
          Média : laissé vide par défaut. Vous ajouterez/éditerez les visuels définitifs manuellement.
        </p>
      </section>

      {/* Denominations */}
      <section className="rounded-2xl border border-border-strong bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">
            Dénominations {isRange ? "(personnalisées — RANGE)" : "(FIXED)"}
          </h4>
          {isRange && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-faint">
                Plage {detail.minDenomination}–{detail.maxDenomination} {detail.recipientCurrency}
              </span>
              <input
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomRow()}
                placeholder="ex. 100"
                type="number"
                className="w-28 rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white"
              />
              <button
                type="button"
                onClick={addCustomRow}
                className="rounded-lg border border-accent/50 bg-accent/20 px-3 py-2 text-xs font-semibold text-accent-strong"
              >
                + Ajouter
              </button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {isRange
              ? "Ajoutez les dénominations que vous voulez vendre."
              : "Aucune dénomination proposée."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-2 py-2">Ajouter</th>
                  <th className="px-2 py-2">Valeur</th>
                  <th className="px-2 py-2">Coût fourn.</th>
                  <th className="px-2 py-2">Coût MAD</th>
                  <th className="px-2 py-2">Marge</th>
                  <th className="px-2 py-2">Suggéré</th>
                  <th className="px-2 py-2">Prix publié</th>
                  <th className="px-2 py-2">Profit</th>
                  {isRange && <th className="px-2 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = r.preview;
                  const priceNum = Number(r.publishedPriceMad) || 0;
                  const profit = p?.costInMad != null ? priceNum - p.costInMad : null;
                  const disabled = p?.alreadyExists || p?.withinBounds === false;
                  return (
                    <tr key={r.faceValue} className="border-t border-border">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={r.include}
                          disabled={disabled}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.faceValue === r.faceValue ? { ...x, include: e.target.checked } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-white">
                        {r.faceValue} {r.faceCurrency}
                        {p?.alreadyExists && (
                          <span className="ml-2 text-xs text-green-400">Déjà ajouté</span>
                        )}
                        {p?.withinBounds === false && (
                          <span className="ml-2 text-xs text-red-400">{p.error}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-muted">
                        {p?.providerCost != null ? `${p.providerCost.toFixed(2)} ${p.supplierCurrency}` : "—"}
                      </td>
                      <td className="px-2 py-2 text-muted">
                        {p?.costInMad != null ? formatMAD(p.costInMad) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={r.marginOverride}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.faceValue === r.faceValue
                                  ? { ...x, marginOverride: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          onBlur={() => repriceRow(r.faceValue, r.marginOverride)}
                          placeholder={p?.marginPct != null ? `${p.marginPct}%` : "%"}
                          className="w-16 rounded-lg border border-border-strong bg-surface2 px-2 py-1 text-sm text-white"
                        />
                      </td>
                      <td className="px-2 py-2 text-muted">
                        {p?.suggestedPriceMad != null ? formatMAD(p.suggestedPriceMad) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={r.publishedPriceMad}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.faceValue === r.faceValue
                                  ? { ...x, publishedPriceMad: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          type="number"
                          className="w-24 rounded-lg border border-border-strong bg-surface2 px-2 py-1 text-sm font-semibold text-white"
                        />
                      </td>
                      <td className="px-2 py-2 text-muted">
                        {profit != null ? formatMAD(Number(profit.toFixed(2))) : "—"}
                      </td>
                      {isRange && (
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() =>
                              setRows((prev) => prev.filter((x) => x.faceValue !== r.faceValue))
                            }
                            className="text-xs text-red-400"
                          >
                            Retirer
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || includedRows.length === 0 || !name.trim() || !slug.trim()}
          className="rounded-xl border border-accent/50 bg-accent/25 px-5 py-2.5 text-sm font-semibold text-accent-strong disabled:opacity-40"
        >
          {submitting ? "Ajout…" : `Ajouter au catalogue (${includedRows.length})`}
        </button>
        <span className="text-xs text-faint">
          Le prix publié par défaut est le prix suggéré — modifiable avant l&apos;import. Aucun prix
          n&apos;est publié automatiquement au-delà de ces valeurs.
        </span>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white";

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
