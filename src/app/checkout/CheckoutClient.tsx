"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/StoreContext";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import { formatMAD } from "@/lib/format";
import { createOrderAction } from "@/app/actions/orders";
import { getPaymentConfigAction } from "@/app/actions/payments";
import { trackMetaEvent, trackMetaPixelOnly } from "@/lib/meta/client";
import { META_CURRENCY, purchaseEventId } from "@/lib/meta/events";
import {
  bankDisplayKey,
  methodDisplayKey,
  resolvePaymentDisplay,
  type ResolvedPaymentDisplay,
} from "@/lib/paymentDisplay";
import type { PaymentMethod } from "@/lib/types";
import type { BankDTO, PaymentConfigDTO } from "@/lib/dto";

const METHOD_META: Record<string, { label: string; hint: string; icon: string }> = {
  bank: { label: "Virement bancaire", hint: "RIB / IBAN disponibles", icon: "BK" },
  usdt: { label: "Crypto", hint: "Paiement crypto rapide", icon: "US" },
  paypal: { label: "PayPal", hint: "PayPal ou envoi manuel", icon: "PP" },
  card: { label: "Carte bancaire", hint: "Disponible prochainement", icon: "CB" },
};

type PaymentCardOption =
  | { id: string; method: "bank"; display: ResolvedPaymentDisplay; bank: BankDTO }
  | { id: string; method: Exclude<PaymentMethod, "bank">; display: ResolvedPaymentDisplay };

function isMethodUsable(config: PaymentConfigDTO, method: PaymentMethod): boolean {
  if (!config.methods[method]?.enabled) return false;
  if (method === "bank") return config.banks.length > 0;
  if (method === "usdt") return config.wallets.length > 0;
  return true;
}

