import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/context/StoreContext";
import { StoreSettingsProvider } from "@/context/StoreSettingsContext";
import { ProductCatalogProvider } from "@/context/ProductCatalogContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getCatalogData, getStoreSettings } from "@/lib/db/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Karta - Cartes de jeu instantanées au Maroc",
  description:
    "Cartes Steam, PlayStation, Xbox, Nintendo, Roblox et Valorant livrées instantanément après paiement. Simple, sécurisé et adapté au Maroc.",
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
      <body className="min-h-screen font-sans antialiased">
        <StoreSettingsProvider initialSettings={settings}>
          <ProductCatalogProvider
            categories={catalog.categories}
            products={catalog.products}
          >
            <StoreProvider>
              <div className="flex min-h-screen flex-col">
                <Navbar />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
            </StoreProvider>
          </ProductCatalogProvider>
        </StoreSettingsProvider>
      </body>
    </html>
  );
}
