import Link from "next/link";
import { normalizeLegalHtml } from "@/lib/legalHtml";
import { isValidGuideUrl, type GuideBlock } from "@/lib/guide";
import type { Product } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import NavigatorTip from "@/components/category/NavigatorTip";

/**
 * Renders a guide's typed content blocks. Rich text (paragraph/warning) is ALWAYS
 * passed through `normalizeLegalHtml` (the shared allowlist sanitizer) before it
 * reaches the DOM, so no unsafe HTML can render regardless of what was stored.
 * Structured blocks (steps, images, tips, product recommendations) render as
 * first-class components — this is deliberately not a general HTML page builder.
 */
export default function GuideContent({
  blocks,
  productCards,
  paymentMethods = [],
}: {
  blocks: GuideBlock[];
  /** DB product id → resolved public card, for product-recommendation blocks. */
  productCards: Map<string, Product>;
  paymentMethods?: { name: string }[];
}) {
  return (
    <div className="space-y-6">
      {blocks.map((block) => {
        switch (block.type) {
          case "heading":
            return (
              <h2
                key={block.id}
                id={block.id}
                className="scroll-mt-24 text-xl font-semibold tracking-tight text-white sm:text-2xl"
              >
                {block.text}
              </h2>
            );
          case "paragraph":
            return (
              <div
                key={block.id}
                className="legal-content text-[15px] leading-relaxed text-muted"
                dangerouslySetInnerHTML={{ __html: normalizeLegalHtml(block.text) }}
              />
            );
          case "steps":
            return (
              <ol key={block.id} className="space-y-3">
                {block.items.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-sm font-semibold text-accent">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-[15px] leading-relaxed text-muted">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>
            );
          case "list":
            return (
              <ul key={block.id} className="space-y-2">
                {block.items.map((item, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-muted">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            );
          case "image":
            return (
              <figure key={block.id} className="overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={block.url}
                  alt={block.alt}
                  className="w-full"
                  loading="lazy"
                  decoding="async"
                />
                {block.caption ? (
                  <figcaption className="border-t border-border bg-surface px-4 py-2 text-xs text-faint">
                    {block.caption}
                  </figcaption>
                ) : null}
              </figure>
            );
          case "warning":
            return (
              <div
                key={block.id}
                role="note"
                /* `warning` is not a colour in tailwind.config.ts, so the
                   previous border-warning/bg-warning classes rendered as
                   nothing. Amber, explicitly — same treatment as the
                   structured guide's intro warning. */
                className="flex gap-3 rounded-xl border border-amber-500/40 border-l-2 border-l-amber-400 bg-amber-500/10 p-4"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
                  aria-hidden
                >
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                </svg>
                <p className="text-sm leading-relaxed text-[#f6d9ad]">{block.text}</p>
              </div>
            );
          case "tip":
            return (
              <NavigatorTip
                key={block.id}
                tip={{
                  enabled: true,
                  title: block.title,
                  message: block.message,
                  type: block.tipType,
                  ctaLabel: "",
                  ctaUrl: "",
                }}
              />
            );
          case "payment":
            return (
              <div key={block.id} className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold text-white">{block.title}</h3>
                {block.note ? (
                  <p className="mt-1 text-sm text-muted">{block.note}</p>
                ) : null}
                {paymentMethods.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {paymentMethods.map((method) => (
                      <span
                        key={method.name}
                        className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted"
                      >
                        {method.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          case "product": {
            const card = productCards.get(block.productId);
            if (!card) return null;
            return (
              <div key={block.id} className="max-w-xs">
                <ProductCard product={card} />
              </div>
            );
          }
          case "cta":
            return isValidGuideUrl(block.url) ? (
              <div key={block.id}>
                <Link href={block.url} className="btn-primary">
                  {block.label}
                </Link>
              </div>
            ) : null;
          default:
            return null;
        }
      })}
    </div>
  );
}
