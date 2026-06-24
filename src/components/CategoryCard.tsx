import Link from "next/link";
import type { Category } from "@/lib/types";
import { getProductsByCategory } from "@/lib/products";
import ProductArt from "./ProductArt";

export default function CategoryCard({ category }: { category: Category }) {
  const count = getProductsByCategory(category.id).length;
  return (
    <Link
      href={`/products?category=${category.id}`}
      className="group overflow-hidden rounded-[14px] border border-border bg-surface transition duration-200 hover:-translate-y-[3px] hover:border-border-strong hover:shadow-soft"
    >
      <ProductArt
        category={category.id}
        className="aspect-[16/10] w-full"
      />
      <div className="flex items-center justify-between px-[18px] py-4">
        <span className="text-[15px] font-medium text-text">
          {category.name}
        </span>
        <span className="font-mono text-xs text-faint">
          {count} cartes
        </span>
      </div>
    </Link>
  );
}
