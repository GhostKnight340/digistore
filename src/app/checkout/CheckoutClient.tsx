"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/StoreContext";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import { formatDH } from "@/lib/format";
import { createOrderAction } from "@/app/actions/orders";
import { AccountAccessSection, AccountVerifyPanel, type AccountGateState } from "./AccountAccessSection";
import { getPaymentConfigAction } from "@/app/actions/payments";
import { validatePromoCodeAction } from "@/app/actions/promo";
import { paymentMethodDisplay } from "@/lib/paymentDisplay";
import { announcedPaymentMethods } from "@/lib/paymentMethod";
import type { PaymentConfigDTO, PromoPreviewDTO } from "@/lib/dto";
import { getRegion } from "@/lib/regions";
import { trackEvent, trackEcommerce, toAnalyticsItem } from "@/lib/analytics";

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
    ghostCreditBalanceMad?: number;
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
  // Name/email are read-only here: for a logged-in customer they come from the
  // account; a new customer manages them inside AccountAccessSection.
  const [email] = useState(initialCustomer?.email ?? "");
  const [fullName] = useState(initialCustomer?.name ?? "");
  const [phoneLocal, setPhoneLocal] = useState(() => stripCountryPrefix(initialCustomer?.phone ?? ""));
  const [editingPhone, setEditingPhone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [regionConfirmed, setRegionConfirmed] = useState(false);
  // Inline account state reported by AccountAccessSection (not-logged-in flow).
  const [accountGate, setAccountGate] = useState<AccountGateState | null>(null);

  // ── Promo code state ───────────────────────────────────────────────────────
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<PromoPreviewDTO | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoRequiresLogin, setPromoRequiresLogin] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);

  const promoDiscountMad = promo?.rewardKind === "discount" ? promo.discountMad : 0;
  const promoCreditMad = promo?.rewardKind === "credit" ? promo.creditMad : 0;

  // ── Ghost Credit spend state ───────────────────────────────────────────────
  const creditBalance = initialCustomer?.ghostCreditBalanceMad ?? 0;
  const [useCredit, setUseCredit] = useState(false);
  const [creditAmountInput, setCreditAmountInput] = useState("");
  // Credit is capped at the balance and at what's left to pay after any discount.
  const maxCreditApplicable = Math.max(0, Math.min(creditBalance, cartTotal - promoDiscountMad));
  const requestedCredit = creditAmountInput.trim() === "" ? maxCreditApplicable : Math.floor(Number(creditAmountInput) || 0);
  const creditAppliedMad = useCredit ? Math.max(0, Math.min(requestedCredit, maxCreditApplicable)) : 0;

  const totalToPay = Math.max(0, cartTotal - promoDiscountMad - creditAppliedMad);

  /** GA4 `items` for this cart. Product data only — never the customer. */
  const analyticsItems = useMemo(
    () =>
      cart.flatMap((item) => {
        const product = getProduct(item.productId);
        return product ? [toAnalyticsItem(product, { quantity: item.quantity })] : [];
      }),
    [cart, getProduct],
  );

  // GA4 `begin_checkout`, once per visit to this page.
  const beginCheckoutSent = useRef(false);
  useEffect(() => {
    if (!ready || beginCheckoutSent.current || cart.length === 0) return;
    beginCheckoutSent.current = true;
    trackEcommerce("begin_checkout", { value: cartTotal, items: analyticsItems });
  }, [ready, cart.length, cartTotal, analyticsItems]);

  async function handleApplyPromo() {
    const code = promoInput.trim();
    if (!code || promoLoading) return;
    setPromoLoading(true);
    setPromoError("");
    setPromoRequiresLogin(false);
    trackEvent("promo_code_attempted", {});
    try {
      const result = await validatePromoCodeAction({
        code,
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        email: email.trim() || undefined,
      });
      if (result.ok && result.preview) {
        setPromo(result.preview);
        setPromoError("");
        trackEvent("promo_code_accepted", { reward_type: result.preview.rewardType });
      } else {
        setPromo(null);
        setPromoError(result.error ?? "Code promo invalide.");
        setPromoRequiresLogin(Boolean(result.requiresLogin));
        trackEvent("promo_code_rejected", { reason: result.requiresLogin ? "requires_login" : "invalid" });
      }
    } catch {
      setPromo(null);
      setPromoError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setPromoLoading(false);
    }
  }

  function handleRemovePromo() {
    setPromo(null);
    setPromoInput("");
    setPromoError("");
    setPromoRequiresLogin(false);
    trackEvent("promo_code_removed", {});
  }

  // A stale preview (cart changed after applying) must never drive the total —
  // drop it so the customer re-applies. createOrder re-validates authoritatively
  // regardless.
  const cartSignature = cart.map((i) => `${i.productId}:${i.quantity}`).join("|");
  useEffect(() => {
    setPromo(null);
    setPromoError("");
    setPromoRequiresLogin(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature]);

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

  // Account gating. An authenticated customer must be email-verified. A new
  // customer must ACTUALLY create their account first ("Créer mon compte", which
  // creates the account, logs them in, and refreshes into the authenticated
  // view) — merely filling and verifying the register form is not enough. So
  // while not logged in the order can never be placed; the CTA stays disabled
  // until a real account exists.
  const accountReady = isLoggedIn ? accountVerified : false;
  const accountIncomplete: string | null = isLoggedIn
    ? accountVerified
      ? null
      : "Vérifiez votre adresse e-mail pour continuer vers le paiement."
    : accountGate?.incompleteReason ??
      "Créez votre compte pour continuer vers le paiement.";

  const canPlace = accountReady && phoneValid && (!needsRegion || regionConfirmed);
  // Ordered so the CTA surfaces the first blocking step: account → phone → region.
  const blockingReason: string | null = accountIncomplete
    ? accountIncomplete
    : !phoneValid
      ? "Ajoutez votre numéro de téléphone."
      : needsRegion && !regionConfirmed
        ? "Confirmez la région requise."
        : null;
  const ctaLabel = canPlace
    ? "Passer au paiement"
    : accountIncomplete
      ? "Compte requis"
      : !phoneValid
        ? "Ajoutez votre téléphone"
        : "Confirmez la région";
  const ctaHelp = canPlace
    ? "Votre commande sera créée, puis vous continuerez vers la page de paiement."
    : blockingReason ?? "Complétez les informations requises pour continuer.";
  const ctaHelpShort = canPlace ? "Étape suivante : page de paiement" : "Informations requises à compléter";

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

    // A new customer must create their account first ("Créer mon compte"), which
    // logs them in and refreshes into the authenticated checkout. The order is
    // never placed from the not-logged-in state — the CTA stays disabled until a
    // real account exists, and this guard also covers a keyboard Enter-submit.
    if (!isLoggedIn) {
      setError(
        accountGate?.incompleteReason ??
          "Créez votre compte pour continuer vers le paiement.",
      );
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

    const items = cart.map((i) => ({ productId: i.productId, quantity: i.quantity }));

    // ── Authenticated customer. Verification is enforced server-side too. ──
    if (!accountVerified) {
      setError("Vérifiez votre adresse e-mail pour continuer vers le paiement.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrderAction({
        customerName: fullName.trim(),
        customerEmail: email.trim(),
        customerPhone: `+212 ${phoneLocal.trim()}`,
        items,
        promoCode: promo ? promo.code : undefined,
        ghostCreditToApplyMad: creditAppliedMad > 0 ? creditAppliedMad : undefined,
      });

      if (!order || "error" in order) {
        setSubmitting(false);
        // Server-side validation/promo failures carry a customer-safe French
        // message (e.g. promo race, item no longer available) — show it.
        setError(order && "error" in order ? order.error : "Une erreur est survenue. Veuillez réessayer.");
        return;
      }

      // GA4 `add_payment_info`: the order exists and the customer is being sent
      // into the payment flow. The specific bank/wallet is chosen later on the
      // payment page, so `payment_type` reports what was offered here, not a
      // per-customer choice. No order number, token or contact detail is sent.
      trackEcommerce("add_payment_info", {
        value: totalToPay,
        items: analyticsItems,
        payment_type:
          paymentOptions.length === 1 ? paymentOptions[0].method.type : "multiple",
      });

      clearCart();
      // Route via the per-order secret token: it authorizes the payment page and
      // order actions. The enumerable public number is display-only.
      router.push(`/payment/${order.accessToken ?? order.publicOrderPathSegment}`);
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
          {isLoggedIn ? (
            <>
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

                  <PhoneBlock
                    isLoggedIn
                    phoneLocal={phoneLocal}
                    setPhoneLocal={setPhoneLocal}
                    phoneValid={phoneValid}
                    editingPhone={editingPhone}
                    setEditingPhone={setEditingPhone}
                  />
                </div>
              </section>

              {/* Authenticated but not yet email-verified → require verification. */}
              {!accountVerified && <AccountVerifyPanel email={email} name={fullName} />}
            </>
          ) : (
            <AccountAccessSection
              onChange={setAccountGate}
              phone={phoneValid ? `+212 ${phoneLocal.trim()}` : undefined}
              phoneField={
                <PhoneBlock
                  isLoggedIn={false}
                  plain
                  phoneLocal={phoneLocal}
                  setPhoneLocal={setPhoneLocal}
                  phoneValid={phoneValid}
                  editingPhone={editingPhone}
                  setEditingPhone={setEditingPhone}
                />
              }
            />
          )}

          <PromoSection
            promoInput={promoInput}
            setPromoInput={setPromoInput}
            promo={promo}
            promoError={promoError}
            promoRequiresLogin={promoRequiresLogin}
            promoLoading={promoLoading}
            onApply={handleApplyPromo}
            onRemove={handleRemovePromo}
          />

          {isLoggedIn && creditBalance > 0 && (
            <GhostCreditSection
              balanceMad={creditBalance}
              maxApplicableMad={maxCreditApplicable}
              useCredit={useCredit}
              setUseCredit={setUseCredit}
              creditAmountInput={creditAmountInput}
              setCreditAmountInput={setCreditAmountInput}
              creditAppliedMad={creditAppliedMad}
            />
          )}

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
            promo={promo}
            promoDiscountMad={promoDiscountMad}
            promoCreditMad={promoCreditMad}
            creditAppliedMad={creditAppliedMad}
            totalToPay={totalToPay}
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
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] border border-white/[0.06] bg-gradient-to-br from-[#1d2638] to-[#0d1017]">
                      {product.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-white">{product.name}</div>
                      <div className="font-mono text-[11.5px] text-faint">Qté {item.quantity}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[13px] text-text">
                      {formatDH(product.price * item.quantity)}
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

          <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-canvas via-canvas/95 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
            <div className="rounded-2xl border border-white/[0.09] bg-[#12141B] p-3.5 shadow-[0_-8px_30px_rgba(0,0,0,0.4)]">
              {promoDiscountMad > 0 && (
                <div className="mb-1 flex items-baseline justify-between text-[12px]">
                  <span className="text-[#8FE0B4]">{promo?.code} · réduction</span>
                  <span className="font-mono text-[#8FE0B4]">-{formatDH(promoDiscountMad)}</span>
                </div>
              )}
              {creditAppliedMad > 0 && (
                <div className="mb-1 flex items-baseline justify-between text-[12px]">
                  <span className="text-[#9FB8FF]">Crédit Ghost utilisé</span>
                  <span className="font-mono text-[#9FB8FF]">-{formatDH(creditAppliedMad)}</span>
                </div>
              )}
              <div className="mb-[11px] flex items-baseline justify-between">
                <span className="text-[12.5px] text-muted">Total à payer</span>
                <span className="font-mono text-[19px] font-semibold text-white">
                  {formatDH(totalToPay)}
                </span>
              </div>
              {promoCreditMad > 0 && (
                <div className="mb-[11px] -mt-1.5 flex items-baseline justify-between text-[11.5px]">
                  <span className="text-[#9FB8FF]">Crédit Ghost à recevoir</span>
                  <span className="font-mono text-[#9FB8FF]">+{formatDH(promoCreditMad)}</span>
                </div>
              )}
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
  promo,
  promoDiscountMad,
  promoCreditMad,
  creditAppliedMad,
  totalToPay,
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
  promo: PromoPreviewDTO | null;
  promoDiscountMad: number;
  promoCreditMad: number;
  creditAppliedMad: number;
  totalToPay: number;
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
  // Whether the cart is "mixed": only some lines were eligible for the promo.
  const mixedCart = promo != null && promo.eligibleLineCount < cart.length;
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
                <div className="relative grid h-[46px] w-[46px] shrink-0 place-items-center overflow-hidden rounded-[11px] border border-white/[0.06] bg-gradient-to-br from-[#1d2638] to-[#0d1017]">
                  {product.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  {region.restricted && flag && (
                    <span className="absolute left-1 top-1 z-10 text-xs">{flag}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-white">{product.name}</div>
                  <div className="font-mono text-xs text-faint">Qté {item.quantity}</div>
                </div>
                <span className="shrink-0 font-mono text-[13.5px] text-text">
                  {formatDH(product.price * item.quantity)}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-[11px] border-b border-white/[0.06] py-4">
          <div className="flex justify-between text-[13.5px]">
            <span className="text-muted">Sous-total</span>
            <span className="font-mono text-text">{formatDH(cartTotal)}</span>
          </div>
          {mixedCart && (
            <div className="flex justify-between text-[13.5px]">
              <span className="text-muted">
                Sous-total éligible
                <span className="ml-1 text-faint">({promo!.eligibleLineCount})</span>
              </span>
              <span className="font-mono text-text">{formatDH(promo!.eligibleSubtotalMad)}</span>
            </div>
          )}
          {promoDiscountMad > 0 && (
            <div className="flex justify-between text-[13.5px]">
              <span className="text-[#8FE0B4]">Réduction · {promo!.code}</span>
              <span className="font-mono text-[#8FE0B4]">-{formatDH(promoDiscountMad)}</span>
            </div>
          )}
          {creditAppliedMad > 0 && (
            <div className="flex justify-between text-[13.5px]">
              <span className="text-[#9FB8FF]">Crédit Ghost utilisé</span>
              <span className="font-mono text-[#9FB8FF]">-{formatDH(creditAppliedMad)}</span>
            </div>
          )}
          <div className="flex justify-between text-[13.5px]">
            <span className="text-muted">Frais de livraison</span>
            <span className="font-medium text-[#5BC98C]">Gratuit</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between py-4 pb-1">
          <span className="text-[15px] font-semibold text-white">Total à payer</span>
          <span className="font-mono text-[22px] font-semibold tracking-tight text-white">
            {formatDH(totalToPay)}
          </span>
        </div>

        {promoCreditMad > 0 && (
          <div className="mt-1 flex items-center justify-between rounded-[11px] border border-accent/[0.18] bg-accent/[0.07] px-3.5 py-2.5">
            <span className="text-[12.5px] text-[#9FB8FF]">Crédit Ghost après confirmation</span>
            <span className="font-mono text-[13.5px] font-semibold text-[#9FB8FF]">+{formatDH(promoCreditMad)}</span>
          </div>
        )}

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

function PromoSection({
  promoInput,
  setPromoInput,
  promo,
  promoError,
  promoRequiresLogin,
  promoLoading,
  onApply,
  onRemove,
}: {
  promoInput: string;
  setPromoInput: (v: string) => void;
  promo: PromoPreviewDTO | null;
  promoError: string;
  promoRequiresLogin: boolean;
  promoLoading: boolean;
  onApply: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const expanded = open || promo != null || Boolean(promoError);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-[11px] px-[18px] py-[16px] text-left sm:px-[22px]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#9FB8FF" strokeWidth={1.9} className="h-[18px] w-[18px] shrink-0" aria-hidden>
          <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
          <circle cx="7" cy="7" r="1.2" fill="#9FB8FF" />
        </svg>
        <span className="flex-1 text-[14.5px] font-semibold text-white">Vous avez un code promo ?</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`h-4 w-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-[18px] py-[18px] sm:px-[22px]">
          {promo ? (
            <PromoApplied promo={promo} onRemove={onRemove} />
          ) : (
            <>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  className="input flex-1"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onApply();
                    }
                  }}
                  placeholder="Entrez votre code promo"
                  aria-label="Code promo"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={onApply}
                  disabled={promoLoading || !promoInput.trim()}
                  className="btn-primary h-[46px] shrink-0 px-5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {promoLoading ? "Vérification…" : "Appliquer"}
                </button>
              </div>
              {promoError && (
                <p role="alert" className="mt-2.5 flex items-start gap-2 text-[12.5px] text-red-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                  <span>{promoError}</span>
                </p>
              )}
              {promoRequiresLogin && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-[11px] border border-accent/[0.18] bg-accent/[0.07] px-3.5 py-2.5">
                  <Link href="/login?next=/checkout" className="btn-primary h-9 px-4 text-[13px]">
                    Se connecter
                  </Link>
                  <Link href="/login?next=/checkout&mode=register" className="btn-ghost h-9 px-4 text-[13px]">
                    Créer un compte
                  </Link>
                  <span className="text-[11.5px] text-faint">Votre panier est conservé.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function GhostCreditSection({
  balanceMad,
  maxApplicableMad,
  useCredit,
  setUseCredit,
  creditAmountInput,
  setCreditAmountInput,
  creditAppliedMad,
}: {
  balanceMad: number;
  maxApplicableMad: number;
  useCredit: boolean;
  setUseCredit: (v: boolean) => void;
  creditAmountInput: string;
  setCreditAmountInput: (v: string) => void;
  creditAppliedMad: number;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
      <button
        type="button"
        onClick={() => setUseCredit(!useCredit)}
        aria-pressed={useCredit}
        className="flex w-full items-center gap-[13px] px-[18px] py-[16px] text-left sm:px-[22px]"
      >
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-accent/12 text-[#9FB8FF]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-[18px] w-[18px]" aria-hidden>
            <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
            <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold text-white">Utiliser mon crédit Ghost</span>
          <span className="mt-0.5 block text-[12.5px] text-muted">Solde disponible : {formatDH(balanceMad)}</span>
        </span>
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] border transition-colors ${
            useCredit ? "border-accent bg-accent text-white" : "border-white/25 bg-transparent"
          }`}
          aria-hidden
        >
          {useCredit && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3.5 w-3.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
      </button>

      {useCredit && (
        <div className="border-t border-white/[0.06] px-[18px] py-[16px] sm:px-[22px]">
          {maxApplicableMad <= 0 ? (
            <p className="text-[12.5px] text-muted">
              Aucun crédit applicable à cette commande pour le moment.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-[#EAF0FF]">
                  Montant à utiliser (DH)
                </span>
                <div className="flex items-center gap-2.5">
                  <input
                    type="number"
                    className="input flex-1 font-mono"
                    value={creditAmountInput}
                    onChange={(e) => setCreditAmountInput(e.target.value)}
                    min={0}
                    max={maxApplicableMad}
                    placeholder={String(maxApplicableMad)}
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={() => setCreditAmountInput(String(maxApplicableMad))}
                    className="btn-ghost h-[46px] shrink-0 px-4 text-[13px]"
                  >
                    Max
                  </button>
                </div>
              </label>
              <p className="mt-2 text-[11.5px] text-faint">
                Jusqu&apos;à {formatDH(maxApplicableMad)} applicable sur cette commande.
                {creditAppliedMad > 0 && (
                  <span className="text-[#9FB8FF]"> {formatDH(creditAppliedMad)} sera déduit du total.</span>
                )}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function PromoApplied({ promo, onRemove }: { promo: PromoPreviewDTO; onRemove: () => void }) {
  const isCredit = promo.rewardKind === "credit";
  return (
    <div
      className={`rounded-[13px] border px-[15px] py-[14px] ${
        isCredit ? "border-accent/28 bg-accent/[0.07]" : "border-[#5BC98C]/28 bg-[#5BC98C]/[0.07]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg text-xs font-bold ${
            isCredit ? "bg-accent/15 text-[#9FB8FF]" : "bg-[#5BC98C]/15 text-[#5BC98C]"
          }`}
        >
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13.5px] font-semibold text-white">{promo.code}</span>
            <span className="text-[12px] text-muted">appliqué</span>
          </div>
          <div className="mt-1 space-y-0.5 text-[12.5px] leading-relaxed text-muted">
            {promo.rewardKind === "discount" ? (
              <p>
                Appliqué à {promo.eligibleLineCount} produit{promo.eligibleLineCount > 1 ? "s" : ""} éligible
                {promo.eligibleLineCount > 1 ? "s" : ""} — réduction de{" "}
                <span className="font-medium text-[#8FE0B4]">{formatDH(promo.discountMad)}</span>.
              </p>
            ) : promo.rewardType === "FIXED_GHOST_CREDIT" ? (
              <p>
                Vous paierez le montant normal et recevrez{" "}
                <span className="font-medium text-[#9FB8FF]">{formatDH(promo.creditMad)}</span> de crédit Ghost
                après confirmation de la commande.
              </p>
            ) : (
              <p>
                Vous paierez le montant normal et recevrez {promo.percentValue}% du sous-total éligible (
                {formatDH(promo.eligibleSubtotalMad)}), soit{" "}
                <span className="font-medium text-[#9FB8FF]">{formatDH(promo.creditMad)}</span> de crédit Ghost
                {promo.maxCreditMad != null ? ` (plafond ${formatDH(promo.maxCreditMad)})` : ""}, après
                confirmation de la commande.
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] text-muted transition hover:border-red-500/40 hover:text-red-400"
        >
          Retirer
        </button>
      </div>
    </div>
  );
}

function PhoneBlock({
  isLoggedIn,
  phoneLocal,
  setPhoneLocal,
  phoneValid,
  editingPhone,
  setEditingPhone,
  plain = false,
}: {
  isLoggedIn: boolean;
  phoneLocal: string;
  setPhoneLocal: (v: string) => void;
  phoneValid: boolean;
  editingPhone: boolean;
  setEditingPhone: (v: boolean) => void;
  // "plain" renders it like a normal required field (no "Requis" status badge,
  // no amber highlight) — used in the register form where every field is
  // required and singling phone out would look inconsistent.
  plain?: boolean;
}) {
  // Collapsed saved row for a logged-in account that already has a number.
  if (isLoggedIn && phoneValid && !editingPhone) {
    return (
      <div className="flex items-center gap-3.5 rounded-xl border border-white/[0.06] bg-[#0B0C10] p-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#5BC98C]/12 text-[#5BC98C]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="h-[18px] w-[18px]" aria-hidden>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white">Numéro de téléphone</div>
          <div className="font-mono text-[13px] text-muted">🇲🇦 +212 {phoneLocal}</div>
        </div>
        <button
          type="button"
          onClick={() => setEditingPhone(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.08] px-3 py-2 text-[12.5px] font-medium text-[#9FB8FF] transition hover:bg-accent/[0.14]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Modifier
        </button>
      </div>
    );
  }

  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between">
        <span className={plain ? "text-sm font-medium text-white" : "text-[13px] font-semibold text-[#EAF0FF]"}>
          Numéro de téléphone
        </span>
        {!plain && (
          <span className={`text-[11.5px] ${phoneValid ? "text-[#5BC98C]" : "text-[#E8A838]"}`}>
            {phoneValid ? "Enregistré" : "Requis"}
          </span>
        )}
      </div>
      <div
        className={`flex h-[46px] items-center gap-2.5 rounded-[11px] border bg-[#0B0C10] pl-3.5 pr-2 transition ${
          phoneValid || plain
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
          placeholder="Votre numéro de téléphone"
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
  );
}
