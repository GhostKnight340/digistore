"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteCategoryAction,
  getAdminCategoriesAction,
  reorderCategoriesAction,
  saveCategoryAction,
} from "@/app/actions/admin";
import { uploadImageFile } from "@/lib/clientUpload";
import type { AdminCategoryDTO, SaveCategoryInput } from "@/lib/dto";
import ToggleSwitch from "@/components/ui/ToggleSwitch";

function emptyCategory(sortOrder: number): AdminCategoryDTO {
  return {
    id: "",
    slug: "",
    name: "",
    description: "",
    icon: "",
    iconUrl: null,
    coverImageUrl: null,
    accentColor: "#3e7bfa",
    active: true,
    sortOrder,
    productCount: 0,
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
      name: draft.name,
      description: draft.description,
      icon: draft.icon,
      iconUrl: draft.iconUrl,
      coverImageUrl: draft.coverImageUrl,
      accentColor: draft.accentColor,
      active: draft.active,
      sortOrder: draft.sortOrder,
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
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="font-bold text-white">Catégories</h2>
            <p className="text-xs text-muted">{categories.length} catégorie{categories.length > 1 ? "s" : ""}</p>
          </div>
          <button type="button" onClick={createNew} className="btn-primary py-1.5 text-xs">
            + Créer
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
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: category.accentColor }}
                >
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
              <Field label="Couleur accent">
                <input className="input h-11" type="color" value={draft.accentColor} onChange={(event) => update("accentColor", event.target.value)} />
              </Field>
            </div>

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
      <div className="rounded-xl border border-border bg-base p-3">
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
