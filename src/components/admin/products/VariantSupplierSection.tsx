"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteVariantMappingAction,
  getVariantSupplyAction,
  listFazerCardsCategoriesAction,
  listFazerCardsOffersAction,
  reorderVariantMappingsAction,
  saveVariantMappingAction,
  setManualFulfillmentAction,
  setVariantMappingEnabledAction,
  validateVariantMappingAction,
} from "@/app/actions/variantMappings";
import { searchReloadlyCatalogAction } from "@/app/actions/suppliers";
import type {
  FazerCardsCatalogOfferDTO,
  MappingWarningCode,
  SaveVariantMappingInput,
  VariantMappingDTO,
  VariantSupplyDTO,
} from "@/lib/dto";

/**
 * "Approvisionnement" — the variant editor's supplier-mapping manager.
 * Everything here is admin-only and display/config: no purchase can be
 * triggered from this section ("Vérifier" is a read-only catalog check).
 */

const WARNING_LABELS: Record<MappingWarningCode, string> = {
  validation_failed: "Dernière vérification échouée",
  never_validated: "Jamais vérifié",
  supplier_disabled: "Fournisseur désactivé globalement",
  supplier_unconfigured: "Fournisseur non configuré",
  mapping_incomplete: "Mapping incomplet",
  cost_missing: "Coût fournisseur manquant",
  cost_stale: "Coût fournisseur obsolète",
  cost_above_price: "Coût ≥ prix de vente",
  low_margin: "Marge faible",
  region_mismatch: "Région fournisseur ≠ région Ghost",
  denomination_mismatch: "Dénomination ≠ valeur faciale de la variante",
};

const SUMMARY_STYLES: Record<string, { bg: string; color: string }> = {
  ready: { bg: "rgba(46,160,103,0.12)", color: "#5BC98C" },
  manual_only: { bg: "rgba(127,166,255,0.12)", color: "#9FB8FF" },
  incomplete: { bg: "rgba(232,168,56,0.12)", color: "#F0C466" },
  none: { bg: "rgba(229,72,77,0.12)", color: "#F08084" },
};

