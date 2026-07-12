import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutCustomerAction } from "@/app/actions/auth";
import { isPlaceholderEmail } from "@/lib/auth";
import {
  GridIcon,
  BagIcon,
  ShieldIcon,
  LogoutIcon,
  CheckIcon,
  LifebuoyIcon,
} from "@/components/account/icons";

async function logout() {
  "use server";
  await logoutCustomerAction();
  redirect("/login");
}

type AccountView = "dashboard" | "orders" | "support" | "security";

const NAV: { view: AccountView; href: string; label: string; Icon: typeof GridIcon }[] = [
  { view: "dashboard", href: "/account", label: "Tableau de bord", Icon: GridIcon },
  { view: "orders", href: "/account/orders", label: "Commandes", Icon: BagIcon },
  { view: "support", href: "/account/support", label: "Support", Icon: LifebuoyIcon },
  { view: "security", href: "/account/security", label: "Sécurité", Icon: ShieldIcon },
];

export default function AccountNav({
  name,
  email,
  active,
  verified = false,
  ordersCount,
  supportCount,
}: {
  name: string;
  email: string;
  active: AccountView;
  verified?: boolean;
  ordersCount?: number;
  supportCount?: number;
}) {
  const hasEmail = Boolean(email) && !isPlaceholderEmail(email);
  const initial = name.slice(0, 1).toUpperCase() || "?";

  return (
    <aside className="h-fit lg:sticky lg:top-[88px]">
      {/* Identity card */}
      <div
        className="relative overflow-hidden rounded-[18px] border border-border p-5"
        style={{ background: "linear-gradient(160deg,#151b28,#0f1218)" }}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-70 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(62,123,250,0.22), transparent 70%)" }}
        />
        <div className="relative flex items-center gap-3">
          <span
            className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] text-lg font-bold text-white"
            style={{ background: "linear-gradient(150deg,#3e7bfa,#2a4fd0)" }}
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            <p className="truncate text-xs text-faint">
              {hasEmail ? email : "Profil à compléter"}
            </p>
          </div>
        </div>
        {verified ? (
          <span className="relative mt-4 inline-flex items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-300">
            <CheckIcon className="h-3.5 w-3.5" />
            Compte vérifié
          </span>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="mt-4 space-y-1">
        {NAV.map(({ view, href, label, Icon }) => {
          const isActive = view === active;
          const count = view === "orders" ? ordersCount : view === "support" ? supportCount : undefined;
          return (
            <Link
              key={view}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "border border-accent/30 bg-accent-soft font-semibold text-accent-strong"
                  : "border border-transparent font-medium text-muted hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{label}</span>
              {count ? (
                <span
                  className={`inline-flex min-w-[20px] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    isActive ? "bg-accent/20 text-accent-strong" : "bg-surface2 text-muted"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="my-4 border-t border-border" />

      <form action={logout}>
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-xl border border-[rgba(240,97,109,0.22)] bg-[rgba(240,97,109,0.06)] px-3 py-2.5 text-sm font-medium text-[#f0616d] transition-colors hover:bg-[rgba(240,97,109,0.12)]"
        >
          <LogoutIcon className="h-[18px] w-[18px]" />
          Déconnexion
        </button>
      </form>
    </aside>
  );
}
