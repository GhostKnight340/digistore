"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import {
  getInventoryProductsAction,
  getInventoryCodesAction,
  addCodesBulkAction,
  disableCodeAction,
} from "@/app/actions/admin";
import type {
  AdminCodeDTO,
  InventoryProductDTO,
  InventoryVariantDTO,
} from "@/lib/dto";

const LOW_STOCK_MAX = 5;
const LOAD_TIMEOUT_MS = 8000;

const STATUS_STYLES: Record<string, string> = {
  unused: "bg-green-500/15 text-green-400",
  reserved: "bg-amber-500/15 text-amber-400",
  used: "bg-muted/15 text-muted",
  disabled: "bg-red-500/15 text-red-400",
};

type Filter = "all" | "attention" | "low" | "out" | "recent";

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(
        () => reject(new Error(`${label} took too long to respond.`)),
        LOAD_TIMEOUT_MS,
      );
    }),
  ]);
}

function stockTone(unused: number) {
  if (unused === 0) {
    return {
      label: "En rupture",
      dot: "bg-red-400",
      text: "text-red-300",
      border: "border-red-500/40",
      bg: "bg-red-500/10",
    };
  }
  if (unused <= LOW_STOCK_MAX) {
    return {
      label: "Stock faible",
      dot: "bg-amber-400",
      text: "text-amber-300",
      border: "border-amber-500/40",
      bg: "bg-amber-500/10",
    };
  }
  return {
    label: "En stock",
    dot: "bg-green-400",
    text: "text-green-300",
    border: "border-green-500/40",
    bg: "bg-green-500/10",
  };
}

function sortedRecently(products: InventoryProductDTO[]) {
  return [...products].sort((a, b) => {
    const bTime = b.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0;
    const aTime = a.lastUpdatedAt ? new Date(a.lastUpdatedAt).getTime() : 0;
    return bTime - aTime;
  });
}

