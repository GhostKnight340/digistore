"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/StoreContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { isOrderingEnabled } from "@/lib/storeSettings";
import OrdersUnavailableNotice from "@/components/store/OrdersUnavailableNotice";
import OrdersDisabledPurchase from "@/components/store/OrdersDisabledPurchase";
import type { CartIdentity } from "@/lib/cartIdentity";
import { formatDH } from "@/lib/format";

export default function AddToCartForm({
  productId,
  price,
  identity,
}: {
  productId: string;
  price?: number;
  /** Natural-key parts stored with the cart line so it survives SKU renames. */
  identity?: CartIdentity;
}) {
  const { addToCart } = useStore();
  const { settings } = useStoreSettings();
  const orderingEnabled = isOrderingEnabled(settings);
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addToCart(productId, qty, identity);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  function handleBuyNow() {
    addToCart(productId, qty, identity);
    router.push("/cart");
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm font-medium text-faint">Quantité</span>
        <div className="flex items-center overflow-hidden rounded-[10px] border border-border bg-surface">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="h-10 w-10 text-lg text-muted transition hover:text-white"
            aria-label="Diminuer la quantité"
          >
            -
          </button>
          <span className="w-9 text-center font-mono text-sm font-semibold text-white">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(10, q + 1))}
            className="h-10 w-10 text-lg text-muted transition hover:text-white"
            aria-label="Augmenter la quantité"
          >
            +
          </button>
        </div>
      </div>

      {typeof price === "number" && (
        <div className="mb-5">
          <div className="mb-1 text-sm text-faint">Total</div>
          <div className="text-3xl font-semibold tracking-[-0.03em] text-text">
            {formatDH(price * qty)}
          </div>
        </div>
      )}

      {orderingEnabled ? (
        <div className="flex flex-col gap-3">
          <button onClick={handleBuyNow} className="btn-primary h-[52px] w-full text-base">
            Acheter maintenant
          </button>
          <button onClick={handleAdd} className="btn-ghost h-11 w-full">
            {added ? "Ajouté au panier" : "Ajouter au panier"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <OrdersUnavailableNotice showContact={false} />
          <OrdersDisabledPurchase />
        </div>
      )}

      {orderingEnabled && added && (
        <div className="mt-3 flex items-center gap-2 rounded-[10px] bg-accent-soft px-3.5 py-3 text-[13.5px] text-accent-strong">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            className="h-4 w-4"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Produit disponible après confirmation du paiement.
        </div>
      )}
    </div>
  );
}
