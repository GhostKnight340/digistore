"use client";

import { useCallback, useEffect, useState } from "react";
import type { ParentProductDTO, VariantDTO, SaveVariantInput } from "@/lib/dto";
import {
  getParentProductsAction,
  saveParentProductAction,
  saveVariantAction,
  deleteVariantAction,
  deleteParentProductAction,
  duplicateParentProductAction,
} from "@/app/actions/admin";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ["steam", "playstation", "xbox", "nintendo", "roblox", "valorant"] as const;

const BG_PRESETS: Record<string, { label: string; from: string; to: string }> = {
  steam:       { label: "Steam Dark",       from: "#1b2838", to: "#2a475e" },
  playstation: { label: "PlayStation Blue", from: "#0033a0", to: "#0a6bff" },
  xbox:        { label: "Xbox Green",       from: "#0e7a0d", to: "#16c60c" },
  nintendo:    { label: "Nintendo Red",     from: "#b30000", to: "#ff4554" },
  roblox:      { label: "Roblox Dark",      from: "#2b2b2b", to: "#5a5a5a" },
  valorant:    { label: "Valorant Red",     from: "#7a1320", to: "#ff4655" },
};

const CURRENCIES = ["MAD", "EUR", "USD", "GBP", "SAR"];
const STOCK_CONTROLS = ["manual", "api"];
type EditorTab = "details" | "content" | "variants" | "media";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradientStyle(category: string) {
  const p = BG_PRESETS[category];
  return p
    ? { background: `linear-gradient(135deg, ${p.from}, ${p.to})` }
    : { background: "#1e2029" };
}

