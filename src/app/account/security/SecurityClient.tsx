"use client";

import { useState } from "react";
import { changePasswordAction, resendVerificationAction } from "@/app/actions/auth";

export default function SecurityClient() {
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
    if (resendLoading || resendCooldown) return;
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
      <div className="flex items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h2 className="text-lg font-bold text-white">Vérification e-mail</h2>
          <p className="mt-1 text-sm text-muted">Besoin d'un nouveau lien? Envoyez-le depuis ce compte.</p>
          {resendError && (
            <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {resendError}
            </p>
          )}
          {resendMessage && (
            <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
              {resendMessage}
            </p>
          )}
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
      <form onSubmit={changePassword} className="mt-6 space-y-4">
        <input className="input" name="currentPassword" type="password" placeholder="Mot de passe actuel" autoComplete="current-password" />
        <input className="input" name="password" type="password" placeholder="Nouveau mot de passe" autoComplete="new-password" />
        <input className="input" name="confirmPassword" type="password" placeholder="Confirmer le nouveau mot de passe" autoComplete="new-password" />
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
