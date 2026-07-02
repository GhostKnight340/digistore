export default function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon ? (
        <div className="mb-1 grid h-11 w-11 place-items-center rounded-xl border border-white/[0.08] bg-admin-input text-muted">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-text">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
