"use client";

import { useEffect, useMemo, useState } from "react";

import { relativeTime } from "@/components/admin/operations/shared";
import type { StudioContentItemDTO, StudioFormat, StudioStatus } from "@/lib/composio/instagram/types";
import { C, FORMAT_LABEL, STATUS_META } from "./tokens";
import { Icon } from "./Icon";
import { PreviewCard } from "./PreviewCard";

export type RowAction =
  | "edit"
  | "preview"
  | "duplicate"
  | "delete"
  | "publish"
  | "reschedule"
  | "cancel"
  | "retry";

/** Row-menu actions available per status (matches the handoff's contextual menu). */
const MENU_BY_STATUS: Record<StudioStatus, { action: RowAction; label: string; tone?: "danger" }[]> = {
  draft: [
    { action: "edit", label: "Modifier" },
    { action: "preview", label: "Prévisualiser" },
    { action: "publish", label: "Publier maintenant" },
    { action: "reschedule", label: "Programmer" },
    { action: "duplicate", label: "Dupliquer" },
    { action: "delete", label: "Supprimer", tone: "danger" },
  ],
  scheduled: [
    { action: "publish", label: "Publier maintenant" },
    { action: "reschedule", label: "Reprogrammer" },
    { action: "preview", label: "Prévisualiser" },
    { action: "duplicate", label: "Dupliquer" },
    { action: "cancel", label: "Annuler", tone: "danger" },
  ],
  failed: [
    { action: "retry", label: "Réessayer" },
    { action: "edit", label: "Modifier" },
    { action: "reschedule", label: "Reprogrammer" },
    { action: "preview", label: "Prévisualiser" },
    { action: "delete", label: "Supprimer", tone: "danger" },
  ],
  publishing: [{ action: "preview", label: "Prévisualiser" }],
  published: [{ action: "preview", label: "Prévisualiser" }, { action: "duplicate", label: "Dupliquer" }],
  cancelled: [{ action: "duplicate", label: "Dupliquer" }, { action: "delete", label: "Supprimer", tone: "danger" }],
};

function StatusBadge({ status }: { status: StudioStatus }) {
  const m = STATUS_META[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px", borderRadius: 7, background: m.bg, color: m.color, fontSize: 11, fontWeight: 500 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color }} />
      {m.label}
    </span>
  );
}

function Thumb({ url, size = 52 }: { url?: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 9, overflow: "hidden", background: C.inset, flexShrink: 0, border: `1px solid ${C.borderSubtle}` }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.faint2 }}>
          <Icon name="image" size={18} color={C.faint2} />
        </div>
      )}
    </div>
  );
}

