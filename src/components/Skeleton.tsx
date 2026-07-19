/**
 * Shared skeleton primitives for route-level loading.tsx fallbacks.
 * Same visual language as the inline skeletons in HeaderSearch and
 * admin/operations/shared.tsx: a pulsing block on the surface2 token.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-surface2 ${className}`} />;
}

/** Mirrors ProductCard: 16/9 media then title, meta and price lines. */
export function ProductCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-surface">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="p-3.5">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="mt-2.5 h-4 w-4/5" />
        <Skeleton className="mt-2 h-3 w-1/3" />
        <Skeleton className="mt-3 h-5 w-20" />
      </div>
    </div>
  );
}

/** The 1/2/3/4-column product grid used by the catalogue and search. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
