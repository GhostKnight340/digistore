import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CategoryLandingView from "@/components/category/CategoryLandingView";
import { getCategoryDetail } from "@/lib/db/catalog";
import { defaultCategoryLanding } from "@/lib/categoryLanding";
import { categoryHref } from "@/lib/categoryUrl";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type Search = Promise<{ region?: string; page?: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryDetail(slug);
  if (!category) return { title: "Catégorie introuvable - ghost.ma" };

  const landing = category.landing ?? defaultCategoryLanding();
  const title = landing.seo.title || `Carte ${category.name} au Maroc | ghost.ma`;
  const description =
    landing.seo.description ||
    category.description ||
    `Achetez vos cartes ${category.name} au Maroc : paiement local en dirham, codes officiels livrés par e-mail après confirmation.`;
  const canonical = categoryHref(category);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      images: landing.seo.imageUrl ? [landing.seo.imageUrl] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CategoryLandingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  const category = await getCategoryDetail(slug);
  if (!category) notFound();

  const { region, page: rawPage } = await searchParams;
  const page = Math.max(1, Number(rawPage ?? 1) || 1);

  return <CategoryLandingView category={category} region={region} page={page} />;
}
