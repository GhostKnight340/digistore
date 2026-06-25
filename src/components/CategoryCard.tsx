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
  const outOfStock = stockStatus === "out_of_stock";
  return (
    <Link
      href={`/products?category=${category.id}`}
      className="group overflow-hidden rounded-[14px] border border-border bg-surface transition duration-200 hover:-translate-y-[3px] hover:border-border-strong hover:shadow-soft"
    >
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnail}
          alt={category.name}
          className="aspect-[16/10] w-full object-cover"
        />
      ) : (
        <ProductArt
          category={category.id}
          className="aspect-[16/10] w-full"
        />
      )}
      <div className="flex items-center justify-between px-[18px] py-4">
        <span className="text-[15px] font-medium text-text">
          {category.name}
        </span>
        <div className="flex items-center gap-2">
          {stockStatus && (
            <span className={`text-[10.5px] font-medium ${outOfStock ? "text-yellow-500" : "text-green-400"}`}>
              {outOfStock ? "En rupture" : "En stock"}
            </span>
          )}
          {count !== undefined && (
            <span className="font-mono text-xs text-faint">
              {count} cartes
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
