"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CartItem } from "@/lib/types";
import type { CartIdentity } from "@/lib/cartIdentity";
import { useProductCatalog } from "@/context/ProductCatalogContext";

const CART_KEY = "digitalshop.cart.v1";

interface StoreContextValue {
  cart: CartItem[];
  ready: boolean;
  cartCount: number;
  cartTotal: number;
  addToCart: (productId: string, quantity?: number, identity?: CartIdentity) => void;
  removeFromCart: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { getProduct, findProductByIdentity, products } = useProductCatalog();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCart(readJSON<CartItem[]>(CART_KEY, []));
    setReady(true);
  }, []);

  // Reconcile stale cart items against the catalog. A cart item keys on the
  // variant id (= SKU, a mutable primary key), so an admin SKU rename or the
  // SKU-cleanup script orphans saved carts. For each item we: keep it as-is if
  // its id still resolves; else re-bind it to the current variant via its stored
  // natural key (parent + denomination + region); else drop it. Without this the
  // badge counts a ghost item while the list is empty and the total is 0.
  useEffect(() => {
    if (!ready || products.length === 0) return;
    setCart((prev) => {
      let changed = false;
      const next: CartItem[] = [];
      for (const item of prev) {
        if (getProduct(item.productId)) {
          next.push(item);
          continue;
        }
        const rebound = findProductByIdentity(item);
        if (rebound) {
          next.push({ ...item, productId: rebound.id });
          changed = true;
        } else {
          changed = true; // dropped: no id match and no natural-key match
        }
      }
      return changed ? next : prev;
    });
  }, [ready, products, getProduct, findProductByIdentity]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, ready]);

  const addToCart = useCallback(
    (productId: string, quantity = 1, identity?: CartIdentity) => {
      setCart((prev) => {
        const existing = prev.find((item) => item.productId === productId);
        if (existing) {
          return prev.map((item) =>
            item.productId === productId
              ? { ...item, quantity: item.quantity + quantity, ...identity }
              : item,
          );
        }
        return [...prev, { productId, quantity, ...identity }];
      });
    },
    [],
  );

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(1, quantity) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const product = getProduct(item.productId);
        return sum + (product ? product.price * item.quantity : 0);
      }, 0),
    [cart, getProduct],
  );

  const value: StoreContextValue = {
    cart,
    ready,
    cartCount,
    cartTotal,
    addToCart,
    removeFromCart,
    setQuantity,
    clearCart,
  };

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return ctx;
}
