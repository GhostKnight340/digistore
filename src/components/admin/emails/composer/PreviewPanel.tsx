"use client";

import type { ClientRecipient } from "../types";

export type PreviewData = {
  subject: string;
  preheader: string;
  html: string;
  missingVariables: string[];
};

/** Live e-mail preview: device toggle, zoom, per-recipient switcher, warnings. */
export default function PreviewPanel({
  preview,
  loading,
  mode,
  onModeChange,
  zoom,
  onZoom,
  recipients,
  previewIndex,
  onPreviewIndex,
  senderName,
  senderEmail,
  collapsible,
  collapsed,
  onCollapse,
}: {
  preview: PreviewData | null;
  loading: boolean;
  mode: "desktop" | "mobile";
  onModeChange: (m: "desktop" | "mobile") => void;
  zoom: number;
  onZoom: (z: number) => void;
  recipients: ClientRecipient[];
  previewIndex: number;
  onPreviewIndex: (i: number) => void;
  senderName: string;
  senderEmail: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapse?: () => void;
}) {
  if (collapsible && collapsed) {
    return (
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Afficher l'aperçu"
        className="card flex h-full w-10 flex-col items-center justify-start gap-2 py-3 text-muted hover:text-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        <span className="[writing-mode:vertical-rl] text-xs">Aperçu</span>
      </button>
    );
  }

  const current = recipients[previewIndex];
  const previewName = current?.name || current?.email?.split("@")[0] || "Exemple";

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text">Aperçu</h2>
          {loading && <span className="text-[11px] text-faint">…</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border border-border p-0.5">
            <button type="button" onClick={() => onModeChange("desktop")} className={`rounded-md px-2 py-0.5 text-xs ${mode === "desktop" ? "bg-accent text-white" : "text-muted"}`}>Bureau</button>
            <button type="button" onClick={() => onModeChange("mobile")} className={`rounded-md px-2 py-0.5 text-xs ${mode === "mobile" ? "bg-accent text-white" : "text-muted"}`}>Mobile</button>
          </div>
          <div className="flex items-center rounded-lg border border-border">
            <button type="button" aria-label="Dézoomer" onClick={() => onZoom(Math.max(50, zoom - 10))} className="px-1.5 py-0.5 text-xs text-muted hover:text-text">−</button>
            <span className="min-w-[38px] text-center font-mono text-[11px] text-muted">{zoom}%</span>
            <button type="button" aria-label="Zoomer" onClick={() => onZoom(Math.min(150, zoom + 10))} className="px-1.5 py-0.5 text-xs text-muted hover:text-text">+</button>
          </div>
          {collapsible && (
            <button type="button" onClick={onCollapse} aria-label="Réduire l'aperçu" className="rounded-lg border border-border px-1.5 py-0.5 text-muted hover:text-text">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Inbox metadata + recipient switcher */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="rounded-lg bg-surface p-2 text-xs">
          <div className="truncate font-medium text-text">{preview?.subject || "(objet vide)"}</div>
          {preview?.preheader && <div className="truncate text-muted">{preview.preheader}</div>}
          <div className="mt-0.5 truncate text-[11px] text-faint">De : {senderName} · {senderEmail}</div>
        </div>
        {recipients.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-muted">Aperçu pour</label>
            <select
              className="input h-8 flex-1 text-xs"
              value={previewIndex}
              onChange={(e) => onPreviewIndex(Number(e.target.value))}
            >
              {recipients.map((r, i) => (
                <option key={r.email} value={i}>{r.name || r.email}</option>
              ))}
            </select>
            <span className="chip shrink-0 text-[10px]">Données d&apos;exemple</span>
          </div>
        )}
        {preview && preview.missingVariables.length > 0 && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">
            Variables non résolues pour {previewName} : {preview.missingVariables.join(", ")}
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto bg-[#070809] p-3">
        {preview ? (
          <div
            className="mx-auto overflow-hidden rounded-lg border border-border bg-white"
            style={{ width: mode === "mobile" ? 380 : "100%", transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
          >
            <iframe title="Aperçu e-mail" srcDoc={preview.html} className="h-[600px] w-full" sandbox="" />
          </div>
        ) : (
          <p className="p-4 text-center text-sm text-muted">L&apos;aperçu s&apos;affichera ici.</p>
        )}
      </div>
    </div>
  );
}
