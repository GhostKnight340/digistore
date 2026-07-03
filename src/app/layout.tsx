import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { StoreProvider } from "@/context/StoreContext";
import { StoreSettingsProvider } from "@/context/StoreSettingsContext";
import { ProductCatalogProvider } from "@/context/ProductCatalogContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getCatalogData, getStoreSettings } from "@/lib/db/catalog";
import { getCurrentCustomer, isAdminCustomer } from "@/lib/auth";
import { MAINTENANCE_BYPASS_COOKIE, shouldShowMaintenance } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ghost.ma - Cartes de jeu au Maroc",
  description:
    "Cartes Steam, PlayStation, Xbox, Nintendo, Roblox et Valorant livrées rapidement après confirmation du paiement. Simple, sécurisé et adapté au Maroc.",
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
  const bypassCookie = (await cookies()).get(MAINTENANCE_BYPASS_COOKIE)?.value;
  const showMaintenance = shouldShowMaintenance({
    enabled: Boolean(settings?.maintenance.enabled),
    pathname,
    isAdmin: isAdminCustomer(customer),
    bypassCookie,
  });

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
                  <main className="flex-1">{children}</main>
                  {pathname.startsWith("/admin") ? null : <Footer />}
                </div>
              )}
            </StoreProvider>
          </ProductCatalogProvider>
        </StoreSettingsProvider>
      </body>
    </html>
  );
}
