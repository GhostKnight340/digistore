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
  EmailLog,
  InventoryCode,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
} from "@/lib/types";
import { getProduct } from "@/lib/products";
import { seedInventory } from "@/lib/inventory";

const CART_KEY = "digitalshop.cart.v1";
const ORDERS_KEY = "digitalshop.orders.v1";
const INVENTORY_KEY = "digitalshop.inventory.v1";
const EMAILS_KEY = "digitalshop.emails.v1";

interface CheckoutDetails {
  email: string;
  fullName: string;
  paymentMethod: PaymentMethod;
}

/** Codes assigned during fulfillment, keyed by order item productId. */
export type CodeAssignments = Record<string, string[]>;

interface StoreContextValue {
  cart: CartItem[];
  orders: Order[];
  inventory: InventoryCode[];
  emailLogs: EmailLog[];
  /** Hydration guard — true once localStorage has been read on the client. */
  ready: boolean;
  cartCount: number;
  cartTotal: number;
  addToCart: (productId: string, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  /** Creates a pending_payment order. Does NOT assign codes. */
  placeOrder: (details: CheckoutDetails) => Order | null;
  getOrder: (id: string) => Order | undefined;
  // Admin manual-fulfillment actions.
  confirmPayment: (orderId: string) => void;
  deliverOrder: (orderId: string, assignments: CodeAssignments) => boolean;
  getAvailableCodes: (productId: string) => InventoryCode[];
  emailLogsForOrder: (orderId: string) => EmailLog[];
  /** Re-read all persisted state from localStorage (manual refresh). */
  syncFromStorage: () => void;
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

function nowISO() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
}

/** Migrates older persisted orders to the current shape. */
function normalizeOrder(raw: Order & { status?: string }): Order {
  const legacyStatus = raw.status as string | undefined;
  const status: OrderStatus =
    legacyStatus === "completed"
      ? "delivered"
      : (legacyStatus as OrderStatus) ?? "pending_payment";
  return {
    ...raw,
    status,
    items: (raw.items ?? []).map((item) => ({
      ...item,
      codes: item.codes ?? [],
    })),
  };
}

function loadOrders(): Order[] {
  return readJSON<Order[]>(ORDERS_KEY, []).map(normalizeOrder);
}

function loadInventory(): InventoryCode[] {
  const stored = readJSON<InventoryCode[] | null>(INVENTORY_KEY, null);
  return stored && stored.length ? stored : seedInventory();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryCode[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage once, on the client.
  useEffect(() => {
    setCart(readJSON<CartItem[]>(CART_KEY, []));
    setOrders(loadOrders());
    setInventory(loadInventory());
    setEmailLogs(readJSON<EmailLog[]>(EMAILS_KEY, []));
    setReady(true);
  }, []);

  // Persist each slice.
  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }, [orders, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
  }, [inventory, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(EMAILS_KEY, JSON.stringify(emailLogs));
  }, [emailLogs, ready]);

