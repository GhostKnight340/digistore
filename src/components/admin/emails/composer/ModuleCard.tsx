"use client";

import ModuleEditor from "../ModuleEditor";
import type { ClientRecipient, EmailModule } from "../types";
import { CATEGORY_TINT, MODULE_CATEGORY, MODULE_LABELS, ModuleIcon, moduleSummary } from "./meta";

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface2 disabled:opacity-30 ${
        danger ? "hover:text-red-400" : "hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A collapsible content-module block card: icon + type label + live summary and
 * reorder / duplicate / delete controls when collapsed; the full editor when
 * expanded. The drag handle is cosmetic — reordering uses the up/down buttons
 * (accessible path; wire real DnD on top later).
 */
export default function ModuleCard({
  module,
  index,
  count,
  open,
  recipients,
  canGrantCredit,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  module: EmailModule;
  index: number;
  count: number;
  open: boolean;
  recipients: ClientRecipient[];
  canGrantCredit: boolean;
  onToggle: () => void;
  onChange: (m: EmailModule) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const tint = CATEGORY_TINT[MODULE_CATEGORY[module.type]];
  return (
    <div className="rounded-xl border border-border bg-surface2/40">
      <div className="flex items-center gap-2 p-2.5">
        <span className="cursor-grab text-faint" aria-hidden="true" title="Glisser pour réorganiser">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
            <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
            <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
          </svg>
        </span>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tint}`}>
            <ModuleIcon type={module.type} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{MODULE_LABELS[module.type]}</span>
            <span className="block truncate text-xs text-faint">{moduleSummary(module)}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn label="Monter" onClick={() => onMove(-1)} disabled={index === 0}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
          </IconBtn>
          <IconBtn label="Descendre" onClick={() => onMove(1)} disabled={index === count - 1}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </IconBtn>
          <IconBtn label="Dupliquer" onClick={onDuplicate}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
          </IconBtn>
          <IconBtn label="Supprimer" onClick={onDelete} danger>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
          </IconBtn>
          <button type="button" onClick={onToggle} aria-label={open ? "Réduire" : "Développer"} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border p-3">
          <ModuleEditor module={module} recipients={recipients} canGrantCredit={canGrantCredit} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
