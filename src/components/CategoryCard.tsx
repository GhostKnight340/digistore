import Link from "next/link";
import type { Category, StockStatus } from "@/lib/types";
import ProductArt from "./ProductArt";

export default function CategoryCard({
  category,
  count,
  thumbnail,
  stockStatus,
}: {
  category: Category;
  count?: number;
  thumbnail?: string | null;
  stockStatus?: StockStatus;
}) {
  const productCount = count ?? category.productCount ?? 0;
  const media = thumbnail ?? category.coverImageUrl ?? category.iconUrl ?? null;
  return (
    <Link
      href={`/products?category=${category.id}`}
      className="group overflow-hidden rounded-[14px] border border-border bg-surface transition duration-200 hover:-translate-y-[3px] hover:border-border-strong hover:shadow-soft"
    >
      <ProductArt
        category={category.id}
        imageUrl={media}
        label={category.name}
        className="aspect-[16/10] w-full rounded-t-[14px]"
      />
      <div className="flex items-center justify-between px-[18px] py-4">
        <span className="text-[15px] font-medium text-text">{category.name}</span>
        <span className="font-mono text-xs text-faint">{productCount} cartes</span>
      </div>
      {stockStatus ? (
        <div className="px-[18px] pb-4 text-xs text-muted">
          {stockStatus === "in_stock" ? "En stock" : "En rupture"}
        </div>
      ) : null}
    </Link>
  );
}
