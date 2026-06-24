"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CartItem,
  Order,
  OrderItem,
  PaymentMethod,
} from "@/lib/types";
import { getProduct } from "@/lib/products";
import { assignCodes } from "@/lib/inventory";

const CART_KEY = "digitalshop.cart.v1";
const ORDERS_KEY = "digitalshop.orders.v1";

interface CheckoutDetails {
  email: string;
  fullName: string;
  paymentMethod: PaymentMethod;
}

interface StoreContextValue {
  cart: CartItem[];
  orders: Order[];
  /** Hydration guard — true once localStorage has been read on the client. */
  ready: boolean;
  cartCount: number;
  cartTotal: number;
  addToCart: (productId: string, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  placeOrder: (details: CheckoutDetails) => Order | null;
  getOrder: (id: string) => Order | undefined;
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage once, on the client.
  useEffect(() => {
    setCart(readJSON<CartItem[]>(CART_KEY, []));
    setOrders(readJSON<Order[]>(ORDERS_KEY, []));
    setReady(true);
  }, []);

  // Persist cart.
  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, ready]);

  // Persist orders.
  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }, [orders, ready]);

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

  const cartCount = useMemo(
    () => cart.reduce((sum, i) => sum + i.quantity, 0),
    [cart],
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce((sum, i) => {
        const product = getProduct(i.productId);
        return sum + (product ? product.price * i.quantity : 0);
      }, 0),
    [cart],
  );

  const placeOrder = useCallback(
    (details: CheckoutDetails): Order | null => {
      if (cart.length === 0) return null;

      const items: OrderItem[] = cart
        .map((i) => {
          const product = getProduct(i.productId);
          if (!product) return null;
          return {
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity: i.quantity,
            codes: assignCodes(product.id, i.quantity),
          } satisfies OrderItem;
        })
        .filter((x): x is OrderItem => x !== null);

      if (items.length === 0) return null;

      const total = items.reduce(
        (sum, it) => sum + it.price * it.quantity,
        0,
      );

      const order: Order = {
        id: `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random()
          .toString(36)
          .slice(2, 5)
          .toUpperCase()}`,
        createdAt: new Date().toISOString(),
        email: details.email,
        fullName: details.fullName,
        paymentMethod: details.paymentMethod,
        items,
        total,
        status: "completed",
      };

      setOrders((prev) => [order, ...prev]);
      setCart([]);
      return order;
    },
    [cart],
  );

  const getOrder = useCallback(
    (id: string) => orders.find((o) => o.id === id),
    [orders],
  );

  const value: StoreContextValue = {
    cart,
    orders,
    ready,
    cartCount,
    cartTotal,
    addToCart,
    removeFromCart,
    setQuantity,
    clearCart,
    placeOrder,
    getOrder,
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
