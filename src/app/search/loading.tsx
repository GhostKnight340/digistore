import { Skeleton, ProductGridSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="container-page pt-6 pb-20 sm:py-10">
      <header className="mb-8 pt-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-40" />
      </header>
      <div className="space-y-10">
        <section className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <ProductGridSkeleton count={8} />
        </section>
      </div>
    </div>
  );
}
