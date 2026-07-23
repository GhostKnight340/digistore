"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";

import type { StudioContentItemDTO, StudioFormat, StudioMediaDescriptor } from "@/lib/composio/instagram/types";
import {
  publishNowAction,
  saveDraftAction,
  updateDraftAction,
  uploadInstagramMediaAction,
} from "@/app/actions/instagramStudio";
import { suggestHashtagsAction } from "@/app/actions/instagramAi";
import { C, FORMAT_META, fmtBytes } from "./tokens";
import { Icon } from "./Icon";
import { PreviewCard } from "./PreviewCard";
import { AiDrawer } from "./AiDrawer";

type ClientMedia = StudioMediaDescriptor & { file: File | null; remote: boolean };
type PreviewMode = "feed" | "mobile" | "fullscreen";
type Autosave = "idle" | "saving" | "saved";

const MAX_CAPTION = 2200;
const MAX_HASHTAGS = 30; // Instagram's per-post hashtag limit.
const EMOJIS = ["✨", "🔥", "📦", "🎮", "🛒", "🚀", "💎"];
const AUTOSAVE_KEY = "ig-studio-composer";

/** Drops client-only fields (the File handle, remote flag) for server transport. */
function strip(m: ClientMedia): StudioMediaDescriptor {
  const { file: _file, remote: _remote, ...rest } = m;
  void _file;
  void _remote;
  return rest;
}

/** Reads an image's natural dimensions client-side (no upload, no pixel analysis). */
function readImageMeta(file: File): Promise<{ url: string; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ url, width: null, height: null });
    img.src = url;
  });
}