  // Live cross-tab sync: when admin (one tab) delivers a code, the customer's
  // delivery page (another tab) updates without a manual reload.
  const syncFromStorage = useCallback(() => {
    setCart(readJSON<CartItem[]>(CART_KEY, []));
    setOrders(loadOrders());
    setInventory(loadInventory());
    setEmailLogs(readJSON<EmailLog[]>(EMAILS_KEY, []));
  }, []);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (
        e.key === ORDERS_KEY ||
        e.key === INVENTORY_KEY ||
        e.key === EMAILS_KEY ||
        e.key === CART_KEY
      ) {
        syncFromStorage();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [syncFromStorage]);

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
            // Codes are assigned later by an admin during fulfillment.
            codes: [] as string[],
          } satisfies OrderItem;
        })
        .filter((x): x is OrderItem => x !== null);

      if (items.length === 0) return null;

      const total = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

      const order: Order = {
        id: makeId("ORD"),
        createdAt: nowISO(),
        email: details.email,
        fullName: details.fullName,
        paymentMethod: details.paymentMethod,
        items,
        total,
        status: "pending_payment",
      };

      setOrders((prev) => [order, ...prev]);
      setCart([]);

      // Simulated "order received" email (logged only).
      const email: EmailLog = {
        id: makeId("EML"),
        orderId: order.id,
        type: "order_received",
        recipient: order.email,
        subject: "Paiement en cours de vérification",
        body: "We received your order and are verifying the payment.",
        createdAt: nowISO(),
      };
      setEmailLogs((prev) => [email, ...prev]);

      return order;
    },
    [cart],
  );

  const getOrder = useCallback(
    (id: string) => orders.find((o) => o.id === id),
    [orders],
  );

  const confirmPayment = useCallback((orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId && o.status === "pending_payment"
          ? { ...o, status: "payment_confirmed", paymentConfirmedAt: nowISO() }
          : o,
      ),
    );
  }, []);

  const deliverOrder = useCallback(
    (orderId: string, assignments: CodeAssignments): boolean => {
      const order = orders.find((o) => o.id === orderId);
      if (!order || order.status === "delivered") return false;

      // Normalize and validate: every item needs `quantity` non-empty codes.
      const cleaned: CodeAssignments = {};
      for (const item of order.items) {
        const codes = (assignments[item.productId] ?? [])
          .map((c) => c.trim())
          .filter(Boolean)
          .slice(0, item.quantity);
        if (codes.length < item.quantity) return false;
        cleaned[item.productId] = codes;
      }

      const deliveredAt = nowISO();

      setOrders((prev) =>
        prev.map((o) =>
          o.id !== orderId
            ? o
            : {
                ...o,
                status: "delivered",
                paymentConfirmedAt: o.paymentConfirmedAt ?? deliveredAt,
                deliveredAt,
                items: o.items.map((item) => ({
                  ...item,
                  codes: cleaned[item.productId] ?? [],
                })),
              },
        ),
      );

      // Mark inventory codes used; record manual codes not in inventory.
      setInventory((prev) => {
        const next = [...prev];
        for (const item of order.items) {
          for (const code of cleaned[item.productId] ?? []) {
            const idx = next.findIndex(
              (c) =>
                c.productId === item.productId &&
                c.code === code &&
                c.status === "unused",
            );
            if (idx >= 0) {
              next[idx] = {
                ...next[idx],
                status: "used",
                assignedOrderId: orderId,
                usedAt: deliveredAt,
              };
            } else {
              next.push({
                id: makeId("INV"),
                productId: item.productId,
                code,
                status: "used",
                assignedOrderId: orderId,
                usedAt: deliveredAt,
              });
            }
          }
        }
        return next;
      });

      // Simulated "code delivered" email (logged only).
      const email: EmailLog = {
        id: makeId("EML"),
        orderId,
        type: "code_delivered",
        recipient: order.email,
        subject: "Paiement confirmé — votre code est disponible",
        body: "Your payment was confirmed. Here is your code. Thank you for your purchase and we hope to see you again.",
        createdAt: deliveredAt,
      };
      setEmailLogs((prev) => [email, ...prev]);

      return true;
    },
    [orders],
  );

  const getAvailableCodes = useCallback(
    (productId: string) =>
      inventory.filter(
        (c) => c.productId === productId && c.status === "unused",
      ),
    [inventory],
  );

  const emailLogsForOrder = useCallback(
    (orderId: string) =>
      emailLogs
        .filter((e) => e.orderId === orderId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [emailLogs],
  );

  const value: StoreContextValue = {
    cart,
    orders,
    inventory,
    emailLogs,
    ready,
    cartCount,
    cartTotal,
    addToCart,
    removeFromCart,
    setQuantity,
    clearCart,
    placeOrder,
    getOrder,
    confirmPayment,
    deliverOrder,
    getAvailableCodes,
    emailLogsForOrder,
    syncFromStorage,
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
