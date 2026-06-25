import Link from "next/link";
import type { Product } from "@/lib/types";
import { getCategory } from "@/lib/products";
import { formatMAD } from "@/lib/format";
import ProductArt from "./ProductArt";

function displayTitle(product: Product): string {
  if (product.parentName && product.faceValue != null) {
    return `${product.parentName} ${product.faceValue} ${product.faceCurrency ?? "MAD"}`;
  }
  return product.name;
}

export default function ProductCard({ product }: { product: Product }) {
  const cat = getCategory(product.category);
  const title = displayTitle(product);
  const outOfStock = product.stockStatus === "out_of_stock";
  return (
    <Link
      href={`/products/${product.id}`}
      className={`group flex flex-col overflow-hidden rounded-[14px] border bg-surface transition duration-200 hover:-translate-y-[3px] hover:shadow-soft ${
        outOfStock
          ? "border-border opacity-70 hover:border-border"
          : "border-border hover:border-border-strong"
      }`}
    >
      {product.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.thumbnail}
          alt={title}
          className="aspect-[3/2] w-full object-cover"
        />
      ) : (
        <ProductArt category={product.category} className="aspect-[3/2] w-full" />
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
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
          <span className={`text-[10.5px] font-medium ${outOfStock ? "text-yellow-500" : "text-green-400"}`}>
            {outOfStock ? "En rupture" : "En stock"}
          </span>
        </div>
        <h3 className="line-clamp-2 text-[14.5px] font-medium leading-snug text-text">
          {title}
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
