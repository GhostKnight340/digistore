"use client";

import { useCallback, useEffect, useState } from "react";
import { categories, getCategory } from "@/lib/products";
import { formatMAD, formatFaceValue, variantTitle } from "@/lib/format";
import {
  getCatalogAction,
  saveParentProductAction,
  saveVariantAction,
  deleteCatalogVariantAction,
  deactivateParentAction,
} from "@/app/actions/admin";
import type { CatalogParent, CatalogVariant } from "@/lib/db/catalog";

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESET_CURRENCIES = ["EUR", "USD", "GBP", "MAD", "TRY", "Robux", "VP"];

// ── Shared form primitives ────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-faint">
      {children}
    </p>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  className = "",
  type = "text",
  min,
  step,
  disabled,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  min?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      step={step}
      disabled={disabled}
      className={`input w-full text-sm ${className}`}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="input w-full resize-y text-sm leading-relaxed"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-surface2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="text-sm text-muted">{label}</span>
    </label>
  );
}

function CurrencySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isPreset = PRESET_CURRENCIES.includes(value);
  const [custom, setCustom] = useState(!isPreset ? value : "");
  const [showCustom, setShowCustom] = useState(!isPreset);

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === "__custom__") {
      setShowCustom(true);
      onChange(custom || "");
    } else {
      setShowCustom(false);
      onChange(v);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={showCustom ? "__custom__" : value}
        onChange={handleSelect}
        className="input w-full text-sm"
      >
        {PRESET_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value="__custom__">Autre…</option>
      </select>
      {showCustom && (
        <input
          type="text"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="ex : SGD, Gems…"
          className="input w-full text-sm"
          autoFocus
        />
      )}
    </div>
  );
}

// ── Parent form ───────────────────────────────────────────────────────────────

interface ParentFormState {
  slug: string;
  name: string;
  category: string;
  brand: string;
  region: string;
  deliveryType: string;
  description: string;
  shortDescription: string;
  longDescription: string;
  instructions: string;
  thumbnail: string;
  active: boolean;
}

function emptyParentForm(): ParentFormState {
  return {
    slug: "",
    name: "",
    category: categories[0]?.id ?? "",
    brand: "",
    region: "",
    deliveryType: "Code numérique instantané",
    description: "",
    shortDescription: "",
    longDescription: "",
    instructions: "",
    thumbnail: "",
    active: true,
  };
}

function parentToForm(p: CatalogParent): ParentFormState {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    brand: p.brand ?? "",
    region: p.region,
    deliveryType: p.deliveryType,
    description: p.description,
    shortDescription: p.shortDescription ?? "",
    longDescription: p.longDescription ?? "",
    instructions: p.instructions ?? "",
    thumbnail: p.thumbnail ?? "",
    active: p.active,
  };
}

function ParentForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ParentFormState;
  onSave: (data: ParentFormState) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ParentFormState>(initial);
  const patch = (partial: Partial<ParentFormState>) =>
    setForm((f) => ({ ...f, ...partial }));

  return (
    <div className="rounded-2xl border border-accent/30 bg-surface p-5 space-y-4">
      <p className="text-xs font-bold uppercase tracking-widest text-accent mb-2">
        {initial.slug ? "Modifier le produit parent" : "Nouveau produit parent"}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>Nom</FieldLabel>
          <TextInput value={form.name} onChange={(v) => patch({ name: v })} placeholder="Steam Wallet" />
        </div>
        <div>
          <FieldLabel>Catégorie</FieldLabel>
          <select
            value={form.category}
            onChange={(e) => patch({ category: e.target.value })}
            className="input w-full text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Marque</FieldLabel>
          <TextInput value={form.brand} onChange={(v) => patch({ brand: v })} placeholder="Valve, Sony…" />
        </div>
        <div>
          <FieldLabel>Région</FieldLabel>
          <TextInput value={form.region} onChange={(v) => patch({ region: v })} placeholder="Global, EU, Maroc…" />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Type de livraison</FieldLabel>
          <TextInput
            value={form.deliveryType}
            onChange={(v) => patch({ deliveryType: v })}
            placeholder="Code numérique instantané"
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Description courte</FieldLabel>
          <TextArea
            value={form.shortDescription}
            onChange={(v) => patch({ shortDescription: v })}
            placeholder="Description affichée sur les cards…"
            rows={2}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Description principale</FieldLabel>
          <TextArea
            value={form.description}
            onChange={(v) => patch({ description: v })}
            placeholder="Description du produit…"
            rows={3}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Description longue</FieldLabel>
          <TextArea
            value={form.longDescription}
            onChange={(v) => patch({ longDescription: v })}
            placeholder="Description complète…"
            rows={4}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Instructions (une étape par ligne)</FieldLabel>
          <TextArea
            value={form.instructions}
            onChange={(v) => patch({ instructions: v })}
            placeholder={"1. Connectez-vous…\n2. Accédez à…"}
            rows={5}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>URL de la vignette</FieldLabel>
          <TextInput
            value={form.thumbnail}
            onChange={(v) => patch({ thumbnail: v })}
            placeholder="https://…"
          />
        </div>
        {!initial.slug && (
          <div className="sm:col-span-2">
            <FieldLabel>Slug (laisser vide pour générer automatiquement)</FieldLabel>
            <TextInput
              value={form.slug}
              onChange={(v) => patch({ slug: v })}
              placeholder="steam-wallet"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <Toggle
          checked={form.active}
          onChange={(v) => patch({ active: v })}
          label="Actif"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
          className="btn-primary h-9 px-5 text-sm disabled:opacity-40"
        >
          {saving ? "Sauvegarde…" : "Sauvegarder"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-ghost h-9 px-4 text-sm"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Variant form ──────────────────────────────────────────────────────────────

interface VariantFormState {
  variantSlug: string;
  faceValue: number;
  faceCurrency: string;
  priceMad: number;
  featured: boolean;
  active: boolean;
}

function emptyVariantForm(): VariantFormState {
  return {
    variantSlug: "",
    faceValue: 0,
    faceCurrency: "MAD",
    priceMad: 0,
    featured: false,
    active: true,
  };
}

function variantToForm(v: CatalogVariant): VariantFormState {
  return {
    variantSlug: v.slug,
    faceValue: v.faceValue ?? 0,
    faceCurrency: v.faceCurrency,
    priceMad: v.priceMad,
    featured: v.featured,
    active: v.active,
  };
}

function VariantForm({
  initial,
  parentSlug,
  parentName,
  onSave,
  onCancel,
  saving,
}: {
  initial: VariantFormState;
  parentSlug: string;
  parentName: string;
  onSave: (data: VariantFormState) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<VariantFormState>(initial);
  const patch = (partial: Partial<VariantFormState>) =>
    setForm((f) => ({ ...f, ...partial }));

  const hasForeignFace = form.faceCurrency !== "MAD" && form.faceValue > 0;
  const previewTitle =
    form.faceValue > 0 ? variantTitle(parentName, form.faceValue, form.faceCurrency) : "";

  return (
    <div className="rounded-xl border border-border bg-base p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-faint">
        {initial.variantSlug ? "Modifier la variante" : "Nouvelle variante"}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Valeur faciale</FieldLabel>
          <TextInput
            type="number"
            value={form.faceValue || ""}
            onChange={(v) => patch({ faceValue: parseFloat(v) || 0 })}
            placeholder="100"
            min={0}
            step={0.01}
          />
        </div>
        <div>
          <FieldLabel>Devise</FieldLabel>
          <CurrencySelect
            value={form.faceCurrency}
            onChange={(v) => patch({ faceCurrency: v })}
          />
        </div>
        <div className="col-span-2">
          <FieldLabel>Prix de vente (MAD)</FieldLabel>
          <TextInput
            type="number"
            value={form.priceMad || ""}
            onChange={(v) => patch({ priceMad: parseFloat(v) || 0 })}
            placeholder="100"
            min={0}
            step={1}
          />
        </div>
      </div>

      {hasForeignFace && (
        <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-[12px] text-muted">
          Aperçu :{" "}
          <span className="text-white">
            {formatFaceValue(form.faceValue, form.faceCurrency)}
          </span>
          {" → "}
          <span className="font-semibold text-accent">{formatMAD(form.priceMad)}</span>
          {previewTitle && (
            <span className="ml-2 text-faint">· {previewTitle}</span>
          )}
        </div>
      )}

      {!initial.variantSlug && (
        <div>
          <FieldLabel>Slug (laisser vide pour générer automatiquement)</FieldLabel>
          <TextInput
            value={form.variantSlug}
            onChange={(v) => patch({ variantSlug: v })}
            placeholder={`${parentSlug}-${form.faceValue || ""}${form.faceCurrency.toLowerCase()}`}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <Toggle
          checked={form.featured}
          onChange={(v) => patch({ featured: v })}
          label="Mis en avant (homepage)"
        />
        <Toggle
          checked={form.active}
          onChange={(v) => patch({ active: v })}
          label="Actif"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving || form.faceValue <= 0 || form.priceMad <= 0}
          className="btn-primary h-8 px-4 text-xs disabled:opacity-40"
        >
          {saving ? "Sauvegarde…" : "Sauvegarder"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-ghost h-8 px-3 text-xs"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Variant row ───────────────────────────────────────────────────────────────

function VariantRow({
  variant,
  parentName,
  editing,
  parentSlug,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  saving,
}: {
  variant: CatalogVariant;
  parentName: string;
  editing: boolean;
  parentSlug: string;
  onEdit: () => void;
  onSave: (data: VariantFormState) => Promise<void>;
  onCancel: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const title = variantTitle(parentName, variant.faceValue ?? 0, variant.faceCurrency);
  const hasForeignFace = variant.faceCurrency !== "MAD";

  if (editing) {
    return (
      <VariantForm
        initial={variantToForm(variant)}
        parentSlug={parentSlug}
        parentName={parentName}
        onSave={onSave}
        onCancel={onCancel}
        saving={saving}
      />
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-base px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-white">{title}</span>
          {variant.featured && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
              Mis en avant
            </span>
          )}
          {!variant.active && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
              Inactif
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-faint">{variant.slug}</span>
      </div>

      <div className="shrink-0 text-right">
        {hasForeignFace ? (
          <div className="text-xs text-muted">
            <span className="text-white">
              {formatFaceValue(variant.faceValue ?? 0, variant.faceCurrency)}
            </span>
            {" → "}
            <span className="font-semibold text-accent">{formatMAD(variant.priceMad)}</span>
          </div>
        ) : (
          <span className="text-sm font-semibold text-white">{formatMAD(variant.priceMad)}</span>
        )}
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="btn-ghost shrink-0 h-8 px-3 text-xs"
      >
        Modifier
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 h-8 px-2 text-xs text-red-400 hover:text-red-300 transition"
        title="Supprimer la variante"
      >
        ✕
      </button>
    </div>
  );
}

// ── Parent product row ────────────────────────────────────────────────────────

function ParentRow({
  parent,
  open,
  onToggle,
  editingParent,
  editingVariantSlug,
  addingVariant,
  onEditParent,
  onSaveParent,
  onCancelParent,
  onEditVariant,
  onSaveVariant,
  onCancelVariant,
  onDeleteVariant,
  onDeactivate,
  onAddVariant,
  saving,
}: {
  parent: CatalogParent;
  open: boolean;
  onToggle: () => void;
  editingParent: boolean;
  editingVariantSlug: string | null; // slug or "" (new)
  addingVariant: boolean;
  onEditParent: () => void;
  onSaveParent: (data: ParentFormState) => Promise<void>;
  onCancelParent: () => void;
  onEditVariant: (slug: string) => void;
  onSaveVariant: (data: VariantFormState) => Promise<void>;
  onCancelVariant: () => void;
  onDeleteVariant: (slug: string) => void;
  onDeactivate: () => void;
  onAddVariant: () => void;
  saving: boolean;
}) {
  const cat = getCategory(parent.category);
  const activeCount = parent.variants.filter((v) => v.active).length;

  return (
    <section className="card overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-2 px-5 py-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-white">{parent.name}</span>
              {parent.brand && (
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-faint">
                  {parent.brand}
                </span>
              )}
              {!parent.active && (
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                  Inactif
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
              <span className="font-mono">{parent.slug}</span>
              <span>{cat?.name}</span>
              <span>{parent.region}</span>
              <span>
                {activeCount}/{parent.variants.length} variantes actives
              </span>
            </div>
          </div>

          <div className="shrink-0 text-right text-xs text-faint">
            {parent.variants
              .filter((v) => v.active)
              .map((v) => formatMAD(v.priceMad))
              .join(" · ")}
          </div>

          <span className="shrink-0 text-xs text-faint">{open ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border px-5 py-5 space-y-4">
          {/* Parent edit form or info */}
          {editingParent ? (
            <ParentForm
              initial={parentToForm(parent)}
              onSave={onSaveParent}
              onCancel={onCancelParent}
              saving={saving}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetaCell label="Slug" value={parent.slug} mono />
                <MetaCell label="Catégorie" value={cat?.name ?? parent.category} />
                <MetaCell label="Marque" value={parent.brand ?? "—"} />
                <MetaCell label="Région" value={parent.region} />
                <MetaCell label="Livraison" value={parent.deliveryType} />
              </div>

              {parent.shortDescription && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                    Description courte
                  </p>
                  <p className="text-[13.5px] text-text">{parent.shortDescription}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onEditParent}
                  className="btn-ghost h-8 px-3 text-xs"
                >
                  Modifier le produit
                </button>
                <button
                  type="button"
                  onClick={onDeactivate}
                  className="h-8 px-3 text-xs text-red-400 hover:text-red-300 transition rounded-lg border border-border"
                >
                  Désactiver tout
                </button>
              </div>
            </>
          )}

          {/* Variants */}
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-faint">
              Variantes
            </p>
            <div className="space-y-2">
              {parent.variants.map((v) => (
                <VariantRow
                  key={v.slug}
                  variant={v}
                  parentName={parent.name}
                  parentSlug={parent.slug}
                  editing={editingVariantSlug === v.slug}
                  onEdit={() => onEditVariant(v.slug)}
                  onSave={onSaveVariant}
                  onCancel={onCancelVariant}
                  onDelete={() => onDeleteVariant(v.slug)}
                  saving={saving}
                />
              ))}
            </div>

            {/* Add variant form */}
            {addingVariant ? (
              <div className="mt-3">
                <VariantForm
                  initial={emptyVariantForm()}
                  parentSlug={parent.slug}
                  parentName={parent.name}
                  onSave={onSaveVariant}
                  onCancel={onCancelVariant}
                  saving={saving}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={onAddVariant}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-[13px] text-muted transition hover:border-accent/50 hover:text-accent"
              >
                <span className="text-lg leading-none">+</span> Ajouter une variante
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function MetaCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-base px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 text-[13px] text-white ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ProductsPanel() {
  const [parents, setParents] = useState<CatalogParent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Edit state
  const [editingParentSlug, setEditingParentSlug] = useState<string | null>(null); // null=none, ""=new
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  // Per-parent editing: { parentSlug: variantSlug|""|null }
  //   null = not editing any variant, "" = adding new variant
  const [editingVariant, setEditingVariant] = useState<{ parentSlug: string; variantSlug: string } | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCatalogAction();
      setParents(data);
    } catch {
      setError("Erreur lors du chargement du catalogue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = parents.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.brand?.toLowerCase().includes(q) ?? false) ||
      p.variants.some((v) => v.slug.toLowerCase().includes(q))
    );
  });

  const totalVariants = parents.reduce((s, p) => s + p.variants.length, 0);

  // ── Handlers ──

  async function handleSaveParent(data: ParentFormState) {
    setSaving(true);
    setError(null);
    try {
      const result = await saveParentProductAction(data);
      if (!result.ok) { setError(result.error ?? "Erreur."); return; }
      await load();
      setEditingParentSlug(null);
      if (result.slug) setOpenSlug(result.slug);
    } catch {
      setError("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveVariant(parentSlug: string, data: VariantFormState) {
    setSaving(true);
    setError(null);
    try {
      const result = await saveVariantAction({ ...data, parentSlug });
      if (!result.ok) { setError(result.error ?? "Erreur."); return; }
      await load();
      setEditingVariant(null);
    } catch {
      setError("Erreur lors de la sauvegarde de la variante.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteVariant(slug: string) {
    if (!confirm(`Supprimer définitivement la variante "${slug}" ?`)) return;
    setSaving(true);
    setError(null);
    try {
      const result = await deleteCatalogVariantAction(slug);
      if (!result.ok) { setError(result.error ?? "Erreur."); return; }
      await load();
      setEditingVariant(null);
    } catch {
      setError("Erreur lors de la suppression.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(slug: string) {
    if (!confirm(`Désactiver le produit "${slug}" et toutes ses variantes ?`)) return;
    setSaving(true);
    setError(null);
    try {
      const result = await deactivateParentAction(slug);
      if (!result.ok) { setError(result.error ?? "Erreur."); return; }
      await load();
    } catch {
      setError("Erreur lors de la désactivation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Produits</h2>
          <p className="mt-1 text-sm text-muted">
            {parents.length} produits · {totalVariants} variantes — données depuis la base de données.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input h-9 w-56 py-0 text-sm"
          />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="btn-ghost h-9 px-3 text-xs"
            title="Rafraîchir"
          >
            ↻
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingParentSlug("");
              setOpenSlug(null);
            }}
            disabled={editingParentSlug === ""}
            className="btn-primary h-9 px-4 text-sm disabled:opacity-40"
          >
            + Nouveau produit
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* New parent form (at top) */}
      {editingParentSlug === "" && (
        <ParentForm
          initial={emptyParentForm()}
          onSave={handleSaveParent}
          onCancel={() => setEditingParentSlug(null)}
          saving={saving}
        />
      )}

      {/* Loading state */}
      {loading && (
        <p className="text-sm text-muted">Chargement du catalogue…</p>
      )}

      {!loading && filtered.length === 0 && search && (
        <p className="text-sm text-muted">Aucun produit ne correspond à "{search}".</p>
      )}

      {!loading && (
        <div className="space-y-2">
          {filtered.map((parent) => {
            const isEditingThisParent = editingParentSlug === parent.slug;
            const variantEdit = editingVariant?.parentSlug === parent.slug
              ? editingVariant.variantSlug
              : null;
            const isAddingVariant = variantEdit === "";

            return (
              <ParentRow
                key={parent.slug}
                parent={parent}
                open={openSlug === parent.slug}
                onToggle={() =>
                  setOpenSlug((id) => (id === parent.slug ? null : parent.slug))
                }
                editingParent={isEditingThisParent}
                editingVariantSlug={
                  variantEdit !== null && variantEdit !== "" ? variantEdit : null
                }
                addingVariant={isAddingVariant}
                onEditParent={() => setEditingParentSlug(parent.slug)}
                onSaveParent={handleSaveParent}
                onCancelParent={() => setEditingParentSlug(null)}
                onEditVariant={(slug) =>
                  setEditingVariant({ parentSlug: parent.slug, variantSlug: slug })
                }
                onSaveVariant={(data) => handleSaveVariant(parent.slug, data)}
                onCancelVariant={() => setEditingVariant(null)}
                onDeleteVariant={handleDeleteVariant}
                onDeactivate={() => handleDeactivate(parent.slug)}
                onAddVariant={() =>
                  setEditingVariant({ parentSlug: parent.slug, variantSlug: "" })
                }
                saving={saving}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
