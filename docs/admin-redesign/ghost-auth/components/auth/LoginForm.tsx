"use client";

import { useState } from "react";
import Link from "next/link";
import GoogleSignInButton from "./GoogleSignInButton";
import AuthDivider from "./AuthDivider";
import FormField, { MailIcon } from "./FormField";
import PasswordInput from "./PasswordInput";
import Checkbox from "./Checkbox";
import SubmitButton from "./SubmitButton";

const emailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export default function LoginForm({
  onGoogle,
  onSubmit,
}: {
  onGoogle?: () => void;
  onSubmit?: (data: { email: string; password: string; remember: boolean }) => Promise<void> | void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [loading, setLoading] = useState(false);

  const emailError = touched.email && email && !emailValid(email) ? "Adresse e-mail invalide" : "";
  const passwordError = touched.password && password && password.length < 8 ? "Au moins 8 caractères" : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!emailValid(email) || password.length < 8) return;
    setLoading(true);
    try {
      await onSubmit?.({ email, password, remember }); // ← reuse existing sign-in logic
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 26, lineHeight: 1.15, letterSpacing: "-0.028em", fontWeight: 600, margin: "0 0 7px" }}>
        Bon retour parmi vous
      </h1>
      <p style={{ fontSize: 14.5, color: "#9A9FAB", margin: "0 0 26px", lineHeight: 1.55 }}>
        Connectez-vous pour retrouver vos commandes et vos codes.
      </p>

      <GoogleSignInButton onClick={onGoogle} disabled={loading} />
      <AuthDivider />

      <form onSubmit={handleSubmit} noValidate>
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
          labelRight={
            <Link href="/forgot-password" style={{ fontSize: 12.5, color: "#5E92FF", fontWeight: 500 }}>
              Mot de passe oublié ?
            </Link>
          }
        />

        <div className="mb-[22px] mt-[6px]">
          <Checkbox checked={remember} onChange={setRemember}>
            <span style={{ fontSize: 13.5, color: "#C4C9D4" }}>Se souvenir de moi</span>
          </Checkbox>
        </div>

        <SubmitButton loading={loading}>{loading ? "Connexion…" : "Se connecter"}</SubmitButton>
      </form>

      <p className="mt-5 text-center" style={{ fontSize: 13.5, color: "#9A9FAB" }}>
        Pas encore de compte ?{" "}
        <Link href="/register" style={{ color: "#5E92FF", fontWeight: 600 }}>Créer un compte</Link>
      </p>
    </>
  );
}
