"use client";

import { useState, useTransition } from "react";
import { updateCustomerPhoneAction } from "@/app/actions/auth";
import { PhoneIcon, UserIcon } from "@/components/account/icons";

export default function AccountProfileForm({ phone }: { phone: string | null }) {
  const [value, setValue] = useState(phone ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
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
    <form onSubmit={save} className="acct-panel p-6 sm:p-[26px]">
      <div className="mb-1 flex items-center gap-3">
        <span className="acct-badge">
          <UserIcon size={16} />
        </span>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">Informations personnelles</h2>
      </div>
      <p className="mb-5 pl-[43px] text-[13.5px] text-[#8891a3]">
        Ajoutez un numéro pour sécuriser vos commandes.
      </p>

      <div className="max-w-[420px]">
        <label htmlFor="account-phone" className="acct-label">
          Numéro de téléphone
        </label>
        <div className="flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-[#0c0d11] px-3.5 transition focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20">
          <PhoneIcon size={16} className="flex-shrink-0 text-faint" />
          <input
            id="account-phone"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (saved) setSaved(false);
            }}
            className="h-full flex-1 bg-transparent text-[14.5px] text-text outline-none placeholder:text-faint"
            placeholder="+212 6 00 00 00 00"
            autoComplete="tel"
            inputMode="tel"
          />
        </div>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
        ) : null}

        <button
          type="submit"
          className="btn-primary mt-4 h-11 gap-2 px-5 text-sm disabled:opacity-75"
          disabled={pending}
          style={pending ? { cursor: "progress" } : undefined}
        >
          {pending ? (
            <>
              <span className="h-[15px] w-[15px] animate-spin rounded-full border-2 border-white/35 border-t-white" />
              Enregistrement…
            </>
          ) : saved ? (
            "Enregistré ✓"
          ) : (
            "Enregistrer"
          )}
        </button>
      </div>
    </form>
  );
}
