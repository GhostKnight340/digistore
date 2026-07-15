/**
 * The customer account sections, shared by the desktop sidebar and the mobile
 * account drawer so the two can never drift apart.
 */
export type AccountView =
  | "dashboard"
  | "orders"
  | "favoris"
  | "wallet"
  | "support"
  | "security";

export type AccountNavItem = {
  view: AccountView;
  href: string;
  label: string;
};

export const ACCOUNT_NAV: AccountNavItem[] = [
  { view: "dashboard", href: "/account", label: "Tableau de bord" },
  { view: "orders", href: "/account/orders", label: "Commandes" },
  { view: "favoris", href: "/account/favoris", label: "Favoris" },
  { view: "wallet", href: "/account/wallet", label: "Crédit Ghost" },
  { view: "support", href: "/account/support", label: "Support" },
  { view: "security", href: "/account/security", label: "Sécurité" },
];

/** Section label shown in the compact mobile account header. */
export function accountSectionLabel(view: AccountView): string {
  return ACCOUNT_NAV.find((item) => item.view === view)?.label ?? "";
}

/** Badge count for a section, or undefined when there is nothing to show. */
export function accountNavCount(
  view: AccountView,
  counts: { ordersCount?: number; supportCount?: number },
): number | undefined {
  const count =
    view === "orders" ? counts.ordersCount : view === "support" ? counts.supportCount : undefined;
  return count ? count : undefined;
}
