"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCustomerProfileAction } from "@/app/actions/auth";

export default function AccountProfileForm({
  firstName,
  lastName,
  phone,
}: {
  firstName: string;
  lastName: string;
  phone: string | null;
}) {
  const router = useRouter();
  const [firstNameValue, setFirstNameValue] = useState(firstName ?? "");
  const [lastNameValue, setLastNameValue] = useState(lastName ?? "");
  const [value, setValue] = useState(phone ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await updateCustomerProfileAction({
        firstName: firstNameValue,
        lastName: lastNameValue,
        phone: value,
      });
      if (!result.ok) {
        setError(result.error ?? "Enregistrement impossible.");
      } else {
        setMessage(result.message ?? "Vos informations ont été mises à jour.");
        // Refresh so the top navigation/profile display reflects the new name.
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={save} className="card mt-6 p-6">
      <h2 className="text-lg font-bold text-white">Informations personnelles</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white">Prénom</span>
          <input
            value={firstNameValue}
            onChange={(event) => setFirstNameValue(event.target.value)}
            className="input"
            placeholder="Votre prénom"
            autoComplete="given-name"
            maxLength={50}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white">Nom</span>
          <input
            value={lastNameValue}
            onChange={(event) => setLastNameValue(event.target.value)}
            className="input"
            placeholder="Votre nom"
            autoComplete="family-name"
            maxLength={50}
          />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-white">Numéro de téléphone</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="input"
          placeholder="+212 6 00 00 00 00"
          autoComplete="tel"
          inputMode="tel"
        />
      </label>
      {error ? <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p> : null}
      {message ? <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p> : null}
      <button className="btn-primary mt-5 h-10 px-4 text-sm disabled:opacity-60" disabled={pending}>
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
