/**
 * Full operational activity log behind the dashboard's live feed. Merges the
 * same four event sources over a larger recent window, then applies type
 * filter, text search, sort and pagination. The window is bounded (the volume
 * is small pre-launch); when it's saturated the response says so, so the count
 * is never silently misleading.
 */
import "server-only";
import { fetchActivityWindow, type ActivityItem } from "./metrics";
import type { OpsActivityLogFilters, OpsActivityLogPageDTO } from "@/lib/dto";

/** Per-source cap. 300 × 4 sources covers all realistic pre-launch history. */
const WINDOW_PER_SOURCE = 300;
const PAGE_SIZE = 30;

const KIND_LABELS: Record<ActivityItem["kind"], string> = {
  order: "Commande",
  payment: "Paiement",
  supplier: "Fournisseur",
  email: "E-mail",
};

export async function getActivityLog(
  filters: OpsActivityLogFilters,
): Promise<OpsActivityLogPageDTO> {
  const all = await fetchActivityWindow(WINDOW_PER_SOURCE);
  const windowSaturated = all.length >= WINDOW_PER_SOURCE * 4;

  const type = filters.type && filters.type !== "all" ? filters.type : null;
  const search = filters.search?.trim().toLowerCase() ?? "";
  const sort = filters.sort === "oldest" ? "oldest" : "newest";
  const page = Math.max(1, filters.page ?? 1);

  let rows = all;
  if (type) rows = rows.filter((r) => r.kind === type);
  if (search) {
    rows = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(search) ||
        r.detail.toLowerCase().includes(search) ||
        KIND_LABELS[r.kind].toLowerCase().includes(search),
    );
  }
  // fetchActivityWindow returns newest-first; reverse for oldest-first.
  if (sort === "oldest") rows = [...rows].reverse();

  const total = rows.length;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return {
    rows: pageRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      kindLabel: KIND_LABELS[r.kind],
      title: r.title,
      detail: r.detail,
      at: r.at,
      href: r.href,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    windowSaturated,
  };
}
