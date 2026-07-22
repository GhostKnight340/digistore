"use client";

import { useEffect, useRef } from "react";
import type { EmailModuleType } from "@/lib/email/composerModules";
import {
  CATEGORY_LABELS,
  CATEGORY_TINT,
  MODULE_CATEGORY,
  MODULE_DESCRIPTIONS,
  MODULE_LABELS,
  MODULE_LIBRARY,
  ModuleIcon,
  type ModuleCategory,
} from "./meta";

const CATEGORY_ORDER: ModuleCategory[] = ["content", "actions", "perks"];

function LibraryBody({ onPick }: { onPick: (type: EmailModuleType) => void }) {
  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((cat) => (
        <div key={cat}>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
            {CATEGORY_LABELS[cat]}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODULE_LIBRARY[cat].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onPick(type)}
                className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-2.5 text-left transition hover:border-border-strong hover:bg-surface2"
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${CATEGORY_TINT[MODULE_CATEGORY[type]]}`}>
                  <ModuleIcon type={type} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text">{MODULE_LABELS[type]}</span>
                  <span className="block text-[11px] leading-snug text-muted">{MODULE_DESCRIPTIONS[type]}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Add-module library. Desktop: anchored popover. Mobile (`sheet`): bottom sheet
 * sliding up from the bottom edge. Picking a type adds it and closes.
 */
export default function ModuleLibrary({
  open,
  sheet,
  onClose,
  onPick,
}: {
  open: boolean;
  sheet: boolean;
  onClose: () => void;
  onPick: (type: EmailModuleType) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || sheet) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, sheet, onClose]);

  if (!open) return null;

  const pick = (type: EmailModuleType) => {
    onPick(type);
    onClose();
  };

  if (sheet) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black/60" onClick={onClose}>
        <div
          className="mt-auto max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-border bg-[#0C0D11] p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">Ajouter un module</h3>
            <button type="button" onClick={onClose} className="btn-ghost text-xs">Fermer</button>
          </div>
          <LibraryBody onPick={pick} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-2 w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-[#15161b] p-4 shadow-2xl"
    >
      <LibraryBody onPick={pick} />
    </div>
  );
}
