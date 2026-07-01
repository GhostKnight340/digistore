"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await requestPasswordResetAction(email);
    setMessage(result.message || "");
    setLoading(false);
  }

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-md card p-8">
        <h1 className="text-2xl font-bold text-white">Mot de passe oublié</h1>
        <p className="mt-1 text-sm text-muted">Recevez un lien sécurisé pour choisir un nouveau mot de passe.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@example.com" />
          {message && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p>}
          <button className="btn-primary w-full disabled:opacity-60" disabled={loading}>
            {loading ? "Envoi..." : "Envoyer le lien"}
          </button>
        </form>
        <Link href="/login" className="mt-4 block text-center text-sm text-accent">Retour à la connexion</Link>
      </div>
    </div>
  );
}
