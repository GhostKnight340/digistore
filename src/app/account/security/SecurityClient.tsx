"use client";

import { useState } from "react";
import { changePasswordAction, resendVerificationAction } from "@/app/actions/auth";
import PasswordField from "@/components/ui/PasswordField";

export default function SecurityClient({ emailVerified }: { emailVerified: boolean }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const form = new FormData(e.currentTarget);
    const result = await changePasswordAction({
      currentPassword: String(form.get("currentPassword") || ""),
      password: String(form.get("password") || ""),
      confirmPassword: String(form.get("confirmPassword") || ""),
    });
    setLoading(false);
    if (!result.ok) setError(result.error || "Modification impossible.");
    else {
      setMessage(result.message || "Mot de passe modifié.");
      e.currentTarget.reset();
    }
  }

  async function resend() {
    if (resendLoading || resendCooldown || emailVerified) return;
    setResendLoading(true);
    setResendError("");
    setResendMessage("");
    try {
      const result = await resendVerificationAction();
      if (!result.ok) setResendError(result.error || "Envoi impossible.");
      else {
        setResendMessage(result.message || "E-mail de vérification envoyé.");
        setResendCooldown(true);
        window.setTimeout(() => setResendCooldown(false), 60000);
      }
    } catch (err) {
      console.error("[security:resend]", err);
      setResendError("Envoi impossible. Veuillez réessayer.");
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="card mt-8 p-6">
      <div className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Statut e-mail</h2>
            <p className="mt-1 text-sm text-muted">
              {emailVerified
                ? "Votre adresse e-mail est vérifiée."
                : "Votre adresse e-mail n'est pas encore vérifiée."}
            </p>
            {emailVerified ? (
              <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
                Votre adresse e-mail est vérifiée.
              </p>
            ) : null}
            {!emailVerified && resendError ? (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {resendError}
              </p>
            ) : null}
            {!emailVerified && resendMessage ? (
              <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
                {resendMessage}
              </p>
            ) : null}
          </div>
          <span className={`chip ${emailVerified ? "border-green-500/30 text-green-300" : "border-amber-500/30 text-amber-300"}`}>
            {emailVerified ? "Vérifié" : "Non vérifié"}
          </span>
        </div>

        {!emailVerified ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Vérification e-mail</h3>
              <p className="mt-1 text-xs text-muted">Besoin d'un nouveau lien ? Envoyez-le depuis ce compte.</p>
            </div>
            <button
              type="button"
              onClick={resend}
              disabled={resendLoading || resendCooldown}
              className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resendLoading ? "Envoi..." : resendCooldown ? "Envoyé" : "Renvoyer"}
            </button>
          </div>
        ) : null}
      </div>

      <form onSubmit={changePassword} className="mt-6 space-y-4">
        <PasswordField name="currentPassword" placeholder="Mot de passe actuel" autoComplete="current-password" />
        <PasswordField name="password" placeholder="Nouveau mot de passe" autoComplete="new-password" />
        <PasswordField name="confirmPassword" placeholder="Confirmer le nouveau mot de passe" autoComplete="new-password" />
        <p className="text-xs text-muted">Au moins 8 caractères, avec une lettre et un chiffre.</p>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
        {message && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p>}
        <button className="btn-primary w-full disabled:opacity-60" disabled={loading}>
          {loading ? "Modification..." : "Modifier le mot de passe"}
        </button>
      </form>
    </div>
  );
}
