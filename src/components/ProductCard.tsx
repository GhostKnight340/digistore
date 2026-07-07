import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatMAD } from "@/lib/format";
import ProductArt from "./ProductArt";
import RegionBadge, { regionTitleSuffix } from "./RegionBadge";

export default function ProductCard({
  product,
  featured = false,
}: {
  product: Product;
  featured?: boolean;
}) {
  const suffix = regionTitleSuffix(product.region);
  return (
    <Link
      href={product.href ?? `/products/${product.id}`}
      className={`group flex min-w-0 flex-col overflow-hidden rounded-[14px] border bg-surface transition duration-200 ${
        featured
          ? "border-border-strong shadow-soft hover:-translate-y-1 hover:border-accent/45 hover:shadow-[0_22px_54px_rgba(0,0,0,0.38)]"
          : "border-border hover:-translate-y-[3px] hover:border-border-strong hover:shadow-soft"
      }`}
    >
      <div className="relative shrink-0">
        <ProductArt
          category={product.category}
          imageUrl={product.imageUrl}
          label={product.name}
          className={`w-full rounded-t-[14px] transition duration-200 group-hover:scale-[1.015] ${
            featured ? "aspect-[1.45]" : "aspect-[16/9]"
          }`}
        />
        <RegionBadge code={product.region} variant="overlay" className="absolute left-2.5 top-2.5" />
      </div>
      <div className={`flex min-w-0 flex-1 flex-col ${featured ? "p-5" : "p-4"}`}>
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
        <h3 className={`line-clamp-2 font-medium leading-snug text-text ${featured ? "text-[15px]" : "text-[14.5px]"}`}>
          {product.name}
          {suffix.label && <> <span className={suffix.className}>{suffix.label}</span></>}
        </h3>
        <div className={`${featured ? "mt-4" : "mt-3"} flex flex-wrap items-baseline justify-between gap-2`}>
          <span className={`font-mono font-semibold tracking-tight text-text ${featured ? "text-xl" : "text-lg"}`}>
            {formatMAD(product.price)}
          </span>
          <span className="min-w-0 truncate text-xs text-faint">{product.categoryName}</span>
        </div>
      </div>
    </Link>
  );
}
