import { visibleFaqItems, type FaqItemSetting } from "@/lib/trust/content";

/**
 * Emits FAQPage structured data for the visible FAQ items. Server component;
 * mirrors the JSON-LD approach already used by the category landing and GTA
 * pre-order pages so search engines can surface the Q&A.
 */
export default function FaqJsonLd({
  items,
  limit,
}: {
  items: FaqItemSetting[];
  limit?: number;
}) {
  const visible = visibleFaqItems(items);
  const scoped = typeof limit === "number" ? visible.slice(0, limit) : visible;
  if (scoped.length === 0) return null;

  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: scoped.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  // JSON.stringify does not escape "<": an admin-authored answer containing a
  // closing script tag would otherwise break out of this element.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }}
    />
  );
}
