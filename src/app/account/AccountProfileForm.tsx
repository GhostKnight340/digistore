"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateCustomerNameAction, updateCustomerPhoneAction } from "@/app/actions/auth";

const MESSAGE_TIMEOUT_MS = 3000;

/** Mirrors the server-side normalization so the read-only view shows the exact
 *  persisted value without a page refresh. */
function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export default function AccountProfileForm({
  name,
  phone,
}: {
  name: string;
  phone: string | null;
}) {
  return (
    <div className="card mt-6 p-6">
      <h2 className="text-lg font-bold text-white">Informations personnelles</h2>

      <EditableField
        label="Nom complet"
        initial={name}
        required
        placeholder="Votre nom"
        successMessage="Nom mis à jour."
        save={(value) => updateCustomerNameAction(value)}
      />

      <EditableField
        label="Numéro de téléphone"
        initial={phone ?? ""}
        placeholder="+212 6 00 00 00 00"
        successMessage="Numéro de téléphone mis à jour."
        save={(value) => updateCustomerPhoneAction(value)}
        inputMode="tel"
        autoComplete="tel"
      />
    </div>
  );
}

function EditableField({
  label,
  initial,
  required = false,
  placeholder,
  successMessage,
  save,
  inputMode,
  autoComplete,
}: {
  label: string;
  initial: string;
  required?: boolean;
  placeholder?: string;
  successMessage: string;
  save: (value: string) => Promise<{ ok: boolean; error?: string }>;
  inputMode?: "tel" | "text";
  autoComplete?: string;
}) {
  const [savedValue, setSavedValue] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasSaved = savedValue !== "";
  // A required field with no value stays in the form (no read-only "Modifier").
  const showForm = (required ? false : !hasSaved) || editing;

  function clearMessageTimer() {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = null;
  }
  useEffect(() => clearMessageTimer, []);

  function startEdit() {
    clearMessageTimer();
    setDraft(savedValue);
    setError("");
    setMessage("");
    setEditing(true);
  }
  function cancelEdit() {
    clearMessageTimer();
    setDraft(savedValue);
    setError("");
    setMessage("");
    setEditing(false);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    clearMessageTimer();
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await save(draft);
      if (!result.ok) {
        setError(result.error ?? "Enregistrement impossible.");
        return;
      }
      const normalized = normalizeSpaces(draft);
      setSavedValue(normalized);
      setDraft(normalized);
      setEditing(false);
      setMessage(successMessage);
      messageTimer.current = setTimeout(() => setMessage(""), MESSAGE_TIMEOUT_MS);
    });
  }

  return (
    <div className="mt-5">
      <span className="mb-1.5 block text-sm font-medium text-white">{label}</span>
      {showForm ? (
        <form onSubmit={submit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="input"
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
          />
          {error ? (
            <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          ) : null}
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" className="btn-primary h-10 px-4 text-sm disabled:opacity-60" disabled={pending}>
              {pending ? "Enregistrement..." : "Enregistrer"}
            </button>
            {(hasSaved || required) && (savedValue !== "" || editing) ? (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="btn-ghost h-10 px-4 text-sm disabled:opacity-60"
              >
                Annuler
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <>
          <p className="text-base text-white">{savedValue}</p>
          {message ? (
            <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p>
          ) : null}
          <button type="button" onClick={startEdit} className="btn-ghost mt-4 h-10 px-4 text-sm">
            Modifier
          </button>
        </>
      )}
    </div>
  );
}
