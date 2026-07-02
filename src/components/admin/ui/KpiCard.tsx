export default function KpiCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  tone?: "warning" | "danger";
}) {
  const border =
    tone === "warning"
      ? "border-warning/[0.22]"
      : tone === "danger"
        ? "border-danger/[0.22]"
        : "border-white/[0.07]";
  return (
    <div className={`rounded-card border bg-admin-surface p-[18px] ${border}`}>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fainter">
        {label}
      </p>
      <p className="mt-2 font-mono text-[27px] font-semibold leading-none tracking-[-0.02em] text-text">
        {value}
      </p>
      {detail ? <p className="mt-2 text-xs text-muted">{detail}</p> : null}
    </div>
  );
}
