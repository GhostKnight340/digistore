import { CardSkeleton } from "@/components/admin/operations/shared";
import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="container-page py-8">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <CardSkeleton rows={4} />
        </div>
        <div className="card p-5">
          <CardSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
