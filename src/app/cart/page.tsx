"use client";

import Link from "next/link";
import { useStore } from "@/context/StoreContext";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import { formatMAD } from "@/lib/format";
import ProductArt from "@/components/ProductArt";

export default function CartPage() {
  const { cart, ready, cartTotal, setQuantity, removeFromCart } = useStore();
  const { getProduct } = useProductCatalog();

  if (!ready) {
    return (
      <div className="container-page py-20 text-center text-muted">
        Chargement?
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="container-page py-10">
        <h1 className="text-3xl font-bold text-white">Votre panier</h1>
        <div className="card mt-8 grid place-items-center px-6 py-20 text-center">
          <span className="text-4xl" aria-hidden>
            🛒
          </span>
          <p className="mt-4 text-lg font-semibold text-white">
            Votre panier est vide
          </p>
          <p className="mt-1 text-sm text-muted">
            Parcourez le catalogue et ajoutez un produit pour commencer.
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
      <h1 className="text-3xl font-bold text-white">Votre panier</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <ul className="space-y-4">
          {cart.map((item) => {
            const product = getProduct(item.productId);
            if (!product) return null;
            return (
              <li key={item.productId} className="card flex gap-4 p-4">
                <ProductArt
                  category={product.category}
                  imageUrl={product.imageUrl}
                  label={product.name}
                  className="h-20 w-28 shrink-0 rounded-xl"
                />
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={product.href ?? `/products/${product.id}`}
                      className="font-semibold text-white hover:text-accent"
                    >
                      {product.name}
                    </Link>
                    <button
                      onClick={() => removeFromCart(product.id)}
                      className="text-xs text-muted transition hover:text-red-400"
                    >
                      Retirer
                    </button>
                  </div>
                  <span className="text-sm text-muted">
                    {formatMAD(product.price)} l'unité
                  </span>

                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex items-center rounded-lg border border-border bg-surface">
                      <button
                        onClick={() =>
                          setQuantity(product.id, item.quantity - 1)
                        }
                        className="px-3 py-1.5 text-muted transition hover:text-white"
                        aria-label="Diminuer la quantité"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-sm font-semibold text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          setQuantity(product.id, item.quantity + 1)
                        }
                        className="px-3 py-1.5 text-muted transition hover:text-white"
                        aria-label="Augmenter la quantité"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-bold text-white">
                      {formatMAD(product.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="h-fit lg:sticky lg:top-24">
          <div className="card p-6">
            <h2 className="text-lg font-bold text-white">
              Récapitulatif de commande
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted">
                <dt>Sous-total</dt>
                <dd className="text-white">{formatMAD(cartTotal)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Livraison</dt>
                <dd className="text-cyan-glow">Rapide · gratuite</dd>
              </div>
            </dl>
            <div className="my-4 border-t border-border" />
            <div className="flex justify-between text-base font-bold text-white">
              <span>Total</span>
              <span>{formatMAD(cartTotal)}</span>
            </div>
            <Link href="/checkout" className="btn-primary mt-6 w-full">
              Passer au paiement
            </Link>
            <Link
              href="/products"
              className="mt-3 block text-center text-sm text-muted hover:text-white"
            >
              Continuer mes achats
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
