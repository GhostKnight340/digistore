"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDH } from "@/lib/format";
import {
  canCustomerCancel,
  isPendingPayment,
  isRefunded as isRefundedStatus,
  isTerminalStatus,
  paymentPageBadge,
  paymentPageHeadline,
  paymentPageInstruction,
} from "@/lib/orderStatus";
import {
  getPaymentPageDataAction,
  submitPaymentAction,
  changePaymentMethodAction,
  cancelOrderAction,
} from "@/app/actions/payments";
import CopyCode from "@/components/CopyCode";
import ProductArt from "@/components/ProductArt";
import PayPalButton from "@/components/PayPalButton";
import RegionBadge from "@/components/RegionBadge";
import OrderDiscordDelivery from "@/components/payment/OrderDiscordDelivery";
import DeliveredOrderDiscord from "@/components/payment/DeliveredOrderDiscord";
import OrderConfirmationMascot from "@/components/OrderConfirmationMascot";
import RefundRequestSection from "@/components/refunds/RefundRequestSection";
import OrdersUnavailableNotice from "@/components/store/OrdersUnavailableNotice";
import { urlHasSensitiveToken } from "@/lib/deliveryFields";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import { resolveOrderPaymentMethod } from "@/lib/paymentMethod";
import { getPublicOrderLabel } from "@/lib/orderNumber";
import type { PaymentPageDataDTO } from "@/app/actions/payments";
import type {
  PaymentMethodDTO,
  PaymentMethodType,
  CustomerOrderDTO,
  DeliveredCodeDTO,
} from "@/lib/dto";

const MAX_PROOF_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "application/pdf"]);
const ALLOWED_PROOF_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf"]);
const COPY_RESET_MS = 1600;

/** Customer-facing tab label per method type (design copy). */
const TYPE_LABEL: Record<PaymentMethodType, string> = {
  bank: "Virement bancaire",
  paypal: "PayPal",
  card: "Carte bancaire",
  crypto: "USDT / Crypto",
  cash: "Espèces",
  custom: "Autre",
};

