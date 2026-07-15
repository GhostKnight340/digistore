"use client";

import { feedbackStatusLabel, feedbackPriorityLabel } from "@/lib/feedback";

// Status conveyed by label + a leading dot for non-"new" states (never colour
// alone), matching the admin design system.
const STATUS_CLASS: Record<string, string> = {
  new: "border-accent/40 text-accent",
  reviewing: "border-amber-500/40 text-amber-400",
  planned: "border-sky-500/40 text-sky-400",
  implemented: "border-green-500/40 text-green-400",
  declined: "border-border text-faint",
  closed: "border-border text-faint",
};

export function FeedbackStatusBadge({ status }: { status: string }) {
  const cls = STATUS_CLASS[status] ?? "border-border text-faint";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {status !== "new" && <span aria-hidden>●</span>}
      {feedbackStatusLabel(status)}
    </span>
  );
}

const PRIORITY_CLASS: Record<string, string> = {
  low: "border-border text-faint",
  medium: "border-border text-muted",
  high: "border-amber-500/40 text-amber-400",
  critical: "border-red-500/50 text-red-300",
};

export function FeedbackPriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_CLASS[priority] ?? "border-border text-muted";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {(priority === "high" || priority === "critical") && <span aria-hidden>▲</span>}
      {feedbackPriorityLabel(priority)}
    </span>
  );
}
