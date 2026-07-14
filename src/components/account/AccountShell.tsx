import AccountNav from "@/components/account/AccountNav";
import AccountMobileNav from "@/components/account/AccountMobileNav";
import PageHeader from "@/components/account/PageHeader";
import type { AccountView } from "@/lib/account/nav";

/**
 * Shared frame for every customer account route.
 *
 * Desktop (lg+): the 264px sidebar next to the page content, unchanged.
 * Mobile/tablet: the sidebar is not rendered at all — a compact account header
 * with a "Menu du compte" bottom sheet takes its place, and the page content
 * starts directly underneath it at full width. The bottom padding keeps the
 * last action clear of the floating Navigator support pill.
 */
export default function AccountShell({
  name,
  email,
  active,
  verified = false,
  ordersCount,
  supportCount,
  title,
  subtitle,
  children,
}: {
  name: string;
  email: string;
  active: AccountView;
  verified?: boolean;
  ordersCount?: number;
  supportCount?: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const identity = { name, email, verified, ordersCount, supportCount, active } as const;

  return (
    <div className="container-page py-6 pb-[max(96px,calc(80px+env(safe-area-inset-bottom)))] lg:py-10 lg:pb-16">
      <div className="grid gap-5 lg:grid-cols-[264px_1fr] lg:gap-[26px]">
        <AccountNav {...identity} className="hidden lg:block" />
        <AccountMobileNav {...identity} className="lg:hidden" />

        {/* min-w-0 lets the content column shrink below its intrinsic width
            instead of forcing the grid (and the page) to overflow. */}
        <section className="min-w-0 space-y-5">
          <PageHeader title={title} subtitle={subtitle} />
          {children}
        </section>
      </div>
    </div>
  );
}
