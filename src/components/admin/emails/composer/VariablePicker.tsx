"use client";

import { useEffect, useRef, useState } from "react";

/** The personalization tokens an admin may insert into subject/preheader/title. */
const VARIABLES: { token: string; label: string }[] = [
  { token: "{{customer.name}}", label: "Nom du client" },
  { token: "{{customer.email}}", label: "E-mail du client" },
  { token: "{{customer.creditBalance}}", label: "Solde de crédit" },
  { token: "{{order.number}}", label: "N° de commande" },
  { token: "{{order.status}}", label: "Statut de commande" },
  { token: "{{store.name}}", label: "Nom de la boutique" },
  { token: "{{support.email}}", label: "E-mail du support" },
];

/**
 * "Insérer une variable" popover — inserts a token into whichever field was last
 * focused (tracked by the parent via `disabled` when no target is set).
 */
export default function VariablePicker({
  disabled,
  onInsert,
}: {
  disabled: boolean;
  onInsert: (token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost text-xs"
        title={disabled ? "Cliquez d'abord dans un champ (Objet, Pré-en-tête, Titre)" : ""}
      >
        Insérer une variable
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-border bg-[#15161b] p-1 shadow-2xl">
          {VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => {
                onInsert(v.token);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface2"
            >
              <span className="text-xs text-text">{v.label}</span>
              <span className="font-mono text-[10px] text-faint">{v.token}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