function RowMenu({
  item,
  busy,
  onAction,
}: {
  item: StudioContentItemDTO;
  busy: boolean;
  onAction: (action: RowAction, item: StudioContentItemDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const actions = MENU_BY_STATUS[item.status] ?? [];
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Actions"
        title="Actions"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.borderInput}`, background: C.surface, color: C.dim, cursor: busy ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="more" size={15} color={C.dim} strokeWidth={2.2} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: 34, right: 0, background: C.menu, border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 11, padding: 6, minWidth: 190, boxShadow: "0 20px 44px rgba(0,0,0,0.5)", zIndex: 50 }}>
            {actions.map((a) => (
              <button
                key={a.action}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAction(a.action, item);
                }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 8, background: "transparent", color: a.tone === "danger" ? C.dangerText : C.text2, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PreviewModal({ item, handle, avatarUrl, onClose }: { item: StudioContentItemDTO; handle: string; avatarUrl?: string | null; onClose: () => void }) {
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
      style={{ position: "fixed", inset: 0, background: "rgba(4,5,6,0.8)", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ position: "relative" }}>
        <button type="button" aria-label="Fermer" onClick={onClose} style={{ position: "absolute", top: -40, right: 0, width: 30, height: 30, borderRadius: 8, border: `1px solid rgba(255,255,255,0.14)`, background: C.surface, color: C.accentTextBright, cursor: "pointer" }}>
          ✕
        </button>
        <PreviewCard width={340} format={item.format} media={item.media} caption={item.caption} hashtags={item.hashtags} handle={handle} avatarUrl={avatarUrl} />
      </div>
    </div>
  );
}

const QUEUE_FILTERS: { key: "all" | StudioStatus; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "draft", label: "Brouillons" },
  { key: "scheduled", label: "Programmés" },
  { key: "failed", label: "Échecs" },
];

export function QueuePanel({
  items,
  handle,
  avatarUrl,
  busy,
  onAction,
}: {
  items: StudioContentItemDTO[];
  handle: string;
  avatarUrl?: string | null;
  busy: boolean;
  onAction: (action: RowAction, item: StudioContentItemDTO) => void;
}) {
  const [filter, setFilter] = useState<"all" | StudioStatus>("all");
  const [preview, setPreview] = useState<StudioContentItemDTO | null>(null);

  // The next scheduled item (earliest scheduledFor) gets the SUIVANTE badge.
  const nextId = useMemo(() => {
    const scheduled = items
      .filter((i) => i.status === "scheduled" && i.scheduledFor)
      .sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? -1 : 1));
    return scheduled[0]?.id ?? null;
  }, [items]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );

  function handleAction(action: RowAction, item: StudioContentItemDTO) {
    if (action === "preview") {
      setPreview(item);
      return;
    }
    onAction(action, item);
  }

  const summary =
    items.length === 0
      ? "Aucun élément dans la file."
      : `${items.length} élément${items.length > 1 ? "s" : ""} · ${items.filter((i) => i.status === "draft").length} brouillon(s), ${items.filter((i) => i.status === "scheduled").length} programmé(s), ${items.filter((i) => i.status === "failed").length} échec(s).`;

  return (
    <div style={{ paddingBottom: 30 }}>
      <div style={{ display: "flex", gap: 4, padding: 4, background: C.inset, border: `1px solid ${C.borderInput}`, borderRadius: 11, marginBottom: 14, width: "fit-content" }}>
        {QUEUE_FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{ height: 30, padding: "0 12px", border: "none", borderRadius: 8, background: on ? C.accent : "transparent", color: on ? "#fff" : C.dim2, fontSize: 12.5, fontWeight: on ? 600 : 500, cursor: "pointer" }}>
              {f.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12 }}>{summary}</div>

      {filtered.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <Icon name="calendar" size={34} color="#3a3f4a" strokeWidth={1.5} style={{ margin: "0 auto 14px", display: "block" }} />
          <div style={{ fontSize: 14, fontWeight: 500, color: C.text2 }}>File d’attente vide</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Vos brouillons et publications programmées apparaîtront ici.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((item) => {
            const isNext = item.id === nextId;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 14px",
                  background: C.card,
                  border: `1px solid ${isNext ? "rgba(62,123,250,0.4)" : C.borderCard}`,
                  borderRadius: 12,
                }}
              >
                <Thumb url={item.media[0]?.url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <StatusBadge status={item.status} />
                    {isNext && (
                      <span style={{ height: 22, display: "inline-flex", alignItems: "center", padding: "0 8px", borderRadius: 7, background: "rgba(62,123,250,0.18)", color: C.accentText, fontSize: 10, fontWeight: 600, letterSpacing: ".04em" }}>
                        SUIVANTE
                      </span>
                    )}
                    <span style={{ fontSize: 11.5, color: C.muted }}>{FORMAT_LABEL[item.format as StudioFormat]}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.caption.trim() || "(sans légende)"}
                  </div>
                  <div style={{ fontSize: 11, color: item.status === "failed" ? C.dangerText : C.faint, marginTop: 3 }}>
                    {item.status === "scheduled" && item.scheduledFor
                      ? `Programmé ${relativeTime(item.scheduledFor)}`
                      : item.status === "failed" && item.lastError
                        ? item.lastError
                        : `Modifié ${relativeTime(item.updatedAt)}`}
                  </div>
                </div>
                <RowMenu item={item} busy={busy} onAction={handleAction} />
              </div>
            );
          })}
        </div>
      )}

      {preview && <PreviewModal item={preview} handle={handle} avatarUrl={avatarUrl} onClose={() => setPreview(null)} />}
    </div>
  );
}

export function PublicationsPanel({
  items,
  onAction,
}: {
  items: StudioContentItemDTO[];
  onAction: (action: RowAction, item: StudioContentItemDTO) => void;
}) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <Icon name="image" size={34} color="#3a3f4a" strokeWidth={1.5} style={{ margin: "0 auto 14px", display: "block" }} />
        <div style={{ fontSize: 14, fontWeight: 500, color: C.text2 }}>Aucune publication</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Les publications envoyées depuis Ghost.ma apparaîtront ici.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14, paddingBottom: 30 }}>
      {items.map((item) => (
        <div key={item.id} style={{ background: C.card, border: `1px solid ${C.borderCard}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ aspectRatio: "1 / 1", background: C.inset }}>
            {item.media[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.media[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.faint2 }}>
                <Icon name="image" size={24} color={C.faint2} />
              </div>
            )}
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {item.caption.trim() || "(sans légende)"}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 11, color: C.faint }}>{item.publishedAt ? relativeTime(item.publishedAt) : ""}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" onClick={() => onAction("duplicate", item)} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: C.dim, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}>
                  <Icon name="copy" size={12} color={C.dim} />
                  Dupliquer
                </button>
                {item.instagramPermalink && (
                  <a href={item.instagramPermalink} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.accentText, textDecoration: "none" }}>
                    Voir
                    <Icon name="ext" size={12} color={C.accentText} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
