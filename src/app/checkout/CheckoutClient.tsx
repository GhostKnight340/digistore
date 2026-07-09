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
import { announcedPaymentMethods } from "@/lib/paymentMethod";
import type { PaymentConfigDTO } from "@/lib/dto";
import { getRegion } from "@/lib/regions";

const REGION_FLAGS: Record<string, string> = {
  MA: "🇲🇦",
  FR: "🇫🇷",
  US: "🇺🇸",
  UK: "🇬🇧",
  TR: "🇹🇷",
  SA: "🇸🇦",
  UAE: "🇦🇪",
  EU: "🇪🇺",
};

function stripCountryPrefix(phone: string) {
  return phone.replace(/^\s*\+?212[\s-]?/, "").trim();
}

export default function CheckoutClient({
  initialConfig = null,
  initialCustomer = null,
}: {
  initialConfig?: PaymentConfigDTO | null;
  initialCustomer?: {
    name: string;
    email: string;
    phone?: string | null;
    emailVerified?: boolean;
  } | null;
}) {
  const { cart, ready, cartTotal, clearCart } = useStore();
  const { getProduct } = useProductCatalog();
  const router = useRouter();

  const [config, setConfig] = useState<PaymentConfigDTO | null>(initialConfig);
  const [configError, setConfigError] = useState(false);
  // Bank accounts (CIH, etc.) collapse into one "Virement bancaire" option at
  // checkout; the customer picks the specific bank later on the payment page.
  const methods = useMemo(() => announcedPaymentMethods(config?.methods ?? []), [config]);

  const isLoggedIn = Boolean(initialCustomer);
  // Only a real, email-verified account earns the "Compte vérifié" badge —
  // never merely being logged in. Ghost.ma has no phone verification.
  const accountVerified = Boolean(initialCustomer?.emailVerified);
  const [email, setEmail] = useState(initialCustomer?.email ?? "");
  const [fullName, setFullName] = useState(initialCustomer?.name ?? "");
  const [phoneLocal, setPhoneLocal] = useState(() => stripCountryPrefix(initialCustomer?.phone ?? ""));
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
      .then(setConfig)
      .catch((err: unknown) => {
        console.error("[checkout] Failed to load payment config:", err);
        setConfigError(true);
      });
  }, [initialConfig]);

  // Informational only — the customer picks the actual method on the payment
  // page.
  const paymentOptions = useMemo(
    () => methods.map((method) => ({ method, display: paymentMethodDisplay(method) })),
    [methods],
  );

  const phoneDigits = phoneLocal.replace(/\D/g, "");
  const phoneValid = phoneDigits.length >= 9;
  const needsRegion = restrictedItems.length > 0;
  const canPlace = phoneValid && (!needsRegion || regionConfirmed);
  const ctaLabel = canPlace
    ? "Passer la commande"
    : !phoneValid
      ? "Ajoutez votre téléphone"
      : "Confirmez la région";
  const ctaHelp = canPlace
    ? "Votre commande sera créée, puis vous continuerez vers la page de paiement."
    : "Complétez les informations requises pour créer la commande.";
  const ctaHelpShort = canPlace ? "Étape suivante : page de paiement" : "Champs requis à compléter";

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
    if (!phoneValid) {
      setError("Veuillez saisir un numéro de téléphone valide.");
      return;
    }
    if (needsRegion && !regionConfirmed) {
      setError("Veuillez confirmer que votre compte correspond à la région requise.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrderAction({
        customerName: fullName.trim(),
        customerEmail: email.trim(),
        customerPhone: `+212 ${phoneLocal.trim()}`,
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

  const submitBlocked =
    submitting || configError || !config || paymentOptions.length === 0 || !canPlace;

  return (
    <div className="container-page py-10 pb-32 lg:pb-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-white sm:text-[34px] sm:tracking-[-0.025em]">
            Paiement
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Vérifiez vos informations et finalisez votre commande.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Step done label="Panier" />
          <span className="h-px w-[26px] bg-white/[0.12]" />
          <Step active label="Paiement" />
          <span className="h-px w-[26px] bg-white/[0.12]" />
          <Step label="Livraison" />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-7 grid gap-[22px] lg:grid-cols-[1fr_384px] lg:items-start lg:gap-[26px]"
      >
        <div className="flex flex-col gap-[22px]">
          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
            <div className="flex items-center gap-[11px] border-b border-white/[0.06] px-[18px] py-[18px] sm:px-[22px]">
              <h2 className="text-base font-semibold text-white">Vos informations</h2>
              {accountVerified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#5BC98C]/25 bg-[#5BC98C]/10 px-2.5 py-1 text-[11.5px] font-medium text-[#5BC98C]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-[11px] w-[11px]" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Compte vérifié
                </span>
              )}
            </div>

            <div className="px-[18px] py-5 sm:px-[22px]">
              {isLoggedIn ? (
                <>
                  <div className="mb-4 flex items-center gap-3.5 rounded-xl border border-white/[0.06] bg-[#0B0C10] p-3.5 sm:gap-[14px] sm:p-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2c3445] to-[#171b26] text-base font-semibold text-[#9FB8FF]">
                      {(fullName.trim().slice(0, 1) || "C").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold text-white">{fullName}</div>
                      <div className="truncate font-mono text-[13px] text-muted">{email}</div>
                    </div>
                    <Link
                      href="/account"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.08] px-3 py-2 text-[12.5px] font-medium text-[#9FB8FF] transition hover:bg-accent/[0.14]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3" aria-hidden>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                      Modifier
                    </Link>
                  </div>
                  <p className="mb-[18px] flex items-center gap-[7px] text-[12.5px] text-faint">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[13px] w-[13px] shrink-0" aria-hidden>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                    Nom et e-mail proviennent de votre compte. Modifiez-les depuis votre profil.
                  </p>
                </>
              ) : (
                <div className="mb-[18px] grid gap-4 sm:grid-cols-2">
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
                </div>
              )}

              {/* phone */}
              <label className="block">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#EAF0FF]">Numéro de téléphone</span>
                  <span className={`text-[11.5px] ${phoneValid ? "text-[#5BC98C]" : "text-[#E8A838]"}`}>
                    {phoneValid ? "Enregistré" : "Requis"}
                  </span>
                </div>
                <div
                  className={`flex h-[46px] items-center gap-2.5 rounded-[11px] border bg-[#0B0C10] pl-3.5 pr-2 transition ${
                    phoneValid
                      ? "border-white/[0.09]"
                      : "border-[#E8A838]/50 shadow-[0_0_0_3px_rgba(232,168,56,0.1)]"
                  }`}
                >
                  <span className="flex shrink-0 items-center gap-1.5 border-r border-white/[0.09] pr-2.5 text-sm text-muted">
                    <span className="text-[15px]">🇲🇦</span>+212
                  </span>
                  <input
                    className="h-full flex-1 bg-transparent text-[14.5px] tracking-wide text-text outline-none placeholder:text-faint"
                    value={phoneLocal}
                    onChange={(e) => setPhoneLocal(e.target.value)}
                    placeholder="6 00 00 00 00"
                    autoComplete="tel-national"
                    inputMode="tel"
                  />
                  {phoneValid && (
                    <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-[#5BC98C]/15">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#5BC98C" strokeWidth={2.6} className="h-[13px] w-[13px]" aria-hidden>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11.5px] text-faint">
                  Utilisé uniquement pour le suivi de votre commande si nécessaire.
                </p>
              </label>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
            <div className="border-b border-white/[0.06] px-[18px] py-[18px] sm:px-[22px]">
              <h2 className="text-base font-semibold text-white">
                Modes de paiement disponibles
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                Vous choisirez votre méthode et recevrez les instructions complètes à
                l&apos;étape suivante.
              </p>
            </div>

            <div className="px-[18px] py-5 sm:px-[22px]">
              {configError ? (
                <p className="text-sm text-red-400">Impossible de charger les modes de paiement.</p>
              ) : !config ? (
                <p className="text-sm text-muted">Chargement...</p>
              ) : paymentOptions.length === 0 ? (
                <p className="text-sm text-muted">Aucun mode de paiement disponible pour le moment.</p>
              ) : (
                <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-[13px] border border-white/[0.08] bg-[#0B0C10]">
                  {paymentOptions.map((option) => (
                    <li
                      key={option.method.id}
                      className="flex items-center gap-[13px] px-[15px] py-[13px]"
                    >
                      <PaymentBrandMark
                        display={option.display}
                        className="h-[38px] w-[38px] shrink-0 rounded-[10px]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-white">
                          {option.display.displayName}
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                          {option.display.subtitle}
                        </span>
                      </span>
                      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[#5BC98C]/12">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#5BC98C" strokeWidth={2.6} className="h-[11px] w-[11px]" aria-hidden>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mx-[18px] mb-[18px] flex items-center gap-[11px] rounded-[11px] border border-accent/[0.16] bg-accent/[0.06] px-[15px] py-[13px] sm:mx-[22px] sm:mb-[22px]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#9FB8FF" strokeWidth={1.9} className="h-4 w-4 shrink-0" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="text-[12.5px] text-[#9FB8FF]">
                Aucun paiement n&apos;est débité maintenant — vous choisirez votre méthode et
                verrez les instructions à l&apos;étape suivante.
              </span>
            </div>
          </section>
        </div>

        <aside className="hidden h-fit lg:sticky lg:top-[88px] lg:block">
          <SummaryCard
            cart={cart}
            getProduct={getProduct}
            cartTotal={cartTotal}
            restrictedItems={restrictedItems}
            regionConfirmed={regionConfirmed}
            setRegionConfirmed={setRegionConfirmed}
            error={error}
            canPlace={canPlace}
            ctaLabel={ctaLabel}
            ctaHelp={ctaHelp}
            submitBlocked={submitBlocked}
            submitting={submitting}
          />
        </aside>

        {/* mobile: compact recap + sticky bottom action bar */}
        <div className="lg:hidden">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0F1015] p-4">
            <h2 className="text-[14.5px] font-semibold text-white">Récapitulatif</h2>
            <ul className="mt-3 space-y-2.5">
              {cart.map((item) => {
                const product = getProduct(item.productId);
                if (!product) return null;
                return (
                  <li key={item.productId} className="flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-[10px] border border-white/[0.06] bg-gradient-to-br from-[#1d2638] to-[#0d1017]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-white">{product.name}</div>
                      <div className="font-mono text-[11.5px] text-faint">Qté {item.quantity}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[13px] text-text">
                      {formatMAD(product.price * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex justify-between border-t border-white/[0.06] pt-2.5 text-[12.5px] text-muted">
              <span>Frais de livraison</span>
              <span className="text-[#5BC98C]">Gratuit</span>
            </div>
          </div>

          {needsRegion && (
            <div className="mt-3.5">
              <RegionBlock
                restrictedItems={restrictedItems}
                regionConfirmed={regionConfirmed}
                setRegionConfirmed={setRegionConfirmed}
              />
            </div>
          )}

          {error && (
            <p className="mt-3.5 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-base via-base/95 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
            <div className="rounded-2xl border border-white/[0.09] bg-[#12141B] p-3.5 shadow-[0_-8px_30px_rgba(0,0,0,0.4)]">
              <div className="mb-[11px] flex items-baseline justify-between">
                <span className="text-[12.5px] text-muted">Total à payer</span>
                <span className="font-mono text-[19px] font-semibold text-white">
                  {formatMAD(cartTotal)}
                </span>
              </div>
              <button
                type="submit"
                disabled={submitBlocked}
                className={`flex h-[50px] w-full items-center justify-center gap-2 rounded-[13px] text-[15px] font-semibold transition-all duration-150 ${
                  canPlace
                    ? "bg-gradient-to-br from-accent to-[#2B5FD9] text-white shadow-[0_10px_26px_rgba(62,123,250,0.35)]"
                    : "cursor-not-allowed border border-white/[0.08] bg-[#161821] text-[#5A606D]"
                } disabled:cursor-not-allowed`}
              >
                <span>{submitting ? "Commande en cours..." : ctaLabel}</span>
                {canPlace && !submitting && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} className="h-4 w-4" aria-hidden>
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                )}
              </button>
              <div className="mt-2 text-center text-[11px] text-faint">{ctaHelpShort}</div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function SummaryCard({
  cart,
  getProduct,
  cartTotal,
  restrictedItems,
  regionConfirmed,
  setRegionConfirmed,
  error,
  canPlace,
  ctaLabel,
  ctaHelp,
  submitBlocked,
  submitting,
}: {
  cart: ReturnType<typeof useStore>["cart"];
  getProduct: ReturnType<typeof useProductCatalog>["getProduct"];
  cartTotal: number;
  restrictedItems: { item: { productId: string; quantity: number }; product: NonNullable<ReturnType<ReturnType<typeof useProductCatalog>["getProduct"]>> }[];
  regionConfirmed: boolean;
  setRegionConfirmed: (v: boolean) => void;
  error: string;
  canPlace: boolean;
  ctaLabel: string;
  ctaHelp: string;
  submitBlocked: boolean;
  submitting: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
      <div className="border-b border-white/[0.06] px-5 py-[18px]">
        <h2 className="text-base font-semibold text-white">Récapitulatif</h2>
      </div>
      <div className="px-5 py-[18px]">
        <ul className="space-y-3 border-b border-white/[0.06] pb-4">
          {cart.map((item) => {
            const product = getProduct(item.productId);
            if (!product) return null;
            const region = getRegion(product.region);
            const flag = REGION_FLAGS[region.code];
            return (
              <li key={item.productId} className="flex items-center gap-3">
                <div className="relative grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[11px] border border-white/[0.06] bg-gradient-to-br from-[#1d2638] to-[#0d1017]">
                  {region.restricted && flag && (
                    <span className="absolute left-1 top-1 text-xs">{flag}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-white">{product.name}</div>
                  <div className="font-mono text-xs text-faint">Qté {item.quantity}</div>
                </div>
                <span className="shrink-0 font-mono text-[13.5px] text-text">
                  {formatMAD(product.price * item.quantity)}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-[11px] border-b border-white/[0.06] py-4">
          <div className="flex justify-between text-[13.5px]">
            <span className="text-muted">Sous-total</span>
            <span className="font-mono text-text">{formatMAD(cartTotal)}</span>
          </div>
          <div className="flex justify-between text-[13.5px]">
            <span className="text-muted">Frais de livraison</span>
            <span className="font-medium text-[#5BC98C]">Gratuit</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between py-4 pb-1">
          <span className="text-[15px] font-semibold text-white">Total</span>
          <span className="font-mono text-[22px] font-semibold tracking-tight text-white">
            {formatMAD(cartTotal)}
          </span>
        </div>

        {restrictedItems.length > 0 && (
          <div className="mt-[18px]">
            <RegionBlock
              restrictedItems={restrictedItems}
              regionConfirmed={regionConfirmed}
              setRegionConfirmed={setRegionConfirmed}
            />
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitBlocked}
          className={`mt-[18px] flex h-[52px] w-full items-center justify-center gap-2 rounded-[13px] text-[15px] font-semibold transition-all duration-150 ${
            canPlace
              ? "bg-gradient-to-br from-accent to-[#2B5FD9] text-white shadow-[0_10px_26px_rgba(62,123,250,0.35)]"
              : "cursor-not-allowed border border-white/[0.08] bg-[#161821] text-[#5A606D]"
          } disabled:cursor-not-allowed`}
        >
          <span>{submitting ? "Commande en cours..." : ctaLabel}</span>
          {canPlace && !submitting && (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} className="h-[17px] w-[17px]" aria-hidden>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          )}
        </button>
        <p className="mt-2.5 text-center text-xs leading-relaxed text-faint">{ctaHelp}</p>

        <div className="mt-4 flex items-center justify-center gap-3.5 border-t border-white/[0.06] pt-4">
          <span className="flex items-center gap-1.5 text-[11.5px] text-[#7A808C]">
            <svg viewBox="0 0 24 24" fill="none" stroke="#5BC98C" strokeWidth={2} className="h-[13px] w-[13px]" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Paiement sécurisé
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-[#7A808C]">
            <svg viewBox="0 0 24 24" fill="none" stroke="#5BC98C" strokeWidth={2} className="h-[13px] w-[13px]" aria-hidden>
              <path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5Z" />
            </svg>
            Vérifié manuellement
          </span>
        </div>
      </div>
    </div>
  );
}

function RegionBlock({
  restrictedItems,
  regionConfirmed,
  setRegionConfirmed,
}: {
  restrictedItems: { item: { productId: string; quantity: number }; product: NonNullable<ReturnType<ReturnType<typeof useProductCatalog>["getProduct"]>> }[];
  regionConfirmed: boolean;
  setRegionConfirmed: (v: boolean) => void;
}) {
  const ok = regionConfirmed;
  return (
    <div
      className={`rounded-[13px] border px-[15px] py-[14px] ${
        ok ? "border-[#5BC98C]/28 bg-[#5BC98C]/[0.07]" : "border-[#E8A838]/28 bg-[#E8A838]/[0.06]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg text-xs font-bold ${
            ok ? "bg-[#5BC98C]/15 text-[#5BC98C]" : "bg-[#E8A838]/15 text-[#E8A838]"
          }`}
        >
          {ok ? "✓" : "!"}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] font-semibold ${ok ? "text-[#8FE0B4]" : "text-[#F0C466]"}`}>
            {ok ? "Compatibilité confirmée" : "Compatibilité région requise"}
          </div>
          <div className="mt-0.5 space-y-1 text-[12.5px] leading-relaxed text-muted">
            {restrictedItems.map(({ item, product }) => {
              const region = getRegion(product.region);
              const flag = REGION_FLAGS[region.code];
              return (
                <p key={item.productId}>
                  {product.name} s&apos;active uniquement sur un compte{" "}
                  <span className="font-medium text-[#EAF0FF]">
                    {flag ? `${flag} ` : ""}
                    {region.name}
                  </span>
                  .
                </p>
              );
            })}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setRegionConfirmed(!ok)}
        className={`mt-[11px] flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left ${
          ok ? "bg-[#5BC98C]/10 border border-[#5BC98C]/35" : "border border-white/10 bg-[#0B0C10]"
        }`}
      >
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-[6px] transition-all duration-150 ${
            ok ? "border-[1.5px] border-[#2EA067] bg-[#2EA067]" : "border-[1.6px] border-white/25 bg-transparent"
          }`}
        >
          {ok && (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} className="h-3 w-3" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
        <span className={`text-[12.5px] leading-tight ${ok ? "text-[#EAF0FF]" : "text-[#C4C9D4]"}`}>
          Je confirme que mon compte correspond bien à la région requise.
        </span>
      </button>
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
