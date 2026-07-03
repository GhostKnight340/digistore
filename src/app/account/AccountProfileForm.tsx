"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCustomerProfileAction } from "@/app/actions/auth";

type Props = {
  name: string;
  email: string;
  phone: string | null;
};

function isValidOptionalPhone(value: string) {
  if (!value.trim()) return true;
  if (!/^\+?[0-9][0-9\s().-]*$/.test(value.trim())) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

export default function AccountProfileForm({ name, email, phone }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState({ name, phone: phone ?? "" });
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);
  const [draftPhone, setDraftPhone] = useState(profile.phone);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function startEditing() {
    setDraftName(profile.name);
    setDraftPhone(profile.phone);
    setMessage("");
    setError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError("");
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!draftName.trim()) {
      setError("Veuillez saisir votre nom.");
      return;
    }
    if (!isValidOptionalPhone(draftPhone)) {
      setError("Veuillez saisir un numéro de téléphone valide (9 à 15 chiffres).");
      return;
    }
    startTransition(async () => {
      const result = await updateCustomerProfileAction({ name: draftName, phone: draftPhone });
      if (!result.ok) {
        setError(result.error ?? "Enregistrement impossible.");
        return;
      }
      setProfile({ name: draftName.trim().replace(/\s+/g, " "), phone: draftPhone.trim() });
      setEditing(false);
      setMessage(result.message ?? "Profil mis à jour.");
      router.refresh();
    });
  }

  return (
    <div className="card mt-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Informations du profil</h2>
          <p className="mt-1 text-sm text-muted">Vos coordonnées utilisées pour vos commandes.</p>
        </div>
        {!editing ? (
          <button type="button" onClick={startEditing} className="btn-ghost h-9 px-3 text-sm">
            Modifier le profil
          </button>
        ) : null}
      </div>

      {!editing ? (
        <dl className="mt-5 divide-y divide-border">
          <ProfileRow label="Nom" value={profile.name} />
          <ProfileRow label="E-mail" value={email} />
          <ProfileRow label="Téléphone" value={profile.phone || "Non renseigné"} muted={!profile.phone} />
        </dl>
      ) : (
        <form onSubmit={save} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">Nom</span>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="input"
              autoComplete="name"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">E-mail</span>
            <input value={email} className="input opacity-60" readOnly disabled />
            <span className="mt-1.5 block text-xs text-muted">
              L&apos;adresse e-mail ne peut pas être modifiée.
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">Numéro de téléphone</span>
            <input
              value={draftPhone}
              onChange={(event) => setDraftPhone(event.target.value)}
              className="input"
              placeholder="+212 6 00 00 00 00"
              autoComplete="tel"
              inputMode="tel"
            />
          </label>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className="btn-primary h-10 px-4 text-sm disabled:opacity-60" disabled={pending}>
              {pending ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              className="btn-ghost h-10 px-4 text-sm disabled:opacity-60"
              disabled={pending}
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {error ? <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p> : null}
      {message && !editing ? (
        <p className="mt-4 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p>
      ) : null}
    </div>
  );
}

function ProfileRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-32 shrink-0 text-xs uppercase text-muted">{label}</dt>
      <dd className={`break-words text-sm font-medium ${muted ? "text-muted" : "text-white"}`}>{value}</dd>
    </div>
  );
}
