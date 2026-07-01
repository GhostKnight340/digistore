"use client";

import { useState } from "react";
import Link from "next/link";
import GoogleSignInButton from "./GoogleSignInButton";
import AuthDivider from "./AuthDivider";
import FormField, { MailIcon, UserIcon } from "./FormField";
import PasswordInput from "./PasswordInput";
import PasswordStrength from "./PasswordStrength";
import Checkbox from "./Checkbox";
import SubmitButton from "./SubmitButton";

const emailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const passwordValid = (v: string) => v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v);

export default function RegisterForm({
  onGoogle,
  onSubmit,
  serverError,
  serverMessage,
}: {
  onGoogle?: () => void;
  onSubmit?: (data: { name: string; email: string; password: string; newsletter: boolean }) => Promise<void> | void;
  serverError?: string;
  serverMessage?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const emailError = touched.email && email && !emailValid(email) ? "Adresse e-mail invalide" : "";
  const passwordError = touched.password && password && !passwordValid(password) ? "Min. 8 caractères, une lettre et un chiffre" : "";
  const confirmError = touched.confirm && confirm && confirm !== password ? "Les mots de passe ne correspondent pas" : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirm: true });
    if (name.trim().length < 2 || !emailValid(email) || !passwordValid(password) || confirm !== password) return;
    setLoading(true);
    try {
      await onSubmit?.({ name, email, password, newsletter }); // ← reuse existing sign-up logic
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 26, lineHeight: 1.15, letterSpacing: "-0.028em", fontWeight: 600, margin: "0 0 7px" }}>
        Créer votre compte
      </h1>
      <p style={{ fontSize: 14.5, color: "#9A9FAB", margin: "0 0 26px", lineHeight: 1.55 }}>
        Rejoignez ghost.ma et recevez vos codes en quelques secondes.
      </p>

      <GoogleSignInButton label="Continuer avec Google" onClick={onGoogle} disabled={loading} />
      <AuthDivider />

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          label="Nom complet"
          icon={UserIcon}
          placeholder="Votre nom"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          valid={name.trim().length >= 2}
        />

        <FormField
          label="Adresse e-mail"
          icon={MailIcon}
          type="email"
          placeholder="vous@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={emailError}
          valid={emailValid(email) && email.length > 0}
        />

        <PasswordInput
          label="Mot de passe"
          value={password}
          onChange={setPassword}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={passwordError}
        />
        <PasswordStrength password={password} />

        <PasswordInput
          label="Confirmer le mot de passe"
          placeholder="Retapez votre mot de passe"
          value={confirm}
          onChange={setConfirm}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={confirmError}
          valid={confirm.length > 0 && confirm === password}
        />

        <div className="mb-[22px] mt-[6px]">
          <Checkbox checked={newsletter} onChange={setNewsletter} align="start">
            <span style={{ fontSize: 13, color: "#9A9FAB", lineHeight: 1.5 }}>
              Recevoir les nouveautés et offres exclusives de ghost.ma.
            </span>
          </Checkbox>
        </div>

        {serverError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-[8px] rounded-[10px] px-[13px] py-[11px]"
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "#f0616d",
              background: "rgba(240,97,109,0.08)",
              border: "1px solid rgba(240,97,109,0.3)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f0616d" strokeWidth={2.2} className="mt-[1px] flex-shrink-0"><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16.5v.5" /></svg>
            {serverError}
          </div>
        )}

        {serverMessage && !serverError && (
          <div
            role="status"
            className="mb-4 flex items-start gap-[8px] rounded-[10px] px-[13px] py-[11px]"
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "#2fbf71",
              background: "rgba(47,191,113,0.08)",
              border: "1px solid rgba(47,191,113,0.3)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2fbf71" strokeWidth={2.4} className="mt-[1px] flex-shrink-0"><path d="M20 6L9 17l-5-5" /></svg>
            {serverMessage}
          </div>
        )}

        <SubmitButton loading={loading}>{loading ? "Création…" : "Créer mon compte"}</SubmitButton>
      </form>

      <p className="mt-4 text-center" style={{ fontSize: 11.5, color: "#646A77", lineHeight: 1.6 }}>
        En créant un compte, vous acceptez nos{" "}
        <Link href="/terms" style={{ color: "#8891a3", textDecoration: "underline" }}>conditions générales</Link> et notre{" "}
        <Link href="/privacy" style={{ color: "#8891a3", textDecoration: "underline" }}>politique de confidentialité</Link>.
      </p>
    </>
  );
}
