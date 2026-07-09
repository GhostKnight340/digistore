"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getOrderDiscordContextAction,
  sendOrderToDiscordAction,
  type OrderDiscordContext,
} from "@/app/actions/discord";

function DiscordGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#5865F2" aria-hidden>
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

/**
 * Compact, secondary Discord control on an already-delivered order (Flows B/C).
 * Never competes with the delivered codes or order status. All state comes from
 * the persisted DB context (no live Discord probe); refreshless via router.
 */
export default function DeliveredOrderDiscord({
  orderId,
  orderPathSegment,
}: {
  orderId: string;
  orderPathSegment: string;
}) {
  const router = useRouter();
  const [ctx, setCtx] = useState<OrderDiscordContext | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    getOrderDiscordContextAction(orderId)
      .then((c) => active && c && setCtx(c))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [orderId]);

  if (!ctx) return null;

  const shell =
    "rounded-2xl border border-[rgba(88,101,242,0.22)] bg-[rgba(88,101,242,0.06)] px-[18px] py-3.5";
  const sent = ctx.deliveryStatus === "SENT";

  async function confirmSend() {
    setSending(true);
    setFeedback(null);
    const res = await sendOrderToDiscordAction(orderId);
    setSending(false);
    setModalOpen(false);
    if (res.ok) {
      setFeedback({ kind: "ok", text: "Envoyé sur Discord." });
      router.refresh();
    } else {
      setFeedback({ kind: "error", text: res.error || "Envoi impossible." });
    }
  }

  // Guests / non-owners: nothing to do here.
  if (!ctx.owner && ctx.state !== "guest") return null;

  return (
    <div className={shell}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <DiscordGlyph className="h-5 w-5" />
          <div>
            {ctx.state === "activated" ? (
              sent ? (
                <p className="text-sm font-semibold text-[#5BC98C]">Envoyé sur Discord ✓</p>
              ) : (
                <p className="text-sm font-semibold text-white">Recevoir aussi sur Discord</p>
              )
            ) : (
              <p className="text-sm font-semibold text-white">Recevoir cette commande sur Discord</p>
            )}
            <p className="text-xs text-[#9A9FAB]">
              {ctx.state === "activated"
                ? sent
                  ? "Cette commande a été envoyée en message privé."
                  : `Envoyer les informations en message privé${
                      ctx.discordUsername ? ` à @${ctx.discordUsername}` : ""
                    }.`
                : ctx.state === "connected_not_activated"
                  ? "Activez les messages Discord pour envoyer cette commande directement en message privé."
                  : "Connectez votre compte Discord pour utiliser cette option."}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {ctx.state === "activated" ? (
            sent ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={sending}
                className="btn-ghost text-xs disabled:opacity-60"
              >
                Renvoyer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={sending}
                className="btn-primary text-xs disabled:opacity-60"
              >
                Envoyer aussi sur Discord
              </button>
            )
          ) : ctx.state === "connected_not_activated" ? (
            <a href="/account" className="btn-ghost text-xs">
              Activer Discord
            </a>
          ) : (
            <a
              href={`/auth/discord?mode=link&next=${encodeURIComponent(`/payment/${orderPathSegment}`)}`}
              className="btn-ghost text-xs"
            >
              Connecter Discord
            </a>
          )}
        </div>
      </div>

      {feedback && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            feedback.kind === "ok" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}
        >
          {feedback.text}
        </p>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !sending && setModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border-strong bg-surface2 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white">Envoyer sur Discord ?</h3>
            <p className="mt-2 text-sm text-muted">
              Les informations de cette commande seront envoyées en message privé sur votre compte
              Discord connecté.
            </p>
            {ctx.discordUsername && (
              <p className="mt-2 text-sm text-[#9FB8FF]">Compte Discord : @{ctx.discordUsername}</p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={sending}
                className="btn-ghost flex-1 text-sm disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmSend}
                disabled={sending}
                className="btn-primary flex-1 text-sm disabled:opacity-60"
              >
                {sending ? "Envoi…" : "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
