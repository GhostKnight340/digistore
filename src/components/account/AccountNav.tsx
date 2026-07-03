"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { logoutCustomerAction } from "@/app/actions/auth";
import {
  BagIcon,
  CheckIcon,
  GridIcon,
  LogOutIcon,
  ShieldIcon,
} from "./AccountIcons";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  count?: number;
};

export default function AccountNav({
  name,
  email,
  verified = false,
  ordersCount,
}: {
  name: string;
  email: string;
  verified?: boolean;
  ordersCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const items: NavItem[] = [
    { href: "/account", label: "Tableau de bord", icon: GridIcon },
    { href: "/account/orders", label: "Commandes", icon: BagIcon, count: ordersCount },
    { href: "/account/security", label: "Sécurité", icon: ShieldIcon },
  ];

  function isActive(href: string) {
    if (href === "/account") return pathname === "/account";
    return pathname.startsWith(href);
  }

  function logout() {
    startTransition(async () => {
      await logoutCustomerAction();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <aside className="h-fit space-y-5 lg:sticky lg:top-24">
      {/* Identity card */}
      <div
        className="relative overflow-hidden rounded-[18px] border border-border p-5"
        style={{ background: "linear-gradient(160deg,#151b28,#0f1218)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-2xl"
          style={{ background: "rgba(62,123,250,0.22)" }}
        />
        <div className="relative flex items-center gap-3">
          <span
            className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] text-lg font-bold text-white"
            style={{ background: "linear-gradient(150deg,#3e7bfa,#5e92ff)" }}
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
        </div>
        {verified ? (
          <span className="relative mt-4 inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
            <CheckIcon className="h-3.5 w-3.5" />
            Compte vérifié
          </span>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="space-y-1.5">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-150 ${
                active
                  ? "border-accent/30 bg-accent-soft font-semibold text-accent-strong"
                  : "border-transparent text-muted hover:border-border hover:bg-surface hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{item.label}</span>
              {typeof item.count === "number" && item.count > 0 ? (
                <span
                  className={`inline-flex min-w-[22px] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    active ? "bg-accent/20 text-accent-strong" : "bg-surface2 text-muted"
                  }`}
                >
                  {item.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border" />

      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-all duration-150 disabled:opacity-60"
        style={{
          background: "rgba(240,97,109,0.06)",
          borderColor: "rgba(240,97,109,0.22)",
          color: "#f0616d",
        }}
      >
        <LogOutIcon className="h-[18px] w-[18px]" />
        {pending ? "Déconnexion..." : "Déconnexion"}
      </button>
    </aside>
  );
}
