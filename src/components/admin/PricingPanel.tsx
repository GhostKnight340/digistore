"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate, timeAgoFr } from "@/lib/format";
import {
  getPricingOverviewAction,
  runReloadlyCostSyncAction,
  savePricingSettingsAction,
  publishSuggestedPriceAction,
  publishSuggestedPricesAction,
  setVariantPricingOverridesAction,
  setProductMarginOverrideAction,
  setCategoryMarginOverrideAction,
} from "@/app/actions/pricing";
import type {
  PricingOverviewDTO,
  PricingRowDTO,
  PricingRowStatus,
  PricingSettingsDTO,
} from "@/lib/dto";

const STATUS_META: Record<PricingRowStatus, { label: string; cls: string }> = {
  up_to_date: { label: "À jour", cls: "border-green-500/40 text-green-400" },
  changed: { label: "Prix suggéré modifié", cls: "border-amber-500/50 text-amber-400" },
  missing_cost: { label: "Coût manquant", cls: "border-border-strong text-muted" },
  missing_fx: { label: "Taux de change manquant", cls: "border-red-500/40 text-red-400" },
  invalid_mapping: { label: "Mapping Reloadly invalide", cls: "border-red-500/40 text-red-400" },
};

const FILTERS: { id: "all" | PricingRowStatus; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "up_to_date", label: "À jour" },
  { id: "changed", label: "Prix suggéré modifié" },
  { id: "missing_cost", label: "Coût manquant" },
  { id: "missing_fx", label: "Taux manquant" },
  { id: "invalid_mapping", label: "Mapping invalide" },
];

