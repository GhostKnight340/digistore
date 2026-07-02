"use client";

import { useState } from "react";
import { changePasswordAction, resendVerificationAction } from "@/app/actions/auth";
import PasswordField from "@/components/ui/PasswordField";
import { LockIcon, MailIcon } from "@/components/account/icons";

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
    <>
      {/* Password */}
      <section className="acct-panel p-6 sm:p-[26px]">
        <div className="mb-1 flex items-center gap-3">
          <span className="acct-badge">
            <LockIcon size={16} />
          </span>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">Mot de passe</h2>
        </div>
        <p className="mb-5 pl-[43px] text-[13.5px] text-[#8891a3]">
          Choisissez un mot de passe fort et unique.
        </p>

        <form onSubmit={changePassword}>
          <div className="grid max-w-[560px] grid-cols-1 gap-4 sm:grid-cols-2">
            <PasswordField
              name="currentPassword"
              label="Mot de passe actuel"
              placeholder="••••••••"
              autoComplete="current-password"
              inputClassName="acct-input"
              className="sm:col-span-2"
            />
            <PasswordField
              name="password"
              label="Nouveau mot de passe"
              placeholder="Min. 8 caractères"
              autoComplete="new-password"
              inputClassName="acct-input"
            />
            <PasswordField
              name="confirmPassword"
              label="Confirmer"
              placeholder="Retapez le mot de passe"
              autoComplete="new-password"
              inputClassName="acct-input"
            />
          </div>
          <p className="mt-3 max-w-[560px] text-xs text-muted">
            Au moins 8 caractères, avec une lettre et un chiffre.
          </p>
          {error ? (
            <p className="mt-3 max-w-[560px] rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          ) : null}
          {message ? (
            <p className="mt-3 max-w-[560px] rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
              {message}
            </p>
          ) : null}
          <button type="submit" className="btn-primary mt-5 h-11 px-5 text-sm disabled:opacity-75" disabled={loading}>
            {loading ? "Modification…" : "Mettre à jour le mot de passe"}
          </button>
        </form>
      </section>

      {/* Email verification */}
      <section className="acct-panel p-6 sm:p-[26px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="acct-badge">
              <MailIcon size={16} />
            </span>
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">Adresse e-mail</h2>
              <p className="mt-0.5 text-[13.5px] text-[#8891a3]">
                {emailVerified
                  ? "Votre adresse e-mail est vérifiée."
                  : "Vérifiez votre adresse pour sécuriser votre compte."}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              emailVerified
                ? "border-[#2fbf71]/30 bg-[#2fbf71]/[0.12] text-[#43cf86]"
                : "border-amber-500/30 bg-amber-500/[0.12] text-amber-300"
            }`}
          >
            {emailVerified ? "Vérifié" : "Non vérifié"}
          </span>
        </div>

        {!emailVerified ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[13px] border border-white/[0.06] bg-[#0c0d11] p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Renvoyer le lien de vérification</h3>
              <p className="mt-1 text-xs text-muted">Besoin d&apos;un nouveau lien ? Envoyez-le depuis ce compte.</p>
            </div>
            <button
              type="button"
              onClick={resend}
              disabled={resendLoading || resendCooldown}
              className="btn-ghost h-10 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resendLoading ? "Envoi…" : resendCooldown ? "Envoyé" : "Renvoyer"}
            </button>
          </div>
        ) : null}

        {!emailVerified && resendError ? (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{resendError}</p>
        ) : null}
        {!emailVerified && resendMessage ? (
          <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{resendMessage}</p>
        ) : null}
      </section>
    </>
  );
}
