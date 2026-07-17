"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  updateCustomerBirthdayAction,
  updateCustomerNameAction,
  updateCustomerPhoneAction,
} from "@/app/actions/auth";
import { PencilIcon } from "@/components/account/icons";

const MESSAGE_TIMEOUT_MS = 3000;

/** Mirrors the server-side normalization so the read-only view shows the exact
 *  persisted value without a page refresh. */
function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** Renders an ISO YYYY-MM-DD date as a French long date for the read-only view. */
function formatBirthday(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AccountProfileForm({
  name,
  phone,
  birthday,
}: {
  name: string;
  phone: string | null;
  /** ISO date (YYYY-MM-DD) or null. */
  birthday: string | null;
}) {
  return (
    <div className="card p-6">
      <h2 className="text-lg font-bold text-white">Informations personnelles</h2>

      <div className="mt-4 divide-y divide-border">
        <EditableField
          label="Nom complet"
          editLabel="Modifier le nom"
          initial={name}
          required
          placeholder="Votre nom"
          successMessage="Nom mis à jour."
          save={(value) => updateCustomerNameAction(value)}
        />

        <EditableField
          label="Numéro de téléphone"
          editLabel="Modifier le numéro de téléphone"
          initial={phone ?? ""}
          placeholder="+212 6 00 00 00 00"
          successMessage="Numéro de téléphone mis à jour."
          save={(value) => updateCustomerPhoneAction(value)}
          inputMode="tel"
          autoComplete="tel"
        />

        <EditableField
          label="Date de naissance"
          editLabel="Modifier la date de naissance"
          initial={birthday ?? ""}
          successMessage="Date de naissance mise à jour."
          save={(value) => updateCustomerBirthdayAction(value)}
          type="date"
          autoComplete="bday"
          formatDisplay={formatBirthday}
        />
      </div>
    </div>
  );
}

function EditableField({
  label,
  editLabel,
  initial,
  required = false,
  placeholder,
  successMessage,
  save,
  inputMode,
  autoComplete,
  type = "text",
  formatDisplay,
}: {
  label: string;
  editLabel: string;
  initial: string;
  required?: boolean;
  placeholder?: string;
  successMessage: string;
  save: (value: string) => Promise<{ ok: boolean; error?: string }>;
  inputMode?: "tel" | "text";
  autoComplete?: string;
  type?: "text" | "date";
  /** Optional read-only rendering of the saved value (e.g. ISO date → fr-FR). */
  formatDisplay?: (value: string) => string;
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
    <div className="py-4 first:pt-0 last:pb-0">
      {showForm ? (
        <form onSubmit={submit}>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-faint">
            {label}
          </label>
          <input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="input"
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            autoFocus={editing}
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
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
              <p className="mt-0.5 truncate text-base text-white">
                {savedValue ? (
                  formatDisplay ? formatDisplay(savedValue) : savedValue
                ) : (
                  <span className="text-muted">Non renseigné</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={startEdit}
              aria-label={editLabel}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface2"
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Modifier
            </button>
          </div>
          {message ? (
            <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