function pct(value: number | null): string {
  return value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export default function PricingPanel() {
  const [data, setData] = useState<PricingOverviewDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | PricingRowStatus>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyVariant, setBusyVariant] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getPricingOverviewAction());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const result = await runReloadlyCostSyncAction();
      setNotice(
        result.ok
          ? `Sync ${result.environment} : ${result.productsSynced} produit(s), ${result.costsUpserted} coût(s) mis à jour.`
          : `Échec de la synchronisation : ${result.error ?? "erreur inconnue"}.`,
      );
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Échec de la synchronisation.");
    } finally {
      setSyncing(false);
    }
  }, [reload]);

  const rows = data?.rows ?? [];
  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const publishableSelected = useMemo(
    () =>
      [...selected].filter((id) => {
        const r = rows.find((x) => x.variantId === id);
        return r && r.suggestedPriceMad != null && r.status === "changed";
      }),
    [selected, rows],
  );

  const publishOne = useCallback(
    async (variantId: string) => {
      setBusyVariant(variantId);
      setNotice(null);
      try {
        const res = await publishSuggestedPriceAction(variantId);
        setNotice(
          res.ok
            ? `Prix publié : ${formatMAD(res.publishedPriceMad ?? 0)}.`
            : `Publication refusée : ${res.error}`,
        );
        await reload();
      } finally {
        setBusyVariant(null);
      }
    },
    [reload],
  );

  const publishSelected = useCallback(async () => {
    if (publishableSelected.length === 0) return;
    setNotice(null);
    const results = await publishSuggestedPricesAction(publishableSelected);
    const ok = results.filter((r) => r.ok).length;
    setNotice(`${ok}/${results.length} prix publié(s).`);
    setSelected(new Set());
    await reload();
  }, [publishableSelected, reload]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Tarification</h2>
          <p className="mt-1 text-sm text-muted">
            Coûts fournisseur Reloadly, prix suggérés et publication. Le prix client publié ne
            change jamais automatiquement.
          </p>
        </div>
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent-strong disabled:opacity-50"
        >
          {syncing ? "Synchronisation…" : "Synchroniser les coûts"}
        </button>
      </div>

      {data?.environment === "sandbox" && (
        <div className="rounded-2xl border-2 border-amber-500/60 bg-amber-500/10 px-5 py-3 text-sm text-amber-200">
          Environnement <strong>sandbox</strong> — ces coûts sont des données de test et sont
          stockés séparément des coûts de production.
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-border-strong bg-surface2 px-4 py-3 text-sm text-white">
          {notice}
        </div>
      )}

      {data?.lastSync && (
        <p className="text-xs text-faint">
          Dernière synchro ({data.lastSync.environment}) :{" "}
          <span className={data.lastSync.status === "failed" ? "text-red-400" : "text-muted"}>
            {data.lastSync.status}
          </span>{" "}
          — {data.lastSync.costsUpserted} coût(s),{" "}
          {data.lastSync.finishedAt
            ? `${timeAgoFr(data.lastSync.finishedAt)} (${formatDate(data.lastSync.finishedAt)})`
            : "en cours"}
          .
          {data.lastSync.error ? ` Erreur : ${data.lastSync.error}` : ""}
        </p>
      )}

      <SettingsCard settings={data?.settings} onSaved={reload} setNotice={setNotice} />

      <CategoryMargins rows={rows} onSaved={reload} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === f.id
                ? "border-accent/50 bg-accent/10 text-accent-strong"
                : "border-border-strong text-muted"
            }`}
          >
            {f.label}
            {f.id !== "all" && counts[f.id] ? ` (${counts[f.id]})` : ""}
          </button>
        ))}
      </div>

      {/* Bulk publish bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm">
          <span className="text-accent-strong">
            {selected.size} sélectionné(s) — {publishableSelected.length} publiable(s)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-border-strong px-3 py-1 text-xs text-muted"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={publishSelected}
              disabled={publishableSelected.length === 0}
              className="rounded-lg border border-accent/50 bg-accent/20 px-3 py-1 text-xs font-semibold text-accent-strong disabled:opacity-50"
            >
              Publier les prix sélectionnés
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">
          Aucune variante Reloadly {filter === "all" ? "" : "dans ce filtre"}. Mappez des variantes
          puis lancez une synchronisation des coûts.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-strong">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-surface2 text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-3 py-3"></th>
                <th className="px-3 py-3">Produit</th>
                <th className="px-3 py-3">Région</th>
                <th className="px-3 py-3">Valeur</th>
                <th className="px-3 py-3">Coût fourn.</th>
                <th className="px-3 py-3">Coût MAD</th>
                <th className="px-3 py-3">Suggéré</th>
                <th className="px-3 py-3">Publié</th>
                <th className="px-3 py-3">Profit brut</th>
                <th className="px-3 py-3">Marge</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <PricingRow
                  key={r.variantId}
                  row={r}
                  selected={selected.has(r.variantId)}
                  onToggle={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      next.has(r.variantId) ? next.delete(r.variantId) : next.add(r.variantId);
                      return next;
                    })
                  }
                  busy={busyVariant === r.variantId}
                  onPublish={() => publishOne(r.variantId)}
                  onRecalc={reload}
                  onSaved={reload}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Global settings ─────────────────────────────────────────────────────────

function SettingsCard({
  settings,
  onSaved,
  setNotice,
}: {
  settings: PricingSettingsDTO | undefined;
  onSaved: () => void;
  setNotice: (s: string | null) => void;
}) {
  const [draft, setDraft] = useState<PricingSettingsDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCode, setNewCode] = useState("");

  useEffect(() => {
    if (settings) setDraft(JSON.parse(JSON.stringify(settings)));
  }, [settings]);

  if (!draft) return null;

  const save = async () => {
    setSaving(true);
    try {
      await savePricingSettingsAction(draft);
      setNotice("Paramètres de tarification enregistrés.");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border-strong bg-card p-5">
      <h3 className="text-sm font-semibold text-white">Paramètres globaux</h3>
      <p className="mt-1 text-xs text-faint">
        Taux de change internes ghost.ma (pas de flux automatique), marge par défaut et arrondi.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-xs text-muted">Marge par défaut (%)</label>
          <input
            type="number"
            step="0.1"
            value={draft.defaultMarginPct}
            onChange={(e) => setDraft({ ...draft, defaultMarginPct: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-muted">Arrondi</label>
          <select
            value={draft.roundingIncrement}
            onChange={(e) =>
              setDraft({ ...draft, roundingIncrement: Number(e.target.value) as 1 | 5 | 10 })
            }
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white"
          >
            <option value={1}>1 MAD</option>
            <option value={5}>5 MAD</option>
            <option value={10}>10 MAD</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted">Mode d&apos;arrondi</label>
          <select
            value={draft.roundingMode}
            onChange={(e) =>
              setDraft({ ...draft, roundingMode: e.target.value as "nearest" | "up" })
            }
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white"
          >
            <option value="nearest">Au plus proche</option>
            <option value="up">Toujours au-dessus</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="text-xs text-muted">Taux de change internes (MAD pour 1 unité)</label>
        <div className="mt-2 flex flex-wrap gap-3">
          {Object.entries(draft.fxRatesToMad).map(([code, rate]) => (
            <div key={code} className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface2 px-3 py-2">
              <span className="font-mono text-xs text-muted">{code} →</span>
              <input
                type="number"
                step="0.01"
                value={rate}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    fxRatesToMad: { ...draft.fxRatesToMad, [code]: Number(e.target.value) },
                  })
                }
                className="w-24 bg-transparent text-sm text-white outline-none"
              />
              <span className="text-xs text-faint">MAD</span>
              <button
                type="button"
                onClick={() => {
                  const next = { ...draft.fxRatesToMad };
                  delete next[code];
                  setDraft({ ...draft, fxRatesToMad: next });
                }}
                className="text-xs text-red-400"
                aria-label={`Supprimer ${code}`}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="GBP"
              maxLength={3}
              className="w-20 rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => {
                if (newCode.length >= 2 && !draft.fxRatesToMad[newCode]) {
                  setDraft({ ...draft, fxRatesToMad: { ...draft.fxRatesToMad, [newCode]: 1 } });
                  setNewCode("");
                }
              }}
              className="rounded-lg border border-border-strong px-3 py-2 text-xs text-muted"
            >
              + Devise
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-xl border border-accent/50 bg-accent/20 px-4 py-2 text-sm font-semibold text-accent-strong disabled:opacity-50"
      >
        {saving ? "Enregistrement…" : "Enregistrer les paramètres"}
      </button>
    </section>
  );
}

// ─── Category margins ────────────────────────────────────────────────────────

function CategoryMargins({ rows, onSaved }: { rows: PricingRowDTO[]; onSaved: () => void }) {
  const categories = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const r of rows) if (!map.has(r.categoryId)) map.set(r.categoryId, r.categoryMarginPct);
    return [...map.entries()];
  }, [rows]);

  if (categories.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border-strong bg-card p-5">
      <h3 className="text-sm font-semibold text-white">Marges par catégorie</h3>
      <p className="mt-1 text-xs text-faint">
        Optionnel. Remplace la marge par défaut pour les produits d&apos;une catégorie.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {categories.map(([id, margin]) => (
          <CategoryMarginInput key={id} categoryId={id} value={margin} onSaved={onSaved} />
        ))}
      </div>
    </section>
  );
}

function CategoryMarginInput({
  categoryId,
  value,
  onSaved,
}: {
  categoryId: string;
  value: number | null;
  onSaved: () => void;
}) {
  const [v, setV] = useState(value == null ? "" : String(value));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setCategoryMarginOverrideAction(categoryId, v.trim() === "" ? null : Number(v));
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface2 px-3 py-2">
      <span className="text-xs text-muted">{categoryId}</span>
      <input
        type="number"
        step="0.1"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="défaut"
        className="w-16 bg-transparent text-sm text-white outline-none"
      />
      <span className="text-xs text-faint">%</span>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="text-xs text-accent-strong disabled:opacity-50"
      >
        ✓
      </button>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function PricingRow({
  row,
  selected,
  onToggle,
  busy,
  onPublish,
  onRecalc,
  onSaved,
}: {
  row: PricingRowDTO;
  selected: boolean;
  onToggle: () => void;
  busy: boolean;
  onPublish: () => void;
  onRecalc: () => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[row.status];
  const canPublish = row.suggestedPriceMad != null && row.status === "changed";

  return (
    <>
      <tr className="border-t border-border">
        <td className="px-3 py-3">
          <input type="checkbox" checked={selected} onChange={onToggle} />
        </td>
        <td className="px-3 py-3 text-white">{row.productName}</td>
        <td className="px-3 py-3 text-muted">{row.region}</td>
        <td className="px-3 py-3 text-muted">
          {row.faceValue != null ? `${row.faceValue} ${row.faceCurrency}` : row.variantLabel}
        </td>
        <td className="px-3 py-3 text-muted">
          {row.providerCost != null
            ? `${row.providerCost.toFixed(2)} ${row.supplierCurrency}`
            : "—"}
        </td>
        <td className="px-3 py-3 text-muted">
          {row.costInMad != null ? formatMAD(row.costInMad) : "—"}
        </td>
        <td className="px-3 py-3 font-semibold text-white">
          {row.suggestedPriceMad != null ? formatMAD(row.suggestedPriceMad) : "—"}
          {row.marginPct != null && (
            <span className="ml-1 text-xs text-faint">({row.marginPct}%)</span>
          )}
        </td>
        <td className="px-3 py-3 text-muted">{formatMAD(row.publishedPriceMad)}</td>
        <td className="px-3 py-3 text-muted">
          {row.expectedGrossProfitMad != null ? formatMAD(row.expectedGrossProfitMad) : "—"}
        </td>
        <td className="px-3 py-3 text-muted">{pct(row.expectedGrossMarginPct)}</td>
        <td className="px-3 py-3">
          <span className={`rounded-full border px-2 py-0.5 text-xs ${meta.cls}`}>{meta.label}</span>
          {row.status === "changed" && row.differenceMad != null && (
            <div className="mt-1 text-xs text-amber-400">
              {row.differenceMad > 0 ? "+" : ""}
              {formatMAD(row.differenceMad)} vs publié
            </div>
          )}
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRecalc}
              className="rounded-lg border border-border-strong px-2 py-1 text-xs text-muted"
            >
              Recalculer
            </button>
            <button
              type="button"
              onClick={onPublish}
              disabled={!canPublish || busy}
              className="rounded-lg border border-accent/50 bg-accent/20 px-2 py-1 text-xs font-semibold text-accent-strong disabled:opacity-40"
            >
              {busy ? "…" : "Publier ce prix"}
            </button>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded-lg border border-border-strong px-2 py-1 text-xs text-muted"
            >
              {open ? "Fermer" : "Overrides"}
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border bg-surface2/40">
          <td colSpan={12} className="px-3 py-3">
            <OverridesEditor row={row} onSaved={onSaved} />
          </td>
        </tr>
      )}
    </>
  );
}

function OverridesEditor({ row, onSaved }: { row: PricingRowDTO; onSaved: () => void }) {
  const [variantMargin, setVariantMargin] = useState(
    row.variantMarginPct == null ? "" : String(row.variantMarginPct),
  );
  const [productMargin, setProductMargin] = useState(
    row.productMarginPct == null ? "" : String(row.productMarginPct),
  );
  const [fixedPrice, setFixedPrice] = useState(
    row.variantFixedPriceMad == null ? "" : String(row.variantFixedPriceMad),
  );
  const [saving, setSaving] = useState(false);

  const parse = (s: string) => (s.trim() === "" ? null : Number(s));

  const save = async () => {
    setSaving(true);
    try {
      await setVariantPricingOverridesAction(row.variantId, {
        marginPctOverride: parse(variantMargin),
        fixedSuggestedPriceMad: parse(fixedPrice),
      });
      await setProductMarginOverrideAction(row.productId, parse(productMargin));
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      <Field label="Marge variante (%)" value={variantMargin} onChange={setVariantMargin} placeholder="hérite" />
      <Field label="Marge produit (%)" value={productMargin} onChange={setProductMargin} placeholder="hérite" />
      <Field
        label="Prix fixe suggéré (MAD)"
        value={fixedPrice}
        onChange={setFixedPrice}
        placeholder="calculé"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-lg border border-accent/50 bg-accent/20 px-3 py-2 text-xs font-semibold text-accent-strong disabled:opacity-50"
      >
        {saving ? "Enregistrement…" : "Enregistrer les overrides"}
      </button>
      <p className="w-full text-xs text-faint">
        Les overrides n&apos;affectent que le <strong>prix suggéré</strong>. Le prix publié ne change
        qu&apos;avec « Publier ce prix ».
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted">{label}</label>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-36 rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-white"
      />
    </div>
  );
}
