import Link from "next/link";
import { accountLogoutAction } from "@/app/account/actions";
import { isPlaceholderEmail } from "@/lib/auth";
import {
  ACCOUNT_NAV,
  accountNavCount,
  type AccountView,
} from "@/lib/account/nav";
import {
  GridIcon,
  HeartIcon,
  BagIcon,
  ShieldIcon,
  LogoutIcon,
  CheckIcon,
  LifebuoyIcon,
  WalletIcon,
} from "@/components/account/icons";

const ICONS: Record<AccountView, typeof GridIcon> = {
  dashboard: GridIcon,
  orders: BagIcon,
  favoris: HeartIcon,
  wallet: WalletIcon,
  support: LifebuoyIcon,
  security: ShieldIcon,
};

/** Desktop-only account sidebar. Below `lg` the compact AccountMobileNav
 *  bottom sheet replaces it — see AccountShell. */
export default function AccountNav({
  name,
  email,
  active,
  verified = false,
  ordersCount,
  supportCount,
  className = "",
}: {
  name: string;
  email: string;
  active: AccountView;
  verified?: boolean;
  ordersCount?: number;
  supportCount?: number;
  className?: string;
}) {
  const hasEmail = Boolean(email) && !isPlaceholderEmail(email);
  const initial = name.slice(0, 1).toUpperCase() || "?";

  return (
    <aside className={`h-fit lg:sticky lg:top-[88px] ${className}`}>
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
        {ACCOUNT_NAV.map(({ view, href, label }) => {
          const Icon = ICONS[view];
          const isActive = view === active;
          const count = accountNavCount(view, { ordersCount, supportCount });
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

      <form action={accountLogoutAction}>
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
