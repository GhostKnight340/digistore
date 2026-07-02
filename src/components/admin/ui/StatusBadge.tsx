import Badge from "./Badge";
import { orderStatusMeta } from "@/lib/adminStatus";

export default function StatusBadge({ status }: { status: string }) {
  const meta = orderStatusMeta(status);
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}
