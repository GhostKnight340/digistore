import { AlertCircle } from "lucide-react";

export default function ErrorCard({
  title,
  description,
  onRetry,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-danger/[0.28] bg-danger/[0.06] p-4">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={1.8} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-text">{title}</p>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-xs font-semibold text-danger hover:underline"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
