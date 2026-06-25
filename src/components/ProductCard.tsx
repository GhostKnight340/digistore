import Link from "next/link";
import type { Product } from "@/lib/types";
import { getCategory } from "@/lib/products";
import { formatMAD } from "@/lib/format";
import ProductArt from "./ProductArt";

export default function ProductCard({
  product,
  outOfStock = false,
}: {
  product: Product;
  outOfStock?: boolean;
}) {
  const cat = getCategory(product.category);
  return (
    <Link
      href={`/products/${product.id}`}
      className="group relative flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface transition duration-200 hover:-translate-y-[3px] hover:border-border-strong hover:shadow-soft"
    >
      <ProductArt category={product.category} className="aspect-[3/2] w-full" />

      {outOfStock && (
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-muted backdrop-blur-sm">
          Rupture de stock
        </span>
      )}

      <div className="flex flex-1 flex-col p-4">
        {outOfStock ? (
          <span className="mb-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-medium text-muted">
            Indisponible
          </span>
        ) : (
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
            Instantané
          </span>
        )}
        <h3 className={`line-clamp-2 text-[14.5px] font-medium leading-snug ${outOfStock ? "text-muted" : "text-text"}`}>
          {product.name}
        </h3>
        <div className="mt-3 flex items-baseline justify-between">
          <span className={`font-mono text-lg font-semibold tracking-tight ${outOfStock ? "text-muted" : "text-text"}`}>
            {formatMAD(product.price)}
          </span>
          <span className="text-xs text-faint">{cat?.name}</span>
        </div>
      </div>
    </Link>
  );
}
