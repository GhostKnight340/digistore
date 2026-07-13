import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GtaPreorderView from "@/components/gta/GtaPreorderView";
import {
  gtaFaqItems,
  gtaPreorderConfig,
  parsePlatform,
} from "@/lib/gtaPreorder";
import { absoluteUrl } from "@/lib/siteUrl";

// Force-dynamic so the `?platform=` selection and the countdown are evaluated
// per request (matching the category/collection landing pages). Catalogue reads
// stay cached via unstable_cache tags inside the data layer.
export const dynamic = "force-dynamic";

type Search = Promise<{ platform?: string }>;

export function generateMetadata(): Metadata {
  const { seo } = gtaPreorderConfig;
  if (!gtaPreorderConfig.active) return { title: "Page introuvable - ghost.ma" };

  const canonical = seo.canonicalPath;
  const images = seo.ogImageUrl ? [seo.ogImageUrl] : undefined;
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: canonical,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}

export default async function GtaPreorderPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  if (!gtaPreorderConfig.active) notFound();

  const { platform } = await searchParams;
  const selectedPlatform = parsePlatform(platform);
  const now = new Date();

  const canonical = absoluteUrl(gtaPreorderConfig.seo.canonicalPath);
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: absoluteUrl("/") },
      {
        "@type": "ListItem",
        position: 2,
        name: "Précommande GTA VI",
        item: canonical,
      },
    ],
  };
  // FAQ structured data from only the visible FAQ content.
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: gtaFaqItems().map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <GtaPreorderView selectedPlatform={selectedPlatform} now={now} />
    </>
  );
}
