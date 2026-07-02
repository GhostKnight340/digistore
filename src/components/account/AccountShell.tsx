import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutCustomerAction } from "@/app/actions/auth";
import {
  ArrowRightIcon,
  BagIcon,
  CheckIcon,
  GridIcon,
  LogOutIcon,
  ShieldIcon,
} from "./icons";

async function logout() {
  "use server";
  await logoutCustomerAction();
  redirect("/login");
}

export type AccountView = "dashboard" | "orders" | "security";

const NAV_ITEMS: {
  view: AccountView;
  href: string;
  label: string;
  Icon: typeof GridIcon;
}[] = [
  { view: "dashboard", href: "/account", label: "Tableau de bord", Icon: GridIcon },
  { view: "orders", href: "/account/orders", label: "Commandes", Icon: BagIcon },
  { view: "security", href: "/account/security", label: "Sécurité", Icon: ShieldIcon },
];

function initial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export default function AccountShell({
  active,
  name,
  email,
  emailVerified,
  ordersCount,
  title,
  subtitle,
  children,
}: {
  active: AccountView;
  name: string;
  email: string;
  emailVerified: boolean;
  ordersCount: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container-page py-10">
      <div className="grid items-start gap-6 lg:grid-cols-[264px_1fr] lg:gap-[26px]">
        {/* ── Sidebar (desktop) ── */}
        <aside className="hidden h-fit lg:sticky lg:top-[88px] lg:flex lg:flex-col lg:gap-[18px]">
          {/* Identity card */}
          <div className="relative overflow-hidden rounded-[18px] border border-border bg-gradient-to-br from-[#151b28] to-[#0f1218] p-5">
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-[14px]"
              style={{ background: "radial-gradient(circle, rgba(62,123,250,0.22), transparent 65%)" }}
            />
            <div className="relative flex items-center gap-3">
              <span className="grid h-[46px] w-[46px] flex-shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-accent to-[#2b5fd9] text-[19px] font-semibold text-white shadow-[0_6px_18px_rgba(62,123,250,0.4)]">
                {initial(name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-white">{name}</p>
                <p className="truncate text-[12.5px] text-[#8891a3]">{email}</p>
              </div>
            </div>
            {emailVerified ? (
              <div className="relative mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-[#2fbf71]/30 bg-[#2fbf71]/[0.12] px-2.5 py-1">
                <CheckIcon size={13} className="text-[#2fbf71]" />
                <span className="text-xs font-semibold text-[#43cf86]">Compte vérifié</span>
              </div>
            ) : (
              <div className="relative mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/[0.12] px-2.5 py-1">
                <span className="text-xs font-semibold text-amber-300">Compte non vérifié</span>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ view, href, label, Icon }) => {
              const isActive = active === view;
              return (
                <Link
                  key={view}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex h-11 items-center gap-3 rounded-[11px] px-3.5 text-sm transition-colors ${
                    isActive
                      ? "border border-accent/[0.28] bg-accent/[0.12] font-semibold text-accent-strong"
                      : "border border-transparent font-medium text-muted hover:bg-surface hover:text-white"
                  }`}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  {view === "orders" && ordersCount > 0 && (
                    <span className="ml-auto rounded-md bg-white/[0.06] px-1.5 py-px font-mono text-[11px] font-medium text-[#8891a3]">
                      {ordersCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="h-px bg-white/[0.06]" />

          <form action={logout}>
            <button
              type="submit"
              className="flex h-11 w-full items-center gap-2.5 rounded-[11px] border border-[#f0616d]/[0.22] bg-[#f0616d]/[0.06] px-3.5 text-sm font-medium text-[#f0616d] transition-colors hover:bg-[#f0616d]/[0.12]"
            >
              <LogOutIcon size={17} />
              Déconnexion
            </button>
          </form>
        </aside>

        {/* ── Main column ── */}
        <div className="min-w-0">
          {/* Page header */}
          <header className="mb-6 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-accent-strong">
                Espace client
              </p>
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white sm:text-[33px]">
                {title}
              </h1>
              <p className="mt-1.5 text-[14.5px] text-muted">{subtitle}</p>
            </div>
          </header>

          {/* Mobile tab bar */}
          <div className="mb-5 flex gap-1.5 overflow-x-auto rounded-xl border border-border bg-surface p-1 lg:hidden">
            {NAV_ITEMS.map(({ view, href, label }) => {
              const isActive = active === view;
              return (
                <Link
                  key={view}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex-shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
                    isActive ? "bg-accent text-white" : "text-muted hover:text-white"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Mobile logout (sidebar is hidden below lg) */}
          <div className="mb-5 lg:hidden">
            <form action={logout}>
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-[11px] border border-[#f0616d]/[0.22] bg-[#f0616d]/[0.06] px-3.5 text-sm font-medium text-[#f0616d] transition-colors hover:bg-[#f0616d]/[0.12]"
              >
                <LogOutIcon size={17} />
                Déconnexion
              </button>
            </form>
          </div>

          <main className="flex flex-col gap-5">{children}</main>
        </div>
      </div>
    </div>
  );
}

// Re-export for pages that build their own CTA rows.
export { ArrowRightIcon };
