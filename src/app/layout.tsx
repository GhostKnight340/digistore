import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/context/StoreContext";
import { StoreSettingsProvider } from "@/context/StoreSettingsContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Karta - Cartes de jeu instantanées au Maroc",
  description:
    "Cartes Steam, PlayStation, Xbox, Nintendo, Roblox et Valorant livrées instantanément après paiement. Simple, sécurisé et adapté au Maroc.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <StoreSettingsProvider>
          <StoreProvider>
            <div className="flex min-h-screen flex-col">
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </StoreProvider>
        </StoreSettingsProvider>
      </body>
    </html>
  );
}
