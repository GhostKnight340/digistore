import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="container-page py-6 pb-[max(96px,calc(80px+env(safe-area-inset-bottom)))] lg:py-10 lg:pb-16">
      <div className="grid gap-5 lg:grid-cols-[264px_1fr] lg:gap-[26px]">
        {/* Navigation latérale */}
        <Skeleton className="hidden h-[420px] rounded-[18px] lg:block" />
        <Skeleton className="h-14 rounded-[18px] lg:hidden" />

        <section className="min-w-0 space-y-5">
          <div>
            <Skeleton className="h-7 w-52" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
          <div className="rounded-[18px] border border-border bg-card p-4 shadow-soft sm:p-[26px]">
            <div className="space-y-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
