import PageHeader from "./PageHeader";

/**
 * Hosts a pre-redesign admin panel inside the new AppShell while its screen
 * awaits a full redesign pass (see docs/admin-redesign/06 §v1/v2 sequence).
 */
export default function LegacyPanelScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="min-w-0 max-w-full pb-10">{children}</div>
    </div>
  );
}
