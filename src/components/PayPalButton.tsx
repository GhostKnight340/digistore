"use client";

import { useEffect, useRef, useState } from "react";
import { createPaypalOrderAction, capturePaypalOrderAction } from "@/app/actions/paypal";

interface PayPalButtonsInstance {
  render: (container: HTMLElement) => void;
  close?: () => void;
}

interface PayPalNamespace {
  Buttons: (config: Record<string, unknown>) => PayPalButtonsInstance;
}

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadPaypalSdk(clientId: string, currency: string): Promise<void> {
  if (typeof window !== "undefined" && window.paypal) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error("PayPal SDK failed to load."));
    };
    document.body.appendChild(script);
  });
  return sdkLoadPromise;
}

/**
 * Renders the official PayPal JS SDK buttons for a single Ghost order.
 * Order creation and capture always go through server actions
 * (createPaypalOrderAction / capturePaypalOrderAction) — this component
 * never talks to PayPal directly and never handles a secret.
 */
export default function PayPalButton({
  orderId,
  currency,
  onConfirmed,
  onError,
}: {
  orderId: string;
  currency: string;
  onConfirmed: () => void;
  onError: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "processing" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId) {
      setStatus("error");
      onError("PayPal n'est pas configuré pour le moment.");
      return;
    }

    loadPaypalSdk(clientId, currency)
      .then(() => {
        if (cancelled || !containerRef.current || !window.paypal) return;
        window.paypal
          .Buttons({
            style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },
            createOrder: async () => {
              if (busyRef.current) throw new Error("Une opération est déjà en cours.");
              busyRef.current = true;
              setStatus("processing");
              try {
                const res = await createPaypalOrderAction(orderId);
                if (!res.ok || !res.paypalOrderId) {
                  throw new Error(res.error || "Impossible de créer le paiement PayPal.");
                }
                return res.paypalOrderId;
              } finally {
                busyRef.current = false;
                setStatus("ready");
              }
            },
            onApprove: async (data: { orderID: string }) => {
              busyRef.current = true;
              setStatus("processing");
              try {
                const res = await capturePaypalOrderAction(orderId, data.orderID);
                if (!res.ok) {
                  onError(res.error || "La capture du paiement a échoué.");
                  return;
                }
                if (res.status === "confirmed") {
                  onConfirmed();
                } else {
                  onError(
                    "Paiement approuvé, vérification en cours. Cette page se mettra à jour automatiquement.",
                  );
                }
              } catch {
                onError(
                  "La capture du paiement a échoué. Si le montant a été débité, contactez le support.",
                );
              } finally {
                busyRef.current = false;
                setStatus("ready");
              }
            },
            onCancel: () => {
              busyRef.current = false;
              setStatus("ready");
            },
            onError: (err: unknown) => {
              console.error("[paypal:button]", err instanceof Error ? err.message : "unknown error");
              busyRef.current = false;
              onError("Une erreur PayPal est survenue. Réessayez.");
              setStatus("ready");
            },
          })
          .render(containerRef.current);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          onError("Impossible de charger PayPal. Vérifiez votre connexion et réessayez.");
        }
      });

    return () => {
      cancelled = true;
    };
    // Re-render fresh buttons only if the order or currency actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, currency]);

  return (
    <div>
      <div ref={containerRef} aria-busy={status === "processing"} />
      {status === "loading" && <p className="mt-2 text-xs text-muted">Chargement de PayPal…</p>}
      {status === "processing" && <p className="mt-2 text-xs text-muted">Traitement du paiement…</p>}
    </div>
  );
}
