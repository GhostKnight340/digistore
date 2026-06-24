"use client";

import Link from "next/link";
import { useStore } from "@/context/StoreContext";
import { formatMAD, formatDate } from "@/lib/format";
import {
  isDelivered,
  orderStatusShort,
  orderStatusBadgeClass,
} from "@/lib/orderStatus";

export default function AccountPage() {
  const { orders, ready } = useStore();

  return (
    <div className="container-page py-10">
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="h-fit">
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-accent/15 text-lg">
                👤
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Invité</p>
                <p className="text-xs text-muted">Non connecté</p>
              </div>
            </div>
            <nav className="mt-5 space-y-1 text-sm">
              <span className="block rounded-lg bg-accent/10 px-3 py-2 font-medium text-white">
                Historique des commandes
              </span>
              <span className="block rounded-lg px-3 py-2 text-muted">
                Profil (bientôt)
              </span>
              <span className="block rounded-lg px-3 py-2 text-muted">
                Paramètres (bientôt)
              </span>
            </nav>
            <Link href="/login" className="btn-ghost mt-4 w-full">
              Connexion / Inscription
            </Link>
          </div>
          <p className="mt-3 px-1 text-xs text-muted">
            Les commandes sont stockées localement dans ce navigateur pour la
            phase 1.
          </p>
        </aside>

        <section>
          <h1 className="text-3xl font-bold text-white">
            Historique des commandes
          </h1>

          {!ready ? (
            <p className="mt-8 text-muted">Chargement...</p>
          ) : orders.length === 0 ? (
            <div className="card mt-8 grid place-items-center px-6 py-20 text-center">
              <span className="text-4xl">📦</span>
              <p className="mt-4 text-lg font-semibold text-white">
                Aucune commande pour le moment
              </p>
              <p className="mt-1 text-sm text-muted">
                Vos commandes apparaîtront ici après achat.
              </p>
              <Link href="/products" className="btn-primary mt-6">
                Parcourir le catalogue
              </Link>
            </div>
          ) : (
            <ul className="mt-8 space-y-4">
              {orders.map((order) => (
                <li key={order.id} className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{order.id}</p>
                      <p className="text-xs text-muted">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`chip ${orderStatusBadgeClass(order.status)}`}
                    >
                      ● {orderStatusShort(order.status)}
                    </span>
                  </div>

                  <div className="my-4 border-t border-border" />

                  <ul className="space-y-1 text-sm text-muted">
                    {order.items.map((item) => (
                      <li key={item.productId} className="flex justify-between">
                        <span>
                          {item.name}{" "}
                          <span className="text-muted/70">
                            ×{item.quantity}
                          </span>
                        </span>
                        <span className="text-white">
                          {formatMAD(item.price * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-white">
                      Total {formatMAD(order.total)}
                    </span>
                    <Link
                      href={`/delivery/${order.id}`}
                      className="text-sm font-medium text-accent hover:text-accent-hover"
                    >
                      {isDelivered(order.status)
                        ? "Voir les codes →"
                        : "Suivre la commande →"}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
