import Link from "next/link";
import Image from "next/image";
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
  return (
    <Link
      href={`/products?category=${category.id}`}
      className="group overflow-hidden rounded-[14px] border border-border bg-surface transition duration-200 hover:-translate-y-[3px] hover:border-border-strong hover:shadow-soft"
    >
      {thumbnail ? (
        <Image
          src={thumbnail}
          alt={category.name}
          width={400}
          height={250}
          className="aspect-[16/10] w-full object-cover"
        />
      ) : (
        <ProductArt category={category.id} className="aspect-[16/10] w-full" />
      )}
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
