"use client";

import { createContext, useContext, useMemo } from "react";
import type { Category, Product } from "@/lib/types";

type ProductCatalogContextValue = {
  categories: Category[];
  products: Product[];
  getProduct: (id: string) => Product | undefined;
};

const ProductCatalogContext = createContext<ProductCatalogContextValue | null>(
  null,
);

export function ProductCatalogProvider({
  categories,
  products,
  children,
}: {
  categories: Category[];
  products: Product[];
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    return {
      categories,
      products,
      getProduct: (id: string) => byId.get(id),
    };
  }, [categories, products]);

  return (
    <ProductCatalogContext.Provider value={value}>
      {children}
    </ProductCatalogContext.Provider>
  );
}

export function useProductCatalog() {
  const ctx = useContext(ProductCatalogContext);
  if (!ctx) {
    throw new Error("useProductCatalog must be used within ProductCatalogProvider");
  }
  return ctx;
}
