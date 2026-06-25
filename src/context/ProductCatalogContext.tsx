"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { products as baseProducts } from "@/lib/products";
import {
  CATALOG_OVERRIDES_KEY,
  readCatalogOverrides,
  type ProductOverrides,
} from "@/lib/productCatalog";
import type { Product } from "@/lib/types";

type ProductCatalogContextValue = {
  products: Product[];
  overrides: ProductOverrides;
  ready: boolean;
  saveProduct: (id: string, patch: Partial<Product>) => void;
  resetProduct: (id: string) => void;
};

const ProductCatalogContext = createContext<ProductCatalogContextValue | null>(null);

function mergeProducts(overrides: ProductOverrides): Product[] {
  return baseProducts.map((p) => {
    const o = overrides[p.id];
    return o ? { ...p, ...o } : p;
  });
}

export function ProductCatalogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [overrides, setOverrides] = useState<ProductOverrides>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOverrides(readCatalogOverrides());
    setReady(true);
  }, []);

  const products = useMemo(() => mergeProducts(overrides), [overrides]);

  const saveProduct = useCallback((id: string, patch: Partial<Product>) => {
    setOverrides((prev) => {
      const next = { ...prev, [id]: { ...(prev[id] ?? {}), ...patch } };
      window.localStorage.setItem(CATALOG_OVERRIDES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetProduct = useCallback((id: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      window.localStorage.setItem(CATALOG_OVERRIDES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ products, overrides, ready, saveProduct, resetProduct }),
    [products, overrides, ready, saveProduct, resetProduct],
  );

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
