import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import "./globals.css";
import { isOrderingEnabled, ORDERS_UNAVAILABLE_COPY } from "@/lib/storeSettings";
import { StoreProvider } from "@/context/StoreContext";
import { StoreSettingsProvider } from "@/context/StoreSettingsContext";
import { ProductCatalogProvider } from "@/context/ProductCatalogContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { getWishlistSlugs } from "@/lib/db/wishlist";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SupportPill from "@/components/support/SupportPill";
import AnalyticsConsentProvider from "@/components/analytics/AnalyticsConsent";
import FeedbackButton from "@/components/feedback/FeedbackButton";
import OrganizationJsonLd from "@/components/trust/OrganizationJsonLd";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getCatalogData, getStoreSettings } from "@/lib/db/catalog";
import { getCurrentCustomer } from "@/lib/auth";
import { getSiteUrl } from "@/lib/siteUrl";
import { isProductionRuntime, isPreviewDeployment, runtimeEnvLabel } from "@/lib/env";

export const dynamic = "force-dynamic";

const SITE_TITLE = "ghost.ma - Cartes cadeaux et recharges au Maroc";
const SITE_DESCRIPTION =
  "Cartes cadeaux, recharges et codes numériques (Steam, PlayStation, Xbox, Nintendo, Roblox, Valorant et plus) livrés rapidement après confirmation du paiement. Simple, sécurisé et adapté au Maroc.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // Default social-preview metadata for every page that doesn't set its own
  // openGraph (product/category/guide/collection pages override this). The image
  // itself comes from the file-based card in app/opengraph-image.tsx, so it is
  // not listed here. No twitter card is declared: the business has no X account,
  // so we don't advertise one — X still falls back to these Open Graph tags.
  openGraph: {
    type: "website",
    siteName: "ghost.ma",
    locale: "fr_MA",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: getSiteUrl(),
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/brand/navigator-icon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/brand/navigator-icon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  // Required for `env(safe-area-inset-*)` to resolve to anything but 0 on iOS,
  // which the floating support pill and the account drawer both rely on.
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [catalog, settings, customer] = await Promise.all([
    getCatalogData().catch(() => ({ categories: [], products: [] })),
    getStoreSettings().catch(() => undefined),
    getCurrentCustomer().catch(() => null),
  ]);
  // Logged-in customers get their server-persisted wishlist slugs hydrated into
  // the client provider (guests start from localStorage). Cheap, visible-only.
  const wishlistSlugs = customer
    ? await getWishlistSlugs(customer.id).catch(() => [] as string[])
    : [];
  const wishlistEnabled = settings?.features?.wishlistEnabled ?? true;
  const pathname = (await headers()).get("x-current-path") ?? "/";
  const maintenanceAllowed =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/payment") ||
    pathname.startsWith("/order") ||
    pathname.startsWith("/delivery") ||
    pathname.startsWith("/find-order");
  const showMaintenance = Boolean(settings?.maintenance.enabled && !maintenanceAllowed);
  // Unintrusive site-wide pre-launch banner while ordering is off. Hidden on
  // admin, during the maintenance splash, and on post-purchase/tracking routes
  // (where the payment page shows its own dedicated notice).
  const ordersBannerSuppressed =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/payment") ||
    pathname.startsWith("/order") ||
    pathname.startsWith("/delivery") ||
    pathname.startsWith("/find-order");
  // Visible only on staging/preview (never on production ghost.ma). Warns
  // testers that data and payments here are throwaway. See src/lib/env.ts.
  const showStagingBanner = isPreviewDeployment();
  // No fallback measurement id: a missing NEXT_PUBLIC_GA_ID must disable
  // analytics cleanly, never silently ship data to a baked-in property.
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  // Production analytics only: staging/preview page views must not pollute the
  // live GA property. Loading is now ALSO gated on the visitor's consent, which
  // is a client-side decision — see AnalyticsConsentProvider. These flags are
  // just the server-known half of the gate.
  const analyticsIsProduction = isProductionRuntime();
  // Kill switch. Absent means enabled, so existing deployments keep working;
  // set it to "false" to disable every provider without unsetting ids.
  const analyticsGloballyEnabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "false";
  const analyticsDebug = process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true";
  const showOrdersBanner = Boolean(
    settings && !isOrderingEnabled(settings) && !showMaintenance && !ordersBannerSuppressed,
  );

  return (
    <html lang="fr">
      {/*
        No analytics <script> here any more. gtag is injected client-side by
        AnalyticsConsentProvider, and only after the visitor grants consent —
        keeping it here would load it for everyone before they could choose.
      */}
      <head>
        <OrganizationJsonLd settings={settings} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {showStagingBanner ? (
          <div
            role="status"
            className="sticky top-0 z-[100] flex h-[26px] items-center justify-center bg-amber-500 px-3 text-center text-[12px] font-semibold uppercase tracking-wide text-black"
          >
            {runtimeEnvLabel().toUpperCase()} — données et paiements de test
          </div>
        ) : null}
        <AnalyticsConsentProvider
          gaId={gaId ?? null}
          isProduction={analyticsIsProduction}
          globallyEnabled={analyticsGloballyEnabled}
          debug={analyticsDebug}
        >
        <StoreSettingsProvider initialSettings={settings}>
          <ProductCatalogProvider
            categories={catalog.categories}
            products={catalog.products}
          >
            <StoreProvider>
              <WishlistProvider
                authenticated={Boolean(customer)}
                initialSlugs={wishlistSlugs}
                enabled={wishlistEnabled}
              >
              {showMaintenance ? (
                <main className="grid min-h-screen place-items-center px-6 py-12">
                  <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/brand/navigator-master-transparent-2048.png"
                      alt=""
                      width={96}
                      height={96}
                      className="mx-auto mb-6 h-24 w-24"
                      style={{ filter: "saturate(0.55) brightness(0.85)" }}
                    />
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                      Maintenance
                    </p>
                    <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
                      {settings?.branding.siteName ?? "ghost.ma"} revient bientôt
                    </h1>
                    <p className="mt-4 text-sm leading-relaxed text-muted">
                      {settings?.maintenance.message}
                    </p>
                    <div className="mt-6 flex justify-center gap-3 text-xs text-muted">
                      <span>{settings?.footer.contactEmail}</span>
                      <span>·</span>
                      <span>{settings?.footer.whatsappNumber}</span>
                    </div>
                  </section>
                </main>
              ) : (
                <div
                  className="flex min-h-screen flex-col"
                  // The staging banner is a 26px sticky bar above this wrapper;
                  // expose its height so the fixed-height admin shell can shrink
                  // to fit (calc below) instead of overflowing the viewport.
                  // Absent (prod / no banner) → the shell falls back to 0px.
                  style={
                    showStagingBanner
                      ? ({ "--admin-shell-offset": "26px" } as React.CSSProperties)
                      : undefined
                  }
                >
                  {/* Navbar/Footer/SupportPill self-hide on /admin client-side
                      (usePathname), so they stay correct across soft navigations
                      rather than depending on the root layout's frozen
                      server-side pathname. */}
                  <Navbar
                    customer={
                      customer
                        ? { name: customer.name, email: customer.email }
                        : null
                    }
                  />
                  {showOrdersBanner ? (
                    <div className="border-b border-accent/15 bg-accent-soft">
                      <div className="container-page flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-2 text-center text-[13px] text-muted">
                        <span>{ORDERS_UNAVAILABLE_COPY.banner}</span>
                        <Link
                          href={ORDERS_UNAVAILABLE_COPY.contactHref}
                          className="font-semibold text-accent hover:underline"
                        >
                          {ORDERS_UNAVAILABLE_COPY.contactLabel}
                        </Link>
                      </div>
                    </div>
                  ) : null}
                  <main className="flex-1">{children}</main>
                  <Footer />
                  <SupportPill />
                  <Suspense fallback={null}>
                    <FeedbackButton
                      customer={
                        customer
                          ? { name: customer.name, email: customer.email }
                          : null
                      }
                    />
                  </Suspense>
                </div>
              )}
              </WishlistProvider>
            </StoreProvider>
          </ProductCatalogProvider>
        </StoreSettingsProvider>
        </AnalyticsConsentProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
