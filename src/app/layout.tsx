import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import "./globals.css";
import { isOrderingEnabled, ORDERS_UNAVAILABLE_COPY } from "@/lib/storeSettings";
import { StoreProvider } from "@/context/StoreContext";
import { StoreSettingsProvider } from "@/context/StoreSettingsContext";
import { ProductCatalogProvider } from "@/context/ProductCatalogContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SupportPill from "@/components/support/SupportPill";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getCatalogData, getStoreSettings } from "@/lib/db/catalog";
import { getCurrentCustomer } from "@/lib/auth";
import { getSiteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "ghost.ma - Cartes de jeu au Maroc",
  description:
    "Cartes Steam, PlayStation, Xbox, Nintendo, Roblox et Valorant livrées rapidement après confirmation du paiement. Simple, sécurisé et adapté au Maroc.",
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
  const showOrdersBanner = Boolean(
    settings && !isOrderingEnabled(settings) && !showMaintenance && !ordersBannerSuppressed,
  );

  return (
    <html lang="en">
      <head>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-3DS42J47SN"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-3DS42J47SN');
            `,
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <StoreSettingsProvider initialSettings={settings}>
          <ProductCatalogProvider
            categories={catalog.categories}
            products={catalog.products}
          >
            <StoreProvider>
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
                <div className="flex min-h-screen flex-col">
                  {pathname.startsWith("/admin") ? null : (
                    <Navbar
                      customer={
                        customer
                          ? { name: customer.name, email: customer.email }
                          : null
                      }
                    />
                  )}
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
                  {pathname.startsWith("/admin") ? null : <Footer />}
                  {pathname.startsWith("/admin") ? null : <SupportPill />}
                </div>
              )}
            </StoreProvider>
          </ProductCatalogProvider>
        </StoreSettingsProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
