import { getStoreSettings } from "@/lib/db/catalog";

export const revalidate = 30;

export default async function MaintenancePage() {
  const settings = await getStoreSettings().catch(() => undefined);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Maintenance
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
          {settings?.branding.siteName ?? "ghost.ma"} revient bientôt
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          {settings?.maintenance.message}
        </p>
        <div className="mt-6 flex justify-center gap-3 text-xs text-muted">
          <span>{settings?.footer.contactEmail}</span>
          <span>·</span>
          <span>{settings?.footer.whatsappNumber}</span>
        </div>
      </section>
    </main>
  );
}
