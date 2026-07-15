"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import { uploadImageFile } from "@/lib/clientUpload";
import {
  APPROVED_GUIDE_ICONS,
  GUIDE_BLOCK_TYPES,
  NAVIGATOR_TIP_TYPES,
  slugifyGuide,
  type GuideBlock,
  type GuideBlockType,
} from "@/lib/guide";
import { guideHref } from "@/lib/guide";
import {
  deleteGuideAction,
  duplicateGuideAction,
  getAdminGuidesAction,
  getGuideEditorOptionsAction,
  reorderGuidesAction,
  saveGuideAction,
  setGuideArchivedAction,
} from "@/app/actions/guides";
import type {
  AdminGuideDTO,
  CollectionProductOptionDTO,
  GuideOptionDTO,
} from "@/lib/dto";

type EditorOptions = {
  guides: GuideOptionDTO[];
  products: CollectionProductOptionDTO[];
  categories: { id: string; name: string }[];
};

let tempCounter = 0;
function tempId(prefix: string): string {
  tempCounter += 1;
  return `${prefix}-${tempCounter}-${tempCounter * 7}`;
}

function emptyDraft(): AdminGuideDTO {
  return {
    id: "",
    slug: "",
    title: "",
    summary: "",
    platform: "",
    categoryId: null,
    heroImageUrl: "",
    icon: "book",
    content: [],
    faq: [],
    navigatorTip: {
      enabled: false,
      title: "",
      message: "",
      type: "information",
      ctaLabel: "",
      ctaUrl: "",
    },
    relatedProductIds: [],
    relatedGuideIds: [],
    aliases: [],
    published: false,
    featured: false,
    sortOrder: 0,
    scheduledAt: null,
    publishedAt: null,
    archivedAt: null,
    seoTitle: "",
    seoDescription: "",
    socialImageUrl: "",
    createdAt: "",
    updatedAt: "",
  };
}

