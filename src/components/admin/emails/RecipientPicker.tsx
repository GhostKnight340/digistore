"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMAD } from "@/lib/format";
import {
  searchCustomersAction,
  matchAccountsAction,
} from "@/app/actions/adminEmails";
import type { ClientRecipient } from "./types";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function RecipientPicker({
  mode,
  recipients,
  onModeChange,
  onChange,
}: {
  mode: "existing" | "manual";
  recipients: ClientRecipient[];
  onModeChange: (mode: "existing" | "manual") => void;
  onChange: (recipients: ClientRecipient[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; email: string; status: string; emailVerified: boolean; creditBalanceMad: number; orderCount: number }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedEmails = useMemo(
    () => new Set(recipients.map((r) => r.email.toLowerCase())),
    [recipients],
  );

  useEffect(() => {
    if (mode !== "existing") return;
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchCustomersAction(q);
        setResults(found);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, mode]);

  const addCustomer = useCallback(
    (c: { id: string; name: string; email: string; status: string; emailVerified: boolean; creditBalanceMad: number; orderCount: number }) => {
      if (selectedEmails.has(c.email.toLowerCase())) return;
      onChange([
        ...recipients,
        {
          customerId: c.id,
          email: c.email,
          name: c.name,
          status: c.status,
          emailVerified: c.emailVerified,
          creditBalanceMad: c.creditBalanceMad,
          orderCount: c.orderCount,
        },
      ]);
    },
    [recipients, selectedEmails, onChange],
  );

  const addManual = useCallback(async () => {
    const raw = manualInput
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const valid = raw.filter(isValidEmail);
    const fresh = valid.filter((e) => !selectedEmails.has(e.toLowerCase()));
    if (!fresh.length) {
      setManualInput("");
      return;
    }
    const additions: ClientRecipient[] = fresh.map((email) => ({
      customerId: null,
      email,
      name: "",
    }));
    onChange([...recipients, ...additions]);
    setManualInput("");
    // Flag manual addresses that match an existing account.
    try {
      const matches = await matchAccountsAction(fresh);
      if (Object.keys(matches).length) {
        onChange(
          [...recipients, ...additions].map((r) => {
            const m = matches[r.email.toLowerCase()];
            return m && !r.customerId ? { ...r, matchedAccount: m } : r;
          }),
        );
      }
    } catch {
      /* non-fatal */
    }
  }, [manualInput, recipients, selectedEmails, onChange]);

  const remove = useCallback(
    (email: string) => onChange(recipients.filter((r) => r.email !== email)),
    [recipients, onChange],
  );

  const invalidManual = manualInput
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((e) => !isValidEmail(e));

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Destinataires</h2>
        <span className="chip">{recipients.length}</span>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => onModeChange("existing")}
          className={`btn flex-1 text-sm ${mode === "existing" ? "btn-primary" : "btn-ghost"}`}
        >
          Client existant
        </button>
        <button
          type="button"
          onClick={() => onModeChange("manual")}
          className={`btn flex-1 text-sm ${mode === "manual" ? "btn-primary" : "btn-ghost"}`}
        >
          Adresse e-mail manuelle
        </button>
      </div>

      {mode === "existing" ? (
        <div>
          <input
            className="input h-11"
            placeholder="Rechercher : nom, e-mail, ID client, n° de commande…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && <p className="mt-2 text-xs text-muted">Recherche…</p>}
          {results.length > 0 && (
            <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border">
              {results.map((c) => {
                const already = selectedEmails.has(c.email.toLowerCase());
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => addCustomer(c)}
                      className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface2 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text">{c.name}</span>
                        <span className="block truncate text-xs text-muted">{c.email}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-faint">
                          <span>{c.status}</span>
                          <span>· {c.orderCount} cmd</span>
                          <span>· {formatMAD(c.creditBalanceMad)} crédit</span>
                          {!c.emailVerified && <span>· non vérifié</span>}
                        </span>
                      </span>
                      <span className="chip shrink-0">{already ? "Ajouté" : "Ajouter"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <textarea
            className="input min-h-[72px]"
            placeholder="Une ou plusieurs adresses, séparées par des virgules ou des retours à la ligne"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
          />
          {invalidManual.length > 0 && (
            <p className="mt-1 text-xs text-red-500">Adresses invalides : {invalidManual.join(", ")}</p>
          )}
          <button type="button" onClick={addManual} className="btn-ghost mt-2 text-sm">
            Ajouter
          </button>
          <p className="mt-2 text-xs text-muted">
            Aucun compte client n&apos;est créé pour une adresse manuelle. Une adresse liée à un compte
            existant est signalée ci-dessous.
          </p>
        </div>
      )}

      {recipients.length > 0 && (
        <ul className="mt-4 space-y-2">
          {recipients.map((r) => (
            <li
              key={r.email}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-text">{r.name || r.email}</span>
                {r.name && <span className="block truncate text-xs text-muted">{r.email}</span>}
                <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-faint">
                  {r.customerId ? (
                    <span className="text-emerald-500">Compte client</span>
                  ) : r.matchedAccount ? (
                    <span className="text-amber-500">Compte existant détecté</span>
                  ) : (
                    <span>Adresse manuelle</span>
                  )}
                  {typeof r.creditBalanceMad === "number" && r.customerId && (
                    <span>· {formatMAD(r.creditBalanceMad)} crédit</span>
                  )}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(r.email)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface2 hover:text-text"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
