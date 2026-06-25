"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { lookupOrderAction } from "@/app/actions/orders";

export default function OrderLookupPage() {
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedId = orderId.trim();
    const trimmedEmail = email.trim();

    if (!trimmedId || !trimmedEmail) {
      setError("Veuillez remplir les deux champs.");
      return;
    }

    setLoading(true);
    const result = await lookupOrderAction(trimmedId, trimmedEmail);
    setLoading(false);

    if (!result) {
      setError("Aucune commande trouvée. Vérifiez votre numéro de commande et votre adresse email.");
      return;
    }

    router.push(`/delivery/${result.id}`);
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-accent/30 bg-accent/10 text-2xl">
            🔍
          </span>
          <h1 className="mt-4 text-2xl font-bold text-white">
            Retrouver ma commande
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Entrez votre numéro de commande et votre adresse email pour accéder
            à votre livraison.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card mt-8 space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Numéro de commande
            </label>
            <input
              className="input font-mono text-sm"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="cmq..."
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-muted">
              Visible sur votre page de confirmation après l'achat.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Adresse email
            </label>
            <input
              className="input text-sm"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@example.com"
              autoComplete="email"
            />
            <p className="mt-1 text-xs text-muted">
              L'email utilisé lors de votre commande.
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? "Recherche en cours..." : "Accéder à ma commande"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Besoin d'aide ?{" "}
          <Link href="/support" className="text-accent hover:text-accent-hover">
            Contacter le support
          </Link>
        </p>
      </div>
    </div>
  );
}
