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
import { getProduct, getVariantById } from "@/lib/products";

const CART_KEY = "digitalshop.cart.v1";
// Without real auth we remember which order ids belong to this browser so the
// account/delivery pages can look them up in the database.
const MY_ORDERS_KEY = "digitalshop.myOrders.v1";

interface StoreContextValue {
  cart: CartItem[];
  /** Order ids created from this browser (no auth yet — local bridge). */
  myOrderIds: string[];
  /** Hydration guard — true once localStorage has been read on the client. */
  ready: boolean;
  cartCount: number;
  cartTotal: number;
  addToCart: (productId: string, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  /** Persists a freshly created order id and clears the cart. */
  rememberOrder: (orderId: string) => void;
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [myOrderIds, setMyOrderIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage once, on the client.
  useEffect(() => {
    setCart(readJSON<CartItem[]>(CART_KEY, []));
    setMyOrderIds(readJSON<string[]>(MY_ORDERS_KEY, []));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(myOrderIds));
  }, [myOrderIds, ready]);

  const addToCart = useCallback((productId: string, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === productId
            ? { ...i, quantity: i.quantity + quantity }
            : i,
        );
      }
      return [...prev, { productId, quantity }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === productId
            ? { ...i, quantity: Math.max(1, quantity) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const rememberOrder = useCallback((orderId: string) => {
    setMyOrderIds((prev) => (prev.includes(orderId) ? prev : [orderId, ...prev]));
    setCart([]);
  }, []);

  const cartCount = useMemo(
    () => cart.reduce((sum, i) => sum + i.quantity, 0),
    [cart],
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce((sum, i) => {
        const price =
          getVariantById(i.productId)?.price ?? getProduct(i.productId)?.price ?? 0;
        return sum + price * i.quantity;
      }, 0),
    [cart],
  );

  const value: StoreContextValue = {
    cart,
    myOrderIds,
    ready,
    cartCount,
    cartTotal,
    addToCart,
    removeFromCart,
    setQuantity,
    clearCart,
    rememberOrder,
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