export default function CheckoutClient({
  initialConfig = null,
  initialCustomer = null,
}: {
  initialConfig?: PaymentConfigDTO | null;
  initialCustomer?: { name: string; email: string; phone?: string | null } | null;
}) {
  const { cart, ready, cartTotal, clearCart } = useStore();
  const { getProduct } = useProductCatalog();
  const { settings } = useStoreSettings();
  const router = useRouter();

  const [config, setConfig] = useState<PaymentConfigDTO | null>(initialConfig);
  const [configError, setConfigError] = useState(false);
  const enabledMethods = config
    ? (["bank", "usdt", "paypal", "card"] as PaymentMethod[]).filter((m) =>
        isMethodUsable(config, m),
      )
    : [];

  const [method, setMethod] = useState<PaymentMethod | "">(
    () => enabledMethods[0] ?? "",
  );
  const [selectedBankId, setSelectedBankId] = useState("");
  const [email, setEmail] = useState(initialCustomer?.email ?? "");
  const [fullName, setFullName] = useState(initialCustomer?.name ?? "");
  const [phone, setPhone] = useState(initialCustomer?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const initiateCheckoutTracked = useRef(false);

  useEffect(() => {
    if (initiateCheckoutTracked.current || !ready || cart.length === 0) return;
    initiateCheckoutTracked.current = true;
    trackMetaEvent("InitiateCheckout", {
      content_ids: cart.map((item) => item.productId),
      content_type: "product",
      contents: cart.map((item) => ({
        id: item.productId,
        quantity: item.quantity,
        item_price: getProduct(item.productId)?.price,
      })),
      currency: META_CURRENCY,
      value: cartTotal,
      num_items: cart.reduce((sum, item) => sum + item.quantity, 0),
    });
  }, [ready, cart, cartTotal, getProduct]);

  useEffect(() => {
    if (initialConfig) return;
    getPaymentConfigAction()
      .then((cfg) => {
        setConfig(cfg);
        const first = (["bank", "usdt", "paypal", "card"] as PaymentMethod[]).find(
          (m) => isMethodUsable(cfg, m),
        );
        if (first) setMethod(first);
        if (cfg.banks[0]) setSelectedBankId(cfg.banks[0].id);
      })
      .catch((err: unknown) => {
        console.error("[checkout] Failed to load payment config:", err);
        setConfigError(true);
      });
  }, [initialConfig]);

  useEffect(() => {
    if (!initialConfig) return;
    const first = (["bank", "usdt", "paypal", "card"] as PaymentMethod[]).find(
      (m) => isMethodUsable(initialConfig, m),
    );
    if (first) setMethod((current) => current || first);
    if (initialConfig.banks[0]) {
      setSelectedBankId((current) => current || initialConfig.banks[0].id);
    }
  }, [initialConfig]);

  const paymentOptions = useMemo<PaymentCardOption[]>(() => {
    if (!config) return [];
    const options: PaymentCardOption[] = [];
    if (config.methods.bank?.enabled) {
      options.push(
        ...config.banks.map((bank) => ({
          id: `bank:${bank.id}`,
          method: "bank" as const,
          display: resolvePaymentDisplay(settings.paymentDisplay[bankDisplayKey(bank.id)], {
            displayName: bank.name,
            subtitle: "Virement bancaire",
            initials: bank.name.slice(0, 2).toUpperCase(),
            accentColor: "#3e7bfa",
          }),
          bank,
        })),
      );
    }
    for (const optionMethod of ["usdt", "paypal", "card"] as const) {
      if (!isMethodUsable(config, optionMethod)) continue;
      const meta = METHOD_META[optionMethod];
      options.push({
        id: optionMethod,
        method: optionMethod,
        display: resolvePaymentDisplay(settings.paymentDisplay[methodDisplayKey(optionMethod)], {
          displayName: meta.label,
          subtitle: meta.hint,
          initials: meta.icon,
          accentColor:
            optionMethod === "usdt"
              ? "#22c55e"
              : optionMethod === "paypal"
                ? "#3e7bfa"
                : "#8b5cf6",
        }),
      });
    }
    return options;
  }, [config, settings.paymentDisplay]);

  if (ready && cart.length === 0) {
    return (
      <div className="container-page py-10">
        <div className="card grid place-items-center px-6 py-20 text-center">
          <p className="text-lg font-semibold text-white">
            Il n&apos;y a rien ? payer pour le moment
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
    if (!method) {
      setError("Veuillez choisir un mode de paiement.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrderAction({
        customerName: fullName.trim(),
        customerEmail: email.trim(),
        customerPhone: phone.trim(),
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

      // Browser half of the Purchase event; the server action already sent
      // the Conversions API half with the same event id for deduplication.
      trackMetaPixelOnly(
        "Purchase",
        {
          content_ids: cart.map((item) => item.productId),
          content_type: "product",
          contents: cart.map((item) => ({
            id: item.productId,
            quantity: item.quantity,
            item_price: getProduct(item.productId)?.price,
          })),
          currency: META_CURRENCY,
          value: cartTotal,
          num_items: cart.reduce((sum, item) => sum + item.quantity, 0),
          order_id: order.publicOrderNumber,
        },
        purchaseEventId(order.id),
      );

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
              Nous vous tiendrons inform? du suivi de votre commande ? cette adresse e-mail.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Nom complet">
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Youssef El Amrani"
                  autoComplete="name"
                />
              </Field>
              <Field label="E-mail">
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@example.com"
                  autoComplete="email"
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
            ) : enabledMethods.length === 0 ? (
              <p className="card p-5 text-sm text-muted">
                Aucun mode de paiement disponible pour le moment.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {paymentOptions.map((option) => {
                    const active =
                      option.method === "bank"
                        ? method === "bank" && selectedBankId === option.bank.id
                        : method === option.method;
                    return (
                      <button
                        type="button"
                        key={option.id}
                        onClick={() => {
                          setMethod(option.method);
                          if (option.method === "bank") setSelectedBankId(option.bank.id);
                        }}
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
                      {product.name} <span className="text-muted/70">?{item.quantity}</span>
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

            {error && (
              <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || configError || !config || enabledMethods.length === 0}
              className="btn-primary mt-6 w-full disabled:opacity-50"
            >
              {submitting ? "Commande en cours?" : "Passer la commande"}
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
