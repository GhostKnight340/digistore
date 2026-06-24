"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getProduct } from "@/lib/products";
import { formatDate } from "@/lib/format";
import {
  isDelivered,
  orderStatusLabel,
  orderStatusBadgeClass,
} from "@/lib/orderStatus";
import { getCustomerOrderAction } from "@/app/actions/orders";
import type { CustomerOrderDTO } from "@/lib/dto";
import ProductArt from "@/components/ProductArt";
import CopyCode from "@/components/CopyCode";

export default function DeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<CustomerOrderDTO | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const data = await getCustomerOrderAction(id);
    setOrder(data);
    setReady(true);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while the order is not yet delivered so the code appears
  // automatically once an admin fulfills it (no manual reload needed).
  const delivered = order ? isDelivered(order.status) : false;
  useEffect(() => {
    if (!ready || delivered) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [ready, delivered, refresh]);

  if (!ready) {
    return (
      <div className="container-page py-20 text-center text-muted">
        Chargement...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container-page py-10">
        <div className="card grid place-items-center px-6 py-20 text-center">
          <p className="text-lg font-semibold text-white">
            Commande introuvable
          </p>
          <Link href="/products" className="btn-primary mt-6">
            Parcourir le catalogue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-4xl">
        <section className="rounded-[22px] border border-border-strong bg-gradient-to-b from-surface2 to-base px-5 py-8 text-center shadow-card sm:px-8">
          <span className={`chip ${orderStatusBadgeClass(order.status)}`}>
            {orderStatusLabel(order.status)}
          </span>
          <h1 className="mt-4 text-3xl font-bold text-white">
            {delivered
              ? "Vos codes sont prêts"
              : "Commande en cours de traitement"}
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {delivered
              ? "Les codes ci-dessous sont liés à votre commande. Affichez-les uniquement lorsque vous êtes prêt à les utiliser."
              : "Votre paiement est en cours de vérification. Votre code apparaîtra ici une fois la commande confirmée."}
          </p>
          {!delivered && (
            <button
              type="button"
              onClick={refresh}
              className="btn-ghost mt-5 h-10 px-4 text-xs"
            >
              Actualiser le statut
            </button>
          )}

          <dl className="mx-auto mt-6 grid max-w-2xl gap-px overflow-hidden rounded-2xl border border-border bg-border/60 text-left sm:grid-cols-2">
            <VaultMeta label="ID commande" value={order.id} />
            <VaultMeta label="Date d'achat" value={formatDate(order.createdAt)} />
            <VaultMeta label="Email client" value={order.customerEmail} />
            <VaultMeta
              label="Statut"
              value={orderStatusLabel(order.status)}
              highlight={delivered}
            />
          </dl>
        </section>

        <section className="mt-8 space-y-6">
          {order.items.map((item) => {
            const product = getProduct(item.productId);
            const codes = order.deliveredCodes
              .filter((d) => d.productId === item.productId)
              .map((d) => d.code);
            return (
              <article key={item.id} className="card overflow-hidden">
                <div className="grid gap-5 p-5 sm:grid-cols-[112px_1fr] sm:p-6">
                  {product && (
                    <ProductArt
                      category={product.category}
                      className="h-24 w-full rounded-xl sm:h-24 sm:w-28"
                    />
                  )}

                  <div className="min-w-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          {item.name}
                        </h2>
                        <p className="mt-1 text-sm text-muted">
                          Quantité: {item.quantity}
                        </p>
                      </div>
                      <span
                        className={`chip ${orderStatusBadgeClass(order.status)}`}
                      >
                        {delivered ? "Code prêt" : "En attente"}
                      </span>
                    </div>

                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                      <MiniMeta
                        label="Région"
                        value={product?.region ?? "Non précisée"}
                      />
                      <MiniMeta
                        label="Type de livraison"
                        value={product?.deliveryType ?? "Code numérique"}
                      />
                      <MiniMeta
                        label="Achat"
                        value={formatDate(order.createdAt)}
                      />
                    </dl>
                  </div>
                </div>

                <div className="border-t border-border bg-base/35 p-5 sm:p-6">
                  {delivered ? (
                    <>
                      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-sm font-semibold text-white">
                          Codes livrés
                        </h3>
                        <p className="text-xs text-muted">
                          {codes.length} code
                          {codes.length === 1 ? "" : "s"} disponible
                          {codes.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="space-y-3">
                        {codes.map((code, index) => (
                          <CopyCode
                            key={`${code}-${index}`}
                            code={code}
                            index={index}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5 text-center">
                      <span className="grid mx-auto h-11 w-11 place-items-center rounded-full border border-amber-500/30 bg-amber-500/15 text-xl">
                        ⏳
                      </span>
                      <p className="mt-3 text-sm font-semibold text-white">
                        Votre paiement est en cours de vérification.
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        Votre code apparaîtra ici une fois la commande
                        confirmée.
                      </p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 p-5">
          <h2 className="text-base font-semibold text-white">
            Vos codes restent accessibles
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Votre code est sauvegardé dans votre historique de commandes. Vous
            pouvez revenir à cette page à tout moment depuis votre compte.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link href="/account" className="btn-ghost">
              Historique des commandes
            </Link>
            <Link href="/products" className="btn-primary">
              Retour à la boutique
            </Link>
          </div>
        </section>

        <section className="card mt-6 p-5">
          <h2 className="text-base font-semibold text-white">
            Problème pour utiliser votre code?
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Vérifiez que la région du produit correspond à votre compte.</li>
            <li>Copiez le code exactement comme il apparaît après révélation.</li>
            <li>
              Contactez le support avec votre ID commande:{" "}
              <span className="font-mono text-text">{order.id}</span>.
            </li>
          </ul>
          <Link
            href="/support"
            className="mt-4 inline-flex text-sm font-medium text-accent hover:text-accent-hover"
          >
            Contacter le support
          </Link>
        </section>
      </div>
    </div>
  );
}

function VaultMeta({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd
        className={`mt-1 break-words text-sm font-semibold ${
          highlight ? "text-green-400" : "text-white"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function MiniMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-1 break-words text-xs font-medium text-muted">{value}</dd>
    </div>
  );
}
