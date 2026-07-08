"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionResult, AdminCategoryDTO, ParentProductDTO, ProductListItemDTO, VariantDTO, SaveVariantInput } from "@/lib/dto";
import {
  createCategoryQuickAction,
  getCategoryOptionsAction,
  getProductListAction,
  getParentProductBySlugAction,
  saveParentProductAction,
  duplicateParentProductAction,
  archiveParentProductAction,
  deleteParentProductAction,
  convertProductToVariantAction,
  saveVariantAction,
  deleteVariantAction,
  duplicateVariantAction,
} from "@/app/actions/admin";
import { uploadImageFile } from "@/lib/clientUpload";
import ProductArt from "@/components/ProductArt";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import RegionBadge, { regionTitleSuffix } from "@/components/RegionBadge";
import { REGION_LIST } from "@/lib/regions";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { isInventoryEnabled } from "@/lib/storeSettings";

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES = ["MAD", "EUR", "USD", "GBP", "SAR"];
const STOCK_CONTROLS = ["manual", "api", "reloadly"];
const STOCK_MODE_OPTIONS = [
  { value: "automatic", label: "Automatique" },
  { value: "force_in_stock", label: "Forcer en stock" },
  { value: "force_out_of_stock", label: "Forcer en rupture" },
] as const;
type EditorTab = "details" | "content" | "variants" | "media";
const TAB_LABELS: Record<EditorTab, string> = {
  details: "Détails",
  content: "Contenu",
  variants: "Variantes",
  media: "Média",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyParent(category = ""): ParentProductDTO {
  return {
    slug: "",
    name: "",
    category,
    brand: null,
    region: "",
    deliveryType: "Produit numérique - livraison rapide",
    description: "",
    shortDescription: null,
    longDescription: null,
    instructions: null,
    thumbnail: null,
    active: true,
    featured: false,
    createdAt: new Date().toISOString(),
    variants: [],
  };
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export default function ProductsPanel() {
  // Lean list for the sidebar
  const [items, setItems] = useState<ProductListItemDTO[]>([]);
  const [categories, setCategories] = useState<AdminCategoryDTO[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Full detail for the selected product
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParentProductDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("details");
  const [variantDrafts, setVariantDrafts] = useState<Record<string, VariantDTO>>({});
  const [editingVariant, setEditingVariant] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [isAddingVariant, setIsAddingVariant] = useState(false);
  const [newVariantDraft, setNewVariantDraft] = useState<VariantDTO | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Cache: slug → ParentProductDTO so navigating between products is instant
  const detailCache = useRef<Record<string, ParentProductDTO>>({});

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const [data, categoryData] = await Promise.all([
        getProductListAction(),
        getCategoryOptionsAction(),
      ]);
      setItems(data);
      setCategories(categoryData);
    } catch (e) {
      setListError(String(e));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  async function loadDetail(slug: string): Promise<ParentProductDTO | null> {
    if (detailCache.current[slug]) return detailCache.current[slug];
    setDetailLoading(true);
    try {
      const data = await getParentProductBySlugAction(slug);
      if (data) detailCache.current[slug] = data;
      return data;
    } finally {
      setDetailLoading(false);
    }
  }

  function invalidateCache(slug: string) {
    delete detailCache.current[slug];
  }

  async function openParent(item: ProductListItemDTO) {
    setSelectedSlug(item.slug);
    setIsNew(false);
    setEditingVariant(null);
    setIsAddingVariant(false);
    setNewVariantDraft(null);
    setActiveTab("details");
    setMsg(null);

    const detail = await loadDetail(item.slug);
    if (detail) {
      setDraft({ ...detail, variants: detail.variants.map((v) => ({ ...v })) });
      setVariantDrafts(Object.fromEntries(detail.variants.map((v) => [v.slug, { ...v }])));
    }
  }

  function openNew() {
    const blank = emptyParent(categories[0]?.id ?? "");
    setSelectedSlug("__new__");
    setIsNew(true);
    setDraft(blank);
    setVariantDrafts({});
    setEditingVariant(null);
    setActiveTab("details");
    setMsg(null);
  }

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  function updateDraft<K extends keyof ParentProductDTO>(k: K, v: ParentProductDTO[K]) {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  }

  function updateVariant<K extends keyof VariantDTO>(slug: string, k: K, v: VariantDTO[K]) {
    setVariantDrafts((prev) => ({ ...prev, [slug]: { ...prev[slug], [k]: v } }));
  }

  function variantSaveInput(parent: ParentProductDTO, variant: VariantDTO, originalSlug?: string): SaveVariantInput {
    return {
      originalSlug,
      slug: variant.slug,
      name: variant.name,
      parentSlug: parent.slug,
      category: parent.category,
      priceMad: variant.priceMad,
      faceValue: variant.faceValue,
      faceCurrency: variant.faceCurrency,
      supplierCost: variant.supplierCost,
      supplierCurrency: variant.supplierCurrency,
      region: parent.region,
      deliveryType: parent.deliveryType,
      active: variant.active,
      featured: variant.featured,
      stockControl: variant.stockControl,
      stockMode: variant.stockMode,
      reloadlyProductId: variant.reloadlyProductId,
      reloadlyCountryCode: variant.reloadlyCountryCode,
    };
  }

  async function saveDirtyVariants(parent: ParentProductDTO): Promise<ActionResult> {
    for (const original of parent.variants) {
      const variant = variantDrafts[original.slug];
      if (!variant || !isVariantDirty(original, variant)) continue;

      const result = await saveVariantAction(variantSaveInput(parent, variant, original.slug));
      if (!result.ok) {
        return {
          ok: false,
          error: result.error ?? `Erreur lors de l'enregistrement de ${variant.name}.`,
        };
      }
    }
    return { ok: true };
  }

  function cancel() {
    if (isNew) {
      setSelectedSlug(null);
      setDraft(null);
    } else if (selectedSlug) {
      const cached = detailCache.current[selectedSlug];
      if (cached) {
        setDraft({ ...cached, variants: cached.variants.map((v) => ({ ...v })) });
        setVariantDrafts(Object.fromEntries(cached.variants.map((v) => [v.slug, { ...v }])));
      }
    }
    setMsg(null);
  }

  function closeEditor() {
    setSelectedSlug(null);
    setDraft(null);
    setMsg(null);
  }

  async function save(): Promise<ParentProductDTO | null> {
    if (!draft) return null;
    if (!draft.slug.trim() || !draft.name.trim()) {
      setMsg({ text: "Le slug et le nom sont obligatoires.", ok: false });
      return null;
    }
    if (!draft.category.trim()) {
      setMsg({ text: "Choisissez ou créez une catégorie.", ok: false });
      return null;
    }
    setSaving(true);
    setMsg(null);
    const newSlug = draft.slug.trim();
    const result = await saveParentProductAction({
      originalSlug: isNew ? undefined : selectedSlug ?? undefined,
      slug: newSlug,
      name: draft.name.trim(),
      category: draft.category,
      brand: draft.brand?.trim() || null,
      region: draft.region,
      deliveryType: draft.deliveryType,
      description: draft.description,
      shortDescription: draft.shortDescription?.trim() || null,
      longDescription: draft.longDescription?.trim() || null,
      instructions: draft.instructions?.trim() || null,
      thumbnail: draft.thumbnail?.trim() || null,
      active: draft.active,
      featured: draft.featured,
    });
    if (result.ok) {
      const variantResult = await saveDirtyVariants({ ...draft, slug: newSlug });
      if (!variantResult.ok) {
        setMsg({ text: variantResult.error ?? "Erreur inconnue.", ok: false });
        setSaving(false);
        return null;
      }

      setMsg({ text: "Enregistré.", ok: true });
      setIsNew(false);
      if (selectedSlug && selectedSlug !== newSlug) invalidateCache(selectedSlug);
      invalidateCache(newSlug);
      setSelectedSlug(newSlug);
      await loadList();
      const detail = await loadDetail(newSlug);
      if (detail) {
        setDraft({ ...detail, variants: detail.variants.map((v) => ({ ...v })) });
        setVariantDrafts(Object.fromEntries(detail.variants.map((v) => [v.slug, { ...v }])));
        setSaving(false);
        return detail;
      }
    } else {
      setMsg({ text: result.error ?? "Erreur inconnue.", ok: false });
    }
    setSaving(false);
    return null;
  }

  async function startAddVariant() {
    if (!draft) return;
    let parent = draft;
    if (isNew || selectedSlug === "__new__") {
      const saved = await save();
      if (!saved) {
        setActiveTab("details");
        setMsg({ text: "Enregistrez d'abord le produit avant d'ajouter des variantes.", ok: false });
        return;
      }
      parent = saved;
    }
    setIsAddingVariant(true);
    setEditingVariant(null);
    setNewVariantDraft({
      id: "",
      slug: "",
      name: "",
      priceMad: 0,
      faceValue: null,
      faceCurrency: "MAD",
      supplierCost: null,
      supplierCurrency: "MAD",
      active: true,
      featured: false,
      stockControl: "manual",
      stockMode: "automatic",
      inventoryUnused: 0,
      reloadlyProductId: null,
      reloadlyCountryCode: null,
    });
    setDraft(parent);
    setMsg(null);
  }

  function cancelAddVariant() {
    setIsAddingVariant(false);
    setNewVariantDraft(null);
  }

  async function saveNewVariant() {
    if (!draft || !newVariantDraft) return;
    if (!newVariantDraft.slug.trim() || !newVariantDraft.name.trim()) {
      setMsg({ text: "Le slug et le nom sont obligatoires pour la nouvelle variante.", ok: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    const input: SaveVariantInput = {
      slug: newVariantDraft.slug.trim(),
      name: newVariantDraft.name.trim(),
      parentSlug: draft.slug,
      category: draft.category,
      priceMad: newVariantDraft.priceMad,
      faceValue: newVariantDraft.faceValue,
      faceCurrency: newVariantDraft.faceCurrency,
      supplierCost: newVariantDraft.supplierCost,
      supplierCurrency: newVariantDraft.supplierCurrency,
      region: draft.region,
      deliveryType: draft.deliveryType,
      active: newVariantDraft.active,
      featured: newVariantDraft.featured,
      stockControl: newVariantDraft.stockControl,
      stockMode: newVariantDraft.stockMode,
      reloadlyProductId: newVariantDraft.reloadlyProductId,
      reloadlyCountryCode: newVariantDraft.reloadlyCountryCode,
    };
    const result = await saveVariantAction(input);
    if (result.ok) {
      setMsg({ text: "Variante ajoutée.", ok: true });
      setIsAddingVariant(false);
      setNewVariantDraft(null);
      await refreshDetail();
    } else {
      setMsg({ text: result.error ?? "Erreur inconnue.", ok: false });
    }
    setSaving(false);
  }

  async function deleteVariantHandler(slug: string) {
    setSaving(true);
    setMsg(null);
    const result = await deleteVariantAction(slug);
    if (result.ok) {
      setMsg({ text: "Variante supprimée.", ok: true });
      await refreshDetail();
    } else {
      setMsg({ text: result.error ?? "Erreur inconnue.", ok: false });
    }
    setSaving(false);
  }

  async function duplicateVariantHandler(slug: string) {
    setSaving(true);
    setMsg(null);
    const result = await duplicateVariantAction(slug);
    if (result.ok) {
      setMsg({ text: "Variante dupliquée.", ok: true });
      await refreshDetail();
    } else {
      setMsg({ text: result.error ?? "Erreur inconnue.", ok: false });
    }
    setSaving(false);
  }

  async function saveVariant(slug: string) {
    if (!draft) return;
    const v = variantDrafts[slug];
    if (!v) return;
    setSaving(true);
    const input: SaveVariantInput = {
      originalSlug: slug,
      slug: v.slug,
      name: v.name,
      parentSlug: draft.slug,
      category: draft.category,
      priceMad: v.priceMad,
      faceValue: v.faceValue,
      faceCurrency: v.faceCurrency,
      supplierCost: v.supplierCost,
      supplierCurrency: v.supplierCurrency,
      region: draft.region,
      deliveryType: draft.deliveryType,
      active: v.active,
      featured: v.featured,
      stockControl: v.stockControl,
      stockMode: v.stockMode,
      reloadlyProductId: v.reloadlyProductId,
      reloadlyCountryCode: v.reloadlyCountryCode,
    };
    const result = await saveVariantAction(input);
    if (result.ok) {
      setMsg({ text: `Variante « ${v.name} » enregistrée.`, ok: true });
      setEditingVariant(null);
      await refreshDetail();
    } else {
      setMsg({ text: result.error ?? "Erreur inconnue.", ok: false });
    }
    setSaving(false);
  }

  async function refreshDetail() {
    if (!selectedSlug || selectedSlug === "__new__") return;
    invalidateCache(selectedSlug);
    await loadList();
    const detail = await loadDetail(selectedSlug);
    if (detail) {
      setDraft({ ...detail, variants: detail.variants.map((v) => ({ ...v })) });
      setVariantDrafts(Object.fromEntries(detail.variants.map((v) => [v.slug, { ...v }])));
    }
  }

  async function duplicateParent() {
    if (!selectedSlug || selectedSlug === "__new__") return;
    setSaving(true);
    setMsg(null);
    const result = await duplicateParentProductAction(selectedSlug);
    if (result.ok && result.slug) {
      setMsg({ text: "Produit parent dupliqué comme brouillon archivé.", ok: true });
      await loadList();
      const item = { slug: result.slug } as ProductListItemDTO;
      await openParent(item);
    } else {
      setMsg({ text: result.error ?? "Duplication impossible.", ok: false });
    }
    setSaving(false);
  }

  async function archiveParent() {
    if (!selectedSlug || selectedSlug === "__new__") return;
    setSaving(true);
    setMsg(null);
    const result = await archiveParentProductAction(selectedSlug);
    if (result.ok) {
      setMsg({ text: "Produit parent archivé.", ok: true });
      invalidateCache(selectedSlug);
      await loadList();
      await refreshDetail();
    } else {
      setMsg({ text: result.error ?? "Archivage impossible.", ok: false });
    }
    setSaving(false);
  }

  async function confirmDeleteParent(options: {
    variantStrategy: "delete" | "move";
    targetParentSlug?: string;
  }) {
    if (!selectedSlug || selectedSlug === "__new__") return;
    setSaving(true);
    setMsg(null);
    const result = await deleteParentProductAction({
      slug: selectedSlug,
      ...options,
    });
    if (result.ok) {
      setMsg({
        text:
          options.variantStrategy === "move"
            ? "Produit parent fusionné puis supprimé."
            : "Produit parent supprimé.",
        ok: true,
      });
      invalidateCache(selectedSlug);
      setSelectedSlug(null);
      setDraft(null);
      setVariantDrafts({});
      setDeleteDialogOpen(false);
      await loadList();
    } else {
      setMsg({ text: result.error ?? "Suppression impossible.", ok: false });
    }
    setSaving(false);
  }

  async function convertStandaloneProduct(sourceSlug: string, removeSource: boolean) {
    if (!selectedSlug || selectedSlug === "__new__") return;
    setSaving(true);
    setMsg(null);
    const result = await convertProductToVariantAction({
      sourceSlug,
      targetParentSlug: selectedSlug,
      removeSource,
    });
    if (result.ok) {
      setMsg({ text: "Produit autonome converti en variante.", ok: true });
      invalidateCache(selectedSlug);
      invalidateCache(sourceSlug);
      await loadList();
      await refreshDetail();
    } else {
      setMsg({ text: result.error ?? "Conversion impossible.", ok: false });
    }
    setSaving(false);
  }

  return (
    <div className="grid h-full w-full min-w-0 max-w-full gap-6 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* ── Left: parent list ── */}
      <aside className={`h-fit ${draft ? "hidden lg:block" : ""}`}>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-white">Produits</h2>
              <p className="text-xs text-muted">{items.length} produit{items.length !== 1 ? "s" : ""} parent{items.length !== 1 ? "s" : ""}</p>
            </div>
            <button type="button" onClick={openNew} className="btn-primary py-1 text-xs">
              + Nouveau
            </button>
          </div>

          {listLoading ? (
            <p className="px-4 py-6 text-sm text-muted">Chargement…</p>
          ) : listError ? (
            <p className="px-4 py-6 text-sm text-red-400 break-all">{listError}</p>
          ) : categories.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted">
              <p className="font-medium text-white">Aucune catégorie pour le moment.</p>
              <p className="mt-1 text-xs">Créez une catégorie avant d'ajouter un produit.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {categories.map((category) => {
                const catId = category.id;
                const group = items.filter((p) => p.category === catId);
                return (
                  <div key={catId}>
                    <div className="flex items-center justify-between gap-3 px-4 py-2">
                      <span className="truncate text-[10px] font-bold uppercase tracking-widest text-faint">
                        {category.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-faint">
                        {group.length} produit{group.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {group.length === 0 ? (
                      <div className="px-4 pb-3 text-xs text-muted">
                        Aucun produit dans cette catégorie.
                      </div>
                    ) : group.map((p) => (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() => openParent(p)}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface ${
                          selectedSlug === p.slug ? "bg-accent/10" : ""
                        }`}
                      >
                        <div
                          className="h-8 w-8 flex-shrink-0 rounded-lg"
                          style={{ background: category.accentColor }}
                        />
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-medium ${selectedSlug === p.slug ? "text-white" : "text-muted"}`}>
                            {p.name}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-muted">
                            {p.variantCount} variante{p.variantCount !== 1 ? "s" : ""}
                            {" · "}
                            {p.active ? "Actif" : <span className="text-yellow-500">Masqué</span>}
                            <RegionBadge code={p.region} variant="chip" size="micro" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
              {/* Products with unknown/custom categories */}
              {items.filter((p) => !categoryMap.has(p.category)).map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => openParent(p)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface ${
                    selectedSlug === p.slug ? "bg-accent/10" : ""
                  }`}
                >
                  <div
                    className="h-8 w-8 flex-shrink-0 rounded-lg"
                    style={{ background: "#1e2029" }}
                  />
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${selectedSlug === p.slug ? "text-white" : "text-muted"}`}>
                      {p.name}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      {p.variantCount} variante{p.variantCount !== 1 ? "s" : ""}
                      {" · "}
                      {p.active ? "Actif" : <span className="text-yellow-500">Masqué</span>}
                      <RegionBadge code={p.region} variant="chip" size="micro" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── Right: editor ── */}
      {detailLoading ? (
        <div className="card flex items-center justify-center p-16 text-center">
          <p className="text-sm text-muted">Chargement…</p>
        </div>
      ) : !draft ? (
        <div className="card flex items-center justify-center p-16 text-center">
          <div>
            <p className="text-3xl">🛍️</p>
            <p className="mt-2 text-sm text-muted">Sélectionnez un produit à modifier ou cliquez sur + Nouveau.</p>
          </div>
        </div>
      ) : (
        <section className="min-w-0 max-w-full space-y-4 overflow-hidden">
          {/* Header */}
          <div className="card flex min-w-0 max-w-full flex-col items-start gap-3 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={closeEditor}
                className="btn-ghost h-10 shrink-0 px-3 text-sm lg:hidden"
                aria-label="Retour à la liste des produits"
              >
                ← Produits
              </button>
              <div className="min-w-0">
                <h2 className="font-bold text-white">{draft.name || "Nouveau produit"}</h2>
                <p className="truncate text-xs text-muted">{isNew ? "Non enregistré" : draft.slug}</p>
              </div>
            </div>
            <div className="flex max-w-full flex-wrap items-center justify-start gap-2 xl:justify-end">
              {msg && (
                <span className={`text-xs ${msg.ok ? "text-green-400" : "text-red-400"}`}>
                  {msg.text}
                </span>
              )}
              {!isNew && selectedSlug && (
                <>
                  <button type="button" onClick={duplicateParent} className="btn-ghost text-sm" disabled={saving}>
                    Dupliquer
                  </button>
                  <button type="button" onClick={archiveParent} className="btn-ghost text-sm" disabled={saving || !draft.active}>
                    Archiver
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteDialogOpen(true)}
                    className="rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                    disabled={saving}
                  >
                    Supprimer
                  </button>
                </>
              )}
              <button type="button" onClick={cancel} className="btn-ghost text-sm" disabled={saving}>
                Annuler
              </button>
              <button type="button" onClick={save} className="btn-primary text-sm" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer le produit"}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="card min-w-0 max-w-full overflow-hidden">
            <div className="flex border-b border-border overflow-x-auto">
              {(["details", "content", "variants", "media"] as EditorTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap px-5 py-3 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? "border-b-2 border-accent text-white"
                      : "text-muted hover:text-white"
                  }`}
                >
                  {TAB_LABELS[tab]}
                  {tab === "variants" && draft.variants.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">
                      {draft.variants.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="min-w-0 p-5">
              {activeTab === "details" && (
                <DetailsTab
                  draft={draft}
                  categories={categories}
                  update={updateDraft}
                  onCategoryCreated={(category) => {
                    setCategories((current) =>
                      current.some((item) => item.id === category.id) ? current : [...current, category],
                    );
                    updateDraft("category", category.id);
                  }}
                />
              )}
              {activeTab === "content" && <ContentTab draft={draft} update={updateDraft} />}
              {activeTab === "variants" && (
                <VariantsTab
                  draft={draft}
                  parentOptions={items.filter((item) => item.slug !== draft.slug)}
                  variantDrafts={variantDrafts}
                  editingVariant={editingVariant}
                  setEditingVariant={setEditingVariant}
                  updateVariant={updateVariant}
                  onSaveVariant={saveVariant}
                  saving={saving}
                  isAddingVariant={isAddingVariant}
                  newVariantDraft={newVariantDraft}
                  onAddVariant={startAddVariant}
                  onNewVariantChange={setNewVariantDraft}
                  onSaveNewVariant={saveNewVariant}
                  onCancelNewVariant={cancelAddVariant}
                  onDeleteVariant={deleteVariantHandler}
                  onDuplicateVariant={duplicateVariantHandler}
                  onConvertStandalone={convertStandaloneProduct}
                />
              )}
              {activeTab === "media" && <MediaTab draft={draft} update={updateDraft} onSave={save} saving={saving} />}
            </div>
          </div>
          {deleteDialogOpen && selectedSlug && (
            <DeleteParentDialog
              product={draft}
              parentOptions={items.filter((item) => item.slug !== selectedSlug)}
              saving={saving}
              onCancel={() => setDeleteDialogOpen(false)}
              onConfirm={confirmDeleteParent}
            />
          )}
        </section>
      )}
    </div>
  );
}

// ─── Details tab ─────────────────────────────────────────────────────────────

function DeleteParentDialog({
  product,
  parentOptions,
  saving,
  onCancel,
  onConfirm,
}: {
  product: ParentProductDTO;
  parentOptions: ProductListItemDTO[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (options: { variantStrategy: "delete" | "move"; targetParentSlug?: string }) => Promise<void>;
}) {
  const [variantStrategy, setVariantStrategy] = useState<"delete" | "move">("delete");
  const [targetParentSlug, setTargetParentSlug] = useState("");
  const canConfirm = variantStrategy === "delete" || Boolean(targetParentSlug);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border-strong bg-base p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-300">
          Supprimer le produit parent
        </p>
        <h3 className="mt-2 text-lg font-bold text-white">{product.name}</h3>
        <p className="mt-2 text-sm text-muted">
          Cette action retire le produit parent de l’admin et de la boutique. Fusionnez les doublons avec le vrai produit parent lorsqu’ils ont du stock ou un historique de commandes.
        </p>

        <div className="mt-5 space-y-3 text-sm">
          <label className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <input
              type="radio"
              checked={variantStrategy === "delete"}
              onChange={() => setVariantStrategy("delete")}
              className="mt-1 accent-[#3e7bfa]"
            />
            <span>
              <span className="font-medium text-white">Supprimer toutes les variantes enfants</span>
              <span className="block text-xs text-muted">
                Fonctionne uniquement si ce produit parent n’a ni stock ni historique de commandes.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <input
              type="radio"
              checked={variantStrategy === "move"}
              onChange={() => setVariantStrategy("move")}
              className="mt-1 accent-[#3e7bfa]"
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-white">Fusionner avec un autre parent, puis supprimer</span>
              <span className="block text-xs text-muted">
                Convertit ce doublon en variante et déplace le stock, les références de commande et les variantes enfants.
              </span>
              {variantStrategy === "move" && (
                <select
                  className="input mt-3 h-10 py-0 text-sm"
                  value={targetParentSlug}
                  onChange={(event) => setTargetParentSlug(event.target.value)}
                >
                  <option value="">Choisir le produit parent cible...</option>
                  {parentOptions.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost text-sm" disabled={saving}>
            Annuler
          </button>
          <button
            type="button"
            disabled={!canConfirm || saving}
            onClick={() =>
              onConfirm({
                variantStrategy,
                targetParentSlug: variantStrategy === "move" ? targetParentSlug : undefined,
              })
            }
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
          >
            {saving ? "Suppression..." : "Confirmer la suppression"}
          </button>
        </div>
      </div>
    </div>
  );
}

function stockModeLabel(mode: string) {
  return STOCK_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "Automatique";
}

function stockBadge(v: VariantDTO) {
  if (v.stockMode === "force_in_stock") {
    return { label: "En stock", className: "border-green-500/30 text-green-400" };
  }
  if (v.stockMode === "force_out_of_stock") {
    return { label: "En rupture", className: "border-yellow-500/30 text-yellow-500" };
  }
  if (v.inventoryUnused > 0 && v.inventoryUnused <= 3) {
    return { label: "Stock faible", className: "border-yellow-500/30 text-yellow-500" };
  }
  if (v.inventoryUnused > 0) {
    return { label: "En stock", className: "border-green-500/30 text-green-400" };
  }
  return { label: "En rupture", className: "border-red-500/30 text-red-400" };
}

function isVariantDirty(original: VariantDTO, draft: VariantDTO) {
  return (
    original.slug !== draft.slug ||
    original.name !== draft.name ||
    original.priceMad !== draft.priceMad ||
    original.faceValue !== draft.faceValue ||
    original.faceCurrency !== draft.faceCurrency ||
    original.supplierCost !== draft.supplierCost ||
    original.supplierCurrency !== draft.supplierCurrency ||
    original.active !== draft.active ||
    original.featured !== draft.featured ||
    original.stockControl !== draft.stockControl ||
    original.stockMode !== draft.stockMode ||
    original.reloadlyProductId !== draft.reloadlyProductId ||
    original.reloadlyCountryCode !== draft.reloadlyCountryCode
  );
}

function DetailsTab({
  draft,
  categories,
  update,
  onCategoryCreated,
}: {
  draft: ParentProductDTO;
  categories: AdminCategoryDTO[];
  update: <K extends keyof ParentProductDTO>(k: K, v: ParentProductDTO[K]) => void;
  onCategoryCreated: (category: AdminCategoryDTO) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du produit *">
          <input
            className="input"
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              const previousAutoSlug = slugify(draft.name);
              update("name", name);
              if (!draft.slug.trim() || draft.slug === previousAutoSlug) {
                update("slug", slugify(name));
              }
            }}
            placeholder="Steam Wallet"
          />
        </Field>
        <Field label="Slug *">
          <input
            className="input font-mono"
            value={draft.slug}
            onChange={(e) => update("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            placeholder="steam-wallet"
          />
        </Field>
        <Field label="Catégorie">
          <CategoryCombobox
            value={draft.category}
            categories={categories}
            onChange={(value) => update("category", value)}
            onCategoryCreated={onCategoryCreated}
          />
        </Field>
        <Field label="Marque / Plateforme">
          <input
            className="input"
            value={draft.brand ?? ""}
            onChange={(e) => update("brand", e.target.value || null)}
            placeholder="Valve"
          />
        </Field>
        <Field label="Région de ce groupe">
          <RegionCombobox value={draft.region} onChange={(value) => update("region", value)} />
        </Field>
        <Field label="Type de livraison">
          <input
            className="input"
            value={draft.deliveryType}
            onChange={(e) => update("deliveryType", e.target.value)}
            placeholder="Produit numérique - livraison rapide"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5">
        <RegionBadge code={draft.region} variant="overlay" />
        <div className="min-w-0 text-sm">
          <p className="mb-0.5 text-xs text-faint">Titre &amp; badge générés</p>
          <p className="truncate font-medium text-white">
            {draft.name || "Nom du produit"}{" "}
            <span className={regionTitleSuffix(draft.region).className}>
              {regionTitleSuffix(draft.region).label}
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <ToggleSwitch
          label="Visibilité boutique"
          checkedLabel="Visible"
          uncheckedLabel="Masqué"
          checked={draft.active}
          onChange={(v) => update("active", v)}
        />
        <ToggleSwitch
          label="Produit parent mis en avant"
          checkedLabel="Mis en avant"
          uncheckedLabel="Non mis en avant"
          checked={draft.featured}
          onChange={(v) => update("featured", v)}
        />
      </div>
    </div>
  );
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateSku(value: string) {
  let next = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bSTEAM\s+WALLET\b/g, "STEAM")
    .replace(/\bWINDOWS\s+11\b/g, "WIN11")
    .replace(/\bVALORANT\s+POINTS\b/g, "VALORANT")
    .replace(/\bGIFT\s+CARDS?\b/g, "")
    .replace(/\bSTORE\b/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  next = next.replace(/-{2,}/g, "-");
  return next || "SKU";
}

function normalizeSkuInput(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+/, "");
}

function CategoryCombobox({
  value,
  categories,
  onChange,
  onCategoryCreated,
}: {
  value: string;
  categories: AdminCategoryDTO[];
  onChange: (value: string) => void;
  onCategoryCreated: (category: AdminCategoryDTO) => void;
}) {
  const selected = categories.find((category) => category.id === value);
  const [query, setQuery] = useState(selected?.name ?? value);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const next = categories.find((category) => category.id === value);
    setQuery(next?.name ?? value);
  }, [categories, value]);

  const filtered = categories.filter((category) => {
    const needle = query.trim().toLowerCase();
    return (
      !needle ||
      category.name.toLowerCase().includes(needle) ||
      category.slug.toLowerCase().includes(needle)
    );
  });
  const exact = categories.some(
    (category) =>
      category.name.toLowerCase() === query.trim().toLowerCase() ||
      category.slug.toLowerCase() === query.trim().toLowerCase(),
  );
  const canCreate = query.trim().length > 1 && !exact;

  async function create() {
    setCreating(true);
    const result = await createCategoryQuickAction(query);
    if (result.ok && result.category) {
      onCategoryCreated(result.category);
      onChange(result.category.id);
      setQuery(result.category.name);
      setOpen(false);
    }
    setCreating(false);
  }

  return (
    <div className="relative">
      <input
        className="input"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          onChange(next);
          setOpen(true);
        }}
        placeholder="Rechercher ou créer une catégorie"
      />
      {open ? (
        <div className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-border bg-base p-1 shadow-card">
          {filtered.map((category) => (
            <button
              key={category.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(category.id);
                setQuery(category.name);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface hover:text-white"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.accentColor }} />
              <span className="flex-1">{category.name}</span>
              <span className="font-mono text-xs text-faint">{category.slug}</span>
            </button>
          ))}
          {canCreate ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={create}
              disabled={creating}
              className="mt-1 w-full rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-left text-sm font-medium text-accent disabled:opacity-50"
            >
              {creating ? "Création..." : `Créer la catégorie « ${query.trim()} »`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RegionCombobox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = REGION_LIST.find((region) => region.code === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const next = REGION_LIST.find((region) => region.code === value);
    setQuery(next?.name ?? "");
  }, [value]);

  const filtered = REGION_LIST.filter((region) => {
    const needle = query.trim().toLowerCase();
    return (
      !needle ||
      region.name.toLowerCase().includes(needle) ||
      region.code.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="relative">
      <input
        className="input"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        placeholder="Rechercher un pays ou une région"
      />
      {open ? (
        <div className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-border bg-base p-1 shadow-card">
          {filtered.map((region) => (
            <button
              key={region.code}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(region.code);
                setQuery(region.name);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                region.code === value ? "bg-accent/10" : "hover:bg-surface"
              }`}
            >
              <RegionBadge code={region.code} variant="chip" size="micro" className="!border-0 !bg-transparent !p-0" />
              <span className="flex-1 text-muted">{region.name}</span>
              <span className="font-mono text-xs text-faint">{region.code}</span>
              {region.code === value ? <span className="text-accent-hover">✓</span> : null}
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-faint">Aucune région trouvée.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Content tab ─────────────────────────────────────────────────────────────

function ContentTab({
  draft,
  update,
}: {
  draft: ParentProductDTO;
  update: <K extends keyof ParentProductDTO>(k: K, v: ParentProductDTO[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Description courte">
        <input
          className="input"
          value={draft.shortDescription ?? ""}
          onChange={(e) => update("shortDescription", e.target.value || null)}
          placeholder="Accroche affichée sur les pages catégorie"
        />
      </Field>
      <Field label="Description longue">
        <textarea
          className="input min-h-[100px] resize-y"
          value={draft.longDescription ?? ""}
          onChange={(e) => update("longDescription", e.target.value || null)}
          placeholder="Description complète affichée sur la page produit"
        />
      </Field>
      <Field label="Description (méta / secours)">
        <textarea
          className="input min-h-[80px] resize-y"
          value={draft.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Description courte utilisée comme méta-description et texte de secours"
        />
      </Field>
      <Field label="Instructions d’utilisation">
        <textarea
          className="input min-h-[120px] resize-y font-mono text-xs"
          value={draft.instructions ?? ""}
          onChange={(e) => update("instructions", e.target.value || null)}
          placeholder={"1. Ouvrez Steam…\n2. Cliquez…"}
        />
      </Field>
    </div>
  );
}

// ─── Variants tab ────────────────────────────────────────────────────────────

function VariantForm({
  v,
  onChange,
}: {
  v: VariantDTO;
  onChange: <K extends keyof VariantDTO>(k: K, val: VariantDTO[K]) => void;
}) {
  const { settings } = useStoreSettings();
  const inventoryOn = isInventoryEnabled(settings);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="SKU *">
          <div className="flex gap-2">
            <input
              className="input font-mono"
              value={v.slug}
              onChange={(e) => onChange("slug", normalizeSkuInput(e.target.value))}
              placeholder="STEAM-10-EUR"
            />
            <button
              type="button"
              onClick={() => onChange("slug", generateSku(v.name))}
              className="btn-ghost shrink-0 px-3 text-xs"
            >
              Régénérer
            </button>
          </div>
        </Field>
        <Field label="Nom de la variante *">
          <input
            className="input"
            value={v.name}
            onChange={(e) => {
              const name = e.target.value;
              onChange("name", name);
              if (!v.slug.trim()) onChange("slug", generateSku(name));
            }}
            placeholder="Steam Wallet 50 EUR"
          />
        </Field>
        <Field label="Valeur faciale">
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={v.faceValue ?? ""}
            onChange={(e) =>
              onChange("faceValue", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </Field>
        <Field label="Devise faciale">
          <select
            className="input"
            value={v.faceCurrency}
            onChange={(e) => onChange("faceCurrency", e.target.value)}
          >
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Prix (MAD)">
          <input
            className="input"
            type="number"
            min="0"
            value={v.priceMad}
            onChange={(e) => onChange("priceMad", Number(e.target.value))}
          />
        </Field>
        <Field label="Coût fournisseur">
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={v.supplierCost ?? ""}
            onChange={(e) =>
              onChange("supplierCost", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </Field>
        <Field label="Devise fournisseur">
          <select
            className="input"
            value={v.supplierCurrency}
            onChange={(e) => onChange("supplierCurrency", e.target.value)}
          >
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Gestion du stock">
          <select
            className="input"
            value={v.stockControl}
            onChange={(e) => onChange("stockControl", e.target.value)}
          >
            {STOCK_CONTROLS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        {v.stockControl === "reloadly" && (
          <>
            <Field label="Reloadly - Product ID">
              <input
                className="input"
                type="number"
                min="0"
                value={v.reloadlyProductId ?? ""}
                onChange={(e) =>
                  onChange("reloadlyProductId", e.target.value === "" ? null : Number(e.target.value))
                }
                placeholder="ex. 18681"
              />
            </Field>
            <Field label="Reloadly - Code pays">
              <input
                className="input"
                value={v.reloadlyCountryCode ?? ""}
                onChange={(e) => onChange("reloadlyCountryCode", e.target.value.toUpperCase() || null)}
                placeholder="ex. US"
                maxLength={2}
              />
            </Field>
          </>
        )}
        {inventoryOn && (
          <>
            <Field label={`Affichage du stock · ${v.inventoryUnused} code(s)`}>
              <select
                className="input"
                value={v.stockMode}
                onChange={(e) => onChange("stockMode", e.target.value)}
              >
                {STOCK_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stock (codes non utilisés)">
              <input className="input" value={v.inventoryUnused} disabled readOnly />
            </Field>
          </>
        )}
      </div>
      <div className="mt-4 flex gap-6">
        <ToggleSwitch
          label="Variant"
          checkedLabel="Actif"
          uncheckedLabel="Masqué"
          checked={v.active}
          onChange={(val) => onChange("active", val)}
        />
        <ToggleSwitch
          label="Homepage"
          checkedLabel="Mis en avant"
          uncheckedLabel="Non mis en avant"
          checked={v.featured}
          onChange={(val) => onChange("featured", val)}
        />
      </div>
    </>
  );
}

function VariantsTab({
  draft,
  parentOptions,
  variantDrafts,
  editingVariant,
  setEditingVariant,
  updateVariant,
  onSaveVariant,
  saving,
  isAddingVariant,
  newVariantDraft,
  onAddVariant,
  onNewVariantChange,
  onSaveNewVariant,
  onCancelNewVariant,
  onDeleteVariant,
  onDuplicateVariant,
  onConvertStandalone,
}: {
  draft: ParentProductDTO;
  parentOptions: ProductListItemDTO[];
  variantDrafts: Record<string, VariantDTO>;
  editingVariant: string | null;
  setEditingVariant: (slug: string | null) => void;
  updateVariant: <K extends keyof VariantDTO>(slug: string, k: K, v: VariantDTO[K]) => void;
  onSaveVariant: (slug: string) => Promise<void>;
  saving: boolean;
  isAddingVariant: boolean;
  newVariantDraft: VariantDTO | null;
  onAddVariant: () => void | Promise<void>;
  onNewVariantChange: (draft: VariantDTO) => void;
  onSaveNewVariant: () => Promise<void>;
  onCancelNewVariant: () => void;
  onDeleteVariant: (slug: string) => Promise<void>;
  onDuplicateVariant: (slug: string) => Promise<void>;
  onConvertStandalone: (sourceSlug: string, removeSource: boolean) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [sourceSlug, setSourceSlug] = useState("");
  const [removeSource, setRemoveSource] = useState(true);

  return (
    <div className="space-y-3">
      {parentOptions.length > 0 && (
        <div className="rounded-xl border border-border bg-base px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1.5 block text-xs font-medium text-white">
                Convertir un produit autonome en variante
              </label>
              <select
                className="input h-10 py-0 text-sm"
                value={sourceSlug}
                onChange={(event) => setSourceSlug(event.target.value)}
              >
                <option value="">Choisir un produit à convertir...</option>
                {parentOptions.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={removeSource}
                onChange={(event) => setRemoveSource(event.target.checked)}
                className="h-4 w-4 accent-[#3e7bfa]"
              />
              Supprimer le produit parent source après conversion
            </label>
            <button
              type="button"
              disabled={!sourceSlug || saving}
              onClick={async () => {
                await onConvertStandalone(sourceSlug, removeSource);
                setSourceSlug("");
              }}
              className="btn-primary h-10 px-4 text-xs disabled:opacity-50"
            >
              Convertir
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Utilisez cette option pour regrouper des produits autonomes en variantes de ce produit parent.
          </p>
        </div>
      )}

      {/* Add variant button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onAddVariant}
          disabled={isAddingVariant || saving}
          className="btn-primary py-1.5 text-xs"
        >
          + Ajouter une variante
        </button>
      </div>

      {/* New variant form */}
      {isAddingVariant && newVariantDraft && (
        <div className="rounded-xl border border-accent/40 bg-base p-4">
          <p className="mb-4 text-sm font-semibold text-white">Nouvelle variante</p>
          <VariantForm
            v={newVariantDraft}
            onChange={(k, val) => {
              const next = { ...newVariantDraft, [k]: val };
              if (k === "name" && typeof val === "string" && !newVariantDraft.slug.trim()) {
                next.slug = generateSku(val);
              }
              onNewVariantChange(next);
            }}
          />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancelNewVariant}
              className="btn-ghost py-1.5 text-xs"
              disabled={saving}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={onSaveNewVariant}
              className="btn-primary py-1.5 text-xs"
              disabled={saving}
            >
              {saving ? "Enregistrement…" : "Enregistrer la variante"}
            </button>
          </div>
        </div>
      )}

      {draft.variants.length === 0 && !isAddingVariant && (
        <div className="rounded-xl border border-border bg-base px-6 py-10 text-center text-sm text-muted">
          <p>Aucune variante pour le moment.</p>
          <p className="mt-1 text-xs">Cliquez sur « + Ajouter une variante » pour créer la première valeur.</p>
        </div>
      )}

      {draft.variants.map((orig) => {
        const v = variantDrafts[orig.slug] ?? orig;
        const isEditing = editingVariant === orig.slug;
        const isConfirming = confirmDelete === orig.slug;
        const isDirty = isVariantDirty(orig, v);
        const status = stockBadge(v);
        const variantTitle = v.faceValue != null
          ? `${draft.name} ${v.faceValue} ${v.faceCurrency}`
          : v.name;

        return (
          <div key={orig.slug} className="rounded-xl border border-border bg-base">
            {/* Row header */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{variantTitle}</p>
                  <p className="font-mono text-[11px] text-muted">SKU: {v.slug}</p>
                </div>
                <span className={`chip ${v.active ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-500"}`}>
                  {v.active ? "Actif" : "Masqué"}
                </span>
                {v.featured && <span className="chip border-accent/30 text-accent">Mis en avant</span>}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted">
                {v.faceValue != null && (
                  <span className="font-medium text-white">{v.faceValue} {v.faceCurrency}</span>
                )}
                <span className="font-semibold text-white">{v.priceMad} MAD</span>
                <span className={`text-xs ${v.stockMode === "force_out_of_stock" ? "text-yellow-500" : v.stockMode === "force_in_stock" ? "text-green-400" : "text-muted"}`}>
                  {v.stockMode === "force_in_stock" ? "↑ En stock" : v.stockMode === "force_out_of_stock" ? "↓ En rupture" : `${v.inventoryUnused} codes`}
                </span>
                <ToggleSwitch
                  checked={v.active}
                  checkedLabel="Actif"
                  uncheckedLabel="Masqué"
                  onChange={(checked) => updateVariant(orig.slug, "active", checked)}
                  disabled={saving}
                  size="sm"
                />
                <ToggleSwitch
                  checked={v.featured}
                  checkedLabel="Mis en avant"
                  uncheckedLabel="Non mis en avant"
                  onChange={(checked) => updateVariant(orig.slug, "featured", checked)}
                  disabled={saving}
                  size="sm"
                />
                <select
                  value={v.stockMode}
                  onChange={(event) => updateVariant(orig.slug, "stockMode", event.target.value)}
                  className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-white outline-none transition hover:border-border-strong focus:border-accent"
                  disabled={saving}
                  title={`Mode de stock : ${stockModeLabel(v.stockMode)}`}
                >
                  {STOCK_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-1.5 text-xs">
                  <span>MAD</span>
                  <input
                    type="number"
                    min="0"
                    value={v.priceMad}
                    onChange={(event) => updateVariant(orig.slug, "priceMad", Number(event.target.value))}
                    className="h-8 w-20 rounded-lg border border-border bg-surface px-2 text-xs text-white outline-none transition hover:border-border-strong focus:border-accent"
                    disabled={saving}
                  />
                </label>
                <span className={`chip ${status.className}`}>{status.label}</span>
                {isDirty && (
                  <button
                    type="button"
                    onClick={() => onSaveVariant(orig.slug)}
                    className="btn-primary h-8 px-3 text-xs"
                    disabled={saving}
                  >
                    {saving ? "Enregistrement..." : "Enregistrer"}
                  </button>
                )}
                {isEditing ? (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setEditingVariant(null)} className="btn-ghost py-1 text-xs" disabled={saving}>
                      Annuler
                    </button>
                    <button type="button" onClick={() => onSaveVariant(orig.slug)} className="btn-primary py-1 text-xs" disabled={saving}>
                      {saving ? "…" : "Enregistrer"}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingVariant(orig.slug); setConfirmDelete(null); }}
                      className="text-xs font-medium text-accent hover:text-accent-hover"
                      disabled={saving}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateVariant(orig.slug)}
                      className="text-xs font-medium text-muted hover:text-white"
                      disabled={saving}
                    >
                      Dupliquer
                    </button>
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-400">Supprimer ?</span>
                        <button
                          type="button"
                          onClick={async () => { setConfirmDelete(null); await onDeleteVariant(orig.slug); }}
                          className="text-xs font-semibold text-red-400 hover:text-red-300"
                          disabled={saving}
                        >
                          Oui
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-muted hover:text-white"
                        >
                          Non
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(orig.slug)}
                        className="text-xs text-red-500/70 hover:text-red-400"
                        disabled={saving}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Inline editor */}
            {isEditing && (
              <div className="border-t border-border px-4 py-4">
                <VariantForm
                  v={v}
                  onChange={(k, val) => updateVariant(orig.slug, k, val)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Media tab ───────────────────────────────────────────────────────────────

function MediaTab({
  draft,
  update,
  onSave,
  saving,
}: {
  draft: ParentProductDTO;
  update: <K extends keyof ParentProductDTO>(k: K, v: ParentProductDTO[K]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      update("thumbnail", url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0">
        <p className="mb-2 text-sm font-medium text-white">Image du produit</p>
        <p className="mb-3 text-xs text-muted">
          Utilisée sur la carte produit et la page détail. Laissez vide pour afficher le visuel de secours.
        </p>

        {/* Upload button */}
        <label className={`relative flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-6 transition-colors ${
          uploading ? "border-accent/40 bg-accent/5" : "border-border hover:border-accent/50"
        }`}>
          <input
            type="file"
            accept="image/*"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={handleFile}
            disabled={uploading}
          />
          {uploading ? (
            <>
              <svg className="h-5 w-5 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              <span className="text-sm text-accent">Import en cours…</span>
            </>
          ) : (
            <>
              <svg className="h-5 w-5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium text-white">Importer une image</p>
                <p className="text-xs text-muted">PNG, JPG, WebP · max 5 MB</p>
              </div>
            </>
          )}
        </label>

        {uploadError && (
          <p className="mt-2 text-xs text-red-400">{uploadError}</p>
        )}

        {/* Manual URL fallback */}
        <div className="mt-3 min-w-0">
          <p className="mb-1.5 text-xs text-muted">Ou collez directement l’URL d’une image</p>
          <input
            className="input block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs"
            value={draft.thumbnail ?? ""}
            onChange={(e) => update("thumbnail", e.target.value || null)}
            placeholder="https://example.com/image.png"
          />
        </div>

        {draft.thumbnail && (
          <div className="mt-3 flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.thumbnail}
              alt=""
              className="h-14 w-20 shrink-0 rounded-lg border border-border object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="block max-w-full overflow-x-auto whitespace-nowrap font-mono text-[10px] leading-relaxed text-muted">
                {draft.thumbnail}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => update("thumbnail", null)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Retirer l’image
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  className="btn-primary px-3 py-1.5 text-xs"
                  disabled={saving}
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview card */}
      <div>
        <p className="mb-2 text-sm font-medium text-white">Aperçu</p>
        <ProductArt
          category={draft.category}
          imageUrl={draft.thumbnail}
          label={draft.name || draft.category}
          className="aspect-[16/9] w-full max-w-sm rounded-[14px] border border-border"
        />
        
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white">{label}</span>
      {children}
    </label>
  );
}
