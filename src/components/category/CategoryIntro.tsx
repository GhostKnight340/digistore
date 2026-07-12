import { normalizeLegalHtml } from "@/lib/legalHtml";

/**
 * Concise category introduction. Reuses the storefront's existing safe
 * markdown/HTML renderer (`normalizeLegalHtml` — allowlist sanitized, no unsafe
 * arbitrary HTML) and the shared `.legal-content` prose styling, capped to a
 * comfortable reading width so the page doesn't become a long article.
 */
export default function CategoryIntro({ intro }: { intro: string }) {
  const html = normalizeLegalHtml(intro).trim();
  if (!html) return null;

  return (
    <section className="mt-8 sm:mt-10">
      <div
        // Use text-[1rem], not text-base: the theme's `base` color collides
        // with Tailwind's text-base and injects the background color (see
        // globals.css .legal-content). Arbitrary sizes avoid that.
        className="legal-content !mt-0 max-w-3xl text-[15px] sm:text-[1rem]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
