"use client";

import { useState, useTransition } from "react";
import { updateCustomerPhoneAction } from "@/app/actions/auth";
import { PhoneIcon } from "@/components/account/AccountIcons";

export default function AccountProfileForm({ phone }: { phone: string | null }) {
  const [value, setValue] = useState(phone ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    startTransition(async () => {
      const result = await updateCustomerPhoneAction(value);
      if (!result.ok) setError(result.error ?? "Enregistrement impossible.");
      else setSaved(true);
    });
  }

  return (
    <form onSubmit={save} className="card mt-5 p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong">
          <PhoneIcon className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-white">Informations personnelles</h2>
          <p className="mt-0.5 text-[13px] text-muted">Ajoutez un numéro pour sécuriser vos commandes.</p>
        </div>
      </div>

      <label className="mt-5 block max-w-[420px]">
        <span className="mb-1.5 block text-sm font-medium text-white">Numéro de téléphone</span>
        <span className="relative block">
          <PhoneIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            className="input h-12 pl-11"
            placeholder="+212 6 00 00 00 00"
            autoComplete="tel"
            inputMode="tel"
          />
        </span>
      </label>

      {error ? <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p> : null}

      <div className="mt-5 flex items-center gap-3">
        <button className="btn-primary h-11 px-5 text-sm disabled:opacity-60" disabled={pending}>
          {pending ? "Enregistrement..." : "Enregistrer"}
        </button>
        {saved && !pending ? <span className="text-sm font-medium text-green-400">Enregistré ✓</span> : null}
      </div>
    </form>
  );
}