function emptyParent(): ParentProductDTO {
  return {
    slug: "",
    name: "",
    category: "steam",
    brand: null,
    region: "",
    deliveryType: "Code numérique instantané",
    description: "",
    shortDescription: null,
    longDescription: null,
    instructions: null,
    thumbnail: null,
    active: true,
    createdAt: new Date().toISOString(),
    variants: [],
  };
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export default function ProductsPanel() {
  const [parents, setParents] = useState<ParentProductDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParentProductDTO | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("details");
  const [variantDrafts, setVariantDrafts] = useState<Record<string, VariantDTO>>({});
  const [editingVariant, setEditingVariant] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [isAddingVariant, setIsAddingVariant] = useState(false);
  const [newVariantDraft, setNewVariantDraft] = useState<VariantDTO | null>(null);
  // Parent product management
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"cascade" | "move">("cascade");
  const [moveTarget, setMoveTarget] = useState("");
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [dupSlug, setDupSlug] = useState("");
  const [dupName, setDupName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getParentProductsAction();
      setParents(data);
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openParent(p: ParentProductDTO) {
    setSelectedSlug(p.slug);
    setIsNew(false);
    setDraft({ ...p, variants: p.variants.map((v) => ({ ...v })) });
    setVariantDrafts(Object.fromEntries(p.variants.map((v) => [v.slug, { ...v }])));
    setEditingVariant(null);
    setIsAddingVariant(false);
    setNewVariantDraft(null);
    setActiveTab("details");
    setMsg(null);
  }

  function openNew() {
    const blank = emptyParent();
    setSelectedSlug("__new__");
    setIsNew(true);
    setDraft(blank);
    setVariantDrafts({});
    setEditingVariant(null);
    setActiveTab("details");
    setMsg(null);
  }

  function updateDraft<K extends keyof ParentProductDTO>(k: K, v: ParentProductDTO[K]) {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  }

  function updateVariant<K extends keyof VariantDTO>(slug: string, k: K, v: VariantDTO[K]) {
    setVariantDrafts((prev) => ({ ...prev, [slug]: { ...prev[slug], [k]: v } }));
  }

  function cancel() {
    if (isNew) {
      setSelectedSlug(null);
      setDraft(null);
    } else {
      const original = parents.find((p) => p.slug === selectedSlug);
      if (original) openParent(original);
    }
    setMsg(null);
  }

  async function save() {
    if (!draft) return;
    if (!draft.slug.trim() || !draft.name.trim()) {
      setMsg({ text: "Slug and name are required.", ok: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    const result = await saveParentProductAction({
      slug: draft.slug.trim(),
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
    });
    if (result.ok) {
      setMsg({ text: "Saved.", ok: true });
      setIsNew(false);
      await load();
    } else {
      setMsg({ text: result.error ?? "Unknown error.", ok: false });
    }
    setSaving(false);
  }

  async function handleToggleArchive() {
    if (!draft) return;
    setSaving(true);
    setMsg(null);
    setShowMenu(false);
    const result = await saveParentProductAction({
      slug: draft.slug,
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
      active: !draft.active,
    });
    if (result.ok) {
      setMsg({ text: draft.active ? "Archived." : "Unarchived.", ok: true });
      await load();
    } else {
      setMsg({ text: result.error ?? "Failed.", ok: false });
    }
    setSaving(false);
  }

  function openDuplicateDialog() {
    if (!draft) return;
    setDupSlug(`${draft.slug}-copy`);
    setDupName(`${draft.name} (Copy)`);
    setShowDuplicateDialog(true);
    setShowMenu(false);
  }

  async function handleDuplicate() {
    if (!draft) return;
    setSaving(true);
    setMsg(null);
    const result = await duplicateParentProductAction(draft.slug, dupSlug.trim(), dupName.trim());
    setShowDuplicateDialog(false);
    if (result.ok) {
      setMsg({ text: "Product duplicated.", ok: true });
      await load();
    } else {
      setMsg({ text: result.error ?? "Failed.", ok: false });
    }
    setSaving(false);
  }

  function openDeleteDialog() {
    if (!draft) return;
    setDeleteMode("cascade");
    setMoveTarget(
      parents.find((p) => p.slug !== draft.slug)?.slug ?? "",
    );
    setShowDeleteDialog(true);
    setShowMenu(false);
  }

  async function handleDelete() {
    if (!draft) return;
    setSaving(true);
    setMsg(null);
    const result = await deleteParentProductAction(
      draft.slug,
      deleteMode === "cascade",
      deleteMode === "move" ? moveTarget : undefined,
    );
    setShowDeleteDialog(false);
    if (result.ok) {
      setSelectedSlug(null);
      setDraft(null);
      setMsg({ text: "Product deleted.", ok: true });
      await load();
    } else {
      setMsg({ text: result.error ?? "Failed.", ok: false });
    }
    setSaving(false);
  }

  function startAddVariant() {
    if (!draft) return;
    setIsAddingVariant(true);
    setEditingVariant(null);
    setNewVariantDraft({
      id: "",
      slug: `${draft.slug}-`,
      name: draft.name,
      priceMad: 0,
      faceValue: null,
      faceCurrency: "MAD",
      active: true,
      featured: false,
      stockControl: "manual",
      stockMode: "automatic",
      inventoryUnused: 0,
    });
    setMsg(null);
  }

  function cancelAddVariant() {
    setIsAddingVariant(false);
    setNewVariantDraft(null);
  }

  async function saveNewVariant() {
    if (!draft || !newVariantDraft) return;
    if (!newVariantDraft.slug.trim() || !newVariantDraft.name.trim()) {
      setMsg({ text: "Slug and name are required for the new variant.", ok: false });
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
      region: draft.region,
      deliveryType: draft.deliveryType,
      active: newVariantDraft.active,
      featured: newVariantDraft.featured,
      stockControl: newVariantDraft.stockControl,
      stockMode: newVariantDraft.stockMode,
    };
    const result = await saveVariantAction(input);
    if (result.ok) {
      setMsg({ text: "Variant added.", ok: true });
      setIsAddingVariant(false);
      setNewVariantDraft(null);
      await load();
    } else {
      setMsg({ text: result.error ?? "Unknown error.", ok: false });
    }
    setSaving(false);
  }

  async function deleteVariantHandler(slug: string) {
    setSaving(true);
    setMsg(null);
    const result = await deleteVariantAction(slug);
    if (result.ok) {
      setMsg({ text: "Variant deleted.", ok: true });
      await load();
    } else {
      setMsg({ text: result.error ?? "Unknown error.", ok: false });
    }
    setSaving(false);
  }

  async function saveVariant(slug: string) {
    if (!draft) return;
    const v = variantDrafts[slug];
    if (!v) return;
    setSaving(true);
    const input: SaveVariantInput = {
      slug: v.slug,
      name: v.name,
      parentSlug: draft.slug,
      category: draft.category,
      priceMad: v.priceMad,
      faceValue: v.faceValue,
      faceCurrency: v.faceCurrency,
      region: draft.region,
      deliveryType: draft.deliveryType,
      active: v.active,
      featured: v.featured,
      stockControl: v.stockControl,
      stockMode: v.stockMode,
    };
    const result = await saveVariantAction(input);
    if (result.ok) {
      setMsg({ text: `Variant "${v.name}" saved.`, ok: true });
      setEditingVariant(null);
      await load();
    } else {
      setMsg({ text: result.error ?? "Unknown error.", ok: false });
    }
    setSaving(false);
  }

  return (
    <div className="grid h-full gap-6 lg:grid-cols-[260px_1fr]">
      {/* ── Left: parent list ── */}
      <aside className="h-fit">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-white">Products</h2>
              <p className="text-xs text-muted">{parents.length} parent product{parents.length !== 1 ? "s" : ""}</p>
            </div>
            <button type="button" onClick={openNew} className="btn-primary py-1 text-xs">
              + New
            </button>
          </div>

          {loading ? (
            <p className="px-4 py-6 text-sm text-muted">Loading…</p>
          ) : loadError ? (
            <p className="px-4 py-6 text-sm text-red-400 break-all">{loadError}</p>
          ) : parents.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted">
              <p className="font-medium text-white">No products yet.</p>
              <p className="mt-1 text-xs">Run the Supabase setup SQL to seed parent products, or click + New.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {CATEGORIES.map((catId) => {
                const group = parents.filter((p) => p.category === catId);
                if (group.length === 0) return null;
                return (
                  <div key={catId}>
                    <div className="px-4 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-faint">
                        {catId}
                      </span>
                    </div>
                    {group.map((p) => (
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
                          style={gradientStyle(p.category)}
                        />
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-medium ${selectedSlug === p.slug ? "text-white" : "text-muted"}`}>
                            {p.name}
                          </p>
                          <p className="text-xs text-muted">
                            {p.variants.length} variant{p.variants.length !== 1 ? "s" : ""}
                            {" · "}
                            {p.active ? "Active" : <span className="text-yellow-500">Hidden</span>}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
              {/* Products with unknown/custom categories */}
              {parents.filter((p) => !(CATEGORIES as readonly string[]).includes(p.category)).map((p) => (
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
                    style={gradientStyle(p.category)}
                  />
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${selectedSlug === p.slug ? "text-white" : "text-muted"}`}>
                      {p.name}
                    </p>
                    <p className="text-xs text-muted">
                      {p.variants.length} variant{p.variants.length !== 1 ? "s" : ""}
                      {" · "}
                      {p.active ? "Active" : <span className="text-yellow-500">Hidden</span>}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── Right: editor ── */}
      {!draft ? (
        <div className="card flex items-center justify-center p-16 text-center">
          <div>
            <p className="text-3xl">🛍️</p>
            <p className="mt-2 text-sm text-muted">Select a product to edit, or click + New</p>
          </div>
        </div>
      ) : (
        <section className="space-y-4">
          {/* Header */}
          <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="font-bold text-white">{draft.name || "New product"}</h2>
              <p className="text-xs text-muted">{isNew ? "Unsaved" : draft.slug}</p>
            </div>
            <div className="flex items-center gap-2">
              {msg && (
                <span className={`text-xs ${msg.ok ? "text-green-400" : "text-red-400"}`}>
                  {msg.text}
                </span>
              )}
              <button type="button" onClick={cancel} className="btn-ghost text-sm" disabled={saving}>
                Cancel
              </button>
              <button type="button" onClick={save} className="btn-primary text-sm" disabled={saving}>
                {saving ? "Saving…" : "Save product"}
              </button>
              {!isNew && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowMenu((v) => !v)}
                    className="btn-ghost h-9 w-9 text-lg leading-none"
                    aria-label="More actions"
                    disabled={saving}
                  >
                    ⋮
                  </button>
                  {showMenu && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-10"
                        aria-label="Close menu"
                        onClick={() => setShowMenu(false)}
                      />
                      <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
                        <button
                          type="button"
                          onClick={() => { setActiveTab("details"); setShowMenu(false); }}
                          className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/5"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={handleToggleArchive}
                          className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/5"
                        >
                          {draft.active ? "Archive" : "Unarchive"}
                        </button>
                        <button
                          type="button"
                          onClick={openDuplicateDialog}
                          className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/5"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={openDeleteDialog}
                          className="w-full border-t border-border px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Delete dialog */}
          {showDeleteDialog && draft && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/60"
                onClick={() => setShowDeleteDialog(false)}
              />
              <div className="relative w-full max-w-sm rounded-2xl border border-border bg-base p-6 shadow-2xl">
                <h3 className="font-bold text-white">Delete "{draft.name}"?</h3>
                <p className="mt-1 text-sm text-muted">This cannot be undone.</p>

                {draft.variants.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-white">
                      This product has <strong>{draft.variants.length}</strong> variant(s). Choose what to do:
                    </p>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                      <input
                        type="radio"
                        name="deleteMode"
                        value="cascade"
                        checked={deleteMode === "cascade"}
                        onChange={() => setDeleteMode("cascade")}
                        className="accent-[#3e7bfa]"
                      />
                      Delete all variants too
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                      <input
                        type="radio"
                        name="deleteMode"
                        value="move"
                        checked={deleteMode === "move"}
                        onChange={() => setDeleteMode("move")}
                        className="accent-[#3e7bfa]"
                      />
                      Move variants to another product
                    </label>
                    {deleteMode === "move" && (
                      <select
                        className="input mt-1"
                        value={moveTarget}
                        onChange={(e) => setMoveTarget(e.target.value)}
                      >
                        {parents
                          .filter((p) => p.slug !== draft.slug)
                          .map((p) => (
                            <option key={p.slug} value={p.slug}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteDialog(false)}
                    className="btn-ghost text-sm"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving || (deleteMode === "move" && !moveTarget)}
                    className="h-9 rounded-lg border border-red-500/50 bg-red-500/10 px-4 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {saving ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Duplicate dialog */}
          {showDuplicateDialog && draft && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/60"
                onClick={() => setShowDuplicateDialog(false)}
              />
              <div className="relative w-full max-w-sm rounded-2xl border border-border bg-base p-6 shadow-2xl">
                <h3 className="font-bold text-white">Duplicate "{draft.name}"</h3>
                <p className="mt-1 text-sm text-muted">
                  The duplicate starts inactive. Variants are copied.
                </p>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-white">New name</span>
                    <input
                      className="input"
                      value={dupName}
                      onChange={(e) => setDupName(e.target.value)}
                      placeholder="My Product (Copy)"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-white">New slug</span>
                    <input
                      className="input font-mono"
                      value={dupSlug}
                      onChange={(e) =>
                        setDupSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))
                      }
                      placeholder="my-product-copy"
                    />
                  </label>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDuplicateDialog(false)}
                    className="btn-ghost text-sm"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    disabled={saving || !dupName.trim() || !dupSlug.trim()}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {saving ? "Duplicating…" : "Duplicate"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="card overflow-hidden">
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
                  {tab}
                  {tab === "variants" && draft.variants.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">
                      {draft.variants.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-5">
              {activeTab === "details" && <DetailsTab draft={draft} update={updateDraft} />}
              {activeTab === "content" && <ContentTab draft={draft} update={updateDraft} />}
              {activeTab === "variants" && (
                <VariantsTab
                  draft={draft}
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
                />
              )}
              {activeTab === "media" && <MediaTab draft={draft} update={updateDraft} />}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Details tab ─────────────────────────────────────────────────────────────

function DetailsTab({
  draft,
  update,
}: {
  draft: ParentProductDTO;
  update: <K extends keyof ParentProductDTO>(k: K, v: ParentProductDTO[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name *">
          <input
            className="input"
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
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
        <Field label="Category">
          <select
            className="input"
            value={draft.category}
            onChange={(e) => update("category", e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Brand / Platform">
          <input
            className="input"
            value={draft.brand ?? ""}
            onChange={(e) => update("brand", e.target.value || null)}
            placeholder="Valve"
          />
        </Field>
        <Field label="Region">
          <input
            className="input"
            value={draft.region}
            onChange={(e) => update("region", e.target.value)}
            placeholder="Maroc / Global"
          />
        </Field>
        <Field label="Delivery type">
          <input
            className="input"
            value={draft.deliveryType}
            onChange={(e) => update("deliveryType", e.target.value)}
            placeholder="Code numérique instantané"
          />
        </Field>
      </div>

      <div className="flex items-center gap-6">
        <Toggle
          label="Active (visible in store)"
          checked={draft.active}
          onChange={(v) => update("active", v)}
        />
      </div>
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
      <Field label="Short description">
        <input
          className="input"
          value={draft.shortDescription ?? ""}
          onChange={(e) => update("shortDescription", e.target.value || null)}
          placeholder="One-line tagline shown on category pages"
        />
      </Field>
      <Field label="Long description">
        <textarea
          className="input min-h-[100px] resize-y"
          value={draft.longDescription ?? ""}
          onChange={(e) => update("longDescription", e.target.value || null)}
          placeholder="Full product description shown on the product page"
        />
      </Field>
      <Field label="Description (meta / fallback)">
        <textarea
          className="input min-h-[80px] resize-y"
          value={draft.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Short description used as meta description and fallback"
        />
      </Field>
      <Field label="Redemption instructions">
        <textarea
          className="input min-h-[120px] resize-y font-mono text-xs"
          value={draft.instructions ?? ""}
          onChange={(e) => update("instructions", e.target.value || null)}
          placeholder={"1. Open Steam…\n2. Click…"}
        />
      </Field>
    </div>
  );
}

// ─── Variants tab ────────────────────────────────────────────────────────────

function VariantForm({
  v,
  slugEditable,
  onChange,
}: {
  v: VariantDTO;
  slugEditable?: boolean;
  onChange: <K extends keyof VariantDTO>(k: K, val: VariantDTO[K]) => void;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {slugEditable && (
          <Field label="Slug *">
            <input
              className="input font-mono"
              value={v.slug}
              onChange={(e) => onChange("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              placeholder="steam-wallet-50-eur"
            />
          </Field>
        )}
        <Field label="Variant name *">
          <input
            className="input"
            value={v.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="Steam Wallet 50 EUR"
          />
        </Field>
        <Field label="Face value">
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
        <Field label="Face currency">
          <select
            className="input"
            value={v.faceCurrency}
            onChange={(e) => onChange("faceCurrency", e.target.value)}
          >
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Price (MAD)">
          <input
            className="input"
            type="number"
            min="0"
            value={v.priceMad}
            onChange={(e) => onChange("priceMad", Number(e.target.value))}
          />
        </Field>
        <Field label="Stock control">
          <select
            className="input"
            value={v.stockControl}
            onChange={(e) => onChange("stockControl", e.target.value)}
          >
            {STOCK_CONTROLS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label={`Stock display${!slugEditable ? ` · ${v.inventoryUnused} code(s)` : ""}`}>
          <select
            className="input"
            value={v.stockMode}
            onChange={(e) => onChange("stockMode", e.target.value)}
          >
            <option value="automatic">Automatique (inventaire)</option>
            <option value="force_in_stock">Toujours En stock</option>
            <option value="force_out_of_stock">Toujours En rupture</option>
          </select>
        </Field>
        {!slugEditable && (
          <Field label="Inventory (unused codes)">
            <input className="input" value={v.inventoryUnused} disabled readOnly />
          </Field>
        )}
      </div>
      <div className="mt-4 flex gap-6">
        <Toggle label="Active" checked={v.active} onChange={(val) => onChange("active", val)} />
        <Toggle label="Featured" checked={v.featured} onChange={(val) => onChange("featured", val)} />
      </div>
    </>
  );
}

function VariantsTab({
  draft,
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
}: {
  draft: ParentProductDTO;
  variantDrafts: Record<string, VariantDTO>;
  editingVariant: string | null;
  setEditingVariant: (slug: string | null) => void;
  updateVariant: <K extends keyof VariantDTO>(slug: string, k: K, v: VariantDTO[K]) => void;
  onSaveVariant: (slug: string) => Promise<void>;
  saving: boolean;
  isAddingVariant: boolean;
  newVariantDraft: VariantDTO | null;
  onAddVariant: () => void;
  onNewVariantChange: (draft: VariantDTO) => void;
  onSaveNewVariant: () => Promise<void>;
  onCancelNewVariant: () => void;
  onDeleteVariant: (slug: string) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {/* Add variant button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onAddVariant}
          disabled={isAddingVariant || saving}
          className="btn-primary py-1.5 text-xs"
        >
          + Add variant
        </button>
      </div>

      {/* New variant form */}
      {isAddingVariant && newVariantDraft && (
        <div className="rounded-xl border border-accent/40 bg-base p-4">
          <p className="mb-4 text-sm font-semibold text-white">New variant</p>
          <VariantForm
            v={newVariantDraft}
            slugEditable
            onChange={(k, val) => onNewVariantChange({ ...newVariantDraft, [k]: val })}
          />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancelNewVariant}
              className="btn-ghost py-1.5 text-xs"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveNewVariant}
              className="btn-primary py-1.5 text-xs"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save variant"}
            </button>
          </div>
        </div>
      )}

      {draft.variants.length === 0 && !isAddingVariant && (
        <div className="rounded-xl border border-border bg-base px-6 py-10 text-center text-sm text-muted">
          <p>No variants yet.</p>
          <p className="mt-1 text-xs">Click &ldquo;+ Add variant&rdquo; above to create the first variant.</p>
        </div>
      )}

      {draft.variants.map((orig) => {
        const v = variantDrafts[orig.slug] ?? orig;
        const isEditing = editingVariant === orig.slug;
        const isConfirming = confirmDelete === orig.slug;
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
                  <p className="font-mono text-[11px] text-muted">SKU: {orig.slug}</p>
                </div>
                <span className={`chip ${v.active ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-500"}`}>
                  {v.active ? "Active" : "Hidden"}
                </span>
                {v.featured && <span className="chip border-accent/30 text-accent">Featured</span>}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted">
                {v.faceValue != null && (
                  <span className="font-medium text-white">{v.faceValue} {v.faceCurrency}</span>
                )}
                <span className="font-semibold text-white">{v.priceMad} MAD</span>
                <span className={`text-xs ${v.stockMode === "force_out_of_stock" ? "text-yellow-500" : v.stockMode === "force_in_stock" ? "text-green-400" : "text-muted"}`}>
                  {v.stockMode === "force_in_stock" ? "↑ En stock" : v.stockMode === "force_out_of_stock" ? "↓ En rupture" : `${v.inventoryUnused} codes`}
                </span>
                {isEditing ? (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setEditingVariant(null)} className="btn-ghost py-1 text-xs" disabled={saving}>
                      Cancel
                    </button>
                    <button type="button" onClick={() => onSaveVariant(orig.slug)} className="btn-primary py-1 text-xs" disabled={saving}>
                      {saving ? "…" : "Save"}
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
                      Edit
                    </button>
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-400">Delete?</span>
                        <button
                          type="button"
                          onClick={async () => { setConfirmDelete(null); await onDeleteVariant(orig.slug); }}
                          className="text-xs font-semibold text-red-400 hover:text-red-300"
                          disabled={saving}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-muted hover:text-white"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(orig.slug)}
                        className="text-xs text-red-500/70 hover:text-red-400"
                        disabled={saving}
                      >
                        Delete
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
}: {
  draft: ParentProductDTO;
  update: <K extends keyof ParentProductDTO>(k: K, v: ParentProductDTO[K]) => void;
}) {
  const preset = BG_PRESETS[draft.category];
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      update("thumbnail", data.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium text-white">Thumbnail image</p>
        <p className="mb-3 text-xs text-muted">
          Used as the product card and detail page image. Leave blank to show the background gradient.
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
              <span className="text-sm text-accent">Uploading…</span>
            </>
          ) : (
            <>
              <svg className="h-5 w-5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium text-white">Click to upload</p>
                <p className="text-xs text-muted">PNG, JPG, WebP · max 5 MB</p>
              </div>
            </>
          )}
        </label>

        {uploadError && (
          <p className="mt-2 text-xs text-red-400">{uploadError}</p>
        )}

        {/* Manual URL fallback */}
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-muted">Or paste an image URL directly</p>
          <input
            className="input text-xs"
            value={draft.thumbnail ?? ""}
            onChange={(e) => update("thumbnail", e.target.value || null)}
            placeholder="https://example.com/image.png"
          />
        </div>

        {draft.thumbnail && (
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.thumbnail}
              alt=""
              className="h-14 w-20 rounded-lg object-cover border border-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="min-w-0">
              <p className="truncate font-mono text-[10px] text-muted">{draft.thumbnail}</p>
              <button
                type="button"
                onClick={() => update("thumbnail", null)}
                className="mt-1 text-xs text-red-400 hover:text-red-300"
              >
                Remove image
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-white">Background preset</p>
        <p className="mb-3 text-xs text-muted">
          Auto-selected from the category set in Details. Change the category to update the preset.
        </p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(BG_PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              title={p.label}
              onClick={() => update("category", key)}
              className={`relative h-14 w-24 rounded-xl transition-all ${
                draft.category === key ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "opacity-60 hover:opacity-100"
              }`}
              style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
            >
              <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] font-semibold uppercase tracking-wide text-white/70">
                {key}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview card */}
      <div>
        <p className="mb-2 text-sm font-medium text-white">Preview</p>
        <div
          className="relative h-36 w-56 overflow-hidden rounded-2xl"
          style={gradientStyle(draft.category)}
        >
          {draft.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.thumbnail}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
          )}
          <div className="absolute inset-0 flex flex-col justify-end p-3">
            <p className="text-xs font-bold uppercase tracking-widest text-white/60">
              {draft.category}
            </p>
            <p className="text-sm font-bold text-white">{draft.name || "Product name"}</p>
          </div>
        </div>
        {preset && (
          <p className="mt-2 text-xs text-muted">
            Active preset: <span className="text-white">{preset.label}</span>
          </p>
        )}
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[#3e7bfa]"
      />
      <span>{label}</span>
    </label>
  );
}
