import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/context/StoreContext";
import { StoreSettingsProvider } from "@/context/StoreSettingsContext";
import { ProductCatalogProvider } from "@/context/ProductCatalogContext";
import StorefrontChrome from "@/components/StorefrontChrome";
import { getCatalogData, getStoreSettings } from "@/lib/db/catalog";

export const revalidate = 3600;

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
  const [catalog, settings] = await Promise.all([
    getCatalogData().catch(() => ({ categories: [], products: [] })),
    getStoreSettings().catch(() => undefined),
  ]);

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
              <StorefrontChrome>{children}</StorefrontChrome>
            </StoreProvider>
          </ProductCatalogProvider>
        </StoreSettingsProvider>
      </body>
    </html>
  );
}