export function Composer({
  handle,
  publishAvailable,
  viewport,
  initialItem,
  onToast,
  onPersisted,
  onExitEdit,
  onSchedule,
}: {
  handle: string;
  publishAvailable: boolean;
  viewport: "desktop" | "mobile";
  initialItem?: StudioContentItemDTO | null;
  onToast: (text: string, tone: "ok" | "err" | "info") => void;
  onPersisted: (opts?: { goToQueue?: boolean }) => void;
  onExitEdit?: () => void;
  onSchedule: (item: StudioContentItemDTO) => void;
}) {
  const editId = initialItem?.id ?? null;
  const [format, setFormat] = useState<StudioFormat>(initialItem?.format ?? "post");
  const [media, setMedia] = useState<ClientMedia[]>(
    (initialItem?.media ?? []).map((m) => ({ ...m, file: null, remote: true })),
  );
  const [caption, setCaption] = useState(initialItem?.caption ?? "");
  const [hashtags, setHashtags] = useState<string[]>(initialItem?.hashtags ?? []);
  const [hashtagInput, setHashtagInput] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("feed");
  const [fullscreen, setFullscreen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(false);
  const [autosave, setAutosave] = useState<Autosave>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [token] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())));
  const [aiOpen, setAiOpen] = useState(false);
  const [lastAiEdit, setLastAiEdit] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);
  const meta = FORMAT_META[format];

  // Restore text fields from the last local autosave (media is not persisted
  // here). Skipped when editing an existing item — its content wins.
  useEffect(() => {
    if (restored.current || editId) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { caption?: string; hashtags?: string[] };
        if (saved.caption) setCaption(saved.caption);
        if (Array.isArray(saved.hashtags)) setHashtags(saved.hashtags);
      }
    } catch {
      /* ignore malformed autosave */
    }
  }, []);

  /** Debounced local autosave of the caption + hashtags (drives the indicator). */
  function scheduleAutosave(nextCaption: string, nextHashtags: string[]) {
    setAutosave("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ caption: nextCaption, hashtags: nextHashtags }));
      } catch {
        /* storage may be unavailable */
      }
      setAutosave("saved");
    }, 600);
  }

  function updateCaption(next: string) {
    setCaption(next);
    scheduleAutosave(next, hashtags);
  }
  function updateHashtags(next: string[]) {
    setHashtags(next);
    scheduleAutosave(caption, next);
  }

  // ── Format ─────────────────────────────────────────────────────────────────
  function changeFormat(next: StudioFormat) {
    if (!FORMAT_META[next].available || next === format) return;
    setFormat(next);
    // A non-multiple format keeps only the first media item.
    if (!FORMAT_META[next].multiple) setMedia((prev) => prev.slice(0, 1));
  }

  // ── Media ────────────────────────────────────────────────────────────────
  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const accepted = Array.from(list).filter((f) => meta.accept.split(",").some((a) => {
      const t = a.trim();
      return t.endsWith("/*") ? f.type.startsWith(t.slice(0, -1)) : f.type === t;
    }));
    if (accepted.length === 0) {
      onToast("Format non supporté. Utilisez une image JPG ou PNG.", "err");
      return;
    }

    // Carousel appends up to maxFiles; single-media formats replace.
    const room = meta.multiple ? Math.max(0, meta.maxFiles - media.length) : 1;
    const toAdd = meta.multiple ? accepted.slice(0, room) : accepted.slice(0, 1);
    if (meta.multiple && accepted.length > room) {
      onToast(`Maximum ${meta.maxFiles} fichiers.`, "err");
    }

    const built = await Promise.all(
      toAdd.map(async (file) => {
        const { url, width, height } = await readImageMeta(file);
        return {
          id: `m${Math.random().toString(36).slice(2, 9)}`,
          type: "image" as const,
          url,
          name: file.name,
          size: file.size,
          width,
          height,
          duration: null,
          file,
          remote: false,
        };
      }),
    );
    setMedia((prev) => (meta.multiple ? [...prev, ...built] : built));
  }

  function removeMedia(id: string) {
    setMedia((prev) => {
      const gone = prev.find((m) => m.id === id);
      if (gone && !gone.remote && gone.url.startsWith("blob:")) URL.revokeObjectURL(gone.url);
      return prev.filter((m) => m.id !== id);
    });
  }

  /** Moves a carousel item left/right (reorder). */
  function moveMedia(id: string, dir: -1 | 1) {
    setMedia((prev) => {
      const i = prev.findIndex((m) => m.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /** Uploads any not-yet-remote media to Blob; returns server-safe descriptors. */
  async function ensureUploaded(): Promise<StudioMediaDescriptor[] | null> {
    const out: StudioMediaDescriptor[] = [];
    for (const m of media) {
      if (m.remote) {
        out.push(strip(m));
        continue;
      }
      if (!m.file) return null;
      const fd = new FormData();
      fd.append("file", m.file);
      const res = await uploadInstagramMediaAction(fd);
      if (!res.ok || !res.data) {
        onToast(res.error ?? "Import du média impossible.", "err");
        return null;
      }
      out.push({ ...strip(m), url: res.data.url });
    }
    return out;
  }

  // ── Hashtags ───────────────────────────────────────────────────────────────
  function addHashtag(raw: string) {
    let v = raw.trim().replace(/\s+/g, "");
    if (!v) return;
    if (!v.startsWith("#")) v = `#${v}`;
    if (hashtags.includes(v)) return;
    if (hashtags.length >= MAX_HASHTAGS) {
      onToast(`Instagram limite à ${MAX_HASHTAGS} hashtags.`, "err");
      return;
    }
    updateHashtags([...hashtags, v]);
  }
  function improveHashtags() {
    if (!hashtags.length) return;
    const cleaned = [...new Set(hashtags.map((h) => h.replace(/[^#a-zA-ZÀ-ÿ0-9]/g, "")).filter((h) => h.length > 1))];
    updateHashtags(cleaned);
    onToast("Hashtags optimisés.", "ok");
  }
  async function suggestHashtags() {
    setSuggesting(true);
    const res = await suggestHashtagsAction({ caption, hashtags, language: "Français" });
    setSuggesting(false);
    if (res.ok && res.data) setSuggested(res.data.suggestions);
    else onToast(res.error ?? "Suggestion impossible.", "err");
  }
  function addSuggested(tag: string) {
    if (hashtags.includes(tag)) return;
    if (hashtags.length >= MAX_HASHTAGS) {
      onToast(`Instagram limite à ${MAX_HASHTAGS} hashtags.`, "err");
      return;
    }
    updateHashtags([...hashtags, tag]);
    setSuggested((s) => s.filter((h) => h !== tag));
  }
  function addAllSuggested() {
    const merged = [...new Set([...hashtags, ...suggested])].slice(0, MAX_HASHTAGS);
    if (merged.length < hashtags.length + suggested.length) {
      onToast(`Ajouté jusqu’à la limite de ${MAX_HASHTAGS} hashtags.`, "info");
    }
    updateHashtags(merged);
    setSuggested([]);
  }
  function insertHashtagsIntoCaption() {
    if (!hashtags.length) return;
    const next = `${caption.trimEnd()}\n\n${hashtags.join(" ")}`.trimStart();
    updateCaption(next.slice(0, MAX_CAPTION));
    onToast("Hashtags insérés dans la légende.", "ok");
  }

  // ── AI caption ───────────────────────────────────────────────────────────────
  function applyAiProposal(proposal: string) {
    setLastAiEdit(caption);
    updateCaption(proposal);
    setAiOpen(false);
    onToast("Légende mise à jour par l’IA.", "ok");
  }
  function undoAiEdit() {
    if (lastAiEdit === null) return;
    updateCaption(lastAiEdit);
    setLastAiEdit(null);
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  /** Creates or updates the draft row, returning its DTO (or null on failure). */
  async function persistDraft(): Promise<StudioContentItemDTO | null> {
    const uploaded = await ensureUploaded();
    if (uploaded === null && media.length) return null;
    const payload = { format, caption, hashtags, media: uploaded ?? [] };
    const res = editId
      ? await updateDraftAction({ id: editId, ...payload })
      : await saveDraftAction(payload);
    if (!res.ok || !res.data) {
      onToast(res.error ?? "Enregistrement impossible.", "err");
      return null;
    }
    return res.data;
  }

  function doSaveDraft() {
    startTransition(async () => {
      const item = await persistDraft();
      if (!item) return;
      onToast(editId ? "Brouillon mis à jour." : "Brouillon enregistré.", "ok");
      onExitEdit?.();
      onPersisted({ goToQueue: true });
    });
  }

  function doSchedule() {
    startTransition(async () => {
      const item = await persistDraft();
      if (!item) return;
      onSchedule(item);
    });
  }

  function doPublish() {
    setConfirmOpen(false);
    startTransition(async () => {
      const uploaded = await ensureUploaded();
      if (!uploaded || uploaded.length === 0) return;
      onToast("Publication en cours…", "info");
      const res = await publishNowAction({ format, caption, hashtags, media: uploaded, token });
      if (res.ok) {
        onToast("Publication publiée sur Instagram.", "ok");
        setCaption("");
        setHashtags([]);
        setMedia([]);
        try {
          localStorage.removeItem(AUTOSAVE_KEY);
        } catch {
          /* ignore */
        }
        onPersisted();
      } else {
        onToast(res.error ?? "Échec de la publication.", "err");
      }
    });
  }

  const canPublish = publishAvailable && meta.publishable && media.length > 0 && !pending;
  const canSchedule = meta.publishable && !pending && (media.length > 0 || !!caption.trim() || hashtags.length > 0);
  const hasContent = media.length > 0 || !!caption.trim() || hashtags.length > 0;
  const previewWidth = previewMode === "mobile" ? 280 : 320;
  const isMobile = viewport === "mobile";

  return (
    <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
      {/* LEFT: workflow column */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14, paddingBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10.5, letterSpacing: ".09em", textTransform: "uppercase", color: C.faint2, fontWeight: 600 }}>
            {editId ? "Modification du brouillon" : "Composer"}
          </div>
          {editId && (
            <button type="button" onClick={() => onExitEdit?.()} style={{ border: "none", background: "transparent", color: C.accentText, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}>
              Nouveau brouillon
            </button>
          )}
        </div>

        {/* STEP 1: FORMAT */}
        <Card>
          <StepLabel>1 · Format</StepLabel>
          <div style={{ display: "flex", gap: 6, padding: 4, background: C.inset, border: `1px solid ${C.borderInput}`, borderRadius: 11, overflowX: "auto" }}>
            {(Object.keys(FORMAT_META) as StudioFormat[]).map((k) => {
              const fm = FORMAT_META[k];
              const on = format === k;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!fm.available}
                  aria-disabled={!fm.available}
                  title={fm.available ? fm.label : fm.unavailableReason}
                  onClick={() => changeFormat(k)}
                  style={{
                    flex: 1,
                    minWidth: 92,
                    height: 34,
                    border: "none",
                    borderRadius: 8,
                    background: on ? C.accent : "transparent",
                    color: on ? "#fff" : fm.available ? C.dim2 : C.faint2,
                    fontSize: 12.5,
                    fontWeight: on ? 600 : 500,
                    cursor: fm.available ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                    padding: "0 10px",
                  }}
                >
                  {fm.label}
                  {!fm.available ? " 🔒" : ""}
                </button>
              );
            })}
          </div>
          {meta.draftOnlyReason ? (
            <Note tone="warn">
              <Icon name="alert" size={14} color={C.warn} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span style={{ color: C.warnText2, lineHeight: 1.55 }}>{meta.draftOnlyReason}</span>
            </Note>
          ) : (
            <Note tone="warn">
              <strong style={{ color: C.warnText, fontWeight: 600 }}>Story indisponible.</strong>{" "}
              {FORMAT_META.story.unavailableReason} Les Reels arriveront prochainement.
            </Note>
          )}
        </Card>

        {/* STEP 2: MEDIA */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <StepLabel noMargin>2 · Média</StepLabel>
            <div style={{ fontSize: 11.5, color: C.muted }}>{meta.hint}</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={meta.accept}
            multiple={meta.multiple}
            style={{ display: "none" }}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {media.length === 0 ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFiles(e.dataTransfer.files);
              }}
              style={{
                border: `1.5px dashed ${C.borderInput}`,
                borderRadius: 13,
                padding: "30px 20px",
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <Icon name="upload" size={26} color={C.faint} strokeWidth={1.6} style={{ margin: "0 auto 10px", display: "block" }} />
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                {meta.multiple ? "Glissez-déposez vos images ici" : "Glissez-déposez votre image ici"}
              </div>
              <div style={{ fontSize: 12, color: C.muted, margin: "5px 0 12px" }}>ou</div>
              <span
                style={{
                  display: "inline-block",
                  height: 34,
                  lineHeight: "34px",
                  padding: "0 15px",
                  borderRadius: 9,
                  border: `1px solid rgba(255,255,255,0.12)`,
                  background: C.surface,
                  color: C.accentTextBright,
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
              >
                Sélectionner depuis l’appareil
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 2 }}>
              {media.map((m, idx) => {
                const metaLine = [m.width ? `${m.width}×${m.height}` : "", m.size ? fmtBytes(m.size) : ""]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={m.id} style={{ width: 96, display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ position: "relative", width: 96, height: 96, borderRadius: 10, overflow: "hidden", background: C.inset, border: `1px solid ${C.borderInput}` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        type="button"
                        aria-label="Retirer l’image"
                        title="Retirer"
                        onClick={() => removeMedia(m.id)}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          width: 19,
                          height: 19,
                          borderRadius: "50%",
                          background: "rgba(7,8,9,0.75)",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name="x" size={10} color="#fff" strokeWidth={2.4} />
                      </button>
                      {meta.multiple && (
                        <div style={{ position: "absolute", bottom: 4, left: 4, right: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <button type="button" aria-label="Déplacer à gauche" onClick={() => moveMedia(m.id, -1)} disabled={idx === 0} style={reorderBtn(idx === 0)}>‹</button>
                          <span style={{ fontSize: 9, color: "#fff", background: "rgba(7,8,9,.75)", borderRadius: 5, padding: "1px 5px" }}>{idx + 1}</span>
                          <button type="button" aria-label="Déplacer à droite" onClick={() => moveMedia(m.id, 1)} disabled={idx === media.length - 1} style={reorderBtn(idx === media.length - 1)}>›</button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 9.5, color: C.faint, fontFamily: "'Geist Mono',monospace", lineHeight: 1.3 }}>{metaLine}</div>
                  </div>
                );
              })}
              {meta.multiple && media.length < meta.maxFiles && (
                <button
                  type="button"
                  aria-label="Ajouter une image"
                  onClick={() => fileRef.current?.click()}
                  style={{ width: 96, height: 96, borderRadius: 10, border: `1.5px dashed ${C.borderInput}`, background: "transparent", color: C.faint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "flex-start" }}
                >
                  <Icon name="plus" size={18} color={C.faint} strokeWidth={1.8} />
                </button>
              )}
            </div>
          )}
        </Card>

        {/* STEP 3: CAPTION + HASHTAGS */}
        <Card>
          <StepLabel>3 · Légende</StepLabel>
          <textarea
            value={caption}
            maxLength={MAX_CAPTION}
            onChange={(e) => updateCaption(e.target.value)}
            placeholder="Écrivez votre légende…"
            style={{
              width: "100%",
              minHeight: 110,
              padding: "12px 13px",
              background: C.inset,
              border: `1px solid ${C.borderInput}`,
              borderRadius: 11,
              color: C.text,
              fontSize: 14,
              outline: "none",
              lineHeight: 1.55,
              resize: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 9, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: C.muted, fontFamily: "'Geist Mono',monospace" }}>
              {caption.length} / 2 200
            </span>
            <button
              type="button"
              aria-label="Insérer un emoji"
              title="Insérer un emoji"
              onClick={() => updateCaption(caption + EMOJIS[Math.floor(Math.random() * EMOJIS.length)])}
              style={iconBtn}
            >
              🙂
            </button>
            <button type="button" onClick={() => updateCaption("")} style={{ border: "none", background: "transparent", color: C.dim2, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              Effacer
            </button>
            {lastAiEdit !== null && (
              <button type="button" onClick={undoAiEdit} style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", fontSize: 12, color: C.accentText, cursor: "pointer", fontWeight: 500 }}>
                <Icon name="retry" size={12} color={C.accentText} strokeWidth={2} />
                Annuler la modification IA
              </button>
            )}
            <div style={{ flex: 1 }} />
            {autosave !== "idle" && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.muted }}>
                {autosave === "saved" && <Icon name="check" size={12} color={C.success} strokeWidth={2.4} />}
                {autosave === "saving" ? "Enregistrement…" : "Enregistré"}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAiOpen(true)}
            style={{
              marginTop: 13,
              height: 36,
              padding: "0 15px",
              borderRadius: 10,
              border: `1px solid rgba(124,92,252,0.35)`,
              background: "rgba(124,92,252,0.12)",
              color: C.aiText,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="sparkle" size={14} color={C.aiText} strokeWidth={0} style={{ fill: C.aiText }} />
            Améliorer avec l’IA
          </button>

          <div style={{ height: 1, background: C.borderSubtle, margin: "16px 0" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.dim }}>Hashtags</div>
            <span style={{ fontSize: 11.5, color: C.muted }}>
              {hashtags.length ? `${hashtags.length} / ${MAX_HASHTAGS} hashtags` : ""}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9 }}>
            {hashtags.length === 0 ? (
              <span style={{ fontSize: 12, color: C.faint2 }}>Aucun hashtag pour le moment.</span>
            ) : (
              hashtags.map((h, i) => (
                <span
                  key={h}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    height: 27,
                    padding: "0 6px 0 10px",
                    borderRadius: 999,
                    background: "rgba(62,123,250,0.1)",
                    border: `1px solid rgba(62,123,250,0.24)`,
                    color: "#9FB8FF",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {h}
                  <button
                    type="button"
                    aria-label={`Retirer ${h}`}
                    onClick={() => updateHashtags(hashtags.filter((_, j) => j !== i))}
                    style={{ width: 16, height: 16, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.08)", color: "#9FB8FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Icon name="x" size={9} color="#9FB8FF" strokeWidth={2.4} />
                  </button>
                </span>
              ))
            )}
          </div>
          <input
            value={hashtagInput}
            onChange={(e) => setHashtagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addHashtag(hashtagInput);
                setHashtagInput("");
              }
            }}
            placeholder="Ajouter un hashtag… puis Entrée"
            style={{ width: "100%", height: 36, padding: "0 12px", background: C.inset, border: `1px solid ${C.borderInput}`, borderRadius: 9, color: C.text, fontSize: 13, outline: "none" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={suggesting}
              onClick={suggestHashtags}
              style={{ ...pill, border: `1px solid rgba(124,92,252,0.3)`, background: "rgba(124,92,252,0.08)", color: C.aiText, cursor: suggesting ? "wait" : "pointer" }}
            >
              {suggesting ? "Génération…" : "Suggérer avec l’IA"}
            </button>
            <button type="button" onClick={improveHashtags} style={pill}>
              Améliorer
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(hashtags.join(" "));
                onToast("Hashtags copiés.", "ok");
              }}
              style={pill}
            >
              Copier
            </button>
          </div>

          {suggested.length > 0 && (
            <div style={{ marginTop: 12, padding: "12px 13px", background: C.inset, border: `1px dashed rgba(124,92,252,0.3)`, borderRadius: 11 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9, gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: C.dim, fontWeight: 500 }}>Suggestions IA (basées sur le texte)</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={addAllSuggested} style={{ border: "none", background: "transparent", color: C.accentText, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                    Tout ajouter
                  </button>
                  <button type="button" onClick={insertHashtagsIntoCaption} style={{ border: "none", background: "transparent", color: C.dim2, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}>
                    Insérer dans la légende
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {suggested.map((h) => (
                  <button key={h} type="button" onClick={() => addSuggested(h)} style={{ height: 27, padding: "0 10px", borderRadius: 999, border: `1px dashed rgba(124,92,252,0.4)`, background: "transparent", color: C.aiText, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                    + {h}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* STEP 4: PUBLISH BAR (sticky) */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            gap: 10,
            padding: "14px 16px",
            background: "rgba(9,10,12,0.92)",
            backdropFilter: "blur(10px)",
            border: `1px solid ${C.borderInput}`,
            borderRadius: 14,
            boxShadow: "0 -10px 30px rgba(0,0,0,0.3)",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            disabled={!canPublish}
            onClick={() => setConfirmOpen(true)}
            style={{
              flex: 1.4,
              height: 42,
              borderRadius: 11,
              border: "none",
              background: C.accent,
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: canPublish ? "pointer" : "not-allowed",
              opacity: canPublish ? 1 : 0.5,
              boxShadow: "0 6px 18px rgba(62,123,250,0.32)",
            }}
          >
            Publier maintenant
          </button>
          <button
            type="button"
            disabled={!canSchedule}
            title={meta.publishable ? "Programmer la publication" : "Ce format ne peut pas encore être programmé"}
            onClick={doSchedule}
            style={{ flex: 1, height: 42, borderRadius: 11, border: `1px solid rgba(255,255,255,0.14)`, background: C.surface, color: C.text2, fontSize: 13, fontWeight: 500, cursor: canSchedule ? (pending ? "wait" : "pointer") : "not-allowed", opacity: canSchedule ? 1 : 0.5 }}
          >
            Programmer
          </button>
          <button
            type="button"
            disabled={pending || !hasContent}
            onClick={doSaveDraft}
            style={{ border: "none", background: "transparent", color: C.dim2, fontSize: 12.5, fontWeight: 500, cursor: "pointer", padding: "0 10px" }}
          >
            {editId ? "Mettre à jour le brouillon" : "Enregistrer le brouillon"}
          </button>
        </div>

        {!publishAvailable && (
          <Note tone="warn">
            <strong style={{ color: C.warnText, fontWeight: 600 }}>Publication indisponible.</strong> La capacité de
            publication n’est pas accordée sur la connexion actuelle. Vous pouvez enregistrer des brouillons.
          </Note>
        )}
      </div>

      {/* RIGHT: preview column (desktop) */}
      {!isMobile && (
        <div style={{ width: 360, flexShrink: 0, position: "sticky", top: 0, paddingBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, letterSpacing: ".09em", textTransform: "uppercase", color: C.faint2, fontWeight: 600 }}>
              Aperçu
            </div>
            <div style={{ display: "flex", gap: 2, background: C.surface, border: `1px solid ${C.borderInput}`, borderRadius: 8, padding: 3 }}>
              {(["feed", "mobile", "fullscreen"] as const).map((m) => {
                const on = previewMode === m && m !== "fullscreen";
                return (
                  <button
                    key={m}
                    type="button"
                    aria-label={m === "feed" ? "Aperçu fil" : m === "mobile" ? "Aperçu mobile" : "Plein écran"}
                    title={m}
                    onClick={() => (m === "fullscreen" ? setFullscreen(true) : setPreviewMode(m))}
                    style={{ width: 28, height: 28, border: "none", borderRadius: 6, background: on ? "rgba(62,123,250,.16)" : "transparent", color: on ? C.accentTextBright : C.dim2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Icon name={m === "feed" ? "monitor" : m === "mobile" ? "smartphone" : "maximize"} size={14} />
                  </button>
                );
              })}
            </div>
          </div>
          <PreviewCard width={previewWidth} format={format} media={media} caption={caption} hashtags={hashtags} handle={handle} />
        </div>
      )}

      {/* mobile: floating "Aperçu" pill */}
      {isMobile && (
        <button
          type="button"
          onClick={() => setMobileSheet(true)}
          style={{ position: "fixed", bottom: 78, right: 20, height: 44, padding: "0 16px", borderRadius: 999, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 10px 26px rgba(62,123,250,0.4)", display: "flex", alignItems: "center", gap: 8, zIndex: 60 }}
        >
          <Icon name="eye" size={15} color="#fff" strokeWidth={2} />
          Aperçu
        </button>
      )}

      {/* mobile preview sheet */}
      {mobileSheet && (
        <Overlay align="flex-end" onClose={() => setMobileSheet(false)}>
          <div style={{ width: "100%", maxWidth: 420, background: "#0C0D11", borderTopLeftRadius: 20, borderTopRightRadius: 20, border: `1px solid ${C.borderInput}`, maxHeight: "88%", display: "flex", flexDirection: "column" }}>
            <SheetHeader title="Aperçu" onClose={() => setMobileSheet(false)} />
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", justifyContent: "center" }}>
              <PreviewCard width={340} format={format} media={media} caption={caption} hashtags={hashtags} handle={handle} />
            </div>
          </div>
        </Overlay>
      )}

      {/* fullscreen preview (desktop) */}
      {fullscreen && (
        <Overlay align="center" onClose={() => setFullscreen(false)}>
          <div style={{ position: "relative" }}>
            <button type="button" aria-label="Fermer" onClick={() => setFullscreen(false)} style={{ position: "absolute", top: -40, right: 0, width: 30, height: 30, borderRadius: 8, border: `1px solid rgba(255,255,255,0.14)`, background: C.surface, color: C.accentTextBright, cursor: "pointer" }}>
              ✕
            </button>
            <PreviewCard width={360} format={format} media={media} caption={caption} hashtags={hashtags} handle={handle} />
          </div>
        </Overlay>
      )}

      {/* AI caption drawer */}
      <AiDrawer open={aiOpen} currentCaption={caption} onClose={() => setAiOpen(false)} onApply={applyAiProposal} onToast={onToast} />

      {/* publish confirm modal */}
      {confirmOpen && (
        <Overlay align="center" onClose={() => setConfirmOpen(false)}>
          <div style={{ width: 420, maxWidth: "92%", background: C.card, border: `1px solid ${C.borderInput}`, borderRadius: 16, boxShadow: "0 30px 70px rgba(0,0,0,0.55)" }}>
            <SheetHeader title="Publier sur Instagram ?" onClose={() => setConfirmOpen(false)} />
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <ConfirmRow label="Compte" value={handle} />
              <ConfirmRow label="Format" value={FORMAT_META[format].label} />
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", background: C.inset, flexShrink: 0 }}>
                  {media[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text2, lineHeight: 1.5 }}>
                  {caption.trim() ? `${caption.trim().slice(0, 140)}${caption.trim().length > 140 ? "…" : ""}` : "(aucune légende)"}
                  {hashtags.length > 0 && <div style={{ color: C.accentText, marginTop: 4 }}>{hashtags.join(" ")}</div>}
                </div>
              </div>
              <Note tone="warn">
                <Icon name="alert" size={14} color={C.warn} strokeWidth={2} style={{ flexShrink: 0 }} />
                <span style={{ color: C.warnText2, lineHeight: 1.55 }}>La publication deviendra publique immédiatement sur Instagram.</span>
              </Note>
            </div>
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.borderCard}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setConfirmOpen(false)} style={{ height: 36, padding: "0 15px", borderRadius: 9, border: `1px solid rgba(255,255,255,0.12)`, background: "transparent", color: C.text2, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                Annuler
              </button>
              <button type="button" disabled={pending} onClick={doPublish} style={{ height: 36, padding: "0 17px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: pending ? "wait" : "pointer" }}>
                {pending ? "Publication…" : "Publier maintenant"}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ── small building blocks ────────────────────────────────────────────────────
const iconBtn: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 7,
  border: `1px solid rgba(255,255,255,0.08)`,
  background: C.surface,
  color: C.dim,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
};
const pill: CSSProperties = {
  height: 30,
  padding: "0 12px",
  borderRadius: 8,
  border: `1px solid ${C.borderInput}`,
  background: C.surface,
  color: C.dim,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};
function reorderBtn(disabled: boolean): CSSProperties {
  return {
    width: 18,
    height: 18,
    borderRadius: 5,
    background: "rgba(7,8,9,0.75)",
    border: "none",
    color: "#fff",
    cursor: disabled ? "default" : "pointer",
    fontSize: 11,
    lineHeight: 1,
    opacity: disabled ? 0.35 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.card, border: `1px solid ${C.borderCard}`, borderRadius: 16, padding: "18px 20px" }}>{children}</div>;
}
function StepLabel({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: noMargin ? 0 : 12 }}>{children}</div>;
}
function Note({ children, tone }: { children: React.ReactNode; tone: "warn" }) {
  const bg = tone === "warn" ? "rgba(232,168,56,0.08)" : "rgba(62,123,250,0.08)";
  const border = tone === "warn" ? "rgba(232,168,56,0.24)" : "rgba(62,123,250,0.2)";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12, padding: "11px 13px", background: bg, border: `1px solid ${border}`, borderRadius: 11, fontSize: 12, lineHeight: 1.55 }}>
      {children}
    </div>
  );
}
function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.text2 }}>
      <span style={{ color: C.dim }}>{label}</span>
      <span style={{ flex: 1, textAlign: "right", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ flexShrink: 0, padding: "16px 20px", borderBottom: `1px solid ${C.borderCard}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
      <button type="button" aria-label="Fermer" onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.borderInput}`, background: C.surface, color: C.dim, cursor: "pointer" }}>
        ✕
      </button>
    </div>
  );
}
function Overlay({ children, align, onClose }: { children: React.ReactNode; align: "center" | "flex-end"; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: "absolute", inset: 0, background: "rgba(4,5,6,0.65)", zIndex: 100, display: "flex", alignItems: align, justifyContent: "center" }}
    >
      {children}
    </div>
  );
}
