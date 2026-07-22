"use client";

import type { ReactNode } from "react";

/**
 * One of the four numbered composer sections (Destinataires, Modèle et objet,
 * Contenu, Paramètres d'envoi). Collapsible independently; when collapsed it
 * shows a one-line summary of its current state.
 */
export default function SectionShell({
  index,
  title,
  summary,
  open,
  onToggle,
  actions,
  children,
}: {
  index: number;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  /** Optional controls rendered on the right of the header (e.g. "Ajouter"). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xs font-semibold text-muted">
            {index}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text">{title}</span>
            {!open && <span className="block truncate text-xs text-muted">{summary}</span>}
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {open && actions && <div className="shrink-0">{actions}</div>}
      </div>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </section>
  );
}
