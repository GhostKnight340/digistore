import { normalizeLegalHtml } from "@/lib/legalHtml";

/**
 * Concise category introduction, presented in a bordered panel (matching the
 * FAQ / Navigator-tip cards) so it reads as a deliberate section rather than
 * loose text on the page. Reuses the storefront's safe markdown/HTML renderer
 * (`normalizeLegalHtml` — allowlist sanitized) and the shared `.legal-content`
 * prose styling. A small eyebrow labels the block; the body width is capped for
 * comfortable reading.
 */
export default function CategoryIntro({
  intro,
  title = "À propos",
}: {
  intro: string;
  title?: string;
}) {
  const html = normalizeLegalHtml(intro).trim();
  if (!html) return null;

  return (
    <section className="mt-8 sm:mt-10">
      <div className="rounded-[18px] border border-border bg-surface/50 p-6 sm:p-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
          {title}
        </p>
        <div
          className="legal-content !mt-4 max-w-3xl text-[15px] sm:text-base"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </section>
  );
}
