import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatMAD } from "@/lib/format";
import ProductArt from "./ProductArt";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={product.href ?? `/products/${product.id}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-surface transition duration-200 hover:-translate-y-[3px] hover:border-border-strong hover:shadow-soft"
    >
      <ProductArt
        category={product.category}
        imageUrl={product.imageUrl}
        label={product.name}
        className="aspect-[16/9] w-full shrink-0 rounded-t-[14px]"
      />
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <span className="mb-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            className="h-2.5 w-2.5"
            aria-hidden
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Livraison rapide
        </span>
        <h3 className="line-clamp-2 text-[14.5px] font-medium leading-snug text-text">
          {product.name}
        </h3>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-lg font-semibold tracking-tight text-text">
            {formatMAD(product.price)}
          </span>
          <span className="min-w-0 truncate text-xs text-faint">{product.categoryName}</span>
        </div>
      </div>
    </Link>
  );
}
