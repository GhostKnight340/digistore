"use client";

import { useEffect, useRef, useState } from "react";
import { STATUS_LABEL, type ValidationResult } from "./validation";

const DOT: Record<ValidationResult["status"], string> = {
  ready: "bg-emerald-400",
  review: "bg-amber-400",
  blocked: "bg-red-400",
};
const TEXT: Record<ValidationResult["status"], string> = {
  ready: "text-emerald-300",
  review: "text-amber-300",
  blocked: "text-red-300",
};

/**
 * Sticky bottom bar: validation indicator (opens a checklist popover), recipient
 * count, credit total, last-saved timestamp, and the three primary actions.
 */
export default function ActionBar({
  validation,
  recipientCount,
  creditTotal,
  lastSaved,
  busy,
  canCompose,
  canSend,
  onSaveDraft,
  onTest,
  onReview,
}: {
  validation: ValidationResult;
  recipientCount: number;
  creditTotal: number;
  lastSaved: string | null;
  busy: boolean;
  canCompose: boolean;
  canSend: boolean;
  onSaveDraft: () => void;
  onTest: () => void;
  onReview: () => void;
}) {
  const [openList, setOpenList] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openList) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenList(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openList]);

  const count = validation.issues.length;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpenList((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs"
        >
          <span className={`h-2 w-2 rounded-full ${DOT[validation.status]}`} />
          <span className={TEXT[validation.status]}>
            {validation.status === "ready" ? STATUS_LABEL.ready : `${count} élément(s) à vérifier`}
          </span>
        </button>
        {openList && (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-xl border border-border bg-[#15161b] p-2 shadow-2xl">
            {count === 0 ? (
              <p className="px-2 py-1.5 text-xs text-emerald-300">Tout est prêt.</p>
            ) : (
              <ul className="space-y-1">
                {validation.issues.map((issue) => (
                  <li key={issue.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs">
                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${issue.blocking ? "bg-red-400" : "bg-amber-400"}`} />
                    <span className={issue.blocking ? "text-red-200" : "text-amber-200"}>{issue.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <span className="text-xs text-muted">
        <span className="font-mono text-text">{recipientCount}</span> destinataire(s)
      </span>
      {creditTotal > 0 && (
        <span className="text-xs text-amber-300">
          Crédit total : <span className="font-mono">{creditTotal} DH</span>
        </span>
      )}
      {lastSaved && <span className="hidden text-[11px] text-faint sm:inline">Enregistré à {lastSaved}</span>}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" onClick={onSaveDraft} disabled={busy || !canCompose} className="btn-ghost text-sm">
          Enregistrer le brouillon
        </button>
        <button type="button" onClick={onTest} disabled={busy || !canSend} className="btn-ghost text-sm">
          Envoyer un test
        </button>
        <button type="button" onClick={onReview} disabled={busy || !canSend} className="btn-primary text-sm">
          Vérifier et envoyer
        </button>
      </div>
    </div>
  );
}