/** "12 mars 2026 à 14:05" — customer-facing delivery timestamp. */
const formatDeliveredAt = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const madWhole = (n: number) => new Intl.NumberFormat("en-US").format(n);
const madExact = (n: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<PaymentPageDataDTO | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await getPaymentPageDataAction(id);
      setData(result);
    } catch (err) {
      console.error("[payment] Failed to load order", err);
      setError("Impossible de charger la commande. Veuillez réessayer.");
    } finally {
      setReady(true);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const status = data?.order.status;
  // Poll every non-terminal state. Rejected / payment_issue orders still change
  // (customer resubmits, admin confirms) — a customer parked on that screen must
  // see the update without a manual refresh. delivered/cancelled/refunded are final.
  const shouldPoll = ready && !isTerminalStatus(status ?? "");

  useEffect(() => {
    if (!shouldPoll) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [shouldPoll, refresh]);

  if (!ready) {
    return <div className="container-page py-24 text-center text-muted">Chargement…</div>;
  }

  if (!data) {
    return (
      <div className="container-page py-10">
        <div className="card grid place-items-center px-6 py-20 text-center">
          <p className="text-lg font-semibold text-white">{error || "Commande introuvable"}</p>
          <Link href="/products" className="btn-primary mt-6">
            Parcourir le catalogue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PaymentExperience
      data={data}
      refresh={refresh}
      error={error}
      setError={setError}
      selfSegment={id}
    />
  );
}

// ─── Main experience ──────────────────────────────────────────────────────────

function PaymentExperience({
  data,
  refresh,
  error,
  setError,
  selfSegment,
}: {
  data: PaymentPageDataDTO;
  refresh: () => void;
  error: string;
  setError: (e: string) => void;
  /**
   * The route reference the customer arrived with — a secret delivery token for
   * anyone who followed their order e-mail, or a public order number for a
   * legacy link. Every self-link on this page reuses it so the customer never
   * loses the capability they came in with.
   */
  selfSegment: string;
}) {
  const { order, config, orderingEnabled } = data;
  const { getProduct } = useProductCatalog();

  const publicOrderNumber = getPublicOrderLabel(order);
  const whatsapp = config.support.whatsappNumber.replace(/\s/g, "");
  // totalMad is already NET of the promo discount and any Ghost Credit spent,
  // so the summary rebuilds the gross line-item subtotal and shows each
  // deduction — otherwise the lines never add up to the displayed total.
  const total = order.totalMad;
  const itemsSubtotal = order.items.reduce(
    (sum, item) => sum + item.unitPriceMad * item.quantity,
    0,
  );

  // Customer-visible methods (already active + visible + not archived).
  const methods = config.methods;
  const currentMethod = resolveOrderPaymentMethod(order.paymentMethod, methods);
  const orderedTypes = useMemo(() => {
    const seen: PaymentMethodType[] = [];
    for (const m of methods) if (!seen.includes(m.type)) seen.push(m.type);
    return seen;
  }, [methods]);
  const activeType: PaymentMethodType | null =
    currentMethod?.type ?? orderedTypes[0] ?? null;
  const methodsOfActiveType = methods.filter((m) => m.type === activeType);
  const activeMethod = currentMethod ?? methodsOfActiveType[0] ?? null;

  // ── Local state ──
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofMessage, setProofMessage] = useState("");
  const [proofError, setProofError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalChecked, setModalChecked] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = order.status;
  // Legacy rows may still carry "pending" / "awaiting_payment": the shared
  // helper keeps this in step with canCustomerCancel, so an order that can be
  // cancelled always renders its payment module too.
  const isPending = isPendingPayment(status);
  const isSubmitted = status === "payment_submitted";
  const isConfirmed = status === "payment_confirmed";
  const isDelivered = status === "delivered";
  const isRejected = status === "rejected" || status === "payment_issue";
  const isCancelled = status === "cancelled";
  const isRefunded = isRefundedStatus(status);
  // Pre-launch: an unpaid order can't be paid while ordering is disabled. The
  // server also strips config.methods, so the payment modules render nothing —
  // we replace them with the "orders unavailable" notice.
  const purchaseBlocked = !orderingEnabled && (isPending || isRejected);

  const details = activeMethod?.details ?? {};
  const comingSoon = activeMethod?.type === "card" && Boolean(details.comingSoon);
  const automated =
    activeMethod?.type === "paypal" || (activeMethod?.type === "card" && !comingSoon);
  const proofRequired = activeMethod?.proofRequired ?? true;
  // A proof-upload method (bank/crypto/cash) rather than an automated one.
  // `purchaseBlocked` forces this off so no proof upload / sticky submit CTA is
  // offered while ordering is disabled.
  const proofFlow = !automated && !comingSoon && !chooserOpen && !purchaseBlocked;
  const proofBased = isPending && proofFlow;
  // A refused / flagged proof-based order can resubmit a new justificatif in-app.
  const canResubmitProof = isRejected && proofFlow;
  const latestProofRequest = [...order.paymentEvents]
    .reverse()
    .find((event) => event.type === "proof_request");
  const proofRequestReason =
    latestProofRequest?.note?.match(/Motif : ([\s\S]*?) Destinataire :/)?.[1]?.trim() ?? null;
  // Upload zone + sticky CTA appear for the initial upload and for a resubmit.
  const showProofUpload = proofBased || canResubmitProof;

  function copy(key: string, value: string) {
    copyToClipboard(value).catch(() => {});
    setCopied(key);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), COPY_RESET_MS);
  }

  function handleProofChange(file: File | null) {
    if (!file) {
      setProofFile(null);
      setProofError("");
      return;
    }
    const err = validateProofFile(file);
    if (err) {
      setProofFile(null);
      setProofError(err);
      setError(err);
      return;
    }
    setProofFile(file);
    setProofError("");
    setError("");
  }

  async function handleSubmit() {
    if (!activeMethod || automated || comingSoon) return;
    if (proofRequired && !proofFile) {
      setError("Veuillez ajouter votre justificatif de paiement avant de continuer.");
      return;
    }
    if (proofError) return;
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      // Pass the unguessable order token (URL segment), not the internal id —
      // the server authorizes the mutation by token or logged-in ownership.
      fd.append("orderId", order.publicOrderPathSegment);
      if (proofFile) fd.append("proof", proofFile);
      if (proofMessage.trim()) fd.append("message", proofMessage.trim());
      const res = await submitPaymentAction(fd);
      if (!res.ok) setError(res.error ?? "Une erreur est survenue.");
      else {
        setProofFile(null);
        setProofMessage("");
        refresh();
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeMethod(methodId: string) {
    if (!methodId || methodId === activeMethod?.id) return;
    setSwitching(true);
    setError("");
    try {
      const res = await changePaymentMethodAction(order.publicOrderPathSegment, methodId);
      if (!res.ok) setError(res.error ?? "Modification impossible.");
      else {
        setProofFile(null);
        setProofError("");
        refresh();
      }
    } catch {
      setError("Modification impossible. Veuillez réessayer.");
    } finally {
      setSwitching(false);
    }
  }

  async function handleCancel() {
    if (cancelling) return;
    setCancelling(true);
    setError("");
    try {
      const res = await cancelOrderAction(order.publicOrderPathSegment);
      if (!res.ok) setError(res.error ?? "Annulation impossible.");
      else {
        setCancelOpen(false);
        refresh();
      }
    } catch {
      setError("Annulation impossible. Veuillez réessayer.");
    } finally {
      setCancelling(false);
    }
  }

  // Header status badge + copy. Every status resolves through the shared
  // helpers, so a status the page has no module for (refunded, a legacy
  // pre-payment row) can never fall through to the amber "pay now" chip.
  const badge = paymentPageBadge(status);

  const headerInstruction = purchaseBlocked
    ? "Les achats sont momentanément suspendus. Aucun paiement n’est requis pour le moment."
    : (paymentPageInstruction(status) ??
      (activeMethod?.type === "bank"
        ? `Effectuez un virement de ${formatDH(total)} vers le compte ci-dessous, puis ajoutez votre justificatif.`
        : "Réglez le montant ci-dessous pour valider votre commande."));

  const product = order.items[0] ? getProduct(order.items[0].productId) : undefined;

  return (
    <div className="container-page py-8 min-[900px]:py-10">
      <div className={`mx-auto max-w-[1130px] ${showProofUpload ? "pb-[104px] min-[900px]:pb-0" : ""}`}>
        {/* ── Compact payment header ── */}
        <div className="mb-6 flex flex-col gap-6 rounded-[18px] border border-white/[0.08] bg-[linear-gradient(150deg,#12141B,#0C0D12)] p-6 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-7 min-[900px]:p-7">
          <div className="min-w-0 flex-1">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{ color: badge.color, background: badge.bg, borderColor: badge.bd }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.dot }} />
              {badge.label}
            </span>
            <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-white min-[900px]:text-[29px]">
              {purchaseBlocked ? "Commandes en pause" : paymentPageHeadline(status)}
            </h1>
            <p className="mt-1.5 max-w-[440px] text-sm leading-relaxed text-[#9A9FAB]">
              {headerInstruction}
            </p>
            <div className="mt-4 flex items-center gap-6">
              <Meta label="Commande">
                <span className="font-mono">{publicOrderNumber}</span>
              </Meta>
              <span className="h-8 w-px bg-white/[0.09]" />
              <Meta label="Méthode">{activeMethod?.name ?? "Paiement"}</Meta>
            </div>
          </div>
          <div className="shrink-0 rounded-[15px] border border-[rgba(62,123,250,0.22)] bg-[#0A0B0F] p-5 shadow-[inset_0_0_0_1px_rgba(62,123,250,0.04),0_0_40px_rgba(62,123,250,0.08)] min-[900px]:w-[250px]">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8DA6E8]">
              Montant à payer
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[44px] font-semibold leading-none tracking-[-0.03em] text-white">
                {madWhole(total)}
              </span>
              <span className="text-lg font-semibold text-[#9FB8FF]">DH</span>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-white/[0.07] pt-3 text-[12.5px] text-[#7A808C]">
              <LockIcon /> Vérification manuelle sécurisée
            </div>
          </div>
        </div>

        {/* ── 3-step orientation (bank flow only) ── */}
        {isPending && !chooserOpen && activeMethod?.type === "bank" && (
          <StepRow proofSelected={!!proofFile} />
        )}

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 items-start gap-6 min-[900px]:grid-cols-[1fr_356px]">
          {/* MAIN */}
          <div className="flex flex-col gap-5">
            {/* Orders paused: replace all payment modules with the notice. */}
            {purchaseBlocked && <OrdersUnavailableNotice />}

            {/* Method tabs */}
            {!purchaseBlocked && isPending && !chooserOpen && orderedTypes.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto rounded-[13px] border border-white/[0.07] bg-[#0B0C10] p-[5px] [scrollbar-width:none] [&::-webkit-scrollbar]:h-0">
                {orderedTypes.map((type) => {
                  const on = type === activeType;
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={switching}
                      onClick={() => {
                        const first = methods.find((m) => m.type === type);
                        if (first) changeMethod(first.id);
                      }}
                      className={`h-[38px] shrink-0 whitespace-nowrap rounded-[9px] px-4 text-[13px] font-semibold transition-all disabled:opacity-60 min-[900px]:flex-1 min-[900px]:px-0 ${
                        on
                          ? "bg-[#1C2536] text-[#EAF0FF] shadow-[inset_0_0_0_1px_rgba(62,123,250,0.35)]"
                          : "bg-transparent text-[#8A909C] hover:text-[#C4C9D4]"
                      }`}
                    >
                      {TYPE_LABEL[type]}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Chooser (after change-method confirmation) */}
            {isPending && chooserOpen && (
              <div className="overflow-hidden rounded-2xl border border-[rgba(62,123,250,0.3)] bg-[#0F1015] shadow-[0_0_0_3px_rgba(62,123,250,0.1)]">
                <div className="border-b border-white/[0.06] px-[22px] py-[18px]">
                  <h2 className="text-base font-semibold text-white">
                    Choisissez un nouveau moyen de paiement
                  </h2>
                  <p className="mt-0.5 text-[13px] text-[#9A9FAB]">
                    Votre commande {publicOrderNumber} reste inchangée — seul le mode de paiement change.
                  </p>
                </div>
                <div className="flex flex-col gap-3 px-[22px] pb-[22px] pt-4">
                  {methods.map((m) => {
                    const on = m.id === activeMethod?.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={switching}
                        onClick={() => {
                          setChooserOpen(false);
                          changeMethod(m.id);
                        }}
                        className={`flex items-center gap-3 rounded-[13px] bg-[#0B0C10] p-[15px] text-left transition disabled:opacity-60 ${
                          on
                            ? "border-[1.5px] border-accent shadow-[0_0_0_3px_rgba(62,123,250,0.14)]"
                            : "border border-white/[0.09] hover:border-white/20"
                        }`}
                      >
                        <MethodGlyph method={m} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14.5px] font-semibold text-white">{m.name}</div>
                          <div className="mt-0.5 truncate text-[12.5px] text-[#9A9FAB]">
                            {m.subtitle || TYPE_LABEL[m.type]}
                          </div>
                        </div>
                        <span
                          className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full ${
                            on ? "bg-accent" : "border-[1.6px] border-white/20"
                          }`}
                        >
                          {on && <CheckIcon className="h-3 w-3" stroke="#fff" width={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pending modules */}
            {isPending && !chooserOpen && activeMethod && (
              <>
                {activeMethod.type === "bank" && (
                  <BankModule
                    method={activeMethod}
                    methodsOfType={methodsOfActiveType}
                    total={total}
                    reference={publicOrderNumber}
                    copied={copied}
                    onCopy={copy}
                    switching={switching}
                    onSelectMethod={changeMethod}
                  />
                )}

                {activeMethod.type === "crypto" && (
                  <CryptoModule
                    method={activeMethod}
                    methodsOfType={methodsOfActiveType}
                    total={total}
                    copied={copied}
                    onCopy={copy}
                    switching={switching}
                    onSelectMethod={changeMethod}
                  />
                )}

                {activeMethod.type === "paypal" && (
                  <PayPalModule
                    orderId={order.id}
                    method={activeMethod}
                    total={total}
                    onConfirmed={refresh}
                    onError={setError}
                  />
                )}

                {activeMethod.type === "card" && (
                  <CardModule
                    orderId={order.id}
                    method={activeMethod}
                    total={total}
                    onConfirmed={refresh}
                    onError={setError}
                  />
                )}

                {(activeMethod.type === "cash" || activeMethod.type === "custom") && (
                  <GenericModule method={activeMethod} />
                )}

                {/* Proof upload + submit */}
                {proofBased && (
                  <ProofCard
                    proofFile={proofFile}
                    message={proofMessage}
                    proofRequired={proofRequired}
                    submitting={submitting}
                    proofError={proofError}
                    onChange={handleProofChange}
                    onMessage={setProofMessage}
                    onSubmit={handleSubmit}
                  />
                )}
              </>
            )}

            {/* Awaiting verification */}
            {isSubmitted && <AwaitingCard order={order} onTrack={() => refresh()} selfSegment={selfSegment} />}

            {/* Confirmed */}
            {isConfirmed && (
              <TerminalConfirmed
                order={order}
                total={total}
                publicOrderNumber={publicOrderNumber}
                selfSegment={selfSegment}
              />
            )}

            {/* Rejected / issue — allow re-uploading a justificatif in-app */}
            {isRejected && (
              <>
                <TerminalRejected
                  total={total}
                  whatsapp={whatsapp}
                  orderReference={publicOrderNumber}
                  canResubmit={canResubmitProof}
                />
                {canResubmitProof && activeMethod && (
                  <>
                    {status === "payment_issue" && proofRequestReason ? (
                      <div className="rounded-2xl border border-[#3E7BFA]/30 bg-[#3E7BFA]/10 p-5">
                        <h2 className="text-lg font-semibold text-white">Nouveau justificatif demandé</h2>
                        <p className="mt-2 text-sm text-[#B7C2D8]">Commande {publicOrderNumber}</p>
                        <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#8EABF5]">
                            Motif de la demande
                          </p>
                          <p className="mt-2 text-sm leading-6 text-white">{proofRequestReason}</p>
                        </div>
                        <p className="mt-3 text-xs text-[#9DA9BF]">
                          Formats acceptés : PNG, JPG, JPEG ou PDF · Taille maximale : 5 Mo.
                        </p>
                      </div>
                    ) : null}
                    <ProofCard
                      proofFile={proofFile}
                      message={proofMessage}
                      proofRequired={proofRequired}
                      submitting={submitting}
                      proofError={proofError}
                      onChange={handleProofChange}
                      onMessage={setProofMessage}
                      onSubmit={handleSubmit}
                    />
                  </>
                )}
              </>
            )}

            {/* Delivered */}
            {isDelivered && <DeliveredSection order={order} selfSegment={selfSegment} />}

            {/* Cancelled */}
            {isCancelled && <TerminalCancelled whatsapp={whatsapp} orderReference={publicOrderNumber} />}

            {/* Refunded */}
            {isRefunded && (
              <TerminalRefunded
                total={total}
                whatsapp={whatsapp}
                orderReference={publicOrderNumber}
              />
            )}

            {error && (
              <div className="rounded-xl border border-[rgba(224,92,92,0.3)] bg-[rgba(224,92,92,0.08)] px-4 py-3 text-sm text-[#E8A6A6]">
                {error}
              </div>
            )}
          </div>

          {/* SIDEBAR */}
          <div className="flex flex-col gap-4 min-[900px]:sticky min-[900px]:top-5">
            {/* Order summary — collapsible on mobile */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
              <button
                type="button"
                onClick={() => setSummaryOpen((v) => !v)}
                className="flex w-full items-center justify-between border-b border-white/[0.06] px-[18px] py-[15px] text-left min-[900px]:pointer-events-none"
              >
                <h2 className="text-[14.5px] font-semibold text-white">Récapitulatif</h2>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[#7A808C]">{publicOrderNumber}</span>
                  <ChevronIcon
                    className={`h-[18px] w-[18px] text-[#7A808C] transition-transform min-[900px]:hidden ${
                      summaryOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>
              <div className={`${summaryOpen ? "block" : "hidden"} min-[900px]:block`}>
                <div className="px-[18px] py-4">
                  {order.items.map((item, i) => {
                    const p = getProduct(item.productId);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 pb-[15px] ${
                          i < order.items.length - 1 ? "" : "border-b border-white/[0.06]"
                        }`}
                      >
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[11px] border border-white/[0.06]">
                          {p ? (
                            <ProductArt
                              category={p.category}
                              imageUrl={p.imageUrl}
                              label={p.name}
                              className="h-full w-full"
                            />
                          ) : (
                            <div className="h-full w-full bg-[linear-gradient(145deg,#1d2638,#0d1017)]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-semibold text-white">
                            {item.name}
                          </div>
                          {/* Never the raw productId: for a variant purchase it
                              is an internal cuid, meaningless to the customer. */}
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#7A808C]">
                            {p?.region && <RegionBadge code={p.region} variant="chip" size="micro" />}
                            <span className="shrink-0">
                              {p?.region ? "· " : ""}Qté {item.quantity}
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[13px] text-white">
                          {formatDH(item.unitPriceMad * item.quantity)}
                        </span>
                      </div>
                    );
                  })}

                  <div className="flex justify-between pt-[13px] text-[13px]">
                    <span className="text-[#9A9FAB]">Sous-total</span>
                    <span className="font-mono text-white">{formatDH(itemsSubtotal)}</span>
                  </div>
                  {order.discountMad > 0 && (
                    <div className="flex justify-between pt-[9px] text-[13px]">
                      <span className="text-[#8FE0B4]">Réduction</span>
                      <span className="font-mono text-[#8FE0B4]">
                        -{formatDH(order.discountMad)}
                      </span>
                    </div>
                  )}
                  {order.ghostCreditAppliedMad > 0 && (
                    <div className="flex justify-between pt-[9px] text-[13px]">
                      <span className="text-[#9FB8FF]">Crédit Ghost utilisé</span>
                      <span className="font-mono text-[#9FB8FF]">
                        -{formatDH(order.ghostCreditAppliedMad)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-b border-white/[0.06] pb-[13px] pt-[9px] text-[13px]">
                    <span className="text-[#9A9FAB]">Livraison</span>
                    <span className="font-medium text-[#5BC98C]">Numérique · gratuit</span>
                  </div>
                  <div className="flex items-baseline justify-between pt-[13px]">
                    <span className="text-sm font-semibold text-white">Total</span>
                    <span className="font-mono text-xl font-semibold text-white">
                      {formatDH(total)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-white/[0.06] bg-[#0B0C10] px-3 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#646A77]">
                      Méthode
                    </span>
                    <span className="ml-auto text-[13px] font-semibold text-white">
                      {activeMethod?.name ?? "Paiement"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Optional Discord DM delivery (additive; never blocks payment). */}
            {!isCancelled && !isRefunded && !isRejected && !isDelivered && (
              <OrderDiscordDelivery orderId={order.id} orderPathSegment={selfSegment} />
            )}

            {/* After your payment */}
            {!purchaseBlocked && !isTerminalStatus(status) && (
              <div className="rounded-2xl border border-white/[0.07] bg-[#0F1015] px-[18px] py-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 text-[#9FB8FF]" />
                  <h2 className="text-sm font-semibold text-white">Après votre paiement</h2>
                </div>
                <p className="text-[12.5px] leading-relaxed text-[#9A9FAB]">
                  Après l’envoi de votre justificatif, votre paiement sera vérifié. Vous pourrez suivre
                  le statut de votre commande depuis cette page et votre espace client.
                </p>
              </div>
            )}

            {/* Change method */}
            {isPending && methods.length > 1 && (
              <div className="rounded-2xl border border-white/[0.06] bg-[#0B0C10] px-[18px] py-4">
                <div className="text-[13px] font-semibold text-white">
                  Vous préférez payer autrement ?
                </div>
                <p className="mb-3 mt-0.5 text-xs text-[#7A808C]">
                  Possible tant que vous n’avez pas encore payé.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setModalChecked(false);
                    setModalOpen(true);
                  }}
                  className="flex h-[42px] w-full items-center justify-center gap-2 rounded-[11px] border border-white/[0.12] bg-[#12141B] text-[13px] font-medium text-[#C4C9D4] hover:bg-[#171b26]"
                >
                  <SwitchIcon className="h-3.5 w-3.5" />
                  Changer de moyen de paiement
                </button>
              </div>
            )}

            {/* Support */}
            <a
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
                `Bonjour, j'ai une question concernant ma commande ${publicOrderNumber}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#0F1015] px-[18px] py-3.5 text-[#C4C9D4]"
            >
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[rgba(62,123,250,0.1)]">
                <ChatIcon className="h-4 w-4 text-[#9FB8FF]" />
              </span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-white">
                  Un problème avec votre paiement ?
                </div>
                <div className="text-xs text-[#9FB8FF]">Contacter le support</div>
              </div>
            </a>

            {config.support.supportEmail && (
              <p className="px-1 text-xs text-faint">
                Vous préférez l&apos;e-mail&nbsp;? Écrivez-nous à{" "}
                <a
                  href={`mailto:${config.support.supportEmail}?subject=${encodeURIComponent(
                    `Commande ${publicOrderNumber}`,
                  )}`}
                  className="font-medium text-[#9FB8FF] underline-offset-2 hover:underline"
                >
                  {config.support.supportEmail}
                </a>
                .
              </p>
            )}

            {/* Refund request — self-contained: shows the request status or a
                low-emphasis "Demander un remboursement" action for a paid order.
                Authorizes against the order id/token server-side. */}
            <RefundRequestSection orderRef={order.id} />

            {/* Cancel order — low-emphasis destructive action, never competes
                with the primary payment CTA. Shown only while the order is
                still customer-cancellable (server re-validates eligibility). */}
            {canCustomerCancel(status) && (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="mx-auto flex items-center gap-1.5 py-1 text-[13px] font-medium text-[#7A808C] transition-colors hover:text-[#E88B8B]"
              >
                <CloseIcon className="h-3.5 w-3.5" />
                Annuler la commande
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sticky mobile CTA */}
      {showProofUpload && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[linear-gradient(180deg,rgba(7,8,9,0),#070809_30%)] px-4 pb-5 pt-3 min-[900px]:hidden">
          <SubmitButton
            enabled={!!proofFile && !submitting}
            submitting={submitting}
            onClick={handleSubmit}
          />
          <div className="mt-1.5 text-center text-[11px] text-[#646A77]">
            {proofFile ? "Vérification sous ~30 min" : "Ajoutez un justificatif pour continuer"}
          </div>
        </div>
      )}

      {/* Change-method modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(4,5,7,0.72)] p-6 backdrop-blur-[4px]">
          <div className="w-full max-w-[440px] overflow-hidden rounded-[18px] border border-white/10 bg-[#12141B] shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
            <div className="px-[26px] pb-5 pt-6">
              <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(232,168,56,0.28)] bg-[rgba(232,168,56,0.13)]">
                <AlertIcon className="h-5 w-5 text-[#E8A838]" />
              </span>
              <h2 className="text-lg font-semibold text-white">Changer de moyen de paiement ?</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#9A9FAB]">
                Avant de continuer, confirmez que vous n’avez pas encore effectué ni envoyé de
                paiement avec le moyen de paiement actuel.
              </p>
              <button
                type="button"
                onClick={() => setModalChecked((v) => !v)}
                className={`mt-[18px] flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left ${
                  modalChecked
                    ? "border border-[rgba(62,123,250,0.3)] bg-[rgba(62,123,250,0.08)]"
                    : "border border-white/10 bg-[#0B0C10]"
                }`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                    modalChecked ? "border-[1.5px] border-accent bg-accent" : "border-[1.6px] border-white/25"
                  }`}
                >
                  {modalChecked && <CheckIcon className="h-3 w-3" stroke="#fff" width={3} />}
                </span>
                <span className="text-[13px] leading-snug text-[#EAF0FF]">
                  Je confirme ne pas avoir encore effectué ni envoyé le paiement.
                </span>
              </button>
            </div>
            <div className="flex gap-3 px-[26px] pb-[22px] pt-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-[46px] flex-1 rounded-xl border border-white/[0.12] bg-transparent text-sm font-semibold text-[#C4C9D4] hover:bg-white/[0.04]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!modalChecked}
                onClick={() => {
                  if (!modalChecked) return;
                  setModalOpen(false);
                  setChooserOpen(true);
                }}
                className={`h-[46px] flex-1 rounded-xl text-sm font-semibold transition ${
                  modalChecked
                    ? "bg-[linear-gradient(145deg,#3E7BFA,#2B5FD9)] text-white shadow-[0_8px_22px_rgba(62,123,250,0.3)]"
                    : "cursor-not-allowed border border-white/[0.08] bg-[#161821] text-[#5A606D]"
                }`}
              >
                Confirmer et changer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel-order confirmation modal */}
      {cancelOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(4,5,7,0.72)] p-6 backdrop-blur-[4px]">
          <div className="w-full max-w-[440px] overflow-hidden rounded-[18px] border border-white/10 bg-[#12141B] shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
            <div className="px-[26px] pb-5 pt-6">
              <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(224,92,92,0.28)] bg-[rgba(224,92,92,0.13)]">
                <AlertIcon className="h-5 w-5 text-[#E88B8B]" />
              </span>
              <h2 className="text-lg font-semibold text-white">Annuler la commande ?</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#9A9FAB]">
                Êtes-vous sûr de vouloir annuler cette commande ?
              </p>
              <div className="mt-[18px] flex items-start gap-2.5 rounded-xl border border-[rgba(232,168,56,0.28)] bg-[rgba(232,168,56,0.09)] px-3.5 py-3">
                <AlertIcon className="mt-px h-4 w-4 shrink-0 text-[#E8A838]" />
                <span className="text-[12.5px] leading-snug text-[#F0C466]">
                  Si vous avez déjà envoyé le paiement, contactez le support au lieu d’annuler.
                </span>
              </div>
            </div>
            <div className="flex gap-3 px-[26px] pb-[22px] pt-4">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                disabled={cancelling}
                className="h-[46px] flex-1 rounded-xl border border-white/[0.12] bg-transparent text-sm font-semibold text-[#C4C9D4] transition hover:bg-white/[0.04] disabled:opacity-60"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="h-[46px] flex-1 rounded-xl bg-[linear-gradient(145deg,#E05C5C,#C23B3B)] text-sm font-semibold text-white shadow-[0_8px_22px_rgba(224,92,92,0.3)] transition disabled:opacity-70"
              >
                {cancelling ? "Annulation…" : "Oui, annuler"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Header helpers ─────────────────────────────────────────────────────────

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#646A77]">
        {label}
      </div>
      <div className="text-[14.5px] font-semibold text-white">{children}</div>
    </div>
  );
}

function StepRow({ proofSelected }: { proofSelected: boolean }) {
  const steps = [
    { n: 1, label: "Choisissez votre banque", state: "done" as const },
    { n: 2, label: "Effectuez le virement", state: proofSelected ? ("done" as const) : ("active" as const) },
    { n: 3, label: "Envoyez votre justificatif", state: proofSelected ? ("active" as const) : ("todo" as const) },
  ];
  return (
    <>
      {/* Mobile: slim 3-segment progress bar */}
      <div className="mb-4 flex items-center gap-1.5 min-[900px]:hidden">
        {steps.map((s) => (
          <span
            key={s.n}
            className="h-1 flex-1 rounded-full"
            style={{
              background:
                s.state === "done" ? "#5BC98C" : s.state === "active" ? "#3E7BFA" : "rgba(255,255,255,0.1)",
            }}
          />
        ))}
      </div>

      {/* Desktop: 3 orientation cards */}
      <div className="mb-6 hidden items-stretch gap-3 min-[900px]:flex">
        {steps.map((s) => {
        const done = s.state === "done";
        const active = s.state === "active";
        const wrap = done
          ? "border-[rgba(91,201,140,0.26)] bg-[rgba(91,201,140,0.07)]"
          : active
            ? "border-[rgba(62,123,250,0.26)] bg-[rgba(62,123,250,0.07)]"
            : "border-white/[0.07] bg-[#0B0C10]";
        return (
          <div
            key={s.n}
            className={`flex flex-1 items-center gap-3 rounded-[13px] border p-[13px_15px] ${wrap}`}
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[13px] font-semibold ${
                done
                  ? "bg-[#5BC98C] text-[#0A1F14]"
                  : active
                    ? "bg-accent text-white shadow-[0_0_0_4px_rgba(62,123,250,0.16)]"
                    : "border-[1.5px] border-white/[0.18] text-[#646A77]"
              }`}
            >
              {done ? <CheckIcon className="h-3 w-3" stroke="#fff" width={3} /> : s.n}
            </span>
            <div className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#646A77]">
                Étape {s.n}
              </div>
              <div
                className={`text-[13.5px] font-semibold leading-tight ${
                  done || active ? "text-white" : "text-[#7A808C]"
                }`}
              >
                {s.label}
              </div>
            </div>
          </div>
        );
        })}
      </div>
    </>
  );
}

// ─── Bank module ────────────────────────────────────────────────────────────

function BankModule({
  method,
  methodsOfType,
  total,
  reference,
  copied,
  onCopy,
  switching,
  onSelectMethod,
}: {
  method: PaymentMethodDTO;
  methodsOfType: PaymentMethodDTO[];
  total: number;
  reference: string;
  copied: string | null;
  onCopy: (key: string, value: string) => void;
  switching: boolean;
  onSelectMethod: (id: string) => void;
}) {
  const d = method.details;
  const rows: { key: string; label: string; value: string; mono?: boolean }[] = [];
  if (d.accountHolder) rows.push({ key: "tit", label: "Titulaire", value: d.accountHolder });
  if (d.rib || d.accountNumber)
    rows.push({ key: "rib", label: "RIB / Numéro de compte", value: (d.rib || d.accountNumber)!, mono: true });
  if (d.iban) rows.push({ key: "iban", label: "IBAN", value: d.iban, mono: true });
  if (d.swift) rows.push({ key: "swift", label: "SWIFT / BIC", value: d.swift, mono: true });
  rows.push({ key: "motif", label: "Motif / Référence", value: reference, mono: true });

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
      <div className="border-b border-white/[0.06] px-[22px] py-[18px]">
        <h2 className="text-base font-semibold text-white">
          {methodsOfType.length > 1 ? "Choisissez votre banque" : method.name}
        </h2>
        <p className="mt-1 text-[13px] text-[#9A9FAB]">
          Virez le montant exact vers {methodsOfType.length > 1 ? "l’un des comptes" : "le compte"} ci-dessous.
        </p>
      </div>

      {methodsOfType.length > 1 && (
        <div className="flex gap-2.5 overflow-x-auto px-[22px] pb-1.5 pt-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:h-0">
          {methodsOfType.map((m) => {
            const on = m.id === method.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={switching}
                onClick={() => onSelectMethod(m.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl bg-[#0B0C10] p-[11px_14px] transition disabled:opacity-60 ${
                  on
                    ? "border-[1.5px] border-accent shadow-[0_0_0_3px_rgba(62,123,250,0.13)]"
                    : "border border-white/[0.09] hover:border-white/20"
                }`}
              >
                <MethodGlyph method={m} small />
                <span className="whitespace-nowrap text-[13.5px] font-semibold text-white">
                  {m.name}
                </span>
                <span
                  className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${
                    on ? "bg-accent" : "border-[1.5px] border-white/[0.18]"
                  }`}
                >
                  {on && <CheckIcon className="h-2.5 w-2.5" stroke="#fff" width={3.2} />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="px-[22px] pb-[22px] pt-3.5">
        {/* Amount hero */}
        <div className="mb-3.5 flex items-center gap-4 rounded-[13px] border border-[rgba(62,123,250,0.22)] bg-[rgba(62,123,250,0.07)] p-[16px_18px]">
          <div className="flex-1">
            <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#8DA6E8]">
              Montant exact à virer
            </div>
            <div className="font-mono text-[26px] font-semibold tracking-[-0.01em] text-white">
              {madExact(total)} DH
            </div>
          </div>
          <CopyButton
            copied={copied === "amt"}
            onClick={() => onCopy("amt", madExact(total))}
            variant="primary"
          />
        </div>

        {/* Detail rows */}
        <div className="overflow-hidden rounded-[13px] border border-white/[0.06] bg-[#0B0C10]">
          {rows.map((r, i) => (
            <div
              key={r.key}
              className={`flex items-center gap-3 p-[13px_16px] ${
                i < rows.length - 1 ? "border-b border-white/[0.05]" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#646A77]">
                  {r.label}
                </div>
                <div
                  className={`overflow-hidden text-ellipsis text-sm font-medium text-white ${
                    r.mono ? "font-mono" : ""
                  } max-[899px]:whitespace-nowrap min-[900px]:break-all`}
                >
                  {r.value}
                </div>
              </div>
              <CopyButton copied={copied === r.key} onClick={() => onCopy(r.key, r.value)} />
            </div>
          ))}
        </div>

        <p className="mt-3.5 flex items-start gap-2 text-[12.5px] text-[#7A808C]">
          <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          {method.customerNote ||
            "Une fois le virement effectué, ajoutez votre justificatif ci-dessous pour lancer la vérification."}
        </p>
      </div>
    </div>
  );
}

// ─── Crypto module ──────────────────────────────────────────────────────────

function CryptoModule({
  method,
  methodsOfType,
  total,
  copied,
  onCopy,
  switching,
  onSelectMethod,
}: {
  method: PaymentMethodDTO;
  methodsOfType: PaymentMethodDTO[];
  total: number;
  copied: string | null;
  onCopy: (key: string, value: string) => void;
  switching: boolean;
  onSelectMethod: (id: string) => void;
}) {
  const d = method.details;
  // MAD→USDT rate is admin-configurable per method (details.cryptoExchangeRate);
  // falls back to the historical 10 MAD/USDT when unset. Never hardcode only —
  // a drifting rate makes every crypto customer under/over-pay.
  const configuredRate = Number(d.cryptoExchangeRate);
  const usdtRate = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 10;
  const usdt = madExact(total / usdtRate);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
      <div className="border-b border-white/[0.06] px-[22px] py-[18px]">
        <h2 className="text-base font-semibold text-white">{method.name || "Paiement en USDT"}</h2>
        <p className="mt-1 text-[13px] text-[#9A9FAB]">
          Envoyez le montant exact à l’adresse ci-dessous.
          {methodsOfType.length > 1 ? " Sélectionnez d’abord le réseau." : ""}
        </p>
      </div>
      <div className="px-[22px] pb-[22px] pt-5">
        {methodsOfType.length > 1 && (
          <div className="mb-4 flex gap-2">
            {methodsOfType.map((m) => {
              const on = m.id === method.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={switching}
                  onClick={() => onSelectMethod(m.id)}
                  className={`h-[38px] flex-1 rounded-[10px] text-[13px] font-semibold transition disabled:opacity-60 ${
                    on
                      ? "border-[1.5px] border-accent bg-[rgba(62,123,250,0.12)] text-[#EAF0FF]"
                      : "border border-white/[0.09] bg-[#0B0C10] text-[#8A909C]"
                  }`}
                >
                  {m.details.network || m.name}
                </button>
              );
            })}
          </div>
        )}
        {d.walletAddress ? (
          <div className="flex items-center gap-[18px]">
            {/* No decorative fake-QR tile here: customers try to scan it and
                fail. Copy-paste of the address below is the supported flow;
                render a real QR of d.walletAddress if one is ever added. */}
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex gap-4">
                <div>
                  <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#646A77]">
                    Montant
                  </div>
                  <div className="font-mono text-lg font-semibold text-white">{usdt} USDT</div>
                </div>
                {d.network && (
                  <div>
                    <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#646A77]">
                      Réseau
                    </div>
                    <div className="text-[15px] font-semibold text-white">{d.network}</div>
                  </div>
                )}
              </div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#646A77]">
                Adresse du portefeuille
              </div>
              <div className="flex items-center gap-2.5 rounded-[11px] border border-white/[0.07] bg-[#0B0C10] px-3.5 py-[11px]">
                <span className="min-w-0 flex-1 break-all font-mono text-[13px] text-white">
                  {d.walletAddress}
                </span>
                <CopyButton copied={copied === "wallet"} onClick={() => onCopy("wallet", d.walletAddress!)} />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#9A9FAB]">
            L’adresse de portefeuille est en cours de configuration. Veuillez réessayer ultérieurement.
          </p>
        )}
        <div className="mt-4 flex items-center gap-2.5 rounded-[11px] border border-[rgba(232,168,56,0.22)] bg-[rgba(232,168,56,0.07)] px-3.5 py-3 text-[12.5px] text-[#F0C466]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#E8A838] shadow-[0_0_8px_#E8A838]" />
          En attente de la transaction — la commande se confirme après 1 confirmation réseau.
        </div>
      </div>
    </div>
  );
}

// ─── PayPal module ──────────────────────────────────────────────────────────

function PayPalModule({
  orderId,
  method,
  total,
  onConfirmed,
  onError,
}: {
  orderId: string;
  method: PaymentMethodDTO;
  total: number;
  onConfirmed: () => void;
  onError: (m: string) => void;
}) {
  const currency = method.details.paypalCurrency || "USD";
  const rate = method.details.paypalExchangeRate || 10;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
      <div className="border-b border-white/[0.06] px-[22px] py-[18px]">
        <h2 className="text-base font-semibold text-white">Payer avec PayPal</h2>
        <p className="mt-1 text-[13px] text-[#9A9FAB]">
          Vous serez redirigé vers PayPal pour régler en toute sécurité.
        </p>
      </div>
      <div className="p-[22px]">
        <AmountPanel total={total} convertedLabel={`${madExact(total / rate)} ${currency}`} />
        <div className="mt-4">
          <PayPalButton orderId={orderId} currency={currency} onConfirmed={onConfirmed} onError={onError} />
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-[12.5px] text-[#646A77]">
          <LockIcon /> La confirmation est automatique après le paiement PayPal.
        </p>
      </div>
    </div>
  );
}

// ─── Card module ────────────────────────────────────────────────────────────

function CardModule({
  orderId,
  method,
  total,
  onConfirmed,
  onError,
}: {
  orderId: string;
  method: PaymentMethodDTO;
  total: number;
  onConfirmed: () => void;
  onError: (m: string) => void;
}) {
  const currency = method.details.paypalCurrency || "USD";
  if (method.details.comingSoon) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-[#0F1015] p-6 text-center">
        <h2 className="text-base font-semibold text-white">
          {method.details.statusNote || "Paiement par carte bientôt disponible."}
        </h2>
        <p className="mt-2 text-sm text-[#9A9FAB]">Veuillez choisir une autre méthode de paiement.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
      <div className="border-b border-white/[0.06] px-[22px] py-[18px]">
        <h2 className="text-base font-semibold text-white">Payer par carte bancaire</h2>
        <p className="mt-1 text-[13px] text-[#9A9FAB]">
          Visa, Mastercard, CMI — traité en toute sécurité via PayPal.
        </p>
      </div>
      <div className="p-[22px]">
        <AmountPanel total={total} cardMarks />
        <div className="mt-4">
          <PayPalButton
            orderId={orderId}
            currency={currency}
            fundingSource="card"
            onConfirmed={onConfirmed}
            onError={onError}
          />
        </div>
        <div className="mt-4 flex items-start gap-2.5 rounded-[11px] border border-white/[0.07] bg-[#0B0C10] px-3.5 py-3">
          <PopupIcon className="mt-px h-4 w-4 shrink-0 text-[#9FB8FF]" />
          <div>
            <div className="mb-0.5 text-[12.5px] font-semibold text-[#EAF0FF]">
              Une fenêtre sécurisée PayPal va s’ouvrir
            </div>
            <div className="text-[12.5px] leading-relaxed text-[#9A9FAB]">
              Saisissez les informations de votre carte dans la fenêtre, sans quitter cette page. La
              confirmation est automatique après le paiement.
            </div>
          </div>
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-xs text-[#646A77]">
          <LockIcon /> Vos données de carte ne transitent jamais par ghost.ma.
        </p>
      </div>
    </div>
  );
}

function GenericModule({ method }: { method: PaymentMethodDTO }) {
  const d = method.details;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
      <div className="border-b border-white/[0.06] px-[22px] py-[18px]">
        <h2 className="text-base font-semibold text-white">{d.customLabel || method.name}</h2>
        <p className="mt-1 text-[13px] text-[#9A9FAB]">{method.subtitle}</p>
      </div>
      {d.fields && d.fields.length > 0 && (
        <div className="m-[22px] overflow-hidden rounded-[13px] border border-white/[0.06] bg-[#0B0C10]">
          {d.fields.map((f, i) => (
            <div
              key={`${f.label}-${i}`}
              className={`flex items-center justify-between p-[13px_16px] ${
                i < d.fields!.length - 1 ? "border-b border-white/[0.05]" : ""
              }`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#646A77]">
                {f.label}
              </span>
              <span className="font-mono text-sm text-white">{f.value}</span>
            </div>
          ))}
        </div>
      )}
      {d.instructions && <p className="px-[22px] pb-[22px] text-sm text-[#9A9FAB]">{d.instructions}</p>}
    </div>
  );
}

function AmountPanel({
  total,
  convertedLabel,
  cardMarks,
}: {
  total: number;
  convertedLabel?: string;
  cardMarks?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-[13px] border border-[rgba(62,123,250,0.22)] bg-[rgba(62,123,250,0.07)] p-[16px_18px]">
      <div className="flex-1">
        <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#8DA6E8]">
          Montant
        </div>
        <div className="font-mono text-[26px] font-semibold text-white">{madExact(total)} DH</div>
      </div>
      {convertedLabel && (
        <div className="text-right">
          <div className="text-[11.5px] text-[#646A77]">≈ à débiter</div>
          <div className="text-sm font-semibold text-[#9FB8FF]">{convertedLabel}</div>
        </div>
      )}
      {cardMarks && (
        <div className="flex shrink-0 gap-1.5">
          <span className="flex h-[30px] items-center rounded-[7px] bg-white px-2.5 text-xs font-bold italic text-[#1A1F71]">
            VISA
          </span>
          <span className="relative flex h-[30px] w-[38px] items-center justify-center rounded-[7px] bg-white">
            <span className="absolute left-1.5 h-[15px] w-[15px] rounded-full bg-[#EB001B]" />
            <span className="absolute right-1.5 h-[15px] w-[15px] rounded-full bg-[#F79E1B] opacity-90" />
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Proof card ─────────────────────────────────────────────────────────────

function ProofCard({
  proofFile,
  message,
  proofRequired,
  submitting,
  proofError,
  onChange,
  onMessage,
  onSubmit,
}: {
  proofFile: File | null;
  message: string;
  proofRequired: boolean;
  submitting: boolean;
  proofError: string;
  onChange: (f: File | null) => void;
  onMessage: (value: string) => void;
  onSubmit: () => void;
}) {
  const enabled = (!proofRequired || !!proofFile) && !submitting;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
      <div className="border-b border-white/[0.06] px-[22px] py-[18px]">
        <h2 className="text-base font-semibold text-white">Justificatif de paiement</h2>
        <p className="mt-1 text-[13px] text-[#9A9FAB]">
          Ajoutez une capture d’écran ou un reçu de votre virement.
        </p>
      </div>
      <div className="px-[22px] pb-[22px] pt-5">
        {!proofFile ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-white/[0.16] bg-[#0B0C10] px-5 py-[34px] text-center">
            <span className="grid h-[52px] w-[52px] place-items-center rounded-[14px] border border-[rgba(62,123,250,0.24)] bg-[rgba(62,123,250,0.1)]">
              <UploadIcon className="h-[22px] w-[22px] text-[#9FB8FF]" />
            </span>
            <div>
              <div className="mb-0.5 text-[14.5px] font-semibold text-white">
                Glissez votre fichier ici, ou <span className="text-[#9FB8FF]">parcourez</span>
              </div>
              <div className="text-[12.5px] text-[#646A77]">PNG, JPG, JPEG ou PDF — 5 Mo max.</div>
            </div>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              className="hidden"
              onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <div className="flex items-center gap-3.5 rounded-[13px] border border-[rgba(91,201,140,0.3)] bg-[#0B0C10] p-[15px_16px]">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] bg-[rgba(91,201,140,0.13)]">
              <FileIcon className="h-5 w-5 text-[#5BC98C]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{proofFile.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-[#5BC98C]">
                <CheckIcon className="h-3 w-3" stroke="#5BC98C" width={2.6} />
                {formatFileSize(proofFile.size)} · prêt à envoyer
              </div>
            </div>
            <label className="flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[9px] border border-white/[0.12] bg-[#12141B] px-3 text-[12.5px] font-medium text-[#C4C9D4]">
              Remplacer
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                className="hidden"
                onChange={(e) => onChange(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-[rgba(224,92,92,0.28)] bg-[rgba(224,92,92,0.08)] text-[#E88B8B]"
              aria-label="Supprimer le fichier"
            >
              <CloseIcon className="h-[15px] w-[15px]" />
            </button>
          </div>
        )}

        {proofError && <p className="mt-2 text-xs text-[#E8A6A6]">{proofError}</p>}

        <label className="mt-4 block text-sm font-medium text-white">
          Message complémentaire <span className="font-normal text-[#646A77]">(facultatif)</span>
        </label>
        <textarea
          value={message}
          onChange={(event) => onMessage(event.target.value.slice(0, 1000))}
          rows={3}
          placeholder="Ajoutez une précision utile pour notre équipe."
          className="mt-2 w-full resize-y rounded-xl border border-white/[0.1] bg-[#0B0C10] px-4 py-3 text-sm text-white placeholder:text-[#646A77] focus:border-[#3E7BFA]/60 focus:outline-none"
        />

        {/* Desktop inline CTA */}
        <div className="mt-4 hidden min-[900px]:block">
          <SubmitButton enabled={enabled} submitting={submitting} onClick={onSubmit} />
        </div>
        <p className="mt-3 hidden text-center text-xs text-[#646A77] min-[900px]:block">
          {proofFile
            ? "Le justificatif sera vérifié manuellement — généralement sous 30 minutes."
            : "Ajoutez d’abord votre justificatif de virement pour activer l’envoi."}
        </p>
      </div>
    </div>
  );
}

function SubmitButton({
  enabled,
  submitting,
  onClick,
}: {
  enabled: boolean;
  submitting: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={`flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[13px] text-[15px] font-semibold transition-all min-[900px]:h-[50px] ${
        enabled
          ? "bg-[linear-gradient(145deg,#3E7BFA,#2B5FD9)] text-white shadow-[0_10px_26px_rgba(62,123,250,0.35)]"
          : "cursor-not-allowed border border-white/[0.08] bg-[#161821] text-[#5A606D]"
      }`}
    >
      <span>{submitting ? "Envoi en cours…" : "Envoyer le justificatif"}</span>
      {!submitting && enabled && <SendIcon className="h-[17px] w-[17px]" />}
    </button>
  );
}

// ─── Awaiting verification ──────────────────────────────────────────────────

function AwaitingCard({
  order,
  onTrack,
  selfSegment,
}: {
  order: CustomerOrderDTO;
  onTrack: () => void;
  /**
   * The reference the customer actually arrived with (secret delivery token, or
   * a public number for a legacy link). Self-links MUST reuse it: linking to the
   * enumerable public segment instead silently downgrades a token-bearing guest
   * to the weaker view, which once delivered costs them access to their own codes.
   */
  selfSegment: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgba(62,123,250,0.22)] bg-[#0F1015]">
      <div className="border-b border-white/[0.06] px-[26px] py-7 text-center">
        <span className="mb-4 inline-flex h-[60px] w-[60px] items-center justify-center rounded-full border border-[rgba(62,123,250,0.3)] bg-[rgba(62,123,250,0.12)]">
          <ClockIcon className="h-7 w-7 text-[#9FB8FF]" />
        </span>
        <h2 className="text-xl font-semibold text-white">Justificatif envoyé</h2>
        <p className="mx-auto mt-1.5 max-w-[400px] text-sm text-[#9A9FAB]">
          Votre paiement est en cours de vérification. Vous n’avez rien d’autre à faire — nous
          confirmons votre commande dès validation.
        </p>
        {order.proofUploaded && (
          <div className="mt-4 inline-flex items-center gap-2.5 rounded-[11px] border border-white/[0.07] bg-[#0B0C10] px-3.5 py-2.5">
            <FileIcon className="h-4 w-4 text-[#5BC98C]" />
            <span className="text-[13px] font-medium text-white">Justificatif reçu</span>
          </div>
        )}
      </div>
      <div className="px-[26px] py-[22px]">
        <TimelineStep
          state="done"
          title="Justificatif reçu"
          sub="Il y a quelques instants"
          connector="done"
        />
        <TimelineStep
          state="active"
          title="Vérification en cours"
          sub="Généralement sous 30 minutes (heures ouvrables)"
          connector="pending"
        />
        <TimelineStep
          state="todo"
          title="Commande confirmée"
          sub="Reçu par e-mail et sur votre espace client"
        />
        <div className="mt-4 flex items-center gap-2.5 rounded-[11px] border border-[rgba(62,123,250,0.16)] bg-[rgba(62,123,250,0.06)] px-3.5 py-3 text-[12.5px] text-[#9FB8FF]">
          <InfoIcon className="h-[15px] w-[15px] shrink-0 text-[#9FB8FF]" />
          Inutile de renvoyer un justificatif. Suivez l’avancement depuis cette page à tout moment.
        </div>
        <Link
          href={`/order/${selfSegment}`}
          onClick={onTrack}
          className="mt-3.5 flex h-11 w-full items-center justify-center rounded-[11px] border border-white/10 bg-[#12141B] text-[13.5px] font-medium text-[#C4C9D4] hover:bg-[#171b26]"
        >
          Suivre ma commande
        </Link>
      </div>
    </div>
  );
}

function TimelineStep({
  state,
  title,
  sub,
  connector,
}: {
  state: "done" | "active" | "todo";
  title: string;
  sub: string;
  connector?: "done" | "pending";
}) {
  return (
    <div className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          className={`grid h-[26px] w-[26px] place-items-center rounded-full ${
            state === "done"
              ? "bg-[#5BC98C]"
              : state === "active"
                ? "border-[1.5px] border-accent bg-[rgba(62,123,250,0.15)]"
                : "border-[1.5px] border-white/[0.14]"
          }`}
        >
          {state === "done" ? (
            <CheckIcon className="h-3 w-3" stroke="#0A1F14" width={3} />
          ) : state === "active" ? (
            <span className="h-2 w-2 rounded-full bg-accent" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-white/[0.14]" />
          )}
        </span>
        {connector && (
          <span
            className="min-h-[22px] w-0.5 flex-1"
            style={{
              background:
                connector === "done"
                  ? "linear-gradient(#5BC98C,rgba(62,123,250,0.5))"
                  : "rgba(255,255,255,0.08)",
            }}
          />
        )}
      </div>
      <div className={connector ? "pb-5" : ""}>
        <div
          className={`text-sm font-semibold ${
            state === "active" ? "text-[#9FB8FF]" : state === "todo" ? "text-[#7A808C]" : "text-white"
          }`}
        >
          {title}
        </div>
        <div className="text-[12.5px] text-[#646A77]">{sub}</div>
      </div>
    </div>
  );
}

// ─── Terminal states ────────────────────────────────────────────────────────

function TerminalConfirmed({
  selfSegment,
  order,
  total,
  publicOrderNumber,
}: {
  order: CustomerOrderDTO;
  total: number;
  publicOrderNumber: string;
  /** See AwaitingCard — self-links must preserve the arrival capability. */
  selfSegment: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgba(91,201,140,0.28)] bg-[#0F1015]">
      <div className="p-[26px] text-center">
        <div className="mb-4 flex justify-center">
          <OrderConfirmationMascot variant="pending" />
        </div>
        <h2 className="text-[19px] font-semibold text-white">Paiement confirmé</h2>
        <p className="mx-auto mt-1.5 max-w-[340px] text-[13.5px] text-[#9A9FAB]">
          Votre paiement de <strong className="text-white">{formatDH(total)}</strong> a été vérifié.
          Votre commande {publicOrderNumber} est en cours de préparation.
        </p>
      </div>
      <div className="px-[22px] pb-[22px]">
        <Link
          href={`/order/${selfSegment}`}
          className="flex h-[46px] w-full items-center justify-center rounded-xl bg-[linear-gradient(145deg,#3E7BFA,#2B5FD9)] text-sm font-semibold text-white"
        >
          Voir ma commande
        </Link>
      </div>
    </div>
  );
}

function TerminalRejected({
  total,
  whatsapp,
  orderReference,
  canResubmit,
}: {
  total: number;
  whatsapp: string;
  orderReference: string;
  canResubmit: boolean;
}) {
  const contactHref = (msg: string) =>
    `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgba(224,92,92,0.3)] bg-[#0F1015]">
      <div className="px-6 pb-[18px] pt-6">
        <div className="mb-3.5 flex items-center gap-3.5">
          <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-xl border border-[rgba(224,92,92,0.3)] bg-[rgba(224,92,92,0.13)]">
            <AlertCircleIcon className="h-[21px] w-[21px] text-[#E88B8B]" />
          </span>
          <div>
            <h2 className="text-[17px] font-semibold text-white">Justificatif à renvoyer</h2>
            <p className="mt-0.5 text-[13px] text-[#9A9FAB]">
              Nous n’avons pas pu vérifier votre paiement.
            </p>
          </div>
        </div>
        <div className="rounded-[11px] border border-[rgba(224,92,92,0.2)] bg-[rgba(224,92,92,0.07)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[#E8A6A6]">
          Vérifiez que le montant du justificatif correspond bien à {formatDH(total)}, puis{" "}
          {canResubmit
            ? "renvoyez une image lisible du virement via le formulaire ci-dessous."
            : "renvoyez une image lisible du virement via le support."}
        </div>
      </div>
      <div className="px-[22px] pb-[22px]">
        <a
          href={contactHref(`Bonjour, j'ai un problème avec ma commande ${orderReference}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[46px] w-full items-center justify-center rounded-xl border border-white/[0.12] bg-transparent text-[13.5px] font-semibold text-[#C4C9D4] hover:bg-white/[0.04]"
        >
          Contacter le support
        </a>
      </div>
    </div>
  );
}

function TerminalCancelled({
  whatsapp,
  orderReference,
}: {
  whatsapp: string;
  orderReference: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgba(224,92,92,0.28)] bg-[#0F1015]">
      <div className="p-[26px] text-center">
        <span className="mb-4 inline-flex h-[58px] w-[58px] items-center justify-center rounded-full border border-[rgba(224,92,92,0.36)] bg-[rgba(224,92,92,0.14)]">
          <AlertCircleIcon className="h-7 w-7 text-[#E88B8B]" />
        </span>
        <h2 className="text-[19px] font-semibold text-white">Commande annulée.</h2>
        <p className="mx-auto mt-1.5 max-w-[360px] text-[13.5px] text-[#9A9FAB]">
          Votre commande {orderReference} a été annulée. Aucun paiement ne sera prélevé.
        </p>
      </div>
      <div className="flex flex-col gap-3 px-[22px] pb-[22px] min-[520px]:flex-row">
        <Link
          href="/products"
          className="flex h-[46px] flex-1 items-center justify-center rounded-xl bg-[linear-gradient(145deg,#3E7BFA,#2B5FD9)] text-[13.5px] font-semibold text-white"
        >
          Parcourir le catalogue
        </Link>
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
            `Bonjour, j'ai une question concernant ma commande annulée ${orderReference}`,
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[46px] flex-1 items-center justify-center rounded-xl border border-white/[0.12] bg-transparent text-[13.5px] font-semibold text-[#C4C9D4] hover:bg-white/[0.04]"
        >
          Contacter le support
        </a>
      </div>
    </div>
  );
}

function TerminalRefunded({
  total,
  whatsapp,
  orderReference,
}: {
  total: number;
  whatsapp: string;
  orderReference: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgba(155,92,224,0.28)] bg-[#0F1015]">
      <div className="p-[26px] text-center">
        <span className="mb-4 inline-flex h-[58px] w-[58px] items-center justify-center rounded-full border border-[rgba(155,92,224,0.36)] bg-[rgba(155,92,224,0.14)]">
          <RefundIcon className="h-7 w-7 text-[#C9A6F0]" />
        </span>
        <h2 className="text-[19px] font-semibold text-white">Commande remboursée</h2>
        <p className="mx-auto mt-1.5 max-w-[380px] text-[13.5px] leading-relaxed text-[#9A9FAB]">
          Votre commande {orderReference} a été remboursée pour un montant de{" "}
          <strong className="text-white">{formatDH(total)}</strong>. Aucun paiement n’est requis.
          Selon votre banque, le remboursement peut mettre quelques jours ouvrés à apparaître sur
          votre compte.
        </p>
      </div>
      <div className="flex flex-col gap-3 px-[22px] pb-[22px] min-[520px]:flex-row">
        <Link
          href="/products"
          className="flex h-[46px] flex-1 items-center justify-center rounded-xl bg-[linear-gradient(145deg,#3E7BFA,#2B5FD9)] text-[13.5px] font-semibold text-white"
        >
          Parcourir le catalogue
        </Link>
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
            `Bonjour, j'ai une question concernant le remboursement de ma commande ${orderReference}`,
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[46px] flex-1 items-center justify-center rounded-xl border border-white/[0.12] bg-transparent text-[13.5px] font-semibold text-[#C4C9D4] hover:bg-white/[0.04]"
        >
          Contacter le support
        </a>
      </div>
    </div>
  );
}

// ─── Delivered ──────────────────────────────────────────────────────────────

function DeliveredSection({ order, selfSegment }: { order: CustomerOrderDTO; selfSegment: string }) {
  const { getProduct } = useProductCatalog();
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[rgba(91,201,140,0.28)] bg-[#0F1015] px-4 py-5 text-center">
        <div className="flex justify-center">
          <OrderConfirmationMascot variant="delivered" />
        </div>
        <p className="mt-3 text-[19px] font-semibold text-white">Commande livrée</p>
        <p className="mx-auto mt-1 max-w-[360px] text-sm text-[#9A9FAB]">
          Vos codes sont disponibles ci-dessous. Révélez-les uniquement lorsque vous êtes prêt à les
          utiliser.
        </p>
      </div>

      <DeliveredOrderDiscord orderId={order.id} orderPathSegment={selfSegment} />

      {order.items.map((item) => {
        const product = getProduct(item.productId);
        const delivered = order.deliveredCodes.filter(
          (d) => d.orderItemId === item.id || (!d.orderItemId && d.productId === item.productId),
        );
        const count = delivered.length;
        return (
          <article
            key={item.id}
            className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]"
          >
            <div className="grid gap-4 p-5 sm:grid-cols-[92px_1fr]">
              {product && (
                <ProductArt
                  category={product.category}
                  imageUrl={product.imageUrl}
                  label={product.name}
                  className="h-20 w-full rounded-xl sm:w-[92px]"
                />
              )}
              <div>
                <h3 className="font-semibold text-white">{item.name}</h3>
                <p className="mt-1 text-sm text-[#9A9FAB]">Quantité : {item.quantity}</p>
              </div>
            </div>
            <div className="border-t border-white/[0.06] bg-black/20 p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#646A77]">
                Code{count > 1 ? "s" : ""} livré{count > 1 ? "s" : ""}
              </p>
              <div className="space-y-3">
                {count === 0 ? (
                  <p className="rounded-xl border border-white/[0.06] bg-[#0B0C10] px-4 py-3 text-sm text-[#9A9FAB]">
                    Aucun code n’a encore été attribué à cette commande.
                  </p>
                ) : (
                  delivered.map((d, i) => (
                    <DeliveredCodeCard
                      key={`${item.id}-${i}`}
                      delivered={d}
                      index={count > 1 ? i : undefined}
                    />
                  ))
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Renders one delivered unit by MEANING, not by looping arbitrary fields into
 * identical secret cards. Providers like Reloadly may return a redemption code,
 * an optional PIN, a redemption URL, and/or instructions. The code (and PIN,
 * when present) are secret and masked/reveal-on-demand; the PIN is grouped under
 * the code rather than shown as a separate delivered code. A normal public
 * redemption URL is a plain "Ouvrir le lien" (no secret warning) unless it
 * embeds a sensitive token. Plain local/manual deliveries fall back to a single
 * code.
 */
function DeliveredCodeCard({
  delivered,
  index,
}: {
  delivered: DeliveredCodeDTO;
  index?: number;
}) {
  const fields = delivered.fields;
  const deliveredAt = delivered.deliveredAt ? (
    <p className="text-[11.5px] text-[#646A77]">Livré le {formatDeliveredAt(delivered.deliveredAt)}</p>
  ) : null;
  if (!fields || fields.length === 0) {
    return (
      <div className="space-y-1.5">
        <CopyCode code={delivered.code} index={index} />
        {deliveredAt}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {deliveredAt}
      {fields.map((field, i) => {
        const hasSecret = Boolean(field.code || field.pin);
        return (
          <div key={i} className="space-y-2.5">
            {/* Group the primary code + its PIN as one credential block. */}
            {hasSecret && (
              <div className="space-y-2">
                {field.code && <CopyCode code={field.code} label="Code livré" index={index} />}
                {field.pin && <CopyCode code={field.pin} label="PIN" />}
              </div>
            )}
            {field.url &&
              (urlHasSensitiveToken(field.url) ? (
                <CopyCode code={field.url} label="Lien d’utilisation" />
              ) : (
                <DeliveredLink url={field.url} />
              ))}
            {field.instructions && (
              <div className="rounded-xl border border-white/[0.06] bg-[#0B0C10] px-4 py-3">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#646A77]">
                  Instructions d’utilisation
                </p>
                <p className="text-sm leading-relaxed text-[#C4C9D4]">{field.instructions}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A normal public redemption URL: shown in plain text with an "Ouvrir le lien"
 * button — never masked and never wrapped in the "Code sécurisé" warning used
 * for real secrets.
 */
function DeliveredLink({ url }: { url: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0B0C10] p-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#646A77]">
        Lien d’utilisation
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0 break-all font-mono text-[13px] text-[#C4C9D4]">{url}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex h-10 shrink-0 items-center px-4 text-xs"
        >
          Ouvrir le lien
        </a>
      </div>
    </div>
  );
}

// ─── Shared pieces ──────────────────────────────────────────────────────────

function MethodGlyph({ method, small }: { method: PaymentMethodDTO; small?: boolean }) {
  const size = small ? "h-[34px] w-[34px] text-[11px] rounded-[9px]" : "h-[42px] w-[42px] text-base rounded-[11px]";
  const initials = (method.initials || method.name.slice(0, 3)).slice(0, 4).toUpperCase();
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden border border-white/[0.08] font-mono font-semibold text-[#EAF0FF] ${size}`}
      style={{
        background: `linear-gradient(145deg, ${method.accentColor}, ${method.accentColor}22)`,
      }}
    >
      {method.logoUrl && method.logoType !== "initials" ? (
        <img src={method.logoUrl} alt={method.name} className="h-full w-full object-contain p-1.5" />
      ) : (
        initials
      )}
    </span>
  );
}

function CopyButton({
  copied,
  onClick,
  variant = "ghost",
}: {
  copied: boolean;
  onClick: () => void;
  variant?: "ghost" | "primary";
}) {
  const base =
    "flex shrink-0 items-center justify-center gap-1.5 font-semibold transition-all";
  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} h-10 rounded-[11px] px-4 text-[13.5px] ${
          copied
            ? "border border-[rgba(91,201,140,0.4)] bg-[rgba(91,201,140,0.16)] text-[#5BC98C]"
            : "bg-accent text-white shadow-[0_6px_16px_rgba(62,123,250,0.3)]"
        }`}
      >
        <CopyIcon className="h-3.5 w-3.5" />
        {copied ? "Copié" : "Copier"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} rounded-[9px] text-[12.5px] max-[899px]:h-10 max-[899px]:w-10 min-[900px]:h-[34px] min-[900px]:px-3 ${
        copied
          ? "border border-[rgba(91,201,140,0.4)] bg-[rgba(91,201,140,0.14)] text-[#5BC98C]"
          : "border border-white/10 bg-[#12141B] text-[#9FB8FF]"
      }`}
      aria-label="Copier"
    >
      <CopyIcon className="h-3.5 w-3.5" />
      <span className="max-[899px]:hidden">{copied ? "Copié" : "Copier"}</span>
    </button>
  );
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1048576).toFixed(1)} Mo`;
}

function validateProofFile(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const validType = file.type ? ALLOWED_PROOF_TYPES.has(file.type) : ALLOWED_PROOF_EXTENSIONS.has(extension);
  const validExtension = ALLOWED_PROOF_EXTENSIONS.has(extension);
  if (!validType || !validExtension) {
    return "Format non supporté. Utilisez PNG, JPG, JPEG ou PDF.";
  }
  if (file.size > MAX_PROOF_SIZE_BYTES) {
    return "Fichier trop volumineux. Taille maximum : 5 Mo.";
  }
  return "";
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) throw new Error("Clipboard copy failed");
}

// ─── Icons (Feather-style, stroke ~1.9) ─────────────────────────────────────

type IconProps = { className?: string };

function svgProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

function CheckIcon({ className, stroke = "currentColor", width = 2 }: { className?: string; stroke?: string; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function CopyIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)} strokeWidth={2}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#5BC98C" strokeWidth={2} className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function ClockIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function InfoIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)} strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
function UploadIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function FileIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function CloseIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)} strokeWidth={2}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function SendIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function ChevronIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)} strokeWidth={2}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function SwitchIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)} strokeWidth={2}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function ChatIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function AlertIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)} strokeWidth={2}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function AlertCircleIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)} strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
function RefundIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)} strokeWidth={2}>
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}
function PopupIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