export default function GuidesPanel() {
  const [guides, setGuides] = useState<AdminGuideDTO[]>([]);
  const [options, setOptions] = useState<EditorOptions>({
    guides: [],
    products: [],
    categories: [],
  });
  const [draft, setDraft] = useState<AdminGuideDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, opts] = await Promise.all([
        getAdminGuidesAction(),
        getGuideEditorOptionsAction(),
      ]);
      setGuides(rows);
      setOptions(opts);
    } catch {
      setError("Impossible de charger les guides.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof AdminGuideDTO>(key: K, value: AdminGuideDTO[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function startCreate() {
    setError("");
    setMessage("");
    setDraft(emptyDraft());
  }

  function startEdit(row: AdminGuideDTO) {
    setError("");
    setMessage("");
    setDraft({ ...row });
  }

  async function onSave() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await saveGuideAction({
        id: draft.id || undefined,
        slug: draft.slug || slugifyGuide(draft.title),
        title: draft.title,
        summary: draft.summary,
        platform: draft.platform,
        categoryId: draft.categoryId,
        heroImageUrl: draft.heroImageUrl,
        icon: draft.icon,
        content: draft.content,
        faq: draft.faq,
        navigatorTip: draft.navigatorTip,
        relatedProductIds: draft.relatedProductIds,
        relatedGuideIds: draft.relatedGuideIds,
        aliases: draft.aliases,
        published: draft.published,
        featured: draft.featured,
        sortOrder: draft.sortOrder,
        scheduledAt: draft.scheduledAt,
        seoTitle: draft.seoTitle,
        seoDescription: draft.seoDescription,
        socialImageUrl: draft.socialImageUrl,
      });
      if (!result.ok) {
        setError(result.error ?? "Échec de l'enregistrement.");
      } else {
        setMessage("Guide enregistré.");
        setDraft(null);
        await load();
      }
    } catch {
      setError("Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  async function onDuplicate(id: string) {
    await duplicateGuideAction(id);
    await load();
  }

  async function onArchive(row: AdminGuideDTO) {
    await setGuideArchivedAction(row.id, !row.archivedAt);
    await load();
  }

  async function onDelete(id: string) {
    if (!confirm("Supprimer définitivement ce guide ?")) return;
    await deleteGuideAction(id);
    if (draft?.id === id) setDraft(null);
    await load();
  }

  async function onReorder(index: number, dir: -1 | 1) {
    const next = [...guides];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setGuides(next);
    await reorderGuidesAction(next.map((g) => g.id));
  }

  if (draft) {
    return (
      <GuideEditor
        draft={draft}
        options={options}
        saving={saving}
        error={error}
        onUpdate={update}
        onSave={onSave}
        onCancel={() => setDraft(null)}
      />
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Guides</h2>
          <p className="text-sm text-muted">
            Pages de contenu client publiées sur /guides.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={startCreate}>
          Nouveau guide
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {message && <p className="mb-4 text-sm text-green-400">{message}</p>}

      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : guides.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-sm text-muted">Aucun guide pour le moment.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {guides.map((row, index) => (
            <li
              key={row.id}
              className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-white">{row.title}</span>
                  <StatusBadge row={row} />
                </div>
                <p className="truncate text-xs text-faint">/{row.slug}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="btn-ghost h-8 px-2 text-xs"
                  onClick={() => onReorder(index, -1)}
                  aria-label="Monter"
                  disabled={index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-ghost h-8 px-2 text-xs"
                  onClick={() => onReorder(index, 1)}
                  aria-label="Descendre"
                  disabled={index === guides.length - 1}
                >
                  ↓
                </button>
                <a
                  href={guideHref(row.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost h-8 px-3 text-xs"
                >
                  Aperçu
                </a>
                <button
                  type="button"
                  className="btn-ghost h-8 px-3 text-xs"
                  onClick={() => startEdit(row)}
                >
                  Éditer
                </button>
                <button
                  type="button"
                  className="btn-ghost h-8 px-3 text-xs"
                  onClick={() => onDuplicate(row.id)}
                >
                  Dupliquer
                </button>
                <button
                  type="button"
                  className="btn-ghost h-8 px-3 text-xs"
                  onClick={() => onArchive(row)}
                >
                  {row.archivedAt ? "Désarchiver" : "Archiver"}
                </button>
                <button
                  type="button"
                  className="btn-ghost h-8 px-3 text-xs text-red-400"
                  onClick={() => onDelete(row.id)}
                >
                  Suppr.
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ row }: { row: AdminGuideDTO }) {
  let label = "Brouillon";
  let tone = "border-border text-faint";
  if (row.archivedAt) {
    label = "Archivé";
    tone = "border-border text-faint";
  } else if (row.published && row.scheduledAt && new Date(row.scheduledAt) > new Date()) {
    label = "Planifié";
    tone = "border-amber-500/40 text-amber-400";
  } else if (row.published) {
    label = "Publié";
    tone = "border-green-500/40 text-green-400";
  }
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {label}
    </span>
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
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-faint">{hint}</span> : null}
    </label>
  );
}

function GuideEditor({
  draft,
  options,
  saving,
  error,
  onUpdate,
  onSave,
  onCancel,
}: {
  draft: AdminGuideDTO;
  options: EditorOptions;
  saving: boolean;
  error: string;
  onUpdate: <K extends keyof AdminGuideDTO>(key: K, value: AdminGuideDTO[K]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [aliasInput, setAliasInput] = useState("");

  const scheduledLocal = useMemo(
    () => (draft.scheduledAt ? toLocalInput(draft.scheduledAt) : ""),
    [draft.scheduledAt],
  );

  async function uploadTo(key: "heroImageUrl" | "socialImageUrl", file: File) {
    try {
      const url = await uploadImageFile(file);
      onUpdate(key, url);
    } catch {
      /* ignore upload error */
    }
  }

  function addAlias() {
    const value = aliasInput.trim().toLowerCase();
    if (!value) return;
    if (!draft.aliases.includes(value)) onUpdate("aliases", [...draft.aliases, value]);
    setAliasInput("");
  }

  return (
    <div className="min-w-0 max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">
          {draft.id ? "Éditer le guide" : "Nouveau guide"}
        </h2>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titre">
            <input
              className="input"
              value={draft.title}
              onChange={(e) => onUpdate("title", e.target.value)}
            />
          </Field>
          <Field label="Slug" hint="Laisser vide pour générer depuis le titre.">
            <input
              className="input"
              value={draft.slug}
              onChange={(e) => onUpdate("slug", slugifyGuide(e.target.value))}
              placeholder={slugifyGuide(draft.title)}
            />
          </Field>
        </div>

        <Field label="Résumé">
          <textarea
            className="input min-h-[70px]"
            value={draft.summary}
            onChange={(e) => onUpdate("summary", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Plateforme (badge)">
            <input
              className="input"
              value={draft.platform}
              onChange={(e) => onUpdate("platform", e.target.value)}
              placeholder="PlayStation"
            />
          </Field>
          <Field label="Catégorie liée">
            <select
              className="input"
              value={draft.categoryId ?? ""}
              onChange={(e) => onUpdate("categoryId", e.target.value || null)}
            >
              <option value="">Aucune</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Icône">
            <select
              className="input"
              value={draft.icon}
              onChange={(e) => onUpdate("icon", e.target.value)}
            >
              {APPROVED_GUIDE_ICONS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ImageField
            label="Image hero"
            value={draft.heroImageUrl}
            onUpload={(f) => uploadTo("heroImageUrl", f)}
            onClear={() => onUpdate("heroImageUrl", "")}
          />
          <ImageField
            label="Image sociale (OG)"
            value={draft.socialImageUrl}
            onUpload={(f) => uploadTo("socialImageUrl", f)}
            onClear={() => onUpdate("socialImageUrl", "")}
          />
        </div>

        {/* Publication */}
        <div className="card space-y-4 p-4">
          <div className="flex flex-wrap gap-6">
            <ToggleSwitch
              checked={draft.published}
              onChange={(v) => onUpdate("published", v)}
              label="Publié"
            />
            <ToggleSwitch
              checked={draft.featured}
              onChange={(v) => onUpdate("featured", v)}
              label="À la une"
            />
          </div>
          <Field
            label="Planifier la publication"
            hint="Publié + date future = masqué jusqu'à cette date."
          >
            <input
              type="datetime-local"
              className="input"
              value={scheduledLocal}
              onChange={(e) =>
                onUpdate(
                  "scheduledAt",
                  e.target.value ? new Date(e.target.value).toISOString() : null,
                )
              }
            />
          </Field>
        </div>

        {/* Content blocks */}
        <BlockEditor
          blocks={draft.content}
          products={options.products}
          onChange={(blocks) => onUpdate("content", blocks)}
        />

        {/* FAQ */}
        <FaqEditor faq={draft.faq} onChange={(faq) => onUpdate("faq", faq)} />

        {/* Navigator tip */}
        <div className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Astuce du Navigator</h3>
            <ToggleSwitch
              checked={draft.navigatorTip.enabled}
              onChange={(v) =>
                onUpdate("navigatorTip", { ...draft.navigatorTip, enabled: v })
              }
              small
            />
          </div>
          {draft.navigatorTip.enabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Titre">
                <input
                  className="input"
                  value={draft.navigatorTip.title}
                  onChange={(e) =>
                    onUpdate("navigatorTip", { ...draft.navigatorTip, title: e.target.value })
                  }
                />
              </Field>
              <Field label="Type">
                <select
                  className="input"
                  value={draft.navigatorTip.type}
                  onChange={(e) =>
                    onUpdate("navigatorTip", {
                      ...draft.navigatorTip,
                      type: e.target.value as (typeof NAVIGATOR_TIP_TYPES)[number],
                    })
                  }
                >
                  {NAVIGATOR_TIP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Message">
                  <textarea
                    className="input min-h-[60px]"
                    value={draft.navigatorTip.message}
                    onChange={(e) =>
                      onUpdate("navigatorTip", {
                        ...draft.navigatorTip,
                        message: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        {/* Related products */}
        <ChipPicker
          label="Produits associés"
          selected={draft.relatedProductIds}
          options={options.products.map((p) => ({
            id: p.productId,
            label: `${p.name} · ${p.categoryName}`,
          }))}
          onChange={(ids) => onUpdate("relatedProductIds", ids)}
        />

        {/* Related guides */}
        <ChipPicker
          label="Guides associés"
          selected={draft.relatedGuideIds}
          options={options.guides
            .filter((g) => g.id !== draft.id)
            .map((g) => ({ id: g.id, label: g.title }))}
          onChange={(ids) => onUpdate("relatedGuideIds", ids)}
        />

        {/* Aliases */}
        <Field label="Alias de recherche" hint="Termes alternatifs que les clients tapent.">
          <div className="flex flex-wrap gap-2">
            {draft.aliases.map((alias) => (
              <span
                key={alias}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted"
              >
                {alias}
                <button
                  type="button"
                  aria-label={`Retirer ${alias}`}
                  onClick={() =>
                    onUpdate("aliases", draft.aliases.filter((a) => a !== alias))
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="input"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addAlias();
                }
              }}
              placeholder="ex. psn, carte psn"
            />
            <button type="button" className="btn-ghost" onClick={addAlias}>
              Ajouter
            </button>
          </div>
        </Field>

        {/* SEO */}
        <div className="card space-y-3 p-4">
          <h3 className="text-sm font-semibold text-white">SEO</h3>
          <Field label="Titre SEO">
            <input
              className="input"
              value={draft.seoTitle}
              onChange={(e) => onUpdate("seoTitle", e.target.value)}
              placeholder={draft.title}
            />
          </Field>
          <Field label="Meta description">
            <textarea
              className="input min-h-[60px]"
              value={draft.seoDescription}
              onChange={(e) => onUpdate("seoDescription", e.target.value)}
              placeholder={draft.summary}
            />
          </Field>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
          Annuler
        </button>
        <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function ImageField({
  label,
  value,
  onUpload,
  onClear,
}: {
  label: string;
  value: string;
  onUpload: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-12 w-12 rounded-lg border border-border object-cover" />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded-lg border border-dashed border-border text-faint">
            —
          </span>
        )}
        <label className="btn-ghost cursor-pointer text-xs">
          Importer
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
            }}
          />
        </label>
        {value && (
          <button type="button" className="btn-ghost text-xs" onClick={onClear}>
            Retirer
          </button>
        )}
      </div>
    </Field>
  );
}

function BlockEditor({
  blocks,
  products,
  onChange,
}: {
  blocks: GuideBlock[];
  products: CollectionProductOptionDTO[];
  onChange: (blocks: GuideBlock[]) => void;
}) {
  function addBlock(type: GuideBlockType) {
    onChange([...blocks, newBlock(type)]);
  }
  function updateBlock(index: number, next: GuideBlock) {
    const copy = [...blocks];
    copy[index] = next;
    onChange(copy);
  }
  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const copy = [...blocks];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Contenu</h3>
        <select
          className="input h-9 w-auto text-xs"
          value=""
          onChange={(e) => {
            if (e.target.value) addBlock(e.target.value as GuideBlockType);
            e.target.value = "";
          }}
        >
          <option value="">+ Ajouter un bloc…</option>
          {GUIDE_BLOCK_TYPES.map((t) => (
            <option key={t} value={t}>
              {BLOCK_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {blocks.length === 0 ? (
        <p className="text-xs text-faint">Aucun bloc. Ajoutez du contenu ci-dessus.</p>
      ) : (
        <ul className="space-y-3">
          {blocks.map((block, index) => (
            <li key={block.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
                  {BLOCK_LABELS[block.type]}
                </span>
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => move(index, -1)} aria-label="Monter">↑</button>
                  <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => move(index, 1)} aria-label="Descendre">↓</button>
                  <button type="button" className="btn-ghost h-7 px-2 text-xs text-red-400" onClick={() => removeBlock(index)} aria-label="Supprimer">×</button>
                </div>
              </div>
              <BlockFields block={block} products={products} onChange={(b) => updateBlock(index, b)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockFields({
  block,
  products,
  onChange,
}: {
  block: GuideBlock;
  products: CollectionProductOptionDTO[];
  onChange: (b: GuideBlock) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <input
          className="input"
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Titre de section"
        />
      );
    case "paragraph":
    case "warning":
      return (
        <textarea
          className="input min-h-[70px]"
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder={block.type === "warning" ? "Avertissement" : "Paragraphe (Markdown autorisé)"}
        />
      );
    case "steps":
    case "list":
      return (
        <textarea
          className="input min-h-[80px]"
          value={block.items.join("\n")}
          onChange={(e) =>
            onChange({ ...block, items: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
          }
          placeholder="Un élément par ligne"
        />
      );
    case "image":
      return (
        <div className="space-y-2">
          <input className="input" value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="URL de l'image" />
          <input className="input" value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} placeholder="Texte alternatif" />
          <input className="input" value={block.caption} onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder="Légende (facultatif)" />
        </div>
      );
    case "tip":
      return (
        <div className="space-y-2">
          <input className="input" value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Titre" />
          <textarea className="input min-h-[60px]" value={block.message} onChange={(e) => onChange({ ...block, message: e.target.value })} placeholder="Message" />
          <select
            className="input"
            value={block.tipType}
            onChange={(e) =>
              onChange({
                ...block,
                tipType: e.target.value as (typeof NAVIGATOR_TIP_TYPES)[number],
              })
            }
          >
            {NAVIGATOR_TIP_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      );
    case "payment":
      return (
        <div className="space-y-2">
          <input className="input" value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Titre" />
          <textarea className="input min-h-[60px]" value={block.note} onChange={(e) => onChange({ ...block, note: e.target.value })} placeholder="Note (facultatif)" />
        </div>
      );
    case "product":
      return (
        <select className="input" value={block.productId} onChange={(e) => onChange({ ...block, productId: e.target.value })}>
          <option value="">Choisir un produit…</option>
          {products.map((p) => (
            <option key={p.productId} value={p.productId}>{p.name} · {p.categoryName}</option>
          ))}
        </select>
      );
    case "cta":
      return (
        <div className="space-y-2">
          <input className="input" value={block.label} onChange={(e) => onChange({ ...block, label: e.target.value })} placeholder="Libellé du bouton" />
          <input className="input" value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="/products ou https://…" />
        </div>
      );
    default:
      return null;
  }
}

function FaqEditor({
  faq,
  onChange,
}: {
  faq: AdminGuideDTO["faq"];
  onChange: (faq: AdminGuideDTO["faq"]) => void;
}) {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">FAQ</h3>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => onChange([...faq, { id: tempId("faq"), question: "", answer: "" }])}
        >
          + Question
        </button>
      </div>
      {faq.length === 0 ? (
        <p className="text-xs text-faint">Aucune question.</p>
      ) : (
        <ul className="space-y-3">
          {faq.map((item, index) => (
            <li key={item.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  className="btn-ghost h-7 px-2 text-xs text-red-400"
                  onClick={() => onChange(faq.filter((_, i) => i !== index))}
                >
                  Supprimer
                </button>
              </div>
              <input
                className="input mb-2"
                value={item.question}
                onChange={(e) => {
                  const copy = [...faq];
                  copy[index] = { ...item, question: e.target.value };
                  onChange(copy);
                }}
                placeholder="Question"
              />
              <textarea
                className="input min-h-[60px]"
                value={item.answer}
                onChange={(e) => {
                  const copy = [...faq];
                  copy[index] = { ...item, answer: e.target.value };
                  onChange(copy);
                }}
                placeholder="Réponse"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChipPicker({
  label,
  selected,
  options,
  onChange,
}: {
  label: string;
  selected: string[];
  options: { id: string; label: string }[];
  onChange: (ids: string[]) => void;
}) {
  const byId = new Map(options.map((o) => [o.id, o.label]));
  return (
    <Field label={label}>
      <div className="mb-2 flex flex-wrap gap-2">
        {selected.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted"
          >
            {byId.get(id) ?? id}
            <button
              type="button"
              aria-label="Retirer"
              onClick={() => onChange(selected.filter((s) => s !== id))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <select
        className="input"
        value=""
        onChange={(e) => {
          if (e.target.value && !selected.includes(e.target.value)) {
            onChange([...selected, e.target.value]);
          }
          e.target.value = "";
        }}
      >
        <option value="">Ajouter…</option>
        {options
          .filter((o) => !selected.includes(o.id))
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
      </select>
    </Field>
  );
}

const BLOCK_LABELS: Record<GuideBlockType, string> = {
  heading: "Titre",
  paragraph: "Paragraphe",
  steps: "Étapes numérotées",
  list: "Liste à puces",
  image: "Image",
  warning: "Avertissement",
  tip: "Astuce Navigator",
  payment: "Moyens de paiement",
  product: "Produit recommandé",
  cta: "Bouton d'action",
};

function newBlock(type: GuideBlockType): GuideBlock {
  const id = tempId("block");
  switch (type) {
    case "heading":
      return { id, type, text: "" };
    case "paragraph":
      return { id, type, text: "" };
    case "steps":
      return { id, type, items: [] };
    case "list":
      return { id, type, items: [] };
    case "image":
      return { id, type, url: "", alt: "", caption: "" };
    case "warning":
      return { id, type, text: "" };
    case "tip":
      return { id, type, title: "", message: "", tipType: "information" };
    case "payment":
      return { id, type, title: "Moyens de paiement", note: "" };
    case "product":
      return { id, type, productId: "" };
    case "cta":
      return { id, type, label: "", url: "" };
  }
}

/** Convert an ISO string to a value the datetime-local input accepts. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
