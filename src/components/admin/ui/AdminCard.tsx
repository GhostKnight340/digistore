export default function AdminCard({
  title,
  eyebrow,
  actions,
  padded = true,
  tone,
  className = "",
  children,
}: {
  title?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  padded?: boolean;
  tone?: "warning" | "danger" | "accent";
  className?: string;
  children: React.ReactNode;
}) {
  const toneBorder =
    tone === "warning"
      ? "border-warning/[0.22]"
      : tone === "danger"
        ? "border-danger/[0.22]"
        : tone === "accent"
          ? "border-accent/[0.22]"
          : "border-white/[0.07]";
  return (
    <section
      className={`rounded-card border bg-admin-surface ${toneBorder} ${
        padded ? "p-[18px]" : ""
      } ${className}`}
    >
      {title || eyebrow || actions ? (
        <div className={`flex items-center gap-3 ${padded ? "mb-3.5" : "border-b border-white/[0.06] px-[18px] py-3.5"}`}>
          <div className="min-w-0">
            {eyebrow ? (
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fainter">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="text-sm font-semibold text-text">{title}</h2>
            ) : null}
          </div>
          {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