const FAZERCARDS_KINDS = [
  { value: "gift_card", label: "Carte cadeau" },
  { value: "topup", label: "Recharge (top-up)" },
  { value: "game_key", label: "Clé de jeu" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function VariantSupplierSection({ variantId }: { variantId: string }) {
  const [supply, setSupply] = useState<VariantSupplyDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState<"reloadly" | "fazercards" | null>(null);
  const [editing, setEditing] = useState<VariantMappingDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const data = await getVariantSupplyAction(variantId);
    setSupply(data);
    setLoading(false);
  }, [variantId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  async function run(label: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) {
        setMessage({ ok: false, text: result.error ?? "Opération impossible." });
      } else if (label) {
        setMessage({ ok: true, text: label });
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-4 space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }
  if (!supply) return null;

  const summaryStyle = SUMMARY_STYLES[supply.summary] ?? SUMMARY_STYLES.none;
  const existingSuppliers = new Set(supply.mappings.map((mapping) => mapping.supplier));
  const orderedIds = supply.mappings.map((mapping) => mapping.id);

  return (
    <div className="mt-5 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h4 className="text-[13.5px] font-semibold text-white">Approvisionnement</h4>
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ background: summaryStyle.bg, color: summaryStyle.color }}
          >
            {supply.summaryLabel}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={supply.manualFulfillmentAllowed}
            disabled={busy}
            onChange={(e) =>
              run(
                e.target.checked ? "Livraison manuelle autorisée." : "Livraison manuelle désactivée.",
                () => setManualFulfillmentAction(variantId, e.target.checked),
              )
            }
          />
          Livraison manuelle autorisée
        </label>
      </div>

      {message && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            message.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      {supply.mappings.length === 0 && (
        <p className="mt-3 text-xs text-faint">
          Aucun fournisseur mappé — cette variante ne peut être livrée que manuellement
          {supply.manualFulfillmentAllowed ? "." : ", et la livraison manuelle est désactivée."}
        </p>
      )}

      <div className="mt-3 space-y-2.5">
        {supply.mappings.map((mapping, index) => (
          <MappingCard
            key={mapping.id}
            mapping={mapping}
            index={index}
            total={supply.mappings.length}
            sellingPriceMad={supply.sellingPriceMad}
            busy={busy}
            onToggle={(enabled) =>
              run(enabled ? "Mapping activé." : "Mapping désactivé.", () =>
                setVariantMappingEnabledAction(mapping.id, enabled),
              )
            }
            onDelete={() =>
              run("Mapping supprimé.", () => deleteVariantMappingAction(mapping.id))
            }
            onValidate={async () => {
              setBusy(true);
              setMessage(null);
              try {
                const result = await validateVariantMappingAction(mapping.id);
                setMessage({ ok: result.ok, text: result.message });
                await refresh();
              } finally {
                setBusy(false);
              }
            }}
            onMove={(direction) => {
              const next = [...orderedIds];
              const target = index + direction;
              if (target < 0 || target >= next.length) return;
              [next[index], next[target]] = [next[target], next[index]];
              void run("Priorité mise à jour.", () =>
                reorderVariantMappingsAction(variantId, next),
              );
            }}
            onEdit={() => {
              setEditing(mapping);
              setAdding(null);
            }}
          />
        ))}
      </div>

      {(adding || editing) && (
        <MappingForm
          variantId={variantId}
          supplier={editing ? (editing.supplier as "reloadly" | "fazercards") : adding!}
          existing={editing}
          variantFaceValue={supply.variantFaceValue}
          variantFaceCurrency={supply.variantFaceCurrency}
          busy={busy}
          onCancel={() => {
            setAdding(null);
            setEditing(null);
          }}
          onSave={async (input) => {
            setBusy(true);
            setMessage(null);
            try {
              const result = await saveVariantMappingAction(input);
              if (!result.ok) {
                setMessage({ ok: false, text: result.error ?? "Enregistrement impossible." });
              } else {
                // Mapping is auto-vérifié on save — surface the check result
                // (and the automatic manual-delivery switch-off) directly.
                const parts = [editing ? "Mapping mis à jour." : "Mapping ajouté."];
                if (result.validation) {
                  parts.push(
                    result.validation.ok
                      ? `Vérifié : ${result.validation.message}`
                      : `Vérification échouée : ${result.validation.message}`,
                  );
                }
                if (result.manualDisabled) {
                  parts.push("Livraison manuelle désactivée automatiquement (fournisseur automatique en place).");
                }
                setMessage({ ok: result.validation ? result.validation.ok : true, text: parts.join(" ") });
                setAdding(null);
                setEditing(null);
              }
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {!adding && !editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!existingSuppliers.has("reloadly") && (
            <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={() => setAdding("reloadly")}>
              + Mapping Reloadly
            </button>
          )}
          {!existingSuppliers.has("fazercards") && (
            <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={() => setAdding("fazercards")}>
              + Mapping FazerCards
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MappingCard({
  mapping,
  index,
  total,
  busy,
  onToggle,
  onDelete,
  onValidate,
  onMove,
  onEdit,
}: {
  mapping: VariantMappingDTO;
  index: number;
  total: number;
  sellingPriceMad: number;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onValidate: () => void;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const role = mapping.priority === 1 ? "Préféré" : mapping.priority === 2 ? "Secours" : `Priorité ${mapping.priority}`;

  return (
    <div className={`rounded-xl border border-border p-3 ${mapping.enabled ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold text-white"
          style={{
            background: `linear-gradient(150deg, ${mapping.supplierAccentColor}55, ${mapping.supplierAccentColor}22)`,
            border: `1px solid ${mapping.supplierAccentColor}66`,
          }}
        >
          {mapping.supplierInitials}
        </span>
        <span className="text-[13px] font-semibold text-white">{mapping.supplierName}</span>
        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10.5px] font-medium text-muted">{role}</span>
        {mapping.lastValidationOk === true && (
          <span className="text-[10.5px] text-green-400">✓ vérifié {formatDate(mapping.lastValidatedAt)}</span>
        )}
        {mapping.lastValidationOk === false && (
          <span className="text-[10.5px] text-red-400">✕ vérification échouée</span>
        )}
        <span className="flex-1" />
        <button type="button" className="btn-ghost h-7 px-2 text-[11px]" disabled={busy || index === 0} onClick={() => onMove(-1)} aria-label="Monter la priorité">
          ↑
        </button>
        <button type="button" className="btn-ghost h-7 px-2 text-[11px]" disabled={busy || index === total - 1} onClick={() => onMove(1)} aria-label="Descendre la priorité">
          ↓
        </button>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-muted sm:grid-cols-4">
        <div>
          <dt className="text-[9.5px] uppercase tracking-wide text-faint">ID produit</dt>
          <dd className="truncate font-mono">{mapping.supplierProductId}</dd>
        </div>
        <div>
          <dt className="text-[9.5px] uppercase tracking-wide text-faint">Nom fournisseur</dt>
          <dd className="truncate">{mapping.supplierProductName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[9.5px] uppercase tracking-wide text-faint">Dénomination · Région</dt>
          <dd>
            {mapping.faceValue != null ? `${mapping.faceValue} ${mapping.faceCurrency ?? ""}` : "—"}
            {" · "}
            {mapping.supplierRegion ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[9.5px] uppercase tracking-wide text-faint">Coût · Marge</dt>
          <dd>
            {mapping.costAmount != null ? `${mapping.costAmount} ${mapping.costCurrency ?? ""}` : "—"}
            {" · "}
            {mapping.margin.computable ? (
              <span className={mapping.margin.marginMad <= 0 ? "text-red-400" : "text-green-400"}>
                {mapping.margin.marginMad} DH ({mapping.margin.marginPct}%)
              </span>
            ) : (
              <span className="text-faint">
                {mapping.margin.reason === "missing_fx_rate" ? "taux FX manquant" : "coût manquant"}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {mapping.warnings.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {mapping.warnings.map((warning) => (
            <span key={warning} className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-400">
              ⚠ {WARNING_LABELS[warning]}
            </span>
          ))}
        </div>
      )}
      {mapping.lastValidationMessage && mapping.lastValidationOk === false && (
        <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-400">
          {mapping.lastValidationMessage}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
        <button type="button" className="btn-ghost h-7 px-2.5 text-[11px]" disabled={busy} onClick={onValidate}>
          Vérifier le mapping
        </button>
        <button type="button" className="btn-ghost h-7 px-2.5 text-[11px]" disabled={busy} onClick={onEdit}>
          Modifier
        </button>
        <button
          type="button"
          className="btn-ghost h-7 px-2.5 text-[11px]"
          disabled={busy}
          onClick={() => onToggle(!mapping.enabled)}
        >
          {mapping.enabled ? "Désactiver" : "Activer"}
        </button>
        <span className="flex-1" />
        {confirmDelete ? (
          <>
            <span className="text-[11px] text-amber-400">Supprimer ce mapping ?</span>
            <button
              type="button"
              className="h-7 rounded-md bg-red-500/15 px-2.5 text-[11px] font-medium text-red-400"
              disabled={busy}
              onClick={onDelete}
            >
              Oui, supprimer
            </button>
            <button type="button" className="btn-ghost h-7 px-2.5 text-[11px]" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
          </>
        ) : (
          <button
            type="button"
            className="h-7 rounded-md px-2.5 text-[11px] text-red-400/80 hover:bg-red-500/10"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add/edit form with catalog assistance ────────────────────────────────────

function MappingForm({
  variantId,
  supplier,
  existing,
  variantFaceValue,
  variantFaceCurrency,
  busy,
  onCancel,
  onSave,
}: {
  variantId: string;
  supplier: "reloadly" | "fazercards";
  existing: VariantMappingDTO | null;
  variantFaceValue: number | null;
  variantFaceCurrency: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: SaveVariantMappingInput) => Promise<void>;
}) {
  const [form, setForm] = useState<SaveVariantMappingInput>({
    id: existing?.id,
    variantId,
    supplier,
    supplierProductId: existing?.supplierProductId ?? "",
    supplierCategoryId: existing?.supplierCategoryId ?? null,
    supplierKind: existing?.supplierKind ?? (supplier === "fazercards" ? "gift_card" : null),
    supplierProductName: existing?.supplierProductName ?? null,
    supplierRegion: existing?.supplierRegion ?? null,
    faceValue: existing?.faceValue ?? variantFaceValue,
    faceCurrency: existing?.faceCurrency ?? variantFaceCurrency,
    costAmount: existing?.costAmount ?? null,
    costCurrency: existing?.costCurrency ?? null,
    enabled: existing?.enabled ?? true,
    autoFulfillEnabled: existing?.autoFulfillEnabled ?? true,
  });

  function patch(partial: Partial<SaveVariantMappingInput>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  return (
    <div className="mt-3 rounded-xl border border-border-strong bg-surface2/40 p-3">
      <p className="text-xs font-semibold text-white">
        {existing ? "Modifier le mapping" : "Nouveau mapping"} —{" "}
        {supplier === "reloadly" ? "Reloadly" : "FazerCards"}
      </p>

      {supplier === "reloadly" ? (
        <ReloadlyPicker
          onPick={(picked) =>
            patch({
              supplierProductId: String(picked.productId),
              supplierProductName: picked.productName,
              supplierRegion: picked.country,
              faceCurrency: picked.currency,
            })
          }
        />
      ) : (
        <FazerCardsPicker
          kind={(form.supplierKind as "gift_card" | "topup") ?? "gift_card"}
          onKind={(kind) => patch({ supplierKind: kind })}
          categoryId={form.supplierCategoryId ?? null}
          onCategory={(categoryId) => patch({ supplierCategoryId: categoryId })}
          onPick={(offer) =>
            patch({
              supplierProductId: offer.offerId,
              supplierProductName: offer.name,
              costAmount: Number(offer.priceUsd),
              costCurrency: "USD",
            })
          }
        />
      )}

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <FormField label={supplier === "reloadly" ? "Product ID Reloadly" : "Card / Offer / Key ID"}>
          <input
            className="input h-8 py-0 text-xs"
            value={form.supplierProductId}
            onChange={(e) => patch({ supplierProductId: e.target.value })}
            placeholder={supplier === "reloadly" ? "ex. 18681" : "ex. card_10usd"}
          />
        </FormField>
        {supplier === "fazercards" && (
          <FormField label="Category / Game ID">
            <input
              className="input h-8 py-0 text-xs"
              value={form.supplierCategoryId ?? ""}
              onChange={(e) => patch({ supplierCategoryId: e.target.value || null })}
              placeholder="ex. gc_steam_1"
            />
          </FormField>
        )}
        <FormField label="Nom produit fournisseur">
          <input
            className="input h-8 py-0 text-xs"
            value={form.supplierProductName ?? ""}
            onChange={(e) => patch({ supplierProductName: e.target.value || null })}
          />
        </FormField>
        <FormField label="Région fournisseur">
          <input
            className="input h-8 py-0 text-xs"
            value={form.supplierRegion ?? ""}
            onChange={(e) => patch({ supplierRegion: e.target.value.toUpperCase() || null })}
            placeholder="ex. US"
          />
        </FormField>
        <FormField label="Dénomination">
          <input
            className="input h-8 py-0 text-xs"
            type="number"
            value={form.faceValue ?? ""}
            onChange={(e) => patch({ faceValue: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </FormField>
        <FormField label="Devise dénomination">
          <input
            className="input h-8 py-0 text-xs"
            value={form.faceCurrency ?? ""}
            onChange={(e) => patch({ faceCurrency: e.target.value.toUpperCase() || null })}
            placeholder="USD"
          />
        </FormField>
        <FormField label="Coût fournisseur">
          <input
            className="input h-8 py-0 text-xs"
            type="number"
            step="0.01"
            value={form.costAmount ?? ""}
            onChange={(e) => patch({ costAmount: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </FormField>
        <FormField label="Devise du coût">
          <input
            className="input h-8 py-0 text-xs"
            value={form.costCurrency ?? ""}
            onChange={(e) => patch({ costCurrency: e.target.value.toUpperCase() || null })}
            placeholder="USD"
          />
        </FormField>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={form.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          Mapping actif
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={form.autoFulfillEnabled}
            onChange={(e) => patch({ autoFulfillEnabled: e.target.checked })}
          />
          Livraison automatique autorisée
        </label>
        <span className="flex-1" />
        <button type="button" className="btn-ghost h-8 px-3 text-xs" disabled={busy} onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="btn-primary h-8 px-3 text-xs disabled:opacity-60"
          disabled={busy || !form.supplierProductId.trim()}
          onClick={() => void onSave(form)}
        >
          {busy ? "Enregistrement…" : "Enregistrer le mapping"}
        </button>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9.5px] font-medium uppercase tracking-wide text-faint">{label}</span>
      {children}
    </label>
  );
}

/** Reloadly catalog search — reuses the importer's search action. */
function ReloadlyPicker({
  onPick,
}: {
  onPick: (product: { productId: number; productName: string; country: string; currency: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [results, setResults] = useState<
    { productId: number; productName: string; country: string; currency: string; denominationType: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setSearching(true);
    setError(null);
    try {
      const result = await searchReloadlyCatalogAction({
        query: query.trim() || undefined,
        countryCode: country.trim().toUpperCase() || undefined,
        page: 0,
        size: 20,
      });
      if (!result.ok) {
        setError(result.error);
        setResults([]);
        return;
      }
      setResults(
        result.data.products.slice(0, 8).map((product) => ({
          productId: product.productId,
          productName: product.productName,
          country: product.country,
          currency: product.currency,
          denominationType: product.denominationType,
        })),
      );
      if (result.data.products.length === 0) setError("Aucun produit Reloadly trouvé.");
    } catch {
      setError("Recherche Reloadly indisponible (identifiants ou réseau).");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mt-2.5 rounded-lg border border-border/60 p-2.5">
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-faint">
        Recherche catalogue Reloadly (nom, marque, pays)
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          className="input h-8 py-0 flex-1 text-xs"
          placeholder="ex. Steam, Google Play…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
        />
        <input
          className="input h-8 py-0 w-20 text-xs"
          placeholder="Pays"
          maxLength={2}
          value={country}
          onChange={(e) => setCountry(e.target.value.toUpperCase())}
        />
        <button type="button" className="btn-ghost h-8 px-3 text-xs" disabled={searching} onClick={() => void search()}>
          {searching ? "…" : "Rechercher"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-amber-400">{error}</p>}
      {results.length > 0 && (
        <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">
          {results.map((product) => (
            <li key={product.productId}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-[11.5px] text-muted hover:bg-white/5"
                onClick={() => onPick(product)}
              >
                <span className="text-white">{product.productName}</span>{" "}
                <span className="font-mono text-faint">#{product.productId}</span> · {product.country} ·{" "}
                {product.currency} · {product.denominationType}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** FazerCards catalog assistance: kind → category → offer. */
function FazerCardsPicker({
  kind,
  onKind,
  categoryId,
  onCategory,
  onPick,
}: {
  kind: "gift_card" | "topup";
  onKind: (kind: string) => void;
  categoryId: string | null;
  onCategory: (categoryId: string | null) => void;
  onPick: (offer: FazerCardsCatalogOfferDTO) => void;
}) {
  const [categories, setCategories] = useState<{ categoryId: string; name: string }[]>([]);
  const [offers, setOffers] = useState<FazerCardsCatalogOfferDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  useEffect(() => {
    if (kind !== "gift_card" && kind !== "topup") return;
    let cancelled = false;
    setLoadingCatalog(true);
    setError(null);
    listFazerCardsCategoriesAction({ kind })
      .then((result) => {
        if (cancelled) return;
        setCategories(result.items);
        if (!result.ok) setError(result.error ?? "Catalogue FazerCards indisponible.");
      })
      .finally(() => !cancelled && setLoadingCatalog(false));
    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    if (!categoryId || (kind !== "gift_card" && kind !== "topup")) {
      setOffers([]);
      return;
    }
    let cancelled = false;
    listFazerCardsOffersAction({ kind, categoryId }).then((result) => {
      if (cancelled) return;
      setOffers(result.items);
      if (!result.ok) setError(result.error ?? "Offres FazerCards indisponibles.");
    });
    return () => {
      cancelled = true;
    };
  }, [kind, categoryId]);

  return (
    <div className="mt-2.5 rounded-lg border border-border/60 p-2.5">
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-faint">
        Catalogue FazerCards (nécessite la clé API)
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <select className="input h-8 py-0 w-40 text-xs" value={kind} onChange={(e) => onKind(e.target.value)}>
          {FAZERCARDS_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="input h-8 py-0 flex-1 text-xs"
          value={categoryId ?? ""}
          onChange={(e) => onCategory(e.target.value || null)}
          disabled={loadingCatalog || categories.length === 0}
        >
          <option value="">
            {loadingCatalog ? "Chargement…" : categories.length ? "Choisir une catégorie…" : "Catalogue indisponible"}
          </option>
          {categories.map((category) => (
            <option key={category.categoryId} value={category.categoryId}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-amber-400">{error}</p>}
      {offers.length > 0 && (
        <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">
          {offers.map((offer) => (
            <li key={offer.offerId}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-[11.5px] text-muted hover:bg-white/5"
                onClick={() => onPick(offer)}
              >
                <span className="text-white">{offer.name}</span>{" "}
                <span className="font-mono text-faint">{offer.offerId}</span> · {offer.priceUsd} USD
                {offer.stock != null ? ` · stock ${offer.stock}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
