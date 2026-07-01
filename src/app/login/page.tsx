"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginCustomerAction, registerCustomerAction } from "@/app/actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
              acceptTerms: form.get("acceptTerms") === "on",
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
              <div className="flex gap-2">
                <input
                  className="input"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 caractères"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button type="button" className="btn-ghost px-3" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "Masquer" : "Voir"}
                </button>
              </div>
              {mode === "register" && (
                <p className="mt-1 text-xs text-muted">Au moins 8 caractères, avec une lettre et un chiffre.</p>
              )}
            </Field>
            {mode === "register" && (
              <>
                <Field label="Confirmer le mot de passe">
                  <input className="input" name="confirmPassword" type="password" autoComplete="new-password" />
                </Field>
                <label className="flex gap-2 text-sm text-muted">
                  <input name="acceptTerms" type="checkbox" className="mt-1" />
                  <span>
                    J'accepte les <Link href="/terms" className="text-accent">conditions</Link> et la{" "}
                    <Link href="/privacy" className="text-accent">confidentialité</Link>.
                  </span>
                </label>
                <label className="flex gap-2 text-sm text-muted">
                  <input name="marketing" type="checkbox" className="mt-1" />
                  <span>Recevoir les nouveautés et offres ghost.ma.</span>
                </label>
              </>
            )}
            {mode === "login" && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <label className="flex items-center gap-2 text-muted">
                  <input name="remember" type="checkbox" />
                  Se souvenir de moi
                </label>
                <Link href="/forgot-password" className="text-accent hover:text-accent-hover">
                  Mot de passe oublié?
                </Link>
              </div>
            )}
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
            {message && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p>}
            <button className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={loading}>
              {loading ? "Veuillez patienter..." : mode === "login" ? "Se connecter" : "Créer le compte"}
            </button>
          </form>
        </div>
      </div>
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
