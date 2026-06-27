"use client";

import Link from "next/link";
import { useEditor } from "@/lib/editor/EditorContext";

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M3 7v6h6" />
      <path d="M3 13C5.6 7.6 11 4 17 4a9 9 0 0 1 0 18" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M21 7v6h-6" />
      <path d="M21 13C18.4 7.6 13 4 7 4a9 9 0 0 0 0 18" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      {open ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  );
}

export default function EditorToolbar() {
  const { canUndo, canRedo, isDirty, previewMode, undo, redo, save, togglePreview } = useEditor();

  return (
    <div className="sticky top-[66px] z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="container-page flex h-11 items-center gap-2">
        <Link
          href="/admin"
          className="text-sm text-muted hover:text-white transition-colors"
        >
          ← Admin
        </Link>

        <div className="mx-2 h-4 w-px bg-border" />

        <Link
          href="/admin/editor"
          className="rounded-lg border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-medium text-white"
        >
          Homepage Editor
        </Link>

        <div className="mx-1 h-4 w-px bg-border" />

        <div className="flex items-center">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            className="rounded p-1.5 text-muted hover:bg-surface hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            className="rounded p-1.5 text-muted hover:bg-surface hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <RedoIcon />
          </button>
        </div>

        <div className="mx-1 h-4 w-px bg-border" />

        <button
          type="button"
          onClick={togglePreview}
          title={previewMode ? "Back to editing" : "Preview"}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            previewMode
              ? "bg-accent/15 text-accent"
              : "text-muted hover:bg-surface hover:text-white"
          }`}
        >
          <EyeIcon open={previewMode} />
          {previewMode ? "Editing off" : "Preview"}
        </button>

        <div className="ml-auto flex items-center gap-3">
          {isDirty && (
            <span className="text-[11px] text-faint">Unsaved changes</span>
          )}
          <button
            type="button"
            onClick={save}
            className="h-7 rounded-lg bg-accent px-3.5 text-xs font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
