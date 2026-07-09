"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/StoreContext";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import { formatMAD } from "@/lib/format";
import { createOrderAction } from "@/app/actions/orders";
import { getPaymentConfigAction } from "@/app/actions/payments";
import { paymentMethodDisplay } from "@/lib/paymentDisplay";
import { buildCheckoutMethods } from "@/lib/paymentMethod";
import type { PaymentConfigDTO } from "@/lib/dto";
import { getRegion } from "@/lib/regions";

export default function CheckoutClient({
  initialConfig = null,
  initialCustomer = null,
}: {
  initialConfig?: PaymentConfigDTO | null;
  initialCustomer?: { name: string; email: string; phone?: string | null } | null;
}) {
  const { cart, ready, cartTotal, clearCart } = useStore();
  const { getProduct } = useProductCatalog();
  const router = useRouter();

  const [config, setConfig] = useState<PaymentConfigDTO | null>(initialConfig);
  const [configError, setConfigError] = useState(false);
  // Bank accounts (CIH, etc.) collapse into one "Virement bancaire" option at
  // checkout; the customer picks the specific bank later on the payment page.
  const methods = useMemo(() => buildCheckoutMethods(config?.methods ?? []), [config]);

  const [methodId, setMethodId] = useState<string>(
    () => buildCheckoutMethods(initialConfig?.methods ?? [])[0]?.id ?? "",
  );
  const isLoggedIn = Boolean(initialCustomer);
  const [email, setEmail] = useState(initialCustomer?.email ?? "");
  const [fullName, setFullName] = useState(initialCustomer?.name ?? "");
  const [phone, setPhone] = useState(initialCustomer?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [regionConfirmed, setRegionConfirmed] = useState(false);

  const restrictedItems = cart
    .map((item) => ({ item, product: getProduct(item.productId) }))
    .filter(({ product }) => product && getRegion(product.region).restricted) as {
    item: (typeof cart)[number];
    product: NonNullable<ReturnType<typeof getProduct>>;
  }[];

  useEffect(() => {
    if (initialConfig) return;
    getPaymentConfigAction()
      .then((cfg) => {
        setConfig(cfg);
        setMethodId((current) => current || buildCheckoutMethods(cfg.methods)[0]?.id || "");
      })
      .catch((err: unknown) => {
        console.error("[checkout] Failed to load payment config:", err);
        setConfigError(true);
      });
  }, [initialConfig]);

  const paymentOptions = useMemo(
    () => methods.map((method) => ({ method, display: paymentMethodDisplay(method) })),
    [methods],
  );

  // A successful submit clears the cart and then navigates to the
  // server-rendered /payment/[id] page, which takes a moment to load. During
  // that window the cart is empty but we are redirecting, not idle — show a
  // redirect state instead of flashing the "nothing to pay" empty state.
  if (submitting && cart.length === 0) {
    return (
      <div className="container-page py-10">
        <div className="card grid place-items-center px-6 py-20 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-border-strong border-t-white" />
          <p className="mt-5 text-lg font-semibold text-white">
            Redirection vers le paiement…
          </p>
        </div>
      </div>
    );
  }

  if (ready && cart.length === 0) {
    return (
      <div className="container-page py-10">
        <div className="card grid place-items-center px-6 py-20 text-center">
          <p className="text-lg font-semibold text-white">
            Il n&apos;y a rien à payer pour le moment
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
      setError("Veuillez saisir votre nom et votre e-mail.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Veuillez saisir une adresse e-mail valide.");
      return;
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (phone.trim() && (!/^\+?[0-9][0-9\s().-]*$/.test(phone.trim()) || phoneDigits.length < 9 || phoneDigits.length > 15)) {
      setError("Veuillez saisir un numéro de téléphone valide.");
      return;
    }
    if (!methodId) {
      setError("Veuillez choisir un mode de paiement.");
      return;
    }
    if (restrictedItems.length > 0 && !regionConfirmed) {
      setError("Veuillez confirmer que votre compte correspond à la région requise.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrderAction({
        customerName: fullName.trim(),
        customerEmail: email.trim(),
        customerPhone: phone.trim(),
        paymentMethod: methodId,
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

      clearCart();
      router.push(`/payment/${order.publicOrderPathSegment}`);
    } catch {
      setSubmitting(false);
      setError("Une erreur est survenue. Veuillez réessayer.");
    }
  }

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold text-white">Paiement</h1>
      <p className="mt-1 text-sm text-muted">
        Choisissez votre mode de paiement et finalisez votre commande.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Step done label="Panier" />
        <span className="h-px w-9 bg-border-strong" />
        <Step active label="Paiement" />
        <span className="h-px w-9 bg-border-strong" />
        <Step label="Livraison" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="space-y-8">
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white">Vos informations</h2>
            <p className="mt-1 text-sm text-muted">
              {isLoggedIn
                ? "Votre nom et e-mail viennent de votre compte (modifiables depuis votre profil). Ajoutez un numéro de téléphone si besoin."
                : "Nous vous tiendrons informé du suivi de votre commande à cette adresse e-mail."}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Nom complet">
                <input
                  className="input disabled:cursor-not-allowed disabled:opacity-70"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Youssef El Amrani"
                  autoComplete="name"
                  disabled={isLoggedIn}
                  readOnly={isLoggedIn}
                />
              </Field>
              <Field label="E-mail">
                <input
                  className="input disabled:cursor-not-allowed disabled:opacity-70"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@example.com"
                  autoComplete="email"
                  disabled={isLoggedIn}
                  readOnly={isLoggedIn}
                />
              </Field>
              <Field label="Numéro de téléphone">
                <input
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+212 6 00 00 00 00"
                  autoComplete="tel"
                  inputMode="tel"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Mode de paiement</h2>
              <p className="mt-1 text-sm text-muted">
                Sélectionnez une option. Les instructions s'afficheront après la création de la commande.
              </p>
            </div>

            {configError ? (
              <p className="card p-5 text-sm text-red-400">
                Impossible de charger les modes de paiement.
              </p>
            ) : !config ? (
              <p className="card p-5 text-sm text-muted">Chargement...</p>
            ) : paymentOptions.length === 0 ? (
              <p className="card p-5 text-sm text-muted">
                Aucun mode de paiement disponible pour le moment.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {paymentOptions.map((option) => {
                    const active = methodId === option.method.id;
                    return (
                      <button
                        type="button"
                        key={option.method.id}
                        onClick={() => setMethodId(option.method.id)}
                        className={`group relative flex min-h-28 items-center gap-4 rounded-2xl border p-4 text-left transition ${
                          active
                            ? "border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(62,123,250,0.18),0_18px_40px_rgba(62,123,250,0.12)]"
                            : "border-border bg-surface/80 hover:border-accent/45 hover:bg-surface2/70"
                        }`}
                      >
                        <PaymentBrandMark
                          display={option.display}
                          active={active}
                          className="h-12 w-12 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold text-white">
                            {option.display.displayName}
                          </span>
                          <span className="mt-1 block text-sm text-muted">{option.display.subtitle}</span>
                        </span>
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${
                            active
                              ? "border-accent bg-accent text-white"
                              : "border-border text-transparent group-hover:border-accent/60"
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-muted">
                  Les instructions complètes de paiement seront affichées après la création de la commande.
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="h-fit lg:sticky lg:top-24">
          <div className="card p-6">
            <h2 className="text-lg font-bold text-white">Récapitulatif</h2>
            <ul className="mt-4 space-y-3">
              {cart.map((item) => {
                const product = getProduct(item.productId);
                if (!product) return null;
                return (
                  <li key={item.productId} className="flex justify-between gap-4 text-sm">
                    <span className="text-muted">
                      {product.name} <span className="text-muted/70">×{item.quantity}</span>
                    </span>
                    <span className="shrink-0 text-white">
                      {formatMAD(product.price * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="my-4 border-t border-border" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted">
                <span>Sous-total</span>
                <span className="text-white">{formatMAD(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Frais de livraison</span>
                <span className="text-green-400">Gratuit</span>
              </div>
            </div>
            <div className="my-4 border-t border-border" />
            <div className="flex justify-between text-base font-bold text-white">
              <span>Total</span>
              <span>{formatMAD(cartTotal)}</span>
            </div>

            {restrictedItems.length > 0 && (
              <div className="mt-4 rounded-xl border border-[#F7B14A]/25 bg-[#F7B14A]/[0.07] p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#F7B14A]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0" aria-hidden>
                    <path d="M12 9v4M12 17h.01" />
                    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  </svg>
                  {restrictedItems.length} article{restrictedItems.length > 1 ? "s" : ""} lié{restrictedItems.length > 1 ? "s" : ""} à une région
                </div>
                <div className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-[#C9B590]">
                  {restrictedItems.map(({ item, product }) => (
                    <p key={item.productId}>
                      {product.name} s'active uniquement sur un compte{" "}
                      <span className="text-white">{getRegion(product.region).name}</span>.
                    </p>
                  ))}
                </div>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12.5px] text-muted">
                  <input
                    type="checkbox"
                    checked={regionConfirmed}
                    onChange={(e) => setRegionConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-surface accent-accent"
                  />
                  Je confirme que mon compte correspond à cette région.
                </label>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={
                submitting ||
                configError ||
                !config ||
                paymentOptions.length === 0 ||
                (restrictedItems.length > 0 && !regionConfirmed)
              }
              className="btn-primary mt-6 w-full disabled:opacity-50"
            >
              {submitting ? "Commande en cours..." : "Passer la commande"}
            </button>
            <p className="mt-3 text-center text-xs text-muted">
              Les instructions complètes de paiement seront affichées après la création de la commande.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

function Step({ label, active = false, done = false }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
          active
            ? "bg-accent text-white shadow-[0_0_0_4px_rgba(62,123,250,0.16)]"
            : done
              ? "border border-accent bg-accent-soft text-accent"
              : "border border-border-strong text-faint"
        }`}
      >
        {done ? "✓" : active ? "2" : "3"}
      </span>
      <span className={active ? "text-sm font-semibold text-text" : "text-sm text-muted"}>
        {label}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-white">{label}</label>
      {children}
    </div>
  );
}
