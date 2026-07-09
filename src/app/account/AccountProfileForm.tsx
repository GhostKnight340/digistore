"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateCustomerPhoneAction } from "@/app/actions/auth";

const SUCCESS_MESSAGE = "Numéro de téléphone mis à jour.";
const MESSAGE_TIMEOUT_MS = 3000;

/** Mirrors the server-side normalizePhone so the read-only view can show the
 *  exact value that was persisted, without a page refresh. */
function normalizePhone(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export default function AccountProfileForm({ phone }: { phone: string | null }) {
  const [savedValue, setSavedValue] = useState(phone ?? "");
  const [draft, setDraft] = useState(phone ?? "");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasSaved = savedValue !== "";
  // Read-only only makes sense once a number exists. With no saved number we
  // stay in the add-phone form (no "Modifier", no "Annuler").
  const showForm = !hasSaved || editing;

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
    setDraft(savedValue); // discard unsaved changes, restore last saved value
    setError("");
    setMessage("");
    setEditing(false);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return; // prevent duplicate submissions
    clearMessageTimer();
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await updateCustomerPhoneAction(draft);
      if (!result.ok) {
        // Remain in edit mode with the entered value preserved.
        setError(result.error ?? "Enregistrement impossible.");
        return;
      }
      const normalized = normalizePhone(draft);
      setSavedValue(normalized);
      setDraft(normalized);
      setEditing(false);
      setMessage(SUCCESS_MESSAGE);
      messageTimer.current = setTimeout(() => setMessage(""), MESSAGE_TIMEOUT_MS);
    });
  }

  return (
    <div className="card mt-6 p-6">
      <h2 className="text-lg font-bold text-white">Informations personnelles</h2>

      <div className="mt-5">
        <span className="mb-1.5 block text-sm font-medium text-white">Numéro de téléphone</span>

        {showForm ? (
          <form onSubmit={save}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="input"
              placeholder="+212 6 00 00 00 00"
              autoComplete="tel"
              inputMode="tel"
            />
            {error ? (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
            ) : null}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="submit"
                className="btn-primary h-10 px-4 text-sm disabled:opacity-60"
                disabled={pending}
              >
                {pending ? "Enregistrement..." : "Enregistrer"}
              </button>
              {hasSaved ? (
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
              <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
                {message}
              </p>
            ) : null}
            <button
              type="button"
              onClick={startEdit}
              className="btn-ghost mt-4 h-10 px-4 text-sm"
            >
              Modifier
            </button>
          </>
        )}
      </div>
    </div>
  );
}
