"use client";

import { createContext, useContext, useMemo } from "react";
import type { Category, Product } from "@/lib/types";
import { cartIdentityKey, productIdentityKey, type CartIdentity } from "@/lib/cartIdentity";

type ProductCatalogContextValue = {
  categories: Category[];
  products: Product[];
  getProduct: (id: string) => Product | undefined;
  /** Resolve a catalogue product by its stable natural key (parent + denomination
   * + region), used to re-bind cart items whose SKU/id was renamed. */
  findProductByIdentity: (parts: CartIdentity) => Product | undefined;
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
    // First writer wins: if two variants share a natural key (e.g. same
    // denomination/region but different provider mapping), we re-bind to the
    // one the catalogue lists first rather than dropping the cart item.
    const byIdentity = new Map<string, Product>();
    for (const product of products) {
      const key = productIdentityKey(product);
      if (key && !byIdentity.has(key)) byIdentity.set(key, product);
    }
    return {
      categories,
      products,
      getProduct: (id: string) => byId.get(id),
      findProductByIdentity: (parts: CartIdentity) => {
        const key = cartIdentityKey(parts);
        return key ? byIdentity.get(key) : undefined;
      },
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
