"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatMAD, formatDate } from "@/lib/format";
import {
  orderStatusBadgeClass,
  isDelivered,
  isPendingPayment,
  isPaymentSubmitted,
  isPaymentConfirmed,
} from "@/lib/orderStatus";
import { getPaymentPageDataAction, submitPaymentAction } from "@/app/actions/payments";
import CopyCode from "@/components/CopyCode";
import ProductArt from "@/components/ProductArt";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import type { PaymentPageDataDTO } from "@/app/actions/payments";
import type { BankDTO, CryptoWalletDTO, PaymentMethodConfigDTO } from "@/lib/dto";

const METHOD_LABELS: Record<string, string> = {
  bank: "Virement bancaire",
  usdt: "USDT",
  paypal: "PayPal",
  card: "Carte bancaire",
  test: "Paiement test",
};

export default function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<PaymentPageDataDTO | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await getPaymentPageDataAction(id);
      setData(result);
    } catch (error) {
      console.error("[payment] Failed to load order", error);
      setError("Impossible de charger la commande. Veuillez reessayer.");
    } finally {
      setReady(true);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const status = data?.order.status;
  const shouldPoll =
    ready &&
    status !== "delivered" &&
    status !== "rejected" &&
    status !== "payment_issue" &&
    status !== "cancelled";

  useEffect(() => {
    if (!shouldPoll) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [shouldPoll, refresh]);

  if (!ready) {
    return (
      <div className="container-page py-20 text-center text-muted">
        Chargement...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container-page py-10">
        <div className="card grid place-items-center px-6 py-20 text-center">
          <p className="text-lg font-semibold text-white">
            {error || "Commande introuvable"}
          </p>
          <Link href="/products" className="btn-primary mt-6">
            Parcourir le catalogue
          </Link>
        </div>
      </div>
    );
  }

  const { order, config } = data;
  const methodConfig = config.methods[order.paymentMethod] ?? null;
  const whatsapp = config.support.whatsappNumber.replace(/\s/g, "");

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* ── Header ── */}
        <section className="rounded-[22px] border border-border-strong bg-gradient-to-b from-surface2 to-base px-5 py-8 text-center shadow-card sm:px-8">
          <span className={`chip ${orderStatusBadgeClass(order.status)}`}>
            {statusLabel(order.status)}
          </span>
          <h1 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
            {pageTitle(order.status)}
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
            {pageSubtitle(order.status)}
          </p>

          <dl className="mx-auto mt-6 grid max-w-xl gap-px overflow-hidden rounded-2xl border border-border bg-border/60 text-left sm:grid-cols-2">
            <VaultMeta label="Commande" value={`#${order.id.slice(-8).toUpperCase()}`} />
            <VaultMeta label="Méthode" value={METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod} />
            <VaultMeta label="Total" value={formatMAD(order.totalMad)} />
            <VaultMeta label="Date" value={formatDate(order.createdAt)} />
          </dl>
        </section>

        {/* ── Status-specific content ── */}
        {isPendingPayment(order.status) && (
          <PendingPaymentSection
            orderId={order.id}
            totalMad={order.totalMad}
            paymentMethod={order.paymentMethod}
            methodConfig={methodConfig ?? null}
            banks={config.banks}
            wallets={config.wallets}
            onSubmitted={refresh}
            setError={setError}
          />
        )}

        {isPaymentSubmitted(order.status) && (
          <StatusCard
            icon="🔍"
            iconClass="border-blue-500/30 bg-blue-500/15"
            title="Confirmation en cours"
            body="Votre paiement a été soumis. Nous le vérifions actuellement. Cette page se met à jour automatiquement."
          />
        )}

        {order.status === "payment_confirmed" && !isDelivered(order.status) && (
          <StatusCard
            icon="✓"
            iconClass="border-accent/30 bg-accent/15"
            iconTextClass="text-accent"
            title="Paiement confirmé"
            body="Votre paiement a été confirmé. Votre commande est prête pour livraison. Nous vous livrerons votre code très bientôt."
          />
        )}

        {order.status === "payment_issue" && (
          <IssueCard
            title="Une erreur semble s'être produite lors du paiement."
            body="Veuillez contacter notre support WhatsApp avec votre numéro de commande."
            whatsapp={whatsapp}
            orderId={order.id}
          />
        )}

        {order.status === "rejected" && (
          <IssueCard
            title="Paiement refusé"
            body="Nous n'avons pas pu confirmer votre paiement. Veuillez nous contacter sur WhatsApp avec votre numéro de commande."
            whatsapp={whatsapp}
            orderId={order.id}
            isRejection
          />
        )}

        {isDelivered(order.status) && (
          <DeliveredSection order={order} />
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ── Order summary ── */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-white">Articles commandés</h2>
          <ul className="mt-3 space-y-2">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between text-sm text-muted">
                <span>{item.name} <span className="text-muted/70">×{item.quantity}</span></span>
                <span className="text-white">{formatMAD(item.unitPriceMad * item.quantity)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Support footer ── */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-white">Besoin d'aide?</h2>
          <p className="mt-1 text-xs text-muted">
            Contactez le support avec votre numéro de commande:{" "}
            <span className="font-mono text-text">{order.id}</span>
          </p>
          <a
            href={`https://wa.me/${whatsapp}?text=Bonjour, j'ai une question concernant ma commande ${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-green-400 hover:text-green-300"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.13.553 4.13 1.523 5.874L0 24l6.305-1.494A11.924 11.924 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.88 0-3.655-.51-5.18-1.396l-.367-.219-3.811.902.962-3.706-.24-.381A10 10 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
            </svg>
            WhatsApp Support
          </a>
        </section>

        <div className="flex gap-3">
          <Link href="/account" className="btn-ghost flex-1 text-center">
            Mes commandes
          </Link>
          <Link href="/products" className="btn-primary flex-1 text-center">
            Retour à la boutique
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Pending Payment ─────────────────────────────────────────────────

function PendingPaymentSection({
  orderId,
  totalMad,
  paymentMethod,
  methodConfig,
  banks,
  wallets,
  onSubmitted,
  setError,
}: {
  orderId: string;
  totalMad: number;
  paymentMethod: string;
  methodConfig: PaymentMethodConfigDTO | null;
  banks: BankDTO[];
  wallets: CryptoWalletDTO[];
  onSubmitted: () => void;
  setError: (e: string) => void;
}) {
  const [selectedBank, setSelectedBank] = useState<BankDTO | null>(banks[0] ?? null);
  const [selectedNetwork, setSelectedNetwork] = useState<string>(
    wallets.find((w) => w.network === "TRC20") ? "TRC20" : wallets[0]?.network ?? "TRC20",
  );
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedWallet = wallets.find((w) => w.network === selectedNetwork);
  const orderRef = orderId.slice(-8).toUpperCase();
  const proofRequired = methodConfig?.proofRequired ?? true;

  async function handleSubmit() {
    if (proofRequired && !proofFile) {
      setError("Veuillez télécharger un justificatif de paiement.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("orderId", orderId);
      if (proofFile) fd.append("proof", proofFile);
      const res = await submitPaymentAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Une erreur est survenue.");
      } else {
        onSubmitted();
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  function copyAddress(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      {/* Instructions header */}
      {methodConfig?.instructions && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-muted">
          {methodConfig.instructions}
        </div>
      )}

      {/* ── Bank Transfer ── */}
      {paymentMethod === "bank" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-white">Informations de virement</h2>

          {banks.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Les coordonnées bancaires sont en cours de configuration. Veuillez réessayer ultérieurement.
            </p>
          ) : (
            <>
              {banks.length > 1 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-faint">Choisissez une banque</p>
                  <div className="flex flex-wrap gap-2">
                    {banks.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBank(b)}
                        className={`rounded-lg border px-3 py-1.5 text-sm ${
                          selectedBank?.id === b.id
                            ? "border-accent bg-accent/15 text-white"
                            : "border-border text-muted"
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedBank && (
                <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border bg-border/60">
                  {selectedBank.name && <BankField label="Banque" value={selectedBank.name} />}
                  {selectedBank.accountHolder && <BankField label="Titulaire" value={selectedBank.accountHolder} />}
                  {selectedBank.rib && <BankField label="RIB" value={selectedBank.rib} copyable />}
                  {selectedBank.iban && <BankField label="IBAN" value={selectedBank.iban} copyable />}
                  {selectedBank.accountNumber && <BankField label="Compte" value={selectedBank.accountNumber} copyable />}
                  {selectedBank.swift && <BankField label="SWIFT/BIC" value={selectedBank.swift} />}
                  <BankField label="Montant" value={formatMAD(totalMad)} />
                  <BankField label="Référence" value={`CMD-${orderRef}`} copyable />
                </dl>
              )}

              {selectedBank?.instructions && (
                <p className="mt-3 text-sm text-muted">{selectedBank.instructions}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── USDT ── */}
      {paymentMethod === "usdt" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-white">Paiement USDT</h2>

          {wallets.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Les adresses USDT sont en cours de configuration. Veuillez réessayer ultérieurement.
            </p>
          ) : (
            <>
              <div className="mt-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-faint">Réseau</p>
                <div className="flex gap-2">
                  {["TRC20", "BEP20"].filter((n) => wallets.some((w) => w.network === n)).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSelectedNetwork(n)}
                      className={`rounded-lg border px-4 py-1.5 text-sm font-medium ${
                        selectedNetwork === n
                          ? "border-accent bg-accent/15 text-white"
                          : "border-border text-muted"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {selectedWallet ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-faint">Adresse {selectedWallet.network}</p>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                      <code className="min-w-0 flex-1 break-all text-xs text-white">
                        {selectedWallet.address}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyAddress(selectedWallet.address)}
                        className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-white"
                      >
                        {copied ? "Copié ✓" : "Copier"}
                      </button>
                    </div>
                  </div>
                  <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border/60">
                    <BankField label="Réseau" value={selectedWallet.network} />
                    <BankField label="Montant" value={`${(totalMad / 10).toFixed(2)} USDT`} />
                    <BankField label="Référence" value={`CMD-${orderRef}`} />
                  </dl>
                  {selectedWallet.instructions && (
                    <p className="text-sm text-muted">{selectedWallet.instructions}</p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Aucun portefeuille disponible pour le réseau {selectedNetwork}.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PayPal ── */}
      {paymentMethod === "paypal" && (
        <div className="card p-5 text-center">
          <h2 className="text-base font-semibold text-white">Paiement PayPal</h2>
          <p className="mt-2 text-sm text-muted">
            {methodConfig?.paypalEmail
              ? `Envoyez ${formatMAD(totalMad)} à : ${methodConfig.paypalEmail}`
              : "Les instructions PayPal seront bientôt disponibles."}
          </p>
          <div className="mt-5 inline-block rounded-2xl border border-border bg-[#0070BA]/10 px-8 py-5 text-center">
            <div className="text-2xl font-bold text-[#003087]">Pay</div>
            <div className="text-2xl font-bold text-[#009cde]">Pal</div>
            <p className="mt-2 text-xs text-muted">{formatMAD(totalMad)}</p>
            <p className="mt-1 text-[10px] text-faint">Interface de paiement à venir</p>
          </div>
        </div>
      )}

      {/* ── Card ── */}
      {paymentMethod === "card" && (
        <div className="card p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-border bg-surface text-2xl">
            💳
          </span>
          <h2 className="mt-4 text-base font-semibold text-white">
            {methodConfig?.cardMessage ?? "Paiement par carte bientôt disponible."}
          </h2>
          <p className="mt-2 text-sm text-muted">
            Veuillez choisir une autre méthode de paiement.
          </p>
        </div>
      )}

      {/* ── Proof Upload + Submit (not for card) ── */}
      {paymentMethod !== "card" && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white">
            {proofRequired ? "Justificatif de paiement (requis)" : "Justificatif de paiement (optionnel)"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Formats acceptés: PNG, JPG, JPEG, PDF · Taille max: 5 Mo
          </p>

          <div className="mt-3">
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              className="hidden"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-4 py-4 text-sm text-muted hover:border-accent/50 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              {proofFile ? proofFile.name : "Sélectionner un fichier"}
            </button>
            {proofFile && (
              <button
                type="button"
                onClick={() => { setProofFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="mt-1 text-xs text-muted hover:text-red-400"
              >
                Supprimer le fichier
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (proofRequired && !proofFile)}
            className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Envoi en cours..." : "J'ai effectué le paiement"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Section: Delivered ───────────────────────────────────────────────────────

function DeliveredSection({ order }: { order: PaymentPageDataDTO["order"] }) {
  const { getProduct } = useProductCatalog();
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-green-500/30 bg-green-500/15 text-xl">
          ✓
        </span>
        <p className="mt-3 font-semibold text-green-300">Commande livrée</p>
        <p className="mt-1 text-sm text-muted">
          Vos codes sont disponibles ci-dessous. Révélez-les uniquement lorsque vous êtes prêt à les utiliser.
        </p>
      </div>

      {order.items.map((item) => {
        const product = getProduct(item.productId);
        const codes = order.deliveredCodes
          .filter((d) => d.productId === item.productId)
          .map((d) => d.code);

        return (
          <article key={item.id} className="card overflow-hidden">
            <div className="grid gap-5 p-5 sm:grid-cols-[100px_1fr]">
              {product && (
                <ProductArt
                  category={product.category}
                  className="h-20 w-full rounded-xl sm:h-20 sm:w-24"
                />
              )}
              <div>
                <h3 className="font-semibold text-white">{item.name}</h3>
                <p className="mt-1 text-sm text-muted">Quantité: {item.quantity}</p>
              </div>
            </div>
            <div className="border-t border-border bg-base/35 p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
                Code{codes.length > 1 ? "s" : ""} livrés
              </p>
              <div className="space-y-3">
                {codes.map((code, i) => (
                  <CopyCode key={`${code}-${i}`} code={code} index={i} />
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusCard({
  icon,
  iconClass,
  iconTextClass,
  title,
  body,
}: {
  icon: string;
  iconClass: string;
  iconTextClass?: string;
  title: string;
  body: string;
}) {
  return (
    <div className="card p-6 text-center">
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full border text-2xl ${iconClass} ${iconTextClass ?? ""}`}>
        {icon}
      </span>
      <p className="mt-4 font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function IssueCard({
  title,
  body,
  whatsapp,
  orderId,
  isRejection,
}: {
  title: string;
  body: string;
  whatsapp: string;
  orderId: string;
  isRejection?: boolean;
}) {
  return (
    <div className={`card p-6 text-center border ${isRejection ? "border-red-500/30 bg-red-500/5" : "border-orange-500/30 bg-orange-500/5"}`}>
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full border text-2xl ${isRejection ? "border-red-500/30 bg-red-500/15" : "border-orange-500/30 bg-orange-500/15"}`}>
        {isRejection ? "✕" : "⚠"}
      </span>
      <p className="mt-4 font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      <a
        href={`https://wa.me/${whatsapp}?text=Bonjour, j'ai un problème avec ma commande ${orderId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.13.553 4.13 1.523 5.874L0 24l6.305-1.494A11.924 11.924 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.88 0-3.655-.51-5.18-1.396l-.367-.219-3.811.902.962-3.706-.24-.381A10 10 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
        </svg>
        Contacter le support WhatsApp
      </a>
    </div>
  );
}

function BankField({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between bg-surface px-4 py-3">
      <div>
        <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
        <dd className="mt-0.5 font-mono text-sm text-white">{value}</dd>
      </div>
      {copyable && (
        <button
          type="button"
          onClick={() =>
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
          className="shrink-0 text-xs text-muted hover:text-white"
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
      )}
    </div>
  );
}

function VaultMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending_payment: "En attente de paiement",
    payment_submitted: "Vérification en cours",
    payment_confirmed: "Paiement confirmé",
    payment_issue: "Problème de paiement",
    rejected: "Paiement refusé",
    delivered: "Commande livrée",
    refunded: "Remboursé",
    cancelled: "Annulée",
  };
  return map[status] ?? status;
}

function pageTitle(status: string): string {
  switch (status) {
    case "pending_payment": return "Effectuez votre paiement";
    case "payment_submitted": return "Vérification en cours";
    case "payment_confirmed": return "Paiement confirmé";
    case "payment_issue": return "Problème de paiement";
    case "rejected": return "Paiement refusé";
    case "delivered": return "Vos codes sont prêts";
    default: return "Statut de commande";
  }
}

function pageSubtitle(status: string): string {
  switch (status) {
    case "pending_payment":
      return "Suivez les instructions ci-dessous pour finaliser votre paiement.";
    case "payment_submitted":
      return "Votre paiement a été soumis. Nous le vérifions actuellement. Cette page se met à jour automatiquement.";
    case "payment_confirmed":
      return "Votre paiement a été confirmé. Votre commande est en cours de préparation.";
    case "payment_issue":
      return "Une anomalie a été détectée. Contactez notre support pour résoudre le problème.";
    case "rejected":
      return "Nous n'avons pas pu valider votre paiement.";
    case "delivered":
      return "Vos codes sont disponibles ci-dessous. Affichez-les uniquement lorsque vous êtes prêt à les utiliser.";
    default:
      return "";
  }
}
