import { redirect, notFound } from "next/navigation";
import {
  parentProducts,
  getParentProduct,
  getVariantById,
  getParentsByCategory,
} from "@/lib/products";
import { getStorefrontStockStatus } from "@/lib/db/inventory";
import ProductDetailClient from "./ProductDetailClient";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return parentProducts.map((p) => ({ id: p.id }));
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

  const parent = getParentProduct(id);

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
    (p) => p.id !== parent.id,
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
