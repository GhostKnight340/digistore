"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { loginCustomerAction, registerCustomerAction } from "@/app/actions/auth";
import PasswordField from "@/components/ui/PasswordField";
import Checkbox from "@/components/ui/Checkbox";

const googleErrors: Record<string, string> = {
  access_denied: "Connexion Google annulée.",
  google_cancelled: "Connexion Google annulée.",
  google_config: "La connexion Google n’est pas configurée pour le moment.",
  google_provider: "Google n’a pas pu confirmer votre identité. Réessayez.",
  google_missing_email: "Votre compte Google ne fournit pas d’adresse e-mail.",
  google_state: "La session Google a expiré. Réessayez.",
  google_account_conflict: "Impossible de lier ce compte Google. Contactez le support.",
  discord_cancelled: "Connexion Discord annulée.",
  discord_config: "La connexion Discord n’est pas configurée pour le moment.",
  discord_provider: "Discord n’a pas pu confirmer votre identité. Réessayez.",
  discord_state: "La session Discord a expiré. Réessayez.",
  discord_login_required: "Veuillez vous connecter avant de lier Discord.",
  discord_already_linked: "Ce compte Discord est déjà lié à un autre compte Ghost.ma.",
  discord_account_conflict: "Impossible de lier ce compte Discord. Contactez le support.",
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const googleError = searchParams.get("error");
    if (googleError) setError(googleErrors[googleError] ?? "Connexion Google impossible. Réessayez.");
  }, [searchParams]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData(e.currentTarget);
      const currentMode = mode;
      const result =
        currentMode === "login"
          ? await loginCustomerAction({
              email: String(form.get("email") || ""),
              password: String(form.get("password") || ""),
              remember: form.get("remember") === "on",
            })
          : await registerCustomerAction({
              name: String(form.get("name") || ""),
              email: String(form.get("email") || ""),
              password: String(form.get("password") || ""),
              confirmPassword: String(form.get("confirmPassword") || ""),
              acceptTerms: true,
              marketingOptIn: form.get("marketing") === "on",
            });
      if (!result.ok) {
        setError(result.error || "Une erreur est survenue.");
        return;
      }
      if (result.message) setMessage(result.message);
      if (result.redirectTo && currentMode === "login") {
        router.push(result.redirectTo);
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error("[login:submit]", err);
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-md">
        <div className="card p-8">
          <div className="mb-6 grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
            {(["login", "register"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setError("");
                  setMessage("");
                }}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  mode === item ? "bg-accent text-white" : "text-muted hover:text-white"
                }`}
              >
                {item === "login" ? "Connexion" : "Inscription"}
              </button>
            ))}
          </div>

          <h1 className="text-2xl font-bold text-white">
            {mode === "login" ? "Bon retour parmi nous" : "Créer un compte"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login"
              ? "Connectez-vous pour retrouver vos commandes et vos codes."
              : "Créez un compte pour suivre vos commandes et retrouver vos codes."}
          </p>

          <GoogleAuthOption mode={mode} />

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "register" && (
              <Field label="Nom complet">
                <input className="input" name="name" placeholder="Votre nom" autoComplete="name" />
              </Field>
            )}
            <Field label="E-mail">
              <input className="input" name="email" type="email" placeholder="vous@example.com" autoComplete="email" />
            </Field>
            <Field label="Mot de passe">
              <PasswordField
                name="password"
                placeholder="Minimum 8 caractères"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {mode === "register" && (
                <p className="mt-1 text-xs text-muted">Au moins 8 caractères, avec une lettre et un chiffre.</p>
              )}
            </Field>
            {mode === "register" && (
              <>
                <Field label="Confirmer le mot de passe">
                  <PasswordField name="confirmPassword" autoComplete="new-password" />
                </Field>
                <label className="flex gap-2 text-sm text-muted">
                  <input name="marketing" type="checkbox" className="mt-1" />
                  <span>Recevoir les nouveautés et offres ghost.ma.</span>
                </label>
              </>
            )}
            {mode === "login" && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <Checkbox name="remember" label="Se souvenir de moi" />
                <Link href="/forgot-password" className="text-accent hover:text-accent-hover">
                  Mot de passe oublié ?
                </Link>
              </div>
            )}
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
            {message && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p>}
            <button className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={loading}>
              {loading ? "Veuillez patienter..." : mode === "login" ? "Se connecter" : "S’inscrire"}
            </button>
            {mode === "register" && (
              <p className="text-center text-xs leading-relaxed text-muted">
                En créant un compte, je confirme avoir 16 ans ou plus et accepter les{" "}
                <Link href="/conditions" className="text-accent hover:text-accent-hover">
                  conditions générales
                </Link>{" "}
                et l’{" "}
                <Link href="/privacy" className="text-accent hover:text-accent-hover">
                  avis de confidentialité
                </Link>
                .
              </p>
            )}
          </form>

        </div>
      </div>
    </div>
  );
}

function GoogleAuthOption({ mode }: { mode: "login" | "register" }) {
  return (
    <div className="mt-6 space-y-3">
      <Link
        href={`/auth/google?mode=${mode}`}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border-strong bg-surface2 px-4 text-sm font-semibold text-text transition hover:border-accent/50 hover:bg-elevated"
      >
        <GoogleIcon />
        Continuer avec Google
      </Link>
      <Link
        href={`/auth/discord?mode=${mode}`}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border-strong bg-surface2 px-4 text-sm font-semibold text-text transition hover:border-[#5865F2]/60 hover:bg-elevated"
      >
        <DiscordIcon />
        Continuer avec Discord
      </Link>
      <div className="flex items-center gap-3 pt-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-faint">Ou continuer avec e-mail</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#5865F2" aria-hidden>
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
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
