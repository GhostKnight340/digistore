"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { findOrderAction } from "@/app/actions/orders";

export default function FindOrderPage() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNumber.trim() || !email.trim()) {
      setError("Veuillez renseigner le numéro de commande et votre email.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const result = await findOrderAction(orderNumber.trim(), email.trim());
      if (result.found && result.redirectTo) {
        router.push(result.redirectTo);
      } else {
        setError("Aucune commande trouvée avec ce numéro et cette adresse email.");
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-md">
        <nav className="mb-8 flex items-center gap-2 text-sm text-faint">
          <Link href="/" className="text-muted transition hover:text-white">
            Accueil
          </Link>
          <span>/</span>
          <span className="text-text">Retrouver ma commande</span>
        </nav>

        <h1 className="text-3xl font-bold text-white">Retrouver ma commande</h1>
        <p className="mt-2 text-sm text-muted">
          Entrez votre numéro de commande et l&apos;adresse email utilisée lors de votre achat.
        </p>

        <form onSubmit={handleSubmit} className="card mt-8 space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Numéro de commande
            </label>
            <input
              className="input w-full font-mono text-sm"
              placeholder="#000123"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-faint">
              Votre numéro de commande est présent dans les emails envoyés par Karta.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Adresse email
            </label>
            <input
              className="input w-full"
              type="email"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-60"
          >
            {loading ? "Recherche en cours..." : "Retrouver ma commande"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          Besoin d&apos;aide ?{" "}
          <Link href="/support" className="text-accent hover:text-accent-hover">
            Contactez le support
          </Link>
        </p>
      </div>
    </div>
  );
}
