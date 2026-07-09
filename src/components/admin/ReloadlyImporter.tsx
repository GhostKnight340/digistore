"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatMAD, timeAgoFr } from "@/lib/format";
import { REGION_LIST } from "@/lib/regions";
import {
  searchReloadlyImportCatalogAction,
  getReloadlyImportDetailAction,
  previewReloadlyDenominationsAction,
  getImportCategoryOptionsAction,
  getGhostParentOptionsAction,
  importReloadlyBatchAction,
} from "@/app/actions/catalog-import";
import { createCategoryQuickAction } from "@/app/actions/admin";
import type {
  AdminCategoryDTO,
  GhostParentOptionDTO,
  ImportGroupInput,
  ImportReloadlyBatchInput,
  ImportReloadlyBatchResultDTO,
  ImportStatus,
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

const inputCls =
  "w-full rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white";

type RowState = {
  faceValue: number;
  faceCurrency: string;
  preview: ReloadlyDenominationPreviewDTO | null;
  publishedPriceMad: string;
  marginOverride: string;
  competitorPrice: string;
  include: boolean;
};

type ProductPrep = {
  detail: ReloadlyImportDetailDTO;
  rows: RowState[];
  customValue: string;
  stockControl: "reloadly" | "manual";
  competitorSource: string;
  // grouping: "new-own" | `share:<leadProductId>` | `existing:<slug>`
  groupChoice: string;
  activateNewVariants: boolean;
  // parent config (used when this product LEADS a new group)
  name: string;
  slug: string;
  slugTouched: boolean;
  categoryId: string;
  brand: string;
  description: string;
  regionCode: string;
  featured: boolean;
  useLogo: boolean;
};

function slugifyClient(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function ReloadlyImporter() {
  const [view, setView] = useState<"search" | "prepare" | "summary">("search");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [result, setResult] = useState<ImportReloadlyBatchResultDTO | null>(null);

  if (view === "prepare") {
    return (
      <PrepareView
        productIds={selectedIds}
        onBack={() => setView("search")}
        onImported={(r) => {
          setResult(r);
          setView("summary");
        }}
      />
    );
  }
  if (view === "summary" && result) {
    return (
      <SummaryView
        result={result}
        onDone={() => {
          setSelectedIds([]);
          setResult(null);
          setView("search");
        }}
      />
    );
  }
  return (
    <SearchView
      onPrepare={(ids) => {
        setSelectedIds(ids);
        setView("prepare");
      }}
    />
  );
}

// ─── Search view (with bulk selection) ───────────────────────────────────────

function SearchView({ onPrepare }: { onPrepare: (ids: number[]) => void }) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [denomType, setDenomType] = useState<"" | "FIXED" | "RANGE">("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ReloadlyImportSearchRowDTO[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

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

  const toggle = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Importer depuis Reloadly</h2>
        <p className="mt-1 text-sm text-muted">
          Recherchez, sélectionnez un ou plusieurs produits régionaux, puis préparez l&apos;import.
          Aucune commande Reloadly n&apos;est passée ici.
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
            className={`mt-1 ${inputCls}`}
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

      {checked.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm">
          <span className="text-accent-strong">{checked.size} produit(s) sélectionné(s)</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChecked(new Set())}
              className="rounded-lg border border-border-strong px-3 py-1 text-xs text-muted"
            >
              Effacer
            </button>
            <button
              type="button"
              onClick={() => onPrepare([...checked])}
              className="rounded-lg border border-accent/50 bg-accent/25 px-3 py-1 text-xs font-semibold text-accent-strong"
            >
              Préparer l&apos;import ({checked.size})
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Aucun produit. Ajustez la recherche.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-strong">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-surface2 text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-3 py-3"></th>
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
                      <input
                        type="checkbox"
                        checked={checked.has(r.productId)}
                        onChange={() => toggle(r.productId)}
                      />
                    </td>
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
                        onClick={() => onPrepare([r.productId])}
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

// ─── Prepare view (multi-product, grouping, draft/publish, review) ───────────

function PrepareView({
  productIds,
  onBack,
  onImported,
}: {
  productIds: number[];
  onBack: () => void;
  onImported: (r: ImportReloadlyBatchResultDTO) => void;
}) {
  const [preps, setPreps] = useState<ProductPrep[]>([]);
  const [categories, setCategories] = useState<AdminCategoryDTO[]>([]);
  const [parents, setParents] = useState<GhostParentOptionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ImportStatus>("draft");
  const [confirming, setConfirming] = useState(false);
  const [mediaAck, setMediaAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [cats, parentOpts, ...details] = await Promise.all([
        getImportCategoryOptionsAction(),
        getGhostParentOptionsAction(),
        ...productIds.map((id) => getReloadlyImportDetailAction(id)),
      ]);
      if (cancelled) return;
      setCategories(cats);
      setParents(parentOpts);
      const errs: string[] = [];
      const built: ProductPrep[] = [];
      details.forEach((res, i) => {
        if (!res.ok) {
          errs.push(`#${productIds[i]}: ${res.error}`);
          return;
        }
        const d = res.data;
        built.push({
          detail: d,
          rows: d.denominations.map((p) => ({
            faceValue: p.faceValue,
            faceCurrency: p.faceCurrency,
            preview: p,
            publishedPriceMad: p.suggestedPriceMad != null ? String(p.suggestedPriceMad) : "",
            marginOverride: "",
            competitorPrice: "",
            include: !p.alreadyExists && p.suggestedPriceMad != null,
          })),
          customValue: "",
          stockControl: "reloadly",
          competitorSource: "",
          groupChoice: "new-own",
          activateNewVariants: false,
          name: d.productName,
          slug: d.suggestedSlug,
          slugTouched: false,
          categoryId: d.suggestedCategoryId ?? cats[0]?.id ?? "",
          brand: d.brandName,
          description: "",
          regionCode: d.suggestedRegionCode,
          featured: false,
          useLogo: false,
        });
      });
      if (errs.length) setError(errs.join(" | "));
      setPreps(built);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productIds]);

  const update = useCallback((productId: number, patch: Partial<ProductPrep>) => {
    setPreps((prev) => prev.map((p) => (p.detail.productId === productId ? { ...p, ...patch } : p)));
  }, []);

  const updateRow = useCallback(
    (productId: number, faceValue: number, patch: Partial<RowState>) => {
      setPreps((prev) =>
        prev.map((p) =>
          p.detail.productId === productId
            ? { ...p, rows: p.rows.map((r) => (r.faceValue === faceValue ? { ...r, ...patch } : r)) }
            : p,
        ),
      );
    },
    [],
  );

  const reprice = useCallback(
    async (prep: ProductPrep, faceValue: number, marginOverride: string) => {
      const res = await previewReloadlyDenominationsAction({
        productId: prep.detail.productId,
        faceValues: [faceValue],
        categoryId: prep.categoryId || null,
        marginOverride: marginOverride.trim() === "" ? null : Number(marginOverride),
      });
      if (res.ok && res.data[0]) {
        const preview = res.data[0];
        setPreps((prev) =>
          prev.map((p) =>
            p.detail.productId === prep.detail.productId
              ? {
                  ...p,
                  rows: p.rows.map((r) =>
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
                }
              : p,
          ),
        );
      }
    },
    [],
  );

  const addCustom = useCallback(
    async (prep: ProductPrep) => {
      const fv = Number(prep.customValue);
      if (!Number.isFinite(fv) || fv <= 0) return;
      if (prep.rows.some((r) => r.faceValue === fv)) {
        update(prep.detail.productId, { customValue: "" });
        return;
      }
      const res = await previewReloadlyDenominationsAction({
        productId: prep.detail.productId,
        faceValues: [fv],
        categoryId: prep.categoryId || null,
        marginOverride: null,
      });
      const preview = res.ok ? res.data[0] : null;
      setPreps((prev) =>
        prev.map((p) =>
          p.detail.productId === prep.detail.productId
            ? {
                ...p,
                customValue: "",
                rows: [
                  ...p.rows,
                  {
                    faceValue: fv,
                    faceCurrency: p.detail.recipientCurrency,
                    preview,
                    publishedPriceMad:
                      preview?.suggestedPriceMad != null ? String(preview.suggestedPriceMad) : "",
                    marginOverride: "",
                    competitorPrice: "",
                    include: preview?.withinBounds !== false && !preview?.alreadyExists,
                  },
                ],
              }
            : p,
        ),
      );
    },
    [update],
  );

  // Build the batch payload from prep state (grouping resolution).
  const batchInput = useMemo<ImportReloadlyBatchInput | null>(() => {
    if (preps.length === 0) return null;
    const byId = new Map(preps.map((p) => [p.detail.productId, p]));
    const groups = new Map<string, ImportGroupInput>();

    for (const prep of preps) {
      const included = prep.rows.filter(
        (r) => r.include && r.preview?.withinBounds !== false && !r.preview?.alreadyExists,
      );
      if (included.length === 0) continue;

      const source = {
        reloadlyProductId: prep.detail.productId,
        reloadlyCountryCode: prep.detail.country,
        variants: included.map((r) => ({
          faceValue: r.faceValue,
          faceCurrency: r.faceCurrency,
          publishedPriceMad: Number(r.publishedPriceMad) || 0,
          marginPctOverride: r.marginOverride.trim() === "" ? null : Number(r.marginOverride),
          stockControl: prep.stockControl,
          competitorReferencePriceMad:
            r.competitorPrice.trim() === "" ? null : Math.round(Number(r.competitorPrice)),
          competitorReferenceSource: prep.competitorSource.trim() || null,
        })),
      };

      let groupKey: string;
      let lead: ProductPrep | undefined;
      if (prep.groupChoice.startsWith("existing:")) {
        const slug = prep.groupChoice.slice("existing:".length);
        groupKey = `existing:${slug}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, { target: { mode: "existing", slug }, activateNewVariants: prep.activateNewVariants, sources: [] });
        }
      } else {
        const leadId = prep.groupChoice.startsWith("share:")
          ? Number(prep.groupChoice.slice("share:".length))
          : prep.detail.productId;
        lead = byId.get(leadId) ?? prep;
        groupKey = `new:${lead.detail.productId}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            target: {
              mode: "new",
              name: lead.name,
              slug: lead.slug,
              categoryId: lead.categoryId,
              brand: lead.brand,
              description: lead.description,
              instructions: lead.detail.redeemInstructionVerbose ?? "",
              regionCode: lead.regionCode,
              featured: lead.featured,
              imageUrl: lead.useLogo ? lead.detail.logoUrl : null,
              imageIsProviderPlaceholder: lead.useLogo,
            },
            activateNewVariants: true,
            sources: [],
          });
        }
      }
      groups.get(groupKey)!.sources.push(source);
    }

    const arr = [...groups.values()];
    return arr.length ? { status, groups: arr } : null;
  }, [preps, status]);

  const includedCount = useMemo(
    () =>
      preps.reduce(
        (n, p) =>
          n +
          p.rows.filter((r) => r.include && r.preview?.withinBounds !== false && !r.preview?.alreadyExists)
            .length,
        0,
      ),
    [preps],
  );

  // New-parent groups always lack final Ghost media at import time.
  const publishingWithoutMedia = useMemo(() => {
    if (status !== "publish" || !batchInput) return false;
    return batchInput.groups.some((g) => g.target.mode === "new");
  }, [status, batchInput]);

  const doImport = useCallback(async () => {
    if (!batchInput) return;
    setSubmitting(true);
    setError(null);
    const res = await importReloadlyBatchAction(batchInput);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      setConfirming(false);
      return;
    }
    onImported(res);
  }, [batchInput, onImported]);

  if (loading) return <p className="text-sm text-muted">Chargement des produits…</p>;

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="text-sm text-accent-strong">
        ← Retour à la recherche
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Import status */}
      <section className="rounded-2xl border border-border-strong bg-card p-5">
        <h3 className="text-sm font-semibold text-white">Statut d&apos;import</h3>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={status === "draft"} onChange={() => setStatus("draft")} />
            <span className="text-white">Brouillon</span>
            <span className="text-xs text-faint">(masqué du storefront, complétez les visuels plus tard)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={status === "publish"} onChange={() => setStatus("publish")} />
            <span className="text-white">Publier immédiatement</span>
            <span className="text-xs text-faint">(confirmation requise)</span>
          </label>
        </div>
      </section>

      {preps.map((prep) => (
        <ProductPrepCard
          key={prep.detail.productId}
          prep={prep}
          preps={preps}
          categories={categories}
          parents={parents}
          onUpdate={(patch) => update(prep.detail.productId, patch)}
          onUpdateRow={(fv, patch) => updateRow(prep.detail.productId, fv, patch)}
          onReprice={(fv, m) => reprice(prep, fv, m)}
          onAddCustom={() => addCustom(prep)}
          onCategoryCreated={(cat) =>
            setCategories((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, cat]))
          }
        />
      ))}

      {/* Consolidated pricing review */}
      <PricingReview preps={preps} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => (status === "publish" ? setConfirming(true) : doImport())}
          disabled={submitting || includedCount === 0 || !batchInput}
          className="rounded-xl border border-accent/50 bg-accent/25 px-5 py-2.5 text-sm font-semibold text-accent-strong disabled:opacity-40"
        >
          {submitting
            ? "Import…"
            : status === "draft"
              ? `Importer en brouillon (${includedCount})`
              : `Réviser et publier (${includedCount})`}
        </button>
        <span className="text-xs text-faint">
          Le prix publié par défaut est le prix suggéré — modifiable avant l&apos;import.
        </span>
      </div>

      {/* Publish confirmation dialog */}
      {confirming && batchInput && (
        <ConfirmPublish
          batchInput={batchInput}
          preps={preps}
          publishingWithoutMedia={publishingWithoutMedia}
          mediaAck={mediaAck}
          setMediaAck={setMediaAck}
          submitting={submitting}
          onCancel={() => setConfirming(false)}
          onConfirm={doImport}
        />
      )}
    </div>
  );
}

