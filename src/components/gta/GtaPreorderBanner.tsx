import TrackedLink from "@/components/gta/TrackedLink";
import {
  GTA_CAMPAIGN_ID,
  GTA_PREORDER_PATH,
  gtaPreorderConfig,
} from "@/lib/gtaPreorder";

/**
 * Homepage entry point to the GTA VI pre-order campaign. A restrained premium
 * banner (dark card, subtle blue glow) that links to `/precommande-gta-6`. Only
 * rendered when the campaign is active. Purely a navigation card — no game
 * artwork, no "buy the game" wording.
 */
export default function GtaPreorderBanner() {
  if (!gtaPreorderConfig.active) return null;
  const { releaseInfo } = gtaPreorderConfig;

  return (
    <section className="mt-8 sm:mt-12">
      <TrackedLink
        href={GTA_PREORDER_PATH}
        event="select_gta_banner"
        params={{ campaign: GTA_CAMPAIGN_ID, source: "homepage" }}
        className="group relative flex flex-col gap-5 overflow-hidden rounded-[20px] border border-border bg-[linear-gradient(158deg,#1d2638_0%,#141a27_52%,#0d1017_100%)] p-6 shadow-soft transition hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[20px] border border-accent/25 shadow-[inset_0_0_90px_rgba(62,123,250,0.12)]"
        />
        <div className="relative min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
            Précommande GTA VI
          </span>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Préparez votre précommande de GTA VI
          </h2>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-muted">
            Ajoutez le crédit nécessaire avec une carte PlayStation ou Xbox, puis
            précommandez sur la boutique officielle. Sortie&nbsp;:{" "}
            {releaseInfo.dateLabel}.
          </p>
        </div>
        <span className="relative inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-accent px-5 py-2.5 text-[14px] font-semibold text-white shadow-glow transition group-hover:-translate-y-px sm:self-auto">
          Découvrir
          <span aria-hidden>→</span>
        </span>
      </TrackedLink>
    </section>
  );
}
