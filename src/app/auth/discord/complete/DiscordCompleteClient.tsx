"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  completeDiscordProfileAction,
  linkDiscordToExistingByPasswordAction,
} from "@/app/actions/discord";
import PasswordField from "@/components/ui/PasswordField";

type Tab = "create" | "link";

export default function DiscordCompleteClient({
  defaultName,
  discordUsername,
}: {
  defaultName: string;
  discordUsername: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function reset() {
    setError("");
    setMessage("");
  }

  async function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    reset();
    const form = new FormData(e.currentTarget);
    const res = await completeDiscordProfileAction({
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error || "Une erreur est survenue.");
      return;
    }
    if (res.message) setMessage(res.message);
    router.push(res.redirectTo || "/account");
    router.refresh();
  }

  async function submitLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    reset();
    const form = new FormData(e.currentTarget);
    const res = await linkDiscordToExistingByPasswordAction({
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error || "Association impossible.");
      return;
    }
    router.push(res.redirectTo || "/account");
    router.refresh();
  }

  return (
    <div className="card p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#5865F2]/15">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#5865F2" aria-hidden>
            <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">Finalisez votre compte</h1>
          {discordUsername && (
            <p className="truncate text-sm text-muted">Connecté avec Discord @{discordUsername}</p>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        Ajoutez vos informations pour continuer, ou connectez-vous à un compte Ghost.ma
        existant pour y associer Discord.
      </p>

      <div className="mt-6 grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
        {(["create", "link"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setTab(item);
              reset();
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              tab === item ? "bg-accent text-white" : "text-muted hover:text-white"
            }`}
          >
            {item === "create" ? "Nouveau compte" : "J’ai déjà un compte"}
          </button>
        ))}
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
      {message && <p className="mt-5 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p>}

      {tab === "create" ? (
        <form className="mt-5 space-y-4" onSubmit={submitCreate}>
          <Field label="Nom complet">
            <input className="input" name="name" defaultValue={defaultName} placeholder="Votre nom" autoComplete="name" />
          </Field>
          <Field label="E-mail">
            <input className="input" name="email" type="email" placeholder="vous@example.com" autoComplete="email" />
            <p className="mt-1 text-xs text-muted">Un lien de vérification vous sera envoyé.</p>
          </Field>
          <Field label="Numéro de téléphone (optionnel)">
            <input className="input" name="phone" placeholder="+212 6 00 00 00 00" autoComplete="tel" inputMode="tel" />
          </Field>
          <button className="btn-primary w-full disabled:opacity-60" type="submit" disabled={loading}>
            {loading ? "Veuillez patienter..." : "Finaliser mon compte"}
          </button>
        </form>
      ) : (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-muted">
            Connectez-vous à votre compte Ghost.ma existant pour y associer Discord.
          </p>
          <form className="space-y-4" onSubmit={submitLink}>
            <Field label="E-mail du compte">
              <input className="input" name="email" type="email" placeholder="vous@example.com" autoComplete="email" />
            </Field>
            <Field label="Mot de passe">
              <PasswordField name="password" autoComplete="current-password" />
            </Field>
            <button className="btn-primary w-full disabled:opacity-60" type="submit" disabled={loading}>
              {loading ? "Veuillez patienter..." : "Associer à ce compte"}
            </button>
          </form>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium uppercase tracking-wide text-faint">Ou</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <a
            href="/auth/google?mode=link_discord"
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border-strong bg-surface2 px-4 text-sm font-semibold text-text transition hover:border-accent/50 hover:bg-elevated"
          >
            <GoogleIcon />
            Continuer avec un compte Google
          </a>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-white">{label}</label>
      {children}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.24 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.37 12 5.37z" />
    </svg>
  );
}
