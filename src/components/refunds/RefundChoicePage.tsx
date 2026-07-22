"use client";

import { useMemo, useState } from "react";
import {
  submitRefundChoiceAction,
  type RefundTokenContext,
} from "@/app/actions/refunds";
import { REFUND_RESOLUTION_LABELS } from "@/lib/refunds/status";
import { formatMAD } from "@/lib/format";
import type { RefundResolutionType } from "@/lib/types";
import type { ReplacementVariant } from "@/lib/db/refundsQuery";

/**
 * Secure "choose your resolution" page shown after a request is approved. The
 * customer picks one of the resolutions the admin offered — refund to the
 * original method, Ghost Credit, or a same-value replacement — with an optional
 * support rating. Submitting is single-use and moves the case to "Choix reçu".
 */
export default function RefundChoicePage({
  token,
  ctx,
}: {
  token: string;
  ctx: RefundTokenContext;
}) {
  const [choice, setChoice] = useState<RefundResolutionType | null>(null);
  const [variant, setVariant] = useState<ReplacementVariant | null>(null);
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const amount = ctx.currency === "MAD" ? formatMAD(ctx.amountMad) : `${ctx.amountMad} ${ctx.currency}`;
  const replacementUnavailable =
    ctx.offeredResolutions.includes("REPLACEMENT_PRODUCT") && ctx.replacementVariants.length === 0;

  const needsSignIn = useMemo(
    () => choice === "GHOST_CREDIT" && ctx.isGuest && !ctx.accountMatches,
    [choice, ctx.isGuest, ctx.accountMatches],
  );

  const canConfirm =
    !!choice &&
    !needsSignIn &&
    (choice !== "REPLACEMENT_PRODUCT" || !!variant);

  const submit = async () => {
    setError("");
    if (!choice) return;
    setSubmitting(true);
    try {
      const res = await submitRefundChoiceAction({
        token,
        type: choice,
        selectedVariantId: variant?.variantId ?? null,
        replacementLabel: variant ? `${variant.productName} · ${variant.variantName}` : null,
        selectedProductId: variant?.productSlug ?? null,
        supportRating: rating,
        supportComment: comment || null,
      });
      if (res.ok) {
        setDone(true);
      } else if (res.needsAccount) {
        setError("Connectez-vous avec l’e-mail de la commande pour recevoir le crédit.");
        setConfirming(false);
      } else {
        setError(res.error || "Envoi impossible.");
        setConfirming(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-green-500/15 text-2xl">
          ✓
        </div>
        <h1 className="text-xl font-semibold text-foreground">Choix confirmé</h1>
        <p className="mt-2 text-sm text-muted">
          Merci ! Votre choix a bien été enregistré pour la demande {ctx.refundNumber}. Notre équipe
          finalise le traitement.
        </p>
      </main>
    );
  }

  const currentPath = `/refund/${token}`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-xl font-semibold text-foreground">Choisissez votre solution</h1>
      <p className="mt-1 text-sm text-muted">
        Demande {ctx.refundNumber} · Commande {ctx.orderNumber}
      </p>
      <p className="mt-2 text-sm text-foreground">
        Montant remboursable approuvé : <span className="font-semibold">{amount}</span>
      </p>

      <div className="mt-6 space-y-3">
        {ctx.offeredResolutions.includes("ORIGINAL_PAYMENT_METHOD") && (
          <ChoiceCard
            selected={choice === "ORIGINAL_PAYMENT_METHOD"}
            onSelect={() => setChoice("ORIGINAL_PAYMENT_METHOD")}
            title={REFUND_RESOLUTION_LABELS.ORIGINAL_PAYMENT_METHOD}
          >
            <p>
              Le remboursement sera envoyé via le moyen de paiement utilisé pour la commande
              {ctx.originalPaymentMethodLabel ? ` (${ctx.originalPaymentMethodLabel})` : ""}.
            </p>
            <p className="mt-1 text-xs text-muted">
              Le traitement prend généralement 1 à 2 jours ouvrables après confirmation de votre
              choix. Le délai d’apparition des fonds peut ensuite dépendre de votre banque ou
              prestataire.
            </p>
          </ChoiceCard>
        )}

        {ctx.offeredResolutions.includes("GHOST_CREDIT") && (
          <ChoiceCard
            selected={choice === "GHOST_CREDIT"}
            onSelect={() => setChoice("GHOST_CREDIT")}
            title={`Recevoir ${amount} en Crédit Ghost`}
          >
            <p>
              Le crédit sera ajouté à votre compte ghost.ma et pourra être utilisé sur une prochaine
              commande.
            </p>
            {needsSignIn && (
              <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                Pour recevoir le crédit, connectez-vous ou créez un compte avec l’e-mail de votre
                commande.{" "}
                <a
                  href={`/login?next=${encodeURIComponent(currentPath)}`}
                  className="underline"
                >
                  Se connecter
                </a>
              </div>
            )}
          </ChoiceCard>
        )}

        {ctx.offeredResolutions.includes("REPLACEMENT_PRODUCT") && (
          <ChoiceCard
            selected={choice === "REPLACEMENT_PRODUCT"}
            onSelect={() => !replacementUnavailable && setChoice("REPLACEMENT_PRODUCT")}
            title="Choisir un autre produit de même valeur"
            disabled={replacementUnavailable}
          >
            {replacementUnavailable ? (
              <p className="text-muted">
                Aucun produit de même valeur n’est actuellement disponible. Veuillez choisir une
                autre solution.
              </p>
            ) : (
              choice === "REPLACEMENT_PRODUCT" && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ctx.replacementVariants.map((v) => (
                    <button
                      type="button"
                      key={v.variantId}
                      onClick={() => setVariant(v)}
                      className={`rounded-xl border p-2 text-left text-xs transition-colors ${
                        variant?.variantId === v.variantId
                          ? "border-accent bg-accent/10"
                          : "border-border hover:border-accent/40"
                      }`}
                    >
                      {v.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.imageUrl}
                          alt={v.productName}
                          className="mb-1 h-16 w-full rounded-lg object-cover"
                        />
                      ) : (
                        <div className="mb-1 h-16 w-full rounded-lg bg-card" />
                      )}
                      <div className="font-medium text-foreground">{v.productName}</div>
                      <div className="text-muted">{v.variantName}</div>
                      {v.region && <div className="text-muted">{v.region}</div>}
                      <div className="mt-0.5 font-semibold text-foreground">
                        {formatMAD(v.priceMad)}
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}
          </ChoiceCard>
        )}
      </div>

      {/* Optional support feedback */}
      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-medium text-foreground">
          Comment évaluez-vous l’assistance reçue ?
        </div>
        <div className="text-xs text-muted">Cette réponse est facultative.</div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setRating(rating === "up" ? null : "up")}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              rating === "up" ? "border-green-500 text-green-400" : "border-border text-muted"
            }`}
          >
            👍
          </button>
          <button
            type="button"
            onClick={() => setRating(rating === "down" ? null : "down")}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              rating === "down" ? "border-red-500 text-red-400" : "border-border text-muted"
            }`}
          >
            👎
          </button>
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Commentaire (facultatif)"
          className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={!canConfirm}
        className="btn-primary mt-6 w-full disabled:opacity-50"
      >
        Confirmer mon choix
      </button>

      {confirming && choice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">Confirmer votre choix</h2>
            <div className="mt-3 space-y-1 text-sm text-foreground">
              <div>
                Solution : <span className="font-medium">{REFUND_RESOLUTION_LABELS[choice]}</span>
              </div>
              {variant && (
                <div>
                  Produit : <span className="font-medium">{variant.productName} · {variant.variantName}</span>
                </div>
              )}
              <div>
                Montant : <span className="font-medium">{amount}</span>
              </div>
            </div>
            {choice === "ORIGINAL_PAYMENT_METHOD" && (
              <p className="mt-2 text-xs text-muted">
                Un remboursement vers le moyen de paiement d’origine est généralement traité sous 1 à
                2 jours ouvrables. Le délai d’apparition des fonds peut ensuite dépendre de votre
                banque ou prestataire.
              </p>
            )}
            <p className="mt-2 text-xs text-muted">
              Ce choix ne peut pas être modifié sans contacter l’assistance.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-muted"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="btn-primary flex-1 disabled:opacity-60"
              >
                {submitting ? "…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ChoiceCard({
  selected,
  onSelect,
  title,
  children,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`block w-full rounded-2xl border p-4 text-left transition-colors ${
        selected ? "border-accent bg-accent/[0.06]" : "border-border hover:border-accent/40"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`grid h-4 w-4 place-items-center rounded-full border ${
            selected ? "border-accent" : "border-muted"
          }`}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="mt-1.5 pl-6 text-sm text-muted">{children}</div>
    </button>
  );
}
