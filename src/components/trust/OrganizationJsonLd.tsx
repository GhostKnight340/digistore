import type { StoreSettings } from "@/lib/storeSettings";
import { getFooterSocialLinks } from "@/lib/footerConfig";
import { getSiteUrl } from "@/lib/siteUrl";

/**
 * Site-wide Organization + WebSite structured data. Rendered once from the root
 * layout so every page carries the entity graph that search engines and AI
 * crawlers use to understand (and cite) ghost.ma. Mirrors the JSON-LD escaping
 * approach used by FaqJsonLd. The WebSite node advertises the /search endpoint
 * as a SearchAction so the sitelinks searchbox can appear.
 */
export default function OrganizationJsonLd({
  settings,
}: {
  settings?: StoreSettings;
}) {
  const siteUrl = getSiteUrl();
  const name = settings?.branding.siteName?.trim() || "ghost.ma";
  const sameAs = settings ? getFooterSocialLinks(settings).map((l) => l.href) : [];
  const email = settings?.footer.contactEmail?.trim();

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name,
        url: siteUrl,
        logo: `${siteUrl}/brand/navigator-icon-512.png`,
        ...(sameAs.length ? { sameAs } : {}),
        ...(email
          ? {
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer support",
                email,
                areaServed: "MA",
                availableLanguage: ["fr", "ar"],
              },
            }
          : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: "fr",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteUrl}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify does not escape "<": settings-authored values (site name,
      // social URLs) must not be able to break out of this script element.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }}
    />
  );
}