export default function InventoryPanel() {
  const { settings, saveSettings } = useStoreSettings();
  const [products, setProducts] = useState<InventoryProductDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [managing, setManaging] = useState<{
    product: InventoryProductDTO;
    variant: InventoryVariantDTO;
  } | null>(null);
  const [modeSaving, setModeSaving] = useState(false);
  const [modeMessage, setModeMessage] = useState("");
  const manualMode = settings.inventoryMode === "manual";

  async function setInventoryMode(mode: "automatic" | "manual") {
    setModeSaving(true);
    setModeMessage("");
    const result = await saveSettings({ ...settings, inventoryMode: mode });
    setModeMessage(result.ok ? "Mode de stock enregistré." : result.error ?? "Impossible d'enregistrer le mode.");
    setModeSaving(false);
  }

  const load = useCallback(async () => {
    setLoadError("");
    setLoaded(false);
    try {
      const data = await withTimeout(getInventoryProductsAction(), "Stock");
      setProducts(data);
      setSelectedProductId((current) => current ?? data[0]?.productId ?? null);
    } catch (error) {
      console.error("Failed to load inventory", error);
      setLoadError("Impossible d'actualiser le stock. Les dernières données chargées restent affichées.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    let rows = products.filter((product) => {
      const searchable = [
        product.productName,
        product.category,
        ...product.variants.map((variant) => variant.name),
      ]
        .join(" ")
        .toLowerCase();
      if (term && !searchable.includes(term)) return false;
      if (filter === "attention") return product.variants.some((v) => v.unused <= LOW_STOCK_MAX);
      if (filter === "low") return product.variants.some((v) => v.unused > 0 && v.unused <= LOW_STOCK_MAX);
      if (filter === "out") return product.variants.some((v) => v.unused === 0);
      return true;
    });

    if (filter === "recent") rows = sortedRecently(rows);
    return rows;
  }, [filter, products, query]);

  const selectedProduct =
    visibleProducts.find((product) => product.productId === selectedProductId) ??
    visibleProducts[0] ??
    null;

  const alerts = useMemo(
    () =>
      products
        .flatMap((product) =>
          product.variants
            .filter((variant) => variant.unused <= LOW_STOCK_MAX)
            .map((variant) => ({
              productName: product.productName,
              variant,
              tone: stockTone(variant.unused),
            })),
        )
        .sort((a, b) => a.variant.unused - b.variant.unused)
        .slice(0, 4),
    [products],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Stock</h2>
          <p className="mt-1 text-sm text-muted">
            Gestion du stock par produit pour les codes numériques.
          </p>
        </div>
        <button type="button" onClick={load} className="btn-ghost h-10 px-4 text-xs">
          Actualiser
        </button>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {loadError}
        </div>
      ) : null}

      <div className="card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Mode de stock</h3>
            <p className="mt-1 text-xs text-muted">
              Choisissez si les commandes utilisent le stock importé ou des codes saisis manuellement.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
            <button
              type="button"
              disabled={modeSaving}
              onClick={() => setInventoryMode("automatic")}
              className={`rounded-md px-3 py-2 transition disabled:opacity-50 ${
                !manualMode ? "bg-accent/15 text-white" : "text-muted hover:text-white"
              }`}
            >
              Stock automatique
            </button>
            <button
              type="button"
              disabled={modeSaving}
              onClick={() => setInventoryMode("manual")}
              className={`rounded-md px-3 py-2 transition disabled:opacity-50 ${
                manualMode ? "bg-accent/15 text-white" : "text-muted hover:text-white"
              }`}
            >
              Saisie manuelle
            </button>
          </div>
          {modeMessage ? <p className="w-full text-xs text-muted">{modeMessage}</p> : null}
        </div>

        {manualMode ? (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p className="font-medium text-amber-50">La saisie manuelle des codes est active.</p>
            <p className="mt-1 text-xs text-amber-100/85">
              Les codes en stock sont ignorés pour les nouvelles commandes. Vous pouvez saisir les codes depuis la page de détail de chaque commande. Le stock existant reste inchangé.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="input h-10 py-0 text-sm"
            placeholder="Rechercher un produit ou une variante..."
          />
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
            {[
              ["all", "Tous"],
              ["attention", "À surveiller"],
              ["low", "Stock faible"],
              ["out", "En rupture"],
              ["recent", "Mis à jour récemment"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id as Filter)}
                className={`rounded-md px-3 py-2 transition ${
                  filter === id ? "bg-accent/15 text-white" : "text-muted hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!loaded ? (
        <p className="text-sm text-muted">Chargement...</p>
      ) : products.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          Aucun produit en stock pour le moment. Ajoutez des produits et des codes pour commencer.
        </p>
      ) : visibleProducts.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          Aucun produit ne correspond à cette recherche ou à ce filtre.
        </p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            {alerts.length > 0 ? (
              <section className="rounded-2xl border border-border bg-surface/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">Alertes de stock</h3>
                  <span className="text-xs text-muted">{alerts.length} active</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {alerts.map(({ productName, variant, tone }) => (
                    <button
                      key={`${productName}-${variant.productId}-${variant.name}`}
                      type="button"
                      onClick={() => {
                        const product = products.find((item) =>
                          item.variants.some((v) => v.productId === variant.productId),
                        );
                        if (product) setSelectedProductId(product.productId);
                      }}
                      className={`rounded-xl border px-3 py-2 text-left ${tone.border} ${tone.bg}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                        <span className="text-sm font-medium text-white">
                          {productName} {variant.name}
                        </span>
                      </div>
                      <p className={`mt-1 text-xs ${tone.text}`}>
                        {variant.unused === 0
                          ? "En rupture"
                          : `Plus que ${variant.unused} code${variant.unused === 1 ? "" : "s"} disponible${variant.unused === 1 ? "" : "s"}`}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.productId}
                  product={product}
                  active={selectedProduct?.productId === product.productId}
                  onSelect={() => setSelectedProductId(product.productId)}
                />
              ))}
            </div>
          </div>

          <ProductDetail
            product={selectedProduct}
            onManage={(product, variant) => setManaging({ product, variant })}
          />
        </div>
      )}

      {managing ? (
        <ManageCodesPanel
          product={managing.product}
          variant={managing.variant}
          onClose={() => setManaging(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}

function ProductCard({
  product,
  active,
  onSelect,
}: {
  product: InventoryProductDTO;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`card w-full p-5 text-left transition hover:border-accent/50 ${
        active ? "border-accent/60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="text-base font-bold text-white">{product.productName}</h3>
          <p className="mt-1 text-xs text-muted">
            {product.variantCount} variant{product.variantCount === 1 ? "" : "s"}
          </p>
        </div>
        <span className="text-xs font-medium text-accent">Voir le stock</span>
      </div>
      <div className="mt-4 space-y-2">
        {product.variants.slice(0, 5).map((variant) => (
          <VariantStockRow key={`${variant.productId}-${variant.name}`} variant={variant} compact />
        ))}
        {product.variants.length > 5 ? (
          <p className="pt-1 text-xs text-muted">
            +{product.variants.length - 5} more variants
          </p>
        ) : null}
      </div>
    </button>
  );
}

function ProductDetail({
  product,
  onManage,
}: {
  product: InventoryProductDTO | null;
  onManage: (product: InventoryProductDTO, variant: InventoryVariantDTO) => void;
}) {
  if (!product) {
    return (
      <section className="card p-6 text-sm text-muted">
        Sélectionnez un produit pour consulter son stock.
      </section>
    );
  }

  return (
    <section className="card h-fit overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-lg font-bold text-white">Stock de {product.productName}</h3>
        <p className="mt-1 text-xs text-muted">
          {product.unused} disponibles, {product.reserved} réservés, {product.used} utilisés
        </p>
      </div>
      <div className="divide-y divide-border/70">
        {product.variants.map((variant) => (
          <div key={`${variant.productId}-${variant.name}`} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <VariantStockRow variant={variant} />
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <Metric label="Disponibles" value={variant.unused} tone="text-green-400" />
                  <Metric label="Réservés" value={variant.reserved} tone="text-amber-400" />
                  <Metric label="Utilisés" value={variant.used} tone="text-muted" />
                </dl>
              </div>
              <button
                type="button"
                onClick={() => onManage(product, variant)}
                className="btn-primary h-9 shrink-0 px-3 text-xs"
              >
                Gérer les codes
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function VariantStockRow({
  variant,
  compact = false,
}: {
  variant: InventoryVariantDTO;
  compact?: boolean;
}) {
  const tone = stockTone(variant.unused);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className={`${compact ? "text-sm" : "text-base"} truncate font-medium text-white`}>
          {variant.name}
        </p>
        {!compact && variant.lastUpdatedAt ? (
          <p className="mt-1 text-xs text-muted">
            Mis à jour le {formatDate(variant.lastUpdatedAt)}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <div className={`flex items-center justify-end gap-2 text-xs ${tone.text}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
          <span>{tone.label}</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-white">
          {variant.unused} code{variant.unused === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <dt className="text-[10px] uppercase text-muted">{label}</dt>
      <dd className={`mt-1 text-sm font-bold ${tone}`}>{value}</dd>
    </div>
  );
}

function ManageCodesPanel({
  product,
  variant,
  onClose,
  onChanged,
}: {
  product: InventoryProductDTO;
  variant: InventoryVariantDTO;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [bulk, setBulk] = useState("");
  const [codes, setCodes] = useState<AdminCodeDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadCodes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getInventoryCodesAction(variant.productId);
      setCodes(data);
      setLoaded(true);
    } catch (loadError) {
      console.error("Failed to load inventory codes", loadError);
      setError("Impossible de charger les codes.");
    } finally {
      setLoading(false);
    }
  }, [variant.productId]);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  async function handleImport() {
    if (!bulk.trim()) return;
    setBusy(true);
    setMessage("");
    setError("");
    const result = await addCodesBulkAction(variant.productId, bulk);
    if (result.ok) {
      setMessage(`${result.added ?? 0} importé(s), ${result.skipped ?? 0} doublon(s) ignoré(s).`);
      setBulk("");
      await onChanged();
      await loadCodes();
    } else {
      setError(result.error ?? "Impossible d'importer les codes.");
    }
    setBusy(false);
  }

  async function handleDisable(codeId: string) {
    setBusy(true);
    setMessage("");
    setError("");
    const result = await disableCodeAction(codeId);
    if (!result.ok) setError(result.error ?? "Impossible de désactiver le code.");
    await onChanged();
    await loadCodes();
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-border-strong bg-base shadow-card">
        <div className="sticky top-0 z-10 border-b border-border bg-base/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">{product.productName}</p>
              <h3 className="mt-1 text-lg font-bold text-white">{variant.name}</h3>
            </div>
            <button type="button" onClick={onClose} className="btn-ghost h-9 px-3 text-xs">
              Fermer
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section className="grid grid-cols-3 gap-3">
            <Metric label="Disponibles" value={variant.unused} tone="text-green-400" />
            <Metric label="Réservés" value={variant.reserved} tone="text-amber-400" />
            <Metric label="Utilisés" value={variant.used} tone="text-muted" />
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <label className="mb-2 block text-sm font-medium text-white">
              Collez un code par ligne
            </label>
            <textarea
              value={bulk}
              onChange={(event) => setBulk(event.target.value)}
              rows={6}
              placeholder={"AAAA-BBBB-CCCC\nDDDD-EEEE-FFFF\nGGGG-HHHH-IIII"}
              className="input min-h-36 py-3 font-mono text-sm"
            />
            <button
              type="button"
              onClick={handleImport}
              disabled={busy || !bulk.trim()}
              className="btn-primary mt-3 h-10 px-4 text-xs disabled:opacity-50"
            >
              Importer les codes
            </button>
          </section>

          {message ? <p className="text-xs text-accent">{message}</p> : null}
          {error ? <p className="text-xs text-red-400">{error}</p> : null}

          <section className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h4 className="text-sm font-semibold text-white">Codes numériques</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 font-medium">Mis à jour</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !loaded ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-5 text-muted">
                        Chargement des codes...
                      </td>
                    </tr>
                  ) : codes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-5 text-muted">
                        Aucun code pour cette variante.
                      </td>
                    </tr>
                  ) : (
                    codes.map((code) => (
                      <tr key={code.id} className="border-b border-border/60">
                        <td className="px-4 py-3 font-mono text-xs text-white">
                          {code.code}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              STATUS_STYLES[code.status] ?? "bg-muted/15 text-muted"
                            }`}
                          >
                            {code.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {code.usedAt ? formatDate(code.usedAt) : formatDate(code.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          {code.status === "used" || code.status === "disabled" ? (
                            <span className="text-[11px] text-faint">Verrouillé</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDisable(code.id)}
                              disabled={busy}
                              className="text-[11px] font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                            >
                              Désactiver
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
