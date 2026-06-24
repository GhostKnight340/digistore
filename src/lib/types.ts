export type CategoryId =
  | "steam"
  | "playstation"
  | "xbox"
  | "nintendo"
  | "roblox"
  | "valorant";

export interface Category {
  id: CategoryId;
  name: string;
  tagline: string;
  /** Tailwind gradient classes used for the placeholder artwork. */
  gradient: string;
  icon: string;
}

export interface Product {
  id: string;
  name: string;
  category: CategoryId;
  region: string;
  /** Price in Moroccan Dirham. */
  price: number;
  deliveryType: string;
  description: string;
  featured?: boolean;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  /** One delivered code per unit purchased. */
  codes: string[];
}

export type PaymentMethod =
  | "test"
  | "bank"
  | "crypto"
  | "paypal";

export interface Order {
  id: string;
  createdAt: string;
  email: string;
  fullName: string;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
  total: number;
  status: "completed";
}
