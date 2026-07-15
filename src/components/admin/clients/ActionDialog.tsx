"use client";

import { useEffect, useRef, useState } from "react";

export interface ActionField {
  key: string;
  label: string;
  type?: "text" | "number" | "email";
  placeholder?: string;
  required?: boolean;
}

/**
 * Accessible confirmation dialog for admin customer actions. Renders a modal
 * with an optional mandatory reason and optional extra fields (amount, new
 * email…). Focus is trapped to the first field, Escape cancels, and the confirm
 * button is disabled until required inputs are filled. Fits within 100dvh on
 * mobile (its own internal scroll). Every account-changing action routes through
 * this so confirmation + reason capture is uniform.
 */
export default function ActionDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  tone = "default",
  requireReason = false,
  fields = [],
  busy = false,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  requireReason?: boolean;
  fields?: ActionField[];
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (values: { reason: string; fields: Record<string, string> }) => void;
}) {
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const firstRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setValues({});
      // Focus the first interactive field after mount.
      const t = setTimeout(() => firstRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const missingReason = requireReason && !reason.trim();
  const missingField = fields.some((f) => f.required && !values[f.key]?.trim());
  const disabled = busy || missingReason || missingField;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-card sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}

        <div className="mt-4 space-y-3">
          {fields.map((f, i) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                {f.label}
                {f.required && <span className="text-red-400"> *</span>}
              </span>
              <input
                ref={i === 0 && !requireReason ? (firstRef as React.Ref<HTMLInputElement>) : undefined}
                type={f.type ?? "text"}
                className="input"
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </label>
          ))}

          {requireReason && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Motif <span className="text-red-400">*</span>
              </span>
              <textarea
                ref={firstRef as React.Ref<HTMLTextAreaElement>}
                className="input min-h-[70px]"
                placeholder="Motif de cette action (enregistré dans l'audit)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className={tone === "danger" ? "btn-primary !bg-red-500 hover:!bg-red-600" : "btn-primary"}
            disabled={disabled}
            onClick={() => onConfirm({ reason: reason.trim(), fields: values })}
          >
            {busy ? "En cours…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
