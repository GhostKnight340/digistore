"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPasswordAction } from "@/app/actions/auth";

export default function ResetPasswordPage() {
  const token = useSearchParams().get("token") || "";
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const result = await resetPasswordAction({
      token,
      password: String(form.get("password") || ""),
      confirmPassword: String(form.get("confirmPassword") || ""),
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error || "Lien invalide.");
      return;
    }
    setMessage(result.message || "Mot de passe modifie.");
    setTimeout(() => router.push(result.redirectTo || "/login"), 700);
  }

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-md card p-8">
        <h1 className="text-2xl font-bold text-white">Nouveau mot de passe</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input className="input" name="password" type="password" placeholder="Nouveau mot de passe" autoComplete="new-password" />
          <input className="input" name="confirmPassword" type="password" placeholder="Confirmer" autoComplete="new-password" />
          <p className="text-xs text-muted">Au moins 8 caracteres, avec une lettre et un chiffre.</p>
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
          {message && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p>}
          <button className="btn-primary w-full disabled:opacity-60" disabled={loading || !token}>
            {loading ? "Modification..." : "Modifier le mot de passe"}
          </button>
        </form>
        <Link href="/login" className="mt-4 block text-center text-sm text-accent">Retour a la connexion</Link>
      </div>
    </div>
  );
}
