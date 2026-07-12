"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteCategoryAction,
  getAdminCategoriesAction,
  getCategoryProductMediaAction,
  reorderCategoriesAction,
  saveCategoryAction,
  seedBrandLandingAction,
} from "@/app/actions/admin";
import { uploadImageFile } from "@/lib/clientUpload";
import type { AdminCategoryDTO, SaveCategoryInput } from "@/lib/dto";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import {
  defaultCategoryLanding,
  isValidCtaUrl,
  APPROVED_INFO_ICONS,
  NAVIGATOR_TIP_TYPES,
  MAX_INFO_ITEMS,
  type CategoryLanding,
  type CategoryInfoItem,
  type CategoryFaqItem,
  type InfoIconKey,
} from "@/lib/categoryLanding";

function emptyCategory(sortOrder: number): AdminCategoryDTO {
  return {
    id: "",
    slug: "",
    seoSlug: "",
    name: "",
    description: "",
    icon: "",
    iconUrl: null,
    coverImageUrl: null,
    accentColor: "#3e7bfa",
    active: true,
    sortOrder,
    productCount: 0,
    landing: defaultCategoryLanding(),
  };
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

export default function CategoriesPanel() {
  const [categories, setCategories] = useState<AdminCategoryDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminCategoryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  // When deleting a category that still holds products, the admin must first
  // pick where those products go (Product.category is a required FK).
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>("");
  // Products of the selected category that have an image — offered as a source
  // for the category cover so a single-product category can reuse its visual.
  const [productMedia, setProductMedia] = useState<
    { id: string; name: string; imageUrl: string }[]
  >([]);

  const selected = useMemo(
    () => categories.find((category) => category.id === selectedId) ?? null,
    [categories, selectedId],
  );

  async function load() {
    setLoading(true);
    const data = await getAdminCategoriesAction();
    setCategories(data);
    if (!selectedId && data[0]) {
      setSelectedId(data[0].id);
      setDraft(data[0]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the selected category's product images (source for the cover). Only
  // saved categories have products; a brand-new draft has none yet.
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setProductMedia([]);
      return;
    }
    getCategoryProductMediaAction(selectedId)
      .then((media) => {
        if (!cancelled) setProductMedia(media);
      })
      .catch(() => {
        if (!cancelled) setProductMedia([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function selectCategory(category: AdminCategoryDTO) {
    setSelectedId(category.id);
    setDraft(category);
    setMessage(null);
    setReassignOpen(false);
  }

  function createNew() {
    const next = emptyCategory(categories.length);
    setSelectedId(null);
    setDraft(next);
    setMessage(null);
    setReassignOpen(false);
  }

  function update<K extends keyof AdminCategoryDTO>(key: K, value: AdminCategoryDTO[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function upload(kind: "iconUrl" | "coverImageUrl", file: File | null) {
    if (!file || !draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const url = await uploadImageFile(file);
      update(kind, url);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Import impossible.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    const input: SaveCategoryInput = {
      originalId: selected?.id,
      slug: draft.slug || slugify(draft.name),
      seoSlug: draft.seoSlug,
      name: draft.name,
      description: draft.description,
      icon: draft.icon,
      iconUrl: draft.iconUrl,
      coverImageUrl: draft.coverImageUrl,
      accentColor: draft.accentColor,
      active: draft.active,
      sortOrder: draft.sortOrder,
      landing: draft.landing ?? defaultCategoryLanding(),
    };
    const result = await saveCategoryAction(input);
    if (result.ok && result.category) {
      setMessage({ text: "Catégorie enregistrée.", ok: true });
      await load();
      setSelectedId(result.category.id);
      setDraft(result.category);
    } else {
      setMessage({ text: result.error ?? "Enregistrement impossible.", ok: false });
    }
    setSaving(false);
  }

  async function seedLanding(force: boolean) {
    const prompt = force
      ? "Remplacer le contenu des pages catégorie des marques connues par le contenu prédéfini le plus récent ?\n\n⚠️ Cela ÉCRASE le contenu existant de ces marques (vos modifications manuelles seront perdues)."
      : "Remplir automatiquement le contenu des pages catégorie pour les marques connues (Steam, PlayStation, Xbox, Nintendo, Google Play, Apple, Netflix, Roblox, PUBG, Free Fire) ?\n\nSeules les catégories encore vides seront remplies — votre contenu existant n'est pas modifié.";
    if (!window.confirm(prompt)) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await seedBrandLandingAction(force);
      if (result.ok) {
        setMessage({
          text: `${result.filled} marque${result.filled > 1 ? "s" : ""} remplie${
            result.filled > 1 ? "s" : ""
          }, ${result.skipped} déjà remplie${result.skipped > 1 ? "s" : ""} (ignorée${
            result.skipped > 1 ? "s" : ""
          }).`,
          ok: true,
        });
        await load();
        if (selectedId) {
          const refreshed = (await getAdminCategoriesAction()).find((c) => c.id === selectedId);
          if (refreshed) setDraft(refreshed);
        }
      } else {
        setMessage({ text: result.error ?? "Remplissage impossible.", ok: false });
      }
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Remplissage impossible.",
        ok: false,
      });
    } finally {
      setSaving(false);
    }
  }

  async function move(category: AdminCategoryDTO, direction: -1 | 1) {
    const index = categories.findIndex((item) => item.id === category.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next.map((item, sortOrder) => ({ ...item, sortOrder })));
    await reorderCategoriesAction(next.map((item) => item.id));
    await load();
  }

  async function deleteCategory(reassignToId?: string) {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await deleteCategoryAction(selected.id, reassignToId);
      if (result.ok) {
        setMessage({ text: "Catégorie supprimée.", ok: true });
        setReassignOpen(false);
        setReassignTo("");
        setSelectedId(null);
        setDraft(null);
        await load();
      } else {
        setMessage({ text: result.error ?? "Suppression impossible.", ok: false });
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Suppression impossible.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    if (!selected) return;
    // Non-empty category: open the reassignment picker instead of deleting.
    if (selected.productCount > 0) {
      const firstOther = categories.find((c) => c.id !== selected.id);
      setReassignTo(firstOther?.id ?? "");
      setReassignOpen(true);
      setMessage(null);
      return;
    }
    if (!window.confirm(`Supprimer la catégorie « ${selected.name} » ?`)) return;
    void deleteCategory();
  }

  function confirmReassignDelete() {
    if (!selected || !reassignTo) return;
    const target = categories.find((c) => c.id === reassignTo);
    if (
      !window.confirm(
        `Déplacer ${selected.productCount} produit${selected.productCount > 1 ? "s" : ""} vers « ${
          target?.name ?? reassignTo
        } », puis supprimer « ${selected.name} » ?`,
      )
    ) {
      return;
    }
    void deleteCategory(reassignTo);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-white">Catégories</h2>
              <p className="text-xs text-muted">{categories.length} catégorie{categories.length > 1 ? "s" : ""}</p>
            </div>
            <button type="button" onClick={createNew} className="btn-primary py-1.5 text-xs">
              + Créer
            </button>
          </div>
          <button
            type="button"
            onClick={() => seedLanding(false)}
            disabled={saving}
            className="btn-ghost mt-3 w-full py-1.5 text-xs disabled:opacity-50"
            title="Remplit les pages catégorie des marques connues (catégories vides uniquement)"
          >
            ✨ Remplir le contenu des marques
          </button>
          <button
            type="button"
            onClick={() => seedLanding(true)}
            disabled={saving}
            className="mt-1.5 w-full text-center text-[11px] text-muted underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
            title="Remplace le contenu des marques par le contenu prédéfini le plus récent"
          >
            Mettre à jour / tout remplacer
          </button>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-muted">Chargement...</p>
        ) : (
          <div className="divide-y divide-border">
            {categories.map((category, index) => (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface ${
                  selectedId === category.id ? "bg-accent/10" : ""
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface2 text-xs font-bold text-muted">
                  {category.icon || category.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{category.name}</span>
                  <span className="text-xs text-muted">
                    {category.productCount} produit{category.productCount > 1 ? "s" : ""} · {category.active ? "Visible" : "Masquée"}
                  </span>
                </span>
                <span className="flex gap-1">
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      move(category, -1);
                    }}
                    className={`rounded border border-border px-1.5 text-xs ${index === 0 ? "opacity-30" : ""}`}
                  >
                    ↑
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      move(category, 1);
                    }}
                    className={`rounded border border-border px-1.5 text-xs ${index === categories.length - 1 ? "opacity-30" : ""}`}
                  >
                    ↓
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <div className="card p-5">
        {!draft ? (
          <div className="grid min-h-80 place-items-center text-center text-sm text-muted">
            Sélectionnez une catégorie ou créez-en une nouvelle.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Édition catégorie</p>
                <h2 className="mt-1 text-2xl font-bold text-white">{draft.name || "Nouvelle catégorie"}</h2>
              </div>
              <ToggleSwitch
                label="Visibilité"
                checked={draft.active}
                checkedLabel="Visible"
                uncheckedLabel="Masquée"
                onChange={(value) => update("active", value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom">
                <input
                  className="input"
                  value={draft.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    update("name", name);
                    if (!selected) update("slug", slugify(name));
                  }}
                />
              </Field>
              <Field label="Slug">
                <input
                  className="input font-mono"
                  value={draft.slug}
                  onChange={(event) => update("slug", slugify(event.target.value))}
                />
              </Field>
              <Field label="Icône texte">
                <input className="input" value={draft.icon} onChange={(event) => update("icon", event.target.value)} placeholder="ST" />
              </Field>
            </div>

            <Field label="Slug de la page (URL SEO)">
              <input
                className="input font-mono"
                value={draft.seoSlug}
                onChange={(event) => update("seoSlug", slugify(event.target.value))}
                placeholder="carte-steam-au-maroc"
              />
              <span className="mt-1 block text-[11px] text-muted">
                {draft.seoSlug
                  ? `URL : ghost.ma/categorie/${draft.seoSlug}`
                  : "Laissez vide pour garder l'ancienne URL (?category=). Renseignez un slug pour une URL optimisée SEO."}
              </span>
            </Field>

            <Field label="Description">
              <textarea
                className="input min-h-24 resize-y"
                value={draft.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <UploadField
                label="Icône image"
                value={draft.iconUrl}
                disabled={saving}
                onClear={() => update("iconUrl", null)}
                onFile={(file) => upload("iconUrl", file)}
                onUrl={(url) => update("iconUrl", url)}
              />
              <UploadField
                label="Bannière / couverture"
                value={draft.coverImageUrl}
                disabled={saving}
                onClear={() => update("coverImageUrl", null)}
                onFile={(file) => upload("coverImageUrl", file)}
                onUrl={(url) => update("coverImageUrl", url)}
              />
            </div>

            {productMedia.length > 0 && (
              <ProductMediaPicker
                media={productMedia}
                selectedUrl={draft.coverImageUrl}
                onPick={(url) => update("coverImageUrl", url)}
              />
            )}

            <LandingEditor
              landing={draft.landing}
              categories={categories}
              currentId={selected?.id}
              disabled={saving}
              onChange={(next) => update("landing", next)}
            />

            {message ? (
              <p className={`text-sm ${message.ok ? "text-green-400" : "text-red-400"}`}>{message.text}</p>
            ) : null}

            {reassignOpen && selected ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4">
                <p className="text-sm font-semibold text-red-200">
                  « {selected.name} » contient {selected.productCount} produit
                  {selected.productCount > 1 ? "s" : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Choisissez la catégorie vers laquelle déplacer {selected.productCount > 1 ? "ces produits" : "ce produit"} avant la suppression.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <select
                    className="input max-w-xs"
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    disabled={saving}
                  >
                    {categories
                      .filter((c) => c.id !== selected.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={confirmReassignDelete}
                    disabled={saving || !reassignTo}
                    className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                  >
                    {saving ? "Suppression..." : "Déplacer et supprimer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReassignOpen(false)}
                    disabled={saving}
                    className="text-sm text-muted transition hover:text-white disabled:opacity-40"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-5">
              <button
                type="button"
                onClick={remove}
                disabled={!selected || saving}
                className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
              >
                Supprimer
              </button>
              <button type="button" onClick={save} disabled={saving} className="btn-primary px-5 text-sm disabled:opacity-50">
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Lets the admin reuse a product's own image as the category cover instead of
 * uploading a separate one — the common case when a category holds a single
 * product. Clicking a thumbnail sets the cover URL to that product's image.
 */
function ProductMediaPicker({
  media,
  selectedUrl,
  onPick,
}: {
  media: { id: string; name: string; imageUrl: string }[];
  selectedUrl: string | null;
  onPick: (url: string) => void;
}) {
  const single = media.length === 1;
  return (
    <div className="rounded-xl border border-border bg-base p-3">
      <p className="text-xs font-medium text-muted">Réutiliser le visuel d&apos;un produit</p>
      <p className="mt-0.5 text-[11px] text-faint">
        {single
          ? "Cette catégorie a un seul produit — utilisez son visuel comme couverture."
          : "Choisissez un produit de la catégorie pour utiliser son visuel comme couverture."}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2.5">
        {media.map((item) => {
          const active = selectedUrl === item.imageUrl;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item.imageUrl)}
              title={item.name}
              className={`group relative w-24 overflow-hidden rounded-lg border p-1 text-left transition ${
                active ? "border-accent bg-accent/10" : "border-border hover:border-accent/60"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.name}
                className="h-16 w-full rounded object-contain"
              />
              <span className="mt-1 block truncate text-[10px] text-muted">{item.name}</span>
              {active && (
                <span className="absolute right-1 top-1 rounded bg-accent px-1 text-[9px] font-bold text-white">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function UploadField({
  label,
  value,
  disabled,
  onFile,
  onUrl,
  onClear,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  onFile: (file: File | null) => void;
  onUrl: (url: string | null) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      <div className="rounded-xl border border-border bg-canvas p-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="mb-3 h-28 w-full rounded-lg object-contain" />
        ) : (
          <div className="mb-3 grid h-28 place-items-center rounded-lg bg-surface text-xs text-muted">
            Aucun média
          </div>
        )}
        <input
          className="input h-9 text-xs"
          value={value ?? ""}
          onChange={(event) => onUrl(event.target.value || null)}
          placeholder="/uploads/image.png"
        />
        <div className="mt-2 flex gap-2">
          <label className="btn-ghost h-8 cursor-pointer px-3 text-xs">
            Importer
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={disabled}
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={onClear}>
            Retirer
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category landing-page content editor. All fields live under the single
// `landing` JSON blob on the category; edits flow through the parent's normal
// draft state + the one existing "Enregistrer" button (no separate save flow).
// ---------------------------------------------------------------------------

const INFO_ICON_LABELS: Record<InfoIconKey, string> = {
  bolt: "Éclair",
  shield: "Bouclier",
  globe: "Globe / région",
  support: "Support",
  lock: "Cadenas",
  check: "Coche",
  card: "Carte",
  sparkle: "Étoile",
};

const TIP_TYPE_LABELS: Record<(typeof NAVIGATOR_TIP_TYPES)[number], string> = {
  information: "Information",
  compatibility: "Compatibilité",
  warning: "Attention",
  security: "Sécurité",
};

function tempId(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 1e9).toString(36);
  return `${prefix}-${rand}`;
}

function moveInList<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, i) =>
    typeof (item as { sortOrder?: number }).sortOrder === "number"
      ? { ...item, sortOrder: i }
      : item,
  );
}

function LandingEditor({
  landing,
  categories,
  currentId,
  disabled,
  onChange,
}: {
  landing: CategoryLanding;
  categories: AdminCategoryDTO[];
  currentId?: string;
  disabled: boolean;
  onChange: (next: CategoryLanding) => void;
}) {
  const set = (patch: Partial<CategoryLanding>) => onChange({ ...landing, ...patch });

  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const relatedAvailable = categories.filter(
    (c) => c.id !== currentId && !landing.relatedCategoryIds.includes(c.id),
  );

  return (
    <div className="rounded-xl border border-border bg-canvas p-4">
      <h3 className="text-sm font-bold text-white">Contenu de la page catégorie</h3>
      <p className="mt-0.5 text-xs text-muted">
        Sections optionnelles. Laissez vide pour afficher la grille de produits seule.
      </p>

      <div className="mt-4 space-y-6">
        {/* HERO */}
        <Group title="Hero">
          <Field label="Sous-titre">
            <input
              className="input"
              value={landing.heroSubtitle}
              onChange={(e) => set({ heroSubtitle: e.target.value })}
              placeholder="Ajoutez facilement des fonds à votre portefeuille."
            />
          </Field>
          <LandingImageField
            label="Image du hero"
            value={landing.heroImageUrl}
            disabled={disabled}
            onChange={(url) => set({ heroImageUrl: url })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CTA principal — libellé">
              <input
                className="input"
                value={landing.primaryCtaLabel}
                onChange={(e) => set({ primaryCtaLabel: e.target.value })}
                placeholder="Voir les cartes"
              />
            </Field>
            <Field label="CTA principal — action">
              <select
                className="input"
                value={landing.primaryCtaMode}
                onChange={(e) =>
                  set({ primaryCtaMode: e.target.value === "url" ? "url" : "products" })
                }
              >
                <option value="products">Défiler vers les produits</option>
                <option value="url">Lien interne / URL</option>
              </select>
            </Field>
          </div>
          {landing.primaryCtaMode === "url" && (
            <UrlField
              label="CTA principal — URL"
              value={landing.primaryCtaUrl}
              onChange={(v) => set({ primaryCtaUrl: v })}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CTA secondaire — libellé">
              <input
                className="input"
                value={landing.secondaryCtaLabel}
                onChange={(e) => set({ secondaryCtaLabel: e.target.value })}
                placeholder="Comment ça fonctionne"
              />
            </Field>
            <UrlField
              label="CTA secondaire — URL"
              value={landing.secondaryCtaUrl}
              onChange={(v) => set({ secondaryCtaUrl: v })}
            />
          </div>
        </Group>

        {/* INTRODUCTION */}
        <Group title="Introduction">
          <Field label="Texte (Markdown ou HTML simple)">
            <textarea
              className="input min-h-28 resize-y"
              value={landing.introText}
              onChange={(e) => set({ introText: e.target.value })}
              placeholder="Décrivez brièvement la catégorie, à qui elle s'adresse, les cas d'usage courants…"
            />
          </Field>
        </Group>

        {/* QUICK INFO */}
        <Group
          title={`Informations rapides (${landing.infoItems.length}/${MAX_INFO_ITEMS})`}
          action={
            landing.infoItems.length < MAX_INFO_ITEMS ? (
              <button
                type="button"
                className="btn-ghost h-8 px-3 text-xs"
                onClick={() =>
                  set({
                    infoItems: [
                      ...landing.infoItems,
                      {
                        id: tempId("info"),
                        icon: "bolt",
                        title: "",
                        description: "",
                        active: true,
                        sortOrder: landing.infoItems.length,
                      },
                    ],
                  })
                }
              >
                + Ajouter
              </button>
            ) : null
          }
        >
          {landing.infoItems.length === 0 ? (
            <EmptyHint>Aucun point d&apos;information.</EmptyHint>
          ) : (
            landing.infoItems.map((item, index) => (
              <RowCard
                key={item.id}
                index={index}
                count={landing.infoItems.length}
                onMove={(dir) => set({ infoItems: moveInList(landing.infoItems, index, dir) })}
                onRemove={() =>
                  set({ infoItems: landing.infoItems.filter((_, i) => i !== index) })
                }
                active={item.active}
                onToggle={(v) =>
                  set({
                    infoItems: patchAt(landing.infoItems, index, { active: v }),
                  })
                }
              >
                <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                  <select
                    className="input"
                    value={item.icon}
                    onChange={(e) =>
                      set({
                        infoItems: patchAt(landing.infoItems, index, {
                          icon: e.target.value as InfoIconKey,
                        }),
                      })
                    }
                  >
                    {APPROVED_INFO_ICONS.map((key) => (
                      <option key={key} value={key}>
                        {INFO_ICON_LABELS[key]}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    value={item.title}
                    placeholder="Titre"
                    onChange={(e) =>
                      set({
                        infoItems: patchAt(landing.infoItems, index, { title: e.target.value }),
                      })
                    }
                  />
                </div>
                <input
                  className="input mt-2"
                  value={item.description}
                  placeholder="Description (optionnelle, une ligne)"
                  onChange={(e) =>
                    set({
                      infoItems: patchAt(landing.infoItems, index, {
                        description: e.target.value,
                      }),
                    })
                  }
                />
              </RowCard>
            ))
          )}
        </Group>

        {/* NAVIGATOR TIP */}
        <Group
          title="Conseil du Navigator"
          action={
            <ToggleSwitch
              checked={landing.navigatorTip.enabled}
              checkedLabel="Activé"
              uncheckedLabel="Masqué"
              size="sm"
              onChange={(v) =>
                set({ navigatorTip: { ...landing.navigatorTip, enabled: v } })
              }
            />
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Titre">
              <input
                className="input"
                value={landing.navigatorTip.title}
                onChange={(e) =>
                  set({ navigatorTip: { ...landing.navigatorTip, title: e.target.value } })
                }
                placeholder="Conseil du Navigator"
              />
            </Field>
            <Field label="Type">
              <select
                className="input"
                value={landing.navigatorTip.type}
                onChange={(e) =>
                  set({
                    navigatorTip: {
                      ...landing.navigatorTip,
                      type: e.target.value as CategoryLanding["navigatorTip"]["type"],
                    },
                  })
                }
              >
                {NAVIGATOR_TIP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TIP_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Message">
            <textarea
              className="input min-h-20 resize-y"
              value={landing.navigatorTip.message}
              onChange={(e) =>
                set({ navigatorTip: { ...landing.navigatorTip, message: e.target.value } })
              }
              placeholder="Vérifiez que la région de votre compte correspond à celle de la carte."
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CTA — libellé">
              <input
                className="input"
                value={landing.navigatorTip.ctaLabel}
                onChange={(e) =>
                  set({ navigatorTip: { ...landing.navigatorTip, ctaLabel: e.target.value } })
                }
                placeholder="Voir le guide"
              />
            </Field>
            <UrlField
              label="CTA — URL"
              value={landing.navigatorTip.ctaUrl}
              onChange={(v) => set({ navigatorTip: { ...landing.navigatorTip, ctaUrl: v } })}
            />
          </div>
        </Group>

        {/* FAQ */}
        <Group
          title="FAQ"
          action={
            <button
              type="button"
              className="btn-ghost h-8 px-3 text-xs"
              onClick={() =>
                set({
                  faqItems: [
                    ...landing.faqItems,
                    {
                      id: tempId("faq"),
                      question: "",
                      answer: "",
                      active: true,
                      sortOrder: landing.faqItems.length,
                    },
                  ],
                })
              }
            >
              + Ajouter
            </button>
          }
        >
          {landing.faqItems.length === 0 ? (
            <EmptyHint>Aucune question.</EmptyHint>
          ) : (
            landing.faqItems.map((item, index) => (
              <RowCard
                key={item.id}
                index={index}
                count={landing.faqItems.length}
                onMove={(dir) => set({ faqItems: moveInList(landing.faqItems, index, dir) })}
                onRemove={() =>
                  set({ faqItems: landing.faqItems.filter((_, i) => i !== index) })
                }
                active={item.active}
                onToggle={(v) =>
                  set({ faqItems: patchAt(landing.faqItems, index, { active: v }) })
                }
              >
                <input
                  className="input"
                  value={item.question}
                  placeholder="Question"
                  onChange={(e) =>
                    set({ faqItems: patchAt(landing.faqItems, index, { question: e.target.value }) })
                  }
                />
                <textarea
                  className="input mt-2 min-h-16 resize-y"
                  value={item.answer}
                  placeholder="Réponse"
                  onChange={(e) =>
                    set({ faqItems: patchAt(landing.faqItems, index, { answer: e.target.value }) })
                  }
                />
              </RowCard>
            ))
          )}
        </Group>

        {/* RELATED CATEGORIES */}
        <Group title="Catégories associées">
          {landing.relatedCategoryIds.length === 0 ? (
            <EmptyHint>Aucune catégorie associée.</EmptyHint>
          ) : (
            <div className="space-y-2">
              {landing.relatedCategoryIds.map((id, index) => (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <span className="w-5 text-xs text-muted">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-white">
                    {nameById.get(id) ?? id}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost h-7 px-2 text-xs disabled:opacity-40"
                    disabled={index === 0}
                    onClick={() =>
                      set({ relatedCategoryIds: moveInList(landing.relatedCategoryIds, index, -1) })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-ghost h-7 px-2 text-xs disabled:opacity-40"
                    disabled={index === landing.relatedCategoryIds.length - 1}
                    onClick={() =>
                      set({ relatedCategoryIds: moveInList(landing.relatedCategoryIds, index, 1) })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="h-7 rounded px-2 text-xs font-medium text-red-300 hover:bg-red-500/10"
                    onClick={() =>
                      set({
                        relatedCategoryIds: landing.relatedCategoryIds.filter((x) => x !== id),
                      })
                    }
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          )}
          {relatedAvailable.length > 0 && (
            <select
              className="input mt-2"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                set({ relatedCategoryIds: [...landing.relatedCategoryIds, e.target.value] });
              }}
            >
              <option value="">+ Ajouter une catégorie…</option>
              {relatedAvailable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Group>

        {/* SEO */}
        <Group title="SEO">
          <Field label="Titre SEO">
            <input
              className="input"
              value={landing.seo.title}
              onChange={(e) => set({ seo: { ...landing.seo, title: e.target.value } })}
              placeholder="Laissez vide pour utiliser le nom de la catégorie"
            />
          </Field>
          <Field label="Méta description">
            <textarea
              className="input min-h-16 resize-y"
              value={landing.seo.description}
              onChange={(e) => set({ seo: { ...landing.seo, description: e.target.value } })}
            />
          </Field>
          <LandingImageField
            label="Image sociale (Open Graph)"
            value={landing.seo.imageUrl}
            disabled={disabled}
            onChange={(url) => set({ seo: { ...landing.seo, imageUrl: url } })}
          />
        </Group>
      </div>
    </div>
  );
}

function patchAt<T>(arr: T[], index: number, patch: Partial<T>): T[] {
  return arr.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

function Group({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
      {children}
    </p>
  );
}

function RowCard({
  index,
  count,
  onMove,
  onRemove,
  active,
  onToggle,
  children,
}: {
  index: number;
  count: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  active: boolean;
  onToggle: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <ToggleSwitch
          checked={active}
          checkedLabel="Actif"
          uncheckedLabel="Masqué"
          size="sm"
          onChange={onToggle}
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost h-7 px-2 text-xs disabled:opacity-40"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn-ghost h-7 px-2 text-xs disabled:opacity-40"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="h-7 rounded px-2 text-xs font-medium text-red-300 hover:bg-red-500/10"
            onClick={onRemove}
          >
            Retirer
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function UrlField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const invalid = value.trim().length > 0 && !isValidCtaUrl(value);
  return (
    <Field label={label}>
      <input
        className={`input ${invalid ? "border-red-500/60" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="/products ou https://…"
      />
      {invalid && (
        <span className="mt-1 block text-[11px] text-red-400">
          URL invalide — utilisez un chemin interne (/…) ou https://
        </span>
      )}
    </Field>
  );
}

function LandingImageField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadImageFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      <div className="rounded-xl border border-border bg-surface p-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="mb-3 h-24 w-full rounded-lg object-contain" />
        ) : (
          <div className="mb-3 grid h-24 place-items-center rounded-lg bg-canvas text-xs text-muted">
            Aucune image
          </div>
        )}
        <input
          className="input h-9 text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/uploads/image.png"
        />
        <div className="mt-2 flex items-center gap-2">
          <label className="btn-ghost h-8 cursor-pointer px-3 text-xs">
            {uploading ? "Import…" : "Importer"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={disabled || uploading}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {value && (
            <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={() => onChange("")}>
              Retirer
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
      </div>
    </div>
  );
}
