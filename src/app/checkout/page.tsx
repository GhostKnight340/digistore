"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/StoreContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { getStorefrontProductsByIdsAction } from "@/app/actions/storefront";
import { formatMAD } from "@/lib/format";
import { createOrderAction } from "@/app/actions/orders";
import type { PaymentMethod, Product } from "@/lib/types";

const methods: {
  id: PaymentMethod;
  label: string;
  hint: string;
  badge?: string;
}[] = [
  {
    id: "test",
    label: "Paiement test",
    hint: "Valide la commande instantanément",
    badge: "Recommandé",
  },
  { id: "bank", label: "Virement bancaire", hint: "Bientôt disponible" },
  { id: "crypto", label: "Crypto", hint: "Bientôt disponible" },
  { id: "paypal", label: "PayPal", hint: "Bientôt disponible" },
];

export default function CheckoutPage() {
  const { cart, ready, rememberOrder } = useStore();
  const { settings } = useStoreSettings();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("test");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const enabledMethods = methods.filter((item) => settings.paymentMethods[item.id]);

  useEffect(() => {
    if (!ready || cart.length === 0) return;
    const slugs = cart.map((i) => i.productId);
    getStorefrontProductsByIdsAction(slugs).then(setProducts);
  }, [cart, ready]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const cartTotal = cart.reduce((sum, i) => {
    const p = productMap.get(i.productId);
    return sum + (p ? p.price * i.quantity : 0);
  }, 0);

  useEffect(() => {
    if (!settings.paymentMethods[method] && enabledMethods[0]) {
      setMethod(enabledMethods[0].id);
    }
  }, [enabledMethods, method, settings.paymentMethods]);

  if (ready && cart.length === 0) {
    return (
      <div className="container-page py-10">
        <div className="card grid place-items-center px-6 py-20 text-center">
          <p className="text-lg font-semibold text-white">
            Il n'y a rien à payer pour le moment
          </p>
          <Link href="/products" className="btn-primary mt-6">
            Parcourir le catalogue
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !fullName.trim()) {
      setError("Veuillez entrer votre nom et votre email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Veuillez entrer une adresse email valide.");
      return;
    }

    setSubmitting(true);
    try {
      // Order + prices are created in the database (server action).
      const order = await createOrderAction({
        customerName: fullName.trim(),
        customerEmail: email.trim(),
        paymentMethod: method,
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
      });

      if (!order) {
        setSubmitting(false);
        setError("Une erreur est survenue. Veuillez réessayer.");
        return;
      }

      rememberOrder(order.id);
      router.push(`/order/${order.id}`);
    } catch {
      setSubmitting(false);
      setError("Une erreur est survenue. Veuillez réessayer.");
    }
  }

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold text-white">Paiement</h1>
      <p className="mt-1 text-sm text-muted">
        Prototype phase 1: il s'agit d'une commande test. Aucun paiement réel
        n'est effectué.
      </p>

      {/* Progress indicator */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-full border border-accent bg-accent-soft">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.6}
              className="h-3 w-3 text-accent-strong"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className="text-sm text-muted">Panier</span>
        </div>
        <span className="h-px w-9 bg-border-strong" />
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent font-mono text-xs font-semibold text-white shadow-[0_0_0_4px_rgba(62,123,250,0.16)]">
            2
          </span>
          <span className="text-sm font-semibold text-text">Paiement</span>
        </div>
        <span className="h-px w-9 bg-border-strong" />
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-full border border-border-strong font-mono text-xs text-faint">
            3
          </span>
          <span className="text-sm text-faint">Livraison</span>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]"
      >
        <div className="space-y-8">
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white">Vos informations</h2>
            <p className="mt-1 text-sm text-muted">
              Nous vous tiendrons informé du statut de votre commande à cette
              adresse email.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">
                  Nom complet
                </label>
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Youssef El Amrani"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">
                  Email
                </label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@example.com"
                  autoComplete="email"
                />
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-bold text-white">
              Méthode de paiement
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {enabledMethods.map((m) => {
                const active = method === m.id;
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                      active
                        ? "border-accent bg-accent/10"
                        : "border-border bg-surface hover:border-accent/50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                        active ? "border-accent bg-accent" : "border-border"
                      }`}
                    >
                      {active && (
                        <span className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </span>
                    <span>
                      <span className="flex items-center gap-2 font-semibold text-white">
                        {m.label}
                        {m.badge && (
                          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
                            {m.badge}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted">{m.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="h-fit lg:sticky lg:top-24">
          <div className="card p-6">
            <h2 className="text-lg font-bold text-white">
              Récapitulatif de commande
            </h2>
            <ul className="mt-4 space-y-3">
              {cart.map((item) => {
                const product = productMap.get(item.productId);
                if (!product) return null;
                return (
                  <li
                    key={item.productId}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-muted">
                      {product.name}{" "}
                      <span className="text-muted/70">×{item.quantity}</span>
                    </span>
                    <span className="text-white">
                      {formatMAD(product.price * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="my-4 border-t border-border" />
            <div className="flex justify-between text-base font-bold text-white">
              <span>Total</span>
              <span>{formatMAD(cartTotal)}</span>
            </div>

            {error && (
              <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary mt-6 w-full"
            >
              {submitting
                ? "Commande en cours..."
                : "Passer une commande test"}
            </button>
            <p className="mt-3 text-center text-xs text-muted">
              Paiement test · Vérification manuelle avant livraison
            </p>
          </div>
        </aside>
      </form>

      {/* What happens next (post-payment preview) */}
      <div className="mt-12 rounded-2xl border border-border bg-gradient-to-b from-surface to-surface2/40 px-6 py-7">
        <p className="mb-5 text-center text-xs uppercase tracking-wide text-faint">
          Ce qui se passe ensuite
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <span className="flex items-center gap-2.5 rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              className="h-4 w-4 text-accent-strong"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Commande reçue
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-4 w-4 text-faint"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="flex items-center gap-2.5 rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4 text-accent-strong"
              aria-hidden
            >
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="M9 9h6M9 13h6M9 17h3" />
            </svg>
            Vérification du paiement
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-4 w-4 text-faint"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="flex items-center gap-2.5 rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-muted">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4"
              aria-hidden
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            Code disponible après confirmation
          </span>
        </div>
      </div>
    </div>
  );
}