function ProductPrepCard({
  prep,
  preps,
  categories,
  parents,
  onUpdate,
  onUpdateRow,
  onReprice,
  onAddCustom,
  onCategoryCreated,
}: {
  prep: ProductPrep;
  preps: ProductPrep[];
  categories: AdminCategoryDTO[];
  parents: GhostParentOptionDTO[];
  onUpdate: (patch: Partial<ProductPrep>) => void;
  onUpdateRow: (faceValue: number, patch: Partial<RowState>) => void;
  onReprice: (faceValue: number, margin: string) => void;
  onAddCustom: () => void;
  onCategoryCreated: (category: AdminCategoryDTO) => void;
}) {
  const d = prep.detail;
  const isRange = d.denominationType === "RANGE";
  const [creatingCat, setCreatingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catBusy, setCatBusy] = useState(false);

  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setCatBusy(true);
    const res = await createCategoryQuickAction(name);
    setCatBusy(false);
    if (res.ok && res.category) {
      onCategoryCreated(res.category);
      onUpdate({ categoryId: res.category.id });
      setNewCatName("");
      setCreatingCat(false);
    }
  };
  const isNewParent = prep.groupChoice === "new-own" || prep.groupChoice.startsWith("share:");
  const isLead = prep.groupChoice === "new-own";
  const staleDays = d.costStaleDays;
  const stale =
    !d.costSyncedAt ||
    Date.now() - new Date(d.costSyncedAt).getTime() > staleDays * 24 * 3600 * 1000;

  const otherNewOwn = preps.filter(
    (p) => p.detail.productId !== d.productId && p.groupChoice === "new-own",
  );

  const setAllIncluded = (include: boolean) =>
    onUpdate({
      rows: prep.rows.map((r) =>
        r.preview?.alreadyExists || r.preview?.withinBounds === false ? r : { ...r, include },
      ),
    });

  return (
    <section className="rounded-2xl border border-border-strong bg-card p-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        {d.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.logoUrl} alt="" className="h-11 w-11 rounded-lg object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white">{d.productName}</h3>
          <p className="text-xs text-muted">
            {d.brandName} · {d.countryName} ({d.country}) · {d.recipientCurrency} · {d.denominationType} ·
            Reloadly #{d.productId}
          </p>
          <p className="mt-0.5 text-xs text-faint">
            remise {d.discountPercentage}% · frais {d.senderFee}+{d.senderFeePercentage}% ·{" "}
            <span className={stale ? "text-amber-400" : "text-muted"}>
              {d.costSyncedAt ? `Synchronisé ${timeAgoFr(d.costSyncedAt)}` : "Jamais synchronisé"}
              {stale ? ` (obsolète, > ${staleDays} j)` : ""}
            </span>
          </p>
        </div>
      </div>

      {/* Grouping */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted">Produit Ghost.ma</label>
          <select
            value={prep.groupChoice}
            onChange={(e) => onUpdate({ groupChoice: e.target.value })}
            className={`mt-1 ${inputCls}`}
          >
            <option value="new-own">Créer un nouveau produit Ghost.ma</option>
            {otherNewOwn.map((p) => (
              <option key={p.detail.productId} value={`share:${p.detail.productId}`}>
                Regrouper avec : {p.name || p.detail.productName}
              </option>
            ))}
            <optgroup label="Ajouter à un produit existant">
              {parents.map((p) => (
                <option key={p.slug} value={`existing:${p.slug}`}>
                  {p.name} ({p.region || "?"}) — {p.variantCount} variante(s){p.active ? "" : " · inactif"}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        {prep.groupChoice.startsWith("existing:") && (
          <label className="flex items-end gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={prep.activateNewVariants}
              onChange={(e) => onUpdate({ activateNewVariants: e.target.checked })}
            />
            Activer les nouvelles variantes immédiatement
          </label>
        )}
        <div>
          <label className="text-xs text-muted">Fulfillment</label>
          <select
            value={prep.stockControl}
            onChange={(e) => onUpdate({ stockControl: e.target.value as "reloadly" | "manual" })}
            className={`mt-1 ${inputCls}`}
          >
            <option value="reloadly">Reloadly (API)</option>
            <option value="manual">Manuel / local</option>
          </select>
        </div>
      </div>

      {/* New-parent config (only for the lead of a new group) */}
      {isLead && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs text-muted">Titre</label>
            <input
              value={prep.name}
              onChange={(e) =>
                onUpdate({
                  name: e.target.value,
                  slug: prep.slugTouched ? prep.slug : slugifyClient(e.target.value),
                })
              }
              className={`mt-1 ${inputCls}`}
            />
          </div>
          <div>
            <label className="text-xs text-muted">Slug</label>
            <input
              value={prep.slug}
              onChange={(e) => onUpdate({ slug: e.target.value, slugTouched: true })}
              className={`mt-1 ${inputCls}`}
            />
          </div>
          <div>
            <label className="text-xs text-muted">Catégorie</label>
            <div className="mt-1 flex gap-2">
              <select
                value={prep.categoryId}
                onChange={(e) => onUpdate({ categoryId: e.target.value })}
                className={inputCls}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCreatingCat((v) => !v)}
                title="Nouvelle catégorie"
                className="shrink-0 rounded-lg border border-border-strong px-3 text-sm text-muted"
              >
                +
              </button>
            </div>
            {creatingCat && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createCategory())}
                  placeholder="Nom de la nouvelle catégorie"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={createCategory}
                  disabled={catBusy || !newCatName.trim()}
                  className="shrink-0 rounded-lg border border-accent/50 bg-accent/20 px-3 text-xs font-semibold text-accent-strong disabled:opacity-40"
                >
                  {catBusy ? "…" : "Créer"}
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted">Marque</label>
            <input
              value={prep.brand}
              onChange={(e) => onUpdate({ brand: e.target.value })}
              className={`mt-1 ${inputCls}`}
            />
          </div>
          <div>
            <label className="text-xs text-muted">Région (parent)</label>
            <select
              value={prep.regionCode}
              onChange={(e) => onUpdate({ regionCode: e.target.value })}
              className={`mt-1 ${inputCls}`}
            >
              <option value="">Région ? (à compléter)</option>
              {REGION_LIST.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-4 text-sm text-muted">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prep.featured}
                onChange={(e) => onUpdate({ featured: e.target.checked })}
              />
              Populaire
            </label>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-xs text-muted">Description</label>
            <textarea
              value={prep.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              rows={2}
              className={`mt-1 ${inputCls}`}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={prep.useLogo}
              onChange={(e) => onUpdate({ useLogo: e.target.checked })}
            />
            Logo fournisseur temporaire
            {prep.useLogo && (
              <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-xs text-amber-400">
                temporaire
              </span>
            )}
          </label>
        </div>
      )}
      {isNewParent && !isLead && (
        <p className="mt-3 text-xs text-faint">
          Les variantes seront ajoutées au produit du groupe sélectionné.
        </p>
      )}

      {/* Media readiness warning */}
      {isLead && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          Ce produit n&apos;a pas encore de visuel Ghost.ma personnalisé.{" "}
          {prep.useLogo ? "Logo fournisseur temporaire utilisé." : "Aucune image."} Vous pourrez
          l&apos;ajouter dans l&apos;admin après l&apos;import.
        </div>
      )}

      {/* Denominations */}
      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">
            Dénominations {isRange ? "(RANGE)" : "(FIXED)"}
          </span>
          {isRange ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-faint">
                Plage {d.minDenomination}–{d.maxDenomination} {d.recipientCurrency}
              </span>
              <input
                value={prep.customValue}
                onChange={(e) => onUpdate({ customValue: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && onAddCustom()}
                placeholder="ex. 100"
                type="number"
                className="w-24 rounded-lg border border-border-strong bg-surface2 px-2 py-1 text-sm text-white"
              />
              <button
                type="button"
                onClick={onAddCustom}
                className="rounded-lg border border-accent/50 bg-accent/20 px-2 py-1 text-xs font-semibold text-accent-strong"
              >
                + Ajouter
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAllIncluded(true)}
                className="rounded border border-border-strong px-2 py-1 text-xs text-muted"
              >
                Tout sélectionner
              </button>
              <button
                type="button"
                onClick={() => setAllIncluded(false)}
                className="rounded border border-border-strong px-2 py-1 text-xs text-muted"
              >
                Tout désélectionner
              </button>
            </div>
          )}
        </div>

        {prep.rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {isRange ? "Ajoutez les dénominations à vendre." : "Aucune dénomination proposée."}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-2 py-2"></th>
                  <th className="px-2 py-2">Valeur</th>
                  <th className="px-2 py-2">Coût</th>
                  <th className="px-2 py-2">Coût MAD</th>
                  <th className="px-2 py-2">Marge</th>
                  <th className="px-2 py-2">Suggéré</th>
                  <th className="px-2 py-2">Prix publié</th>
                  <th className="px-2 py-2">Concurrent</th>
                  <th className="px-2 py-2">Profit</th>
                  {isRange && <th className="px-2 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {prep.rows.map((r) => {
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
                          onChange={(e) => onUpdateRow(r.faceValue, { include: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-2 text-white">
                        {r.faceValue} {r.faceCurrency}
                        {p?.alreadyExists && <span className="ml-2 text-xs text-green-400">Déjà ajouté</span>}
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
                          onChange={(e) => onUpdateRow(r.faceValue, { marginOverride: e.target.value })}
                          onBlur={() => onReprice(r.faceValue, r.marginOverride)}
                          placeholder={p?.marginPct != null ? `${p.marginPct}%` : "%"}
                          className="w-14 rounded border border-border-strong bg-surface2 px-2 py-1 text-sm text-white"
                        />
                      </td>
                      <td className="px-2 py-2 text-muted">
                        {p?.suggestedPriceMad != null ? formatMAD(p.suggestedPriceMad) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={r.publishedPriceMad}
                          onChange={(e) => onUpdateRow(r.faceValue, { publishedPriceMad: e.target.value })}
                          type="number"
                          className="w-24 rounded border border-border-strong bg-surface2 px-2 py-1 text-sm font-semibold text-white"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={r.competitorPrice}
                          onChange={(e) => onUpdateRow(r.faceValue, { competitorPrice: e.target.value })}
                          type="number"
                          placeholder="—"
                          className="w-20 rounded border border-border-strong bg-surface2 px-2 py-1 text-sm text-white"
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
                              onUpdate({ rows: prep.rows.filter((x) => x.faceValue !== r.faceValue) })
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
        <div className="mt-2">
          <label className="text-xs text-muted">Source prix concurrent (optionnel)</label>
          <input
            value={prep.competitorSource}
            onChange={(e) => onUpdate({ competitorSource: e.target.value })}
            placeholder="ex. concurrent X"
            className="mt-1 w-64 rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white"
          />
        </div>
      </div>
    </section>
  );
}

// ─── Consolidated pricing review (§8) ────────────────────────────────────────

function PricingReview({ preps }: { preps: ProductPrep[] }) {
  const items = preps.flatMap((prep) =>
    prep.rows
      .filter((r) => r.include && r.preview?.withinBounds !== false && !r.preview?.alreadyExists)
      .map((r) => ({ prep, r })),
  );
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border-strong bg-card p-5">
      <h3 className="text-sm font-semibold text-white">Revue tarifaire ({items.length})</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-2 py-2">Produit</th>
              <th className="px-2 py-2">Région</th>
              <th className="px-2 py-2">Valeur</th>
              <th className="px-2 py-2">Coût</th>
              <th className="px-2 py-2">Coût MAD</th>
              <th className="px-2 py-2">Marge</th>
              <th className="px-2 py-2">Suggéré</th>
              <th className="px-2 py-2">Publié</th>
              <th className="px-2 py-2">Concurrent</th>
              <th className="px-2 py-2">Profit</th>
              <th className="px-2 py-2">Marge %</th>
              <th className="px-2 py-2">Alerte</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ prep, r }) => {
              const p = r.preview;
              const price = Number(r.publishedPriceMad) || 0;
              const profit = p?.costInMad != null ? price - p.costInMad : null;
              const marginPct = profit != null && price ? (profit / price) * 100 : null;
              const suggested = p?.suggestedPriceMad ?? null;
              const bigDiff = suggested != null && suggested > 0 ? Math.abs(price - suggested) / suggested > 0.25 : false;
              const stale =
                !prep.detail.costSyncedAt ||
                Date.now() - new Date(prep.detail.costSyncedAt).getTime() >
                  prep.detail.costStaleDays * 24 * 3600 * 1000;
              const alerts: string[] = [];
              if (p?.costInMad == null) alerts.push("Coût manquant");
              if (profit != null && profit < 0) alerts.push("Profit négatif");
              if (marginPct != null && marginPct >= 0 && marginPct < 5) alerts.push("Marge faible");
              if (bigDiff) alerts.push("Écart > 25% vs suggéré");
              if (stale) alerts.push("Coût obsolète");
              const bad = alerts.some((a) => a === "Profit négatif" || a === "Coût manquant");
              return (
                <tr key={`${prep.detail.productId}:${r.faceValue}`} className="border-t border-border">
                  <td className="px-2 py-2 text-white">{prep.name || prep.detail.productName}</td>
                  <td className="px-2 py-2 text-muted">{prep.detail.country}</td>
                  <td className="px-2 py-2 text-muted">
                    {r.faceValue} {r.faceCurrency}
                  </td>
                  <td className="px-2 py-2 text-muted">
                    {p?.providerCost != null ? `${p.providerCost.toFixed(2)} ${p.supplierCurrency}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-muted">{p?.costInMad != null ? formatMAD(p.costInMad) : "—"}</td>
                  <td className="px-2 py-2 text-muted">
                    {p?.marginSource ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-muted">{suggested != null ? formatMAD(suggested) : "—"}</td>
                  <td className="px-2 py-2 font-semibold text-white">{formatMAD(price)}</td>
                  <td className="px-2 py-2 text-muted">
                    {r.competitorPrice.trim() ? formatMAD(Number(r.competitorPrice)) : "—"}
                  </td>
                  <td className={`px-2 py-2 ${profit != null && profit < 0 ? "text-red-400" : "text-muted"}`}>
                    {profit != null ? formatMAD(Number(profit.toFixed(2))) : "—"}
                  </td>
                  <td className={`px-2 py-2 ${marginPct != null && marginPct < 5 ? "text-amber-400" : "text-muted"}`}>
                    {marginPct != null ? `${marginPct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-2 py-2">
                    {alerts.length > 0 ? (
                      <span className={`text-xs ${bad ? "text-red-400" : "text-amber-400"}`}>
                        {alerts.join(", ")}
                      </span>
                    ) : (
                      <span className="text-xs text-green-400">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-faint">
        Les alertes n&apos;empêchent pas l&apos;import — ce sont des garde-fous pour vos décisions tarifaires.
      </p>
    </section>
  );
}

// ─── Publish confirmation ────────────────────────────────────────────────────

function ConfirmPublish({
  batchInput,
  preps,
  publishingWithoutMedia,
  mediaAck,
  setMediaAck,
  submitting,
  onCancel,
  onConfirm,
}: {
  batchInput: ImportReloadlyBatchInput;
  preps: ProductPrep[];
  publishingWithoutMedia: boolean;
  mediaAck: boolean;
  setMediaAck: (v: boolean) => void;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  void preps;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border-strong bg-card p-6">
        <h3 className="text-lg font-semibold text-white">Confirmer la publication</h3>
        <p className="mt-1 text-sm text-muted">
          Les produits suivants seront créés/mis à jour et rendus visibles.
        </p>
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {batchInput.groups.map((g, i) => {
            const variantCount = g.sources.reduce((n, s) => n + s.variants.length, 0);
            const label =
              g.target.mode === "new" ? `${g.target.name} (${g.target.regionCode || "?"})` : `${g.target.slug} (existant)`;
            return (
              <div key={i} className="rounded-lg border border-border px-3 py-2 text-sm">
                <span className="text-white">{label}</span>
                <span className="ml-2 text-xs text-muted">
                  {variantCount} variante(s) · {g.sources.length} source(s) Reloadly
                  {g.target.mode === "existing" ? (g.activateNewVariants ? " · nouvelles activées" : " · nouvelles inactives") : ""}
                </span>
              </div>
            );
          })}
        </div>

        {publishingWithoutMedia && (
          <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <input
              type="checkbox"
              checked={mediaAck}
              onChange={(e) => setMediaAck(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Certains produits n&apos;ont pas de visuel Ghost.ma personnalisé (logo fournisseur
              temporaire ou aucune image). Je confirme vouloir publier malgré tout.
            </span>
          </label>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || (publishingWithoutMedia && !mediaAck)}
            className="rounded-lg border border-accent/50 bg-accent/25 px-4 py-2 text-sm font-semibold text-accent-strong disabled:opacity-40"
          >
            {submitting ? "Publication…" : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function SummaryView({
  result,
  onDone,
}: {
  result: ImportReloadlyBatchResultDTO;
  onDone: () => void;
}) {
  const firstSlug = result.products[0]?.slug;
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-5">
        <h2 className="text-lg font-semibold text-green-300">Import terminé</h2>
        <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Produits créés" value={result.productsCreated} />
          <Stat label="Produits mis à jour" value={result.productsUpdated} />
          <Stat label="Variantes créées" value={result.variantsCreated} />
          <Stat label="Variantes ignorées (doublons)" value={result.variantsSkipped} />
          <Stat label="Produits en brouillon" value={result.draftProducts} />
          <Stat label="Produits publiés" value={result.publishedProducts} />
          <Stat label="Produits à visuel à revoir" value={result.variantsNeedingMedia} />
        </div>
      </div>

      <div className="rounded-2xl border border-border-strong bg-card p-5">
        <h3 className="text-sm font-semibold text-white">Produits importés</h3>
        <div className="mt-3 space-y-2">
          {result.products.map((p) => (
            <div key={p.slug} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="text-white">{p.name}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  p.isDraft
                    ? "border-amber-500/50 text-amber-400"
                    : p.active
                      ? "border-green-500/40 text-green-400"
                      : "border-border-strong text-muted"
                }`}
              >
                {p.isDraft ? "Brouillon" : p.active ? "Publié" : "Inactif"}
              </span>
              <span className="text-xs text-muted">
                +{p.createdVariants} variante(s){p.skippedVariants ? `, ${p.skippedVariants} ignorée(s)` : ""}
              </span>
              {p.needsMediaReview && (
                <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-xs text-amber-400">
                  {p.usingProviderPlaceholder ? "Logo fournisseur temporaire" : "Visuel manquant"}
                </span>
              )}
              <Link href={`/products/${p.slug}`} className="ml-auto text-xs text-accent-strong">
                Voir
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {firstSlug && (
          <Link
            href={`/products/${firstSlug}`}
            className="rounded-lg border border-accent/50 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent-strong"
          >
            Voir les produits importés
          </Link>
        )}
        <Link href="/admin?tab=products" className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted">
          Ajouter les visuels
        </Link>
        <Link href="/admin?tab=pricing" className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted">
          Ouvrir la tarification
        </Link>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted"
        >
          Retourner au catalogue Reloadly
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface2 px-3 py-2">
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs text-faint">{label}</div>
    </div>
  );
}
