/** Account-area page header: mono eyebrow + title + subtitle (design handoff). */
export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-accent-strong">
        Espace client
      </p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-white sm:text-[33px] sm:tracking-[-0.03em]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted">{subtitle}</p>
    </header>
  );
}
