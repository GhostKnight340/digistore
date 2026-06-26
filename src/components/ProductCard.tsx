import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatMAD } from "@/lib/format";
import ProductArt from "./ProductArt";

function StockBadge({ status }: { status: Product["stockStatus"] }) {
  if (!status) return null;
  if (status === "out_of_stock") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
        En rupture
      </span>
    );
  }
  if (status === "low_stock") {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
        Stock faible
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">
      En stock
    </span>
  );
}

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface transition duration-200 hover:-translate-y-[3px] hover:border-border-strong hover:shadow-soft"
    >
      <ProductArt category={product.category} className="aspect-[3/2] w-full" />
      <div className="flex flex-1 flex-col p-4">
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
        <h3 className="line-clamp-2 text-[14.5px] font-medium leading-snug text-text">
          {product.name}
        </h3>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="font-mono text-lg font-semibold tracking-tight text-text">
            {formatMAD(product.price)}
          </span>
          <StockBadge status={product.stockStatus} />
        </div>
      </div>
    </Link>
  );
}
