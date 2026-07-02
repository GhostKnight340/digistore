export default function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pb-5">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {children ? <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
