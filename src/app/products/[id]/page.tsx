import { redirect, notFound } from "next/navigation";
import {
  parentProducts,
  getParentProduct,
  getVariantById,
  getParentsByCategory,
} from "@/lib/products";
import { getStorefrontStockStatus } from "@/lib/db/inventory";
import { getParentFromDB } from "@/lib/db/catalog";
import type { CatalogParent } from "@/lib/db/catalog";
import type { CategoryId, ParentProduct } from "@/lib/types";
import ProductDetailClient from "./ProductDetailClient";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return parentProducts.map((p) => ({ id: p.id }));
}

function dbParentToParent(db: CatalogParent): ParentProduct {
  return {
    id: db.slug,
    name: db.name,
    category: db.category as CategoryId,
    brand: db.brand ?? undefined,
    region: db.region,
    deliveryType: db.deliveryType,
    description: db.description,
    shortDescription: db.shortDescription ?? undefined,
    longDescription: db.longDescription ?? undefined,
    instructions: db.instructions ?? undefined,
    thumbnail: db.thumbnail ?? undefined,
    active: db.active,
    variants: db.variants.map((v) => ({
      id: v.slug,
      productId: db.slug,
      faceValue: v.faceValue ?? 0,
      faceCurrency: v.faceCurrency,
      price: v.priceMad,
      featured: v.featured,
      active: v.active,
    })),
  };
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v: variantParam } = await searchParams;

  // Try DB first, fall back to static catalog
  let parent: ParentProduct | null = null;
  try {
    const dbParent = await getParentFromDB(id);
    if (dbParent) parent = dbParentToParent(dbParent);
  } catch {
    // DB not configured or error — fall back to static
  }
  if (!parent) parent = getParentProduct(id) ?? null;

  if (!parent) {
    // Legacy variant URL: /products/steam-50 → /products/steam-wallet?v=steam-50
    const variant = getVariantById(id);
    if (variant) redirect(`/products/${variant.productId}?v=${id}`);
    notFound();
  }

  let stockStatus: Record<string, { unused: number; stockControl: string }> = {};
  try {
    stockStatus = await getStorefrontStockStatus();
  } catch {
    // DB not configured — treat everything as in-stock
  }

  const related = getParentsByCategory(parent.category).filter(
    (p) => p.id !== parent!.id,
  );

  return (
    <ProductDetailClient
      parent={parent}
      initialVariantId={variantParam}
      stockStatus={stockStatus}
      related={related}
    />
  );
}
