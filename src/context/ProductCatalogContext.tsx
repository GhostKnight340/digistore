"use client";

import { createContext, useContext, useMemo } from "react";
import type { Category, Product } from "@/lib/types";
import type { ProductListItemDTO } from "@/lib/dto";

type ProductCatalogContextValue = {
  categories: Category[];
  products: Product[];
  /** Parent products (one entry per product, not per variant) — used by the footer. */
  parentProducts: ProductListItemDTO[];
  getProduct: (id: string) => Product | undefined;
};

const ProductCatalogContext = createContext<ProductCatalogContextValue | null>(
  null,
);

export function ProductCatalogProvider({
  categories,
  products,
  parentProducts = [],
  children,
}: {
  categories: Category[];
  products: Product[];
  parentProducts?: ProductListItemDTO[];
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    return {
      categories,
      products,
      parentProducts,
      getProduct: (id: string) => byId.get(id),
    };
  }, [categories, products, parentProducts]);

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
