"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  deleteCollectionAction,
  duplicateCollectionAction,
  generateCollectionsAction,
  getAdminCollectionsAction,
  getCollectionProductOptionsAction,
  reorderCollectionsAction,
  saveCollectionAction,
} from "@/app/actions/collections";
import type {
  AdminCollectionDTO,
  AutoCollectionResultDTO,
  CollectionProductOptionDTO,
  SaveCollectionInput,
} from "@/lib/dto";
import { collectionState, collectionStateLabel } from "@/lib/collections/schedule";
import {
  APPROVED_COLLECTION_ICONS,
  resolveCollectionIcon,
  type CollectionIconKey,
} from "@/lib/collections/icons";
import { collectionHref } from "@/lib/collectionUrl";
import { uploadImageFile } from "@/lib/clientUpload";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import CollectionIcon from "@/components/CollectionIcon";
import { formatDH } from "@/lib/format";

const ICON_LABELS: Record<CollectionIconKey, string> = {
  collection: "Collection (générique)",
  gaming: "Gaming (manette)",
  gift: "Carte cadeau",
  subscription: "Abonnement",
  software: "Logiciel",
  sparkle: "Nouveautés",
  trending: "Populaire / tendance",
  globe: "Global / région",
  navigator: "Navigator",
};

/** Non-interactive homepage-card preview mirroring the storefront CollectionCard. */
function CollectionCardPreview({ draft }: { draft: Draft }) {
  const accent = draft.accentColor || "#3e7bfa";
  const icon = resolveCollectionIcon(draft.icon, draft.name, draft.aliases);
  const count = draft.productIds.length;
  return (
    <div
      className="max-w-xs overflow-hidden rounded-[14px] border border-border bg-surface"
      style={{ ["--brand" as string]: accent }}
    >
      {draft.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={draft.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
      ) : null}
      <div className="p-[18px]">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border"
            style={{
              color: accent,
              borderColor: `color-mix(in srgb, ${accent} 34%, transparent)`,
              background: `color-mix(in srgb, ${accent} 12%, transparent)`,
            }}
          >
            <CollectionIcon name={icon} className="h-[20px] w-[20px]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-text">
            {draft.homepageTitle.trim() || draft.name || "Nom de la collection"}
          </span>
        </div>
        {draft.shortDescription ? (
          <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {draft.shortDescription}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-wide text-faint">
            {count} produit{count === 1 ? "" : "s"}
          </span>
          <span className="text-[13px] font-medium" style={{ color: accent }}>
            {draft.ctaLabel.trim() || "Explorer"} →
          </span>
        </div>
      </div>
    </div>
  );
}

type Draft = SaveCollectionInput & { originalId?: string };

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function emptyCollection(sortOrder: number): Draft {
  return {
    slug: "",
    name: "",
    shortDescription: "",
    longDescription: "",
    imageUrl: null,
    active: false,
    sortOrder,
    startAt: null,
    endAt: null,
    showOnHomepage: false,
    homepageTitle: "",
    homepageLimit: 8,
    ctaLabel: "",
    seoTitle: "",
    seoDescription: "",
    socialImageUrl: null,
    aliases: [],
    icon: "",
    accentColor: null,
    productIds: [],
  };
}

function toDraft(dto: AdminCollectionDTO): Draft {
  return {
    originalId: dto.id,
    slug: dto.slug,
    name: dto.name,
    shortDescription: dto.shortDescription,
    longDescription: dto.longDescription,
    imageUrl: dto.imageUrl,
    active: dto.active,
    sortOrder: dto.sortOrder,
    startAt: dto.startAt,
    endAt: dto.endAt,
    showOnHomepage: dto.showOnHomepage,
    homepageTitle: dto.homepageTitle,
    homepageLimit: dto.homepageLimit,
    ctaLabel: dto.ctaLabel,
    seoTitle: dto.seoTitle,
    seoDescription: dto.seoDescription,
    socialImageUrl: dto.socialImageUrl,
    aliases: dto.aliases,
    icon: dto.icon,
    accentColor: dto.accentColor,
    productIds: dto.items.map((item) => item.productId),
  };
}

/** ISO instant → the value a <input type="datetime-local"> expects (local wall
 *  clock). Empty string clears the field. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const STATE_TONE: Record<string, string> = {
  live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  upcoming: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  expired: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  inactive: "border-border bg-surface2 text-muted",
};

export default function CollectionsPanel() {
  const [items, setItems] = useState<AdminCollectionDTO[]>([]);
  const [options, setOptions] = useState<CollectionProductOptionDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  // "Generate from catalogue" preview/apply modal.
  const [autoResult, setAutoResult] = useState<AutoCollectionResultDTO | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  const load = useCallback(async (focusId?: string) => {
    setLoading(true);
    try {
      const [collections, productOptions] = await Promise.all([
        getAdminCollectionsAction(),
        getCollectionProductOptionsAction(),
      ]);
      setItems(collections);
      setOptions(productOptions);
      const target =
        focusId ??
        selectedId ??
        collections[0]?.id ??
        null;
      const dto = collections.find((c) => c.id === target) ?? collections[0] ?? null;
      setSelectedId(dto?.id ?? null);
      setDraft(dto ? toDraft(dto) : null);
    } catch {
      setMessage({ text: "Chargement impossible.", ok: false });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const optionsById = useMemo(
    () => new Map(options.map((option) => [option.productId, option])),
    [options],
  );

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function selectCollection(id: string) {
    const dto = items.find((c) => c.id === id);
    if (!dto) return;
    setSelectedId(id);
    setDraft(toDraft(dto));
    setMessage(null);
  }

  function createNew() {
    setSelectedId(null);
    setDraft(emptyCollection(items.length));
    setMessage(null);
  }

  async function move(id: string, direction: -1 | 1) {
    const index = items.findIndex((c) => c.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setItems(next);
    await reorderCollectionsAction(next.map((c) => c.id));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload: SaveCollectionInput = {
        ...draft,
        slug: slugify(draft.slug || draft.name),
      };
      const result = await saveCollectionAction(payload);
      if (result.ok) {
        setMessage({ text: "Collection enregistrée.", ok: true });
        await load(result.id ?? selectedId ?? undefined);
      } else {
        setMessage({ text: result.error ?? "Enregistrement impossible.", ok: false });
      }
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!selectedId) return;
    const result = await duplicateCollectionAction(selectedId);
    if (result.ok) {
      setMessage({ text: "Collection dupliquée.", ok: true });
      await load(result.id);
    } else {
      setMessage({ text: result.error ?? "Duplication impossible.", ok: false });
    }
  }

  async function remove() {
    if (!selectedId || !draft) return;
    if (!window.confirm(`Supprimer la collection « ${draft.name || draft.slug} » ? Cette action est définitive.`)) {
      return;
    }
    const result = await deleteCollectionAction(selectedId);
    if (result.ok) {
      setMessage({ text: "Collection supprimée.", ok: true });
      setSelectedId(null);
      await load();
    } else {
      setMessage({ text: result.error ?? "Suppression impossible.", ok: false });
    }
  }

  async function openAutoPreview() {
    setAutoBusy(true);
    setMessage(null);
    try {
      const result = await generateCollectionsAction(false);
      setAutoResult(result);
    } catch {
      setMessage({ text: "Aperçu impossible.", ok: false });
    } finally {
      setAutoBusy(false);
    }
  }

  async function applyAuto() {
    setAutoBusy(true);
    try {
      const result = await generateCollectionsAction(true);
      setAutoResult(result);
      const { created, updated } = result.summary;
      setMessage({
        text: `Collections générées : ${created} créée(s), ${updated} mise(s) à jour.`,
        ok: true,
      });
      await load();
    } catch {
      setMessage({ text: "Génération impossible.", ok: false });
    } finally {
      setAutoBusy(false);
    }
  }

  async function uploadBanner(file: File) {
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      update("imageUrl", url);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Import impossible.", ok: false });
    } finally {
      setUploading(false);
    }
  }

  const selectedProductIds = draft?.productIds ?? [];
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((option) => {
      if (!needle) return true;
      return `${option.name} ${option.categoryName} ${option.slug}`
        .toLowerCase()
        .includes(needle);
    });
  }, [options, query]);

  function addProduct(productId: string) {
    if (!draft || selectedProductIds.includes(productId)) return;
    update("productIds", [...selectedProductIds, productId]);
  }
  function removeProduct(productId: string) {
    if (!draft) return;
    update("productIds", selectedProductIds.filter((id) => id !== productId));
  }
  function moveProduct(productId: string, direction: -1 | 1) {
    const index = selectedProductIds.indexOf(productId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selectedProductIds.length) return;
    const next = [...selectedProductIds];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    update("productIds", next);
  }

  const liveState = draft
    ? collectionState(
        { active: draft.active, startAt: draft.startAt, endAt: draft.endAt },
        new Date(),
      )
    : "inactive";

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Collections</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Regroupez des produits en sélections éditoriales (Tendances, Nouveautés, Promotions…)
            affichées sur l'accueil et sur des pages dédiées. Différent des catégories : une
            collection est curatée et peut évoluer dans le temps.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={openAutoPreview}
            disabled={autoBusy}
            className="btn-ghost h-9 px-3 text-xs disabled:opacity-50"
            title="Créer automatiquement des collections à partir du catalogue existant"
          >
            {autoBusy && !autoResult ? "Analyse…" : "✨ Générer depuis le catalogue"}
          </button>
          {message ? (
            <p className={`text-xs ${message.ok ? "text-emerald-300" : "text-red-300"}`}>
              {message.text}
            </p>
          ) : null}
        </div>
      </div>

      {autoResult ? (
        <AutoGenerateModal
          result={autoResult}
          busy={autoBusy}
          onApply={applyAuto}
          onClose={() => setAutoResult(null)}
        />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ── Master list ─────────────────────────────────────────────── */}
        <aside className="card h-fit overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold text-white">Toutes les collections</h3>
            <button type="button" onClick={createNew} className="btn-primary h-8 px-3 text-xs">
              + Créer
            </button>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <p className="px-4 py-6 text-sm text-muted">Chargement…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">Aucune collection pour le moment.</p>
            ) : (
              items.map((item, index) => {
                const active = item.id === selectedId;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-3 py-2.5 ${active ? "bg-surface" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => selectCollection(item.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-medium text-white">
                        {item.name || item.slug}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span
                          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${STATE_TONE[item.state]}`}
                        >
                          {collectionStateLabel(item.state)}
                        </span>
                        <span className="text-[11px] text-faint">
                          {item.productCount} produit{item.productCount === 1 ? "" : "s"}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => move(item.id, -1)}
                        disabled={index === 0}
                        className="px-1 text-faint hover:text-white disabled:opacity-30"
                        aria-label="Monter"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(item.id, 1)}
                        disabled={index === items.length - 1}
                        className="px-1 text-faint hover:text-white disabled:opacity-30"
                        aria-label="Descendre"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ── Editor ──────────────────────────────────────────────────── */}
        {draft ? (
          <div className="space-y-5">
            <div className="card space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    {selectedId ? "Modifier la collection" : "Nouvelle collection"}
                  </h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATE_TONE[liveState]}`}
                  >
                    {collectionStateLabel(liveState)}
                  </span>
                </div>
                {selectedId && draft.active ? (
                  <Link
                    href={collectionHref(draft.slug)}
                    target="_blank"
                    className="text-xs font-medium text-accent hover:text-accent-hover"
                  >
                    Voir la page →
                  </Link>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom">
                  <input
                    className="input h-10 py-0 text-sm"
                    value={draft.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      update("name", name);
                      if (!selectedId && !draft.slug) update("slug", slugify(name));
                    }}
                    placeholder="Tendances"
                  />
                </Field>
                <Field label="Slug (URL)" hint={`/collections/${draft.slug || "…"}`}>
                  <input
                    className="input h-10 py-0 text-sm"
                    value={draft.slug}
                    onChange={(e) => update("slug", e.target.value)}
                    placeholder="tendances"
                  />
                </Field>
              </div>

              <Field label="Description courte" hint="Affichée sous le titre">
                <input
                  className="input h-10 py-0 text-sm"
                  value={draft.shortDescription}
                  onChange={(e) => update("shortDescription", e.target.value)}
                  placeholder="Les produits les plus demandés du moment."
                />
              </Field>

              <Field label="Introduction longue (optionnel)">
                <textarea
                  className="input min-h-[80px] py-2 text-sm"
                  value={draft.longDescription}
                  onChange={(e) => update("longDescription", e.target.value)}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                  <span className="text-sm font-medium text-white">Active</span>
                  <ToggleSwitch checked={draft.active} onChange={(v) => update("active", v)} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                  <span className="text-sm font-medium text-white">Afficher sur l'accueil</span>
                  <ToggleSwitch
                    checked={draft.showOnHomepage}
                    onChange={(v) => update("showOnHomepage", v)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Titre section accueil (optionnel)">
                  <input
                    className="input h-10 py-0 text-sm"
                    value={draft.homepageTitle}
                    onChange={(e) => update("homepageTitle", e.target.value)}
                    placeholder={draft.name}
                  />
                </Field>
                <Field label="Nombre de produits (accueil)">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    className="input h-10 py-0 text-sm"
                    value={draft.homepageLimit}
                    onChange={(e) => update("homepageLimit", Number(e.target.value) || 8)}
                  />
                </Field>
              </div>

              <Field label="Libellé du bouton « Voir tout » (optionnel)">
                <input
                  className="input h-10 py-0 text-sm"
                  value={draft.ctaLabel}
                  onChange={(e) => update("ctaLabel", e.target.value)}
                  placeholder="Voir tout"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Début (optionnel)" hint="Masquée avant cette date">
                  <input
                    type="datetime-local"
                    className="input h-10 py-0 text-sm"
                    value={isoToLocalInput(draft.startAt)}
                    onChange={(e) => update("startAt", localInputToIso(e.target.value))}
                  />
                </Field>
                <Field label="Fin (optionnel)" hint="Masquée après cette date">
                  <input
                    type="datetime-local"
                    className="input h-10 py-0 text-sm"
                    value={isoToLocalInput(draft.endAt)}
                    onChange={(e) => update("endAt", localInputToIso(e.target.value))}
                  />
                </Field>
              </div>

              <Field label="Bannière (optionnel)">
                <div className="flex items-center gap-3">
                  {draft.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={draft.imageUrl}
                      alt=""
                      className="h-12 w-20 rounded-lg border border-border object-cover"
                    />
                  ) : null}
                  <label className="btn-ghost h-9 cursor-pointer px-3 text-xs">
                    {uploading ? "Import…" : "Choisir une image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadBanner(file);
                      }}
                    />
                  </label>
                  {draft.imageUrl ? (
                    <button
                      type="button"
                      onClick={() => update("imageUrl", null)}
                      className="text-xs text-red-300"
                    >
                      Retirer
                    </button>
                  ) : null}
                </div>
                <input
                  className="input mt-2 h-9 py-0 text-sm"
                  value={draft.imageUrl ?? ""}
                  onChange={(e) => update("imageUrl", e.target.value || null)}
                  placeholder="ou collez une URL, ex. /collections/gaming.webp"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Icône de la carte (accueil)" hint="Utilisée quand aucune image n'est définie">
                  <select
                    className="input h-10 py-0 text-sm"
                    value={draft.icon}
                    onChange={(e) => update("icon", e.target.value)}
                  >
                    <option value="">Automatique (selon le nom)</option>
                    {APPROVED_COLLECTION_ICONS.map((key) => (
                      <option key={key} value={key}>
                        {ICON_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Accent (optionnel)" hint="Couleur hex, ex. #3e7bfa">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-10 w-12 shrink-0 rounded-lg border border-border bg-surface"
                      value={draft.accentColor || "#3e7bfa"}
                      onChange={(e) => update("accentColor", e.target.value)}
                      aria-label="Couleur d'accent"
                    />
                    <input
                      className="input h-10 py-0 text-sm"
                      value={draft.accentColor ?? ""}
                      onChange={(e) => update("accentColor", e.target.value || null)}
                      placeholder="#3e7bfa"
                    />
                    {draft.accentColor ? (
                      <button
                        type="button"
                        onClick={() => update("accentColor", null)}
                        className="shrink-0 text-xs text-red-300"
                      >
                        Retirer
                      </button>
                    ) : null}
                  </div>
                </Field>
              </div>

              {/* Card preview — how the collection appears on the homepage grid. */}
              <Field label="Aperçu de la carte">
                <CollectionCardPreview draft={draft} />
              </Field>
            </div>

            {/* Product picker */}
            <div className="card overflow-hidden">
              <div className="border-b border-border px-5 py-3">
                <h3 className="text-sm font-bold text-white">Produits de la collection</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Sélectionnez des produits parents. Un produit n'apparaît qu'une fois, quel que
                  soit le nombre de dénominations.
                </p>
              </div>
              <div className="grid gap-0 md:grid-cols-2">
                <div className="border-b border-border md:border-b-0 md:border-r">
                  <div className="border-b border-border px-4 py-3">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="input h-9 py-0 text-sm"
                      placeholder="Rechercher un produit (nom, catégorie, slug)…"
                    />
                  </div>
                  <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
                    {filteredOptions.map((option) => {
                      const added = selectedProductIds.includes(option.productId);
                      return (
                        <div
                          key={option.productId}
                          className="flex items-center justify-between gap-3 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">
                              {option.name}
                              {!option.active ? (
                                <span className="ml-2 text-[10px] text-amber-300">inactif</span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted">
                              {option.categoryName} · {option.region}
                              {option.priceFrom != null ? ` · dès ${formatDH(option.priceFrom)}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={added}
                            onClick={() => addProduct(option.productId)}
                            className="btn-primary h-8 shrink-0 px-3 text-xs disabled:opacity-40"
                          >
                            {added ? "Ajouté" : "Ajouter"}
                          </button>
                        </div>
                      );
                    })}
                    {filteredOptions.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-muted">Aucun produit.</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div className="border-b border-border px-4 py-3">
                    <h4 className="text-sm font-bold text-white">
                      Ordre d'affichage ({selectedProductIds.length})
                    </h4>
                  </div>
                  <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
                    {selectedProductIds.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-muted">Aucun produit sélectionné.</p>
                    ) : (
                      selectedProductIds.map((productId, index) => {
                        const option = optionsById.get(productId);
                        return (
                          <div key={productId} className="flex items-center gap-2 px-4 py-2.5">
                            <span className="w-5 shrink-0 text-xs text-faint">{index + 1}.</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-white">
                                {option?.name ?? productId}
                              </p>
                              {option ? (
                                <p className="mt-0.5 truncate text-xs text-muted">
                                  {option.categoryName} · {option.region}
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => moveProduct(productId, -1)}
                              disabled={index === 0}
                              className="px-1 text-faint hover:text-white disabled:opacity-30"
                              aria-label="Monter"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => moveProduct(productId, 1)}
                              disabled={index === selectedProductIds.length - 1}
                              className="px-1 text-faint hover:text-white disabled:opacity-30"
                              aria-label="Descendre"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              onClick={() => removeProduct(productId)}
                              className="px-1 text-red-300 hover:text-red-200"
                              aria-label="Retirer"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* SEO */}
            <div className="card space-y-4 p-5">
              <h3 className="text-sm font-bold text-white">Référencement (SEO)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Titre SEO (optionnel)">
                  <input
                    className="input h-10 py-0 text-sm"
                    value={draft.seoTitle}
                    onChange={(e) => update("seoTitle", e.target.value)}
                    placeholder={draft.name}
                  />
                </Field>
                <Field label="Image sociale (URL, optionnel)">
                  <input
                    className="input h-10 py-0 text-sm"
                    value={draft.socialImageUrl ?? ""}
                    onChange={(e) => update("socialImageUrl", e.target.value || null)}
                  />
                </Field>
              </div>
              <Field label="Meta description (optionnel)">
                <textarea
                  className="input min-h-[70px] py-2 text-sm"
                  value={draft.seoDescription}
                  onChange={(e) => update("seoDescription", e.target.value)}
                />
              </Field>
              <Field
                label="Alias de recherche (optionnel)"
                hint="Séparés par des virgules. Aident la recherche client, jamais affichés publiquement."
              >
                <input
                  className="input h-10 py-0 text-sm"
                  value={draft.aliases.join(", ")}
                  onChange={(e) =>
                    update(
                      "aliases",
                      e.target.value.split(",").map((a) => a.trim()).filter(Boolean),
                    )
                  }
                  placeholder="promo, soldes, deals"
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn-primary h-10 px-5 text-sm disabled:opacity-50"
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              {selectedId ? (
                <>
                  <button type="button" onClick={duplicate} className="btn-ghost h-10 px-4 text-sm">
                    Dupliquer
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    className="h-10 rounded-lg border border-red-500/40 px-4 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    Supprimer
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="card grid place-items-center p-10 text-sm text-muted">
            {loading ? "Chargement…" : "Sélectionnez ou créez une collection."}
          </div>
        )}
      </div>
    </section>
  );
}

function AutoGenerateModal({
  result,
  busy,
  onApply,
  onClose,
}: {
  result: AutoCollectionResultDTO;
  busy: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const buildable = result.plans.filter((p) => !p.skipped);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Générer des collections depuis le catalogue"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-bold text-white">
            Générer des collections depuis le catalogue
          </h3>
          <p className="mt-1 text-xs text-muted">
            {result.applied
              ? `Terminé : ${result.summary.created} créée(s), ${result.summary.updated} mise(s) à jour, ${result.summary.unchanged} inchangée(s).`
              : "Aperçu — construit à partir des produits réels et éligibles. Rien n'est enregistré tant que vous ne confirmez pas."}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {result.plans.map((plan) => (
            <div
              key={plan.slug}
              className={`rounded-xl border px-4 py-3 ${
                plan.skipped ? "border-border bg-surface2/40" : "border-border bg-surface"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-white">{plan.name}</span>
                {plan.skipped ? (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                    ignorée
                  </span>
                ) : (
                  <span className="text-[11px] text-faint">
                    {plan.productCount} produit{plan.productCount === 1 ? "" : "s"}
                  </span>
                )}
                {plan.showOnHomepage && !plan.skipped ? (
                  <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">
                    accueil
                  </span>
                ) : null}
                {plan.status ? (
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    {plan.status === "created"
                      ? "créée"
                      : plan.status === "updated"
                        ? "mise à jour"
                        : "inchangée"}
                  </span>
                ) : null}
              </div>
              {plan.skipped ? (
                <p className="mt-1 text-xs text-muted">{plan.reason}</p>
              ) : (
                <p className="mt-1 line-clamp-2 text-xs text-muted">
                  {plan.productNames.join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <span className="text-xs text-faint">
            {result.applied
              ? null
              : `${buildable.length} collection(s) seront créées ou mises à jour · ${result.ineligibleCount} produit(s) exclus`}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost h-9 px-4 text-sm">
              {result.applied ? "Fermer" : "Annuler"}
            </button>
            {!result.applied ? (
              <button
                type="button"
                onClick={onApply}
                disabled={busy || buildable.length === 0}
                className="btn-primary h-9 px-4 text-sm disabled:opacity-50"
              >
                {busy ? "Génération…" : `Créer / mettre à jour (${buildable.length})`}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-faint">{hint}</span> : null}
    </label>
  );
}
