"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  List,
  Star,
  ShoppingBag,
  ScanLine,
  PackageCheck,
  RotateCcw,
  Boxes,
  Users,
  Settings,
  CreditCard,
  Mail,
  Scale,
  Terminal,
  ChevronsUpDown,
  Ghost,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Marks active when the pathname matches exactly (default: prefix match). */
  exact?: boolean;
  count?: number;
  countTone?: "accent" | "warning";
};

type NavGroup = { label: string | null; items: NavItem[] };

function buildNav(counts: { orders: number; review: number }): NavGroup[] {
  return [
    {
      label: null,
      items: [{ label: "Overview", href: "/admin", icon: LayoutDashboard, exact: true }],
    },
    {
      label: "Catalogue",
      items: [
        { label: "Products", href: "/admin/products", icon: Package },
        { label: "Categories", href: "/admin/categories", icon: List },
        { label: "Featured", href: "/admin/featured", icon: Star },
      ],
    },
    {
      label: "Orders",
      items: [
        {
          label: "All orders",
          href: "/admin/orders",
          icon: ShoppingBag,
          exact: true,
          count: counts.orders || undefined,
          countTone: "accent",
        },
        {
          label: "Payment review",
          href: "/admin/orders/review",
          icon: ScanLine,
          count: counts.review || undefined,
          countTone: "warning",
        },
        { label: "Fulfillment", href: "/admin/orders/fulfillment", icon: PackageCheck },
        { label: "Refunds", href: "/admin/orders/refunds", icon: RotateCcw },
      ],
    },
    {
      label: null,
      items: [
        { label: "Inventory", href: "/admin/inventory", icon: Boxes },
        { label: "Customers", href: "/admin/customers", icon: Users },
      ],
    },
    {
      label: "Settings",
      items: [
        { label: "Store settings", href: "/admin/settings/store", icon: Settings },
        { label: "Payment methods", href: "/admin/settings/payments", icon: CreditCard },
        { label: "Email templates", href: "/admin/settings/email", icon: Mail },
        { label: "Legal pages", href: "/admin/settings/legal", icon: Scale },
        { label: "Developer tools", href: "/admin/settings/developer", icon: Terminal },
      ],
    },
  ];
}

export default function AdminSidebar({
  counts,
  user,
}: {
  counts: { orders: number; review: number };
  user: { name: string; email: string };
}) {
  const pathname = usePathname();
  const groups = buildNav(counts);
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-white/[0.07] bg-admin-sidebar">
      <div className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4">
        <div className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-accent/[0.13] text-accent-strong ring-1 ring-inset ring-accent/20">
          <Ghost className="h-4 w-4" strokeWidth={1.8} />
        </div>
        <div className="leading-tight">
          <p className="text-[13.5px] font-semibold text-text">ghost.ma</p>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fainter">
            admin
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className={groupIndex === 0 ? "" : "mt-4"}>
            {group.label ? (
              <p className="mb-1.5 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fainter">
                {group.label}
              </p>
            ) : null}
            <div className="flex flex-col gap-[3px]">
              {group.items.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-9 items-center gap-[11px] rounded-[9px] px-3 text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                      active
                        ? "bg-accent/[0.13] font-semibold text-[#EAF0FF] ring-1 ring-inset ring-accent/20"
                        : "text-muted hover:bg-white/[0.03] hover:text-text"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                    <span className="truncate">{item.label}</span>
                    {item.count ? (
                      <span
                        className={`ml-auto rounded-chip px-1.5 py-px font-mono text-[11px] font-semibold ${
                          item.countTone === "warning"
                            ? "bg-warning/[0.14] text-warning"
                            : "bg-accent/[0.13] text-[#9FB8FF]"
                        }`}
                      >
                        {item.count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2.5 border-t border-white/[0.06] px-4 py-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-admin-elevated font-mono text-xs font-semibold text-muted ring-1 ring-inset ring-white/[0.08]">
          {initials || "AD"}
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-medium text-text">{user.name}</p>
          <p className="truncate text-[11.5px] text-faint">Administrator</p>
        </div>
        <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-fainter" strokeWidth={1.8} />
      </div>
    </aside>
  );
}
