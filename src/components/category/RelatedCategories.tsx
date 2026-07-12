import Link from "next/link";
import type { Category } from "@/lib/types";
import CategoryCard from "@/components/CategoryCard";

/**
 * Admin-curated related categories. The caller passes the already-resolved,
 * validated list (current category excluded, active only, deduped, ordered).
 * Reuses the storefront CategoryCard so the cards match the rest of the site.
 * Renders nothing when the list is empty.
 */
export default function RelatedCategories({
  title,
  categories,
}: {
  title?: string;
  categories: Category[];
}) {
  if (categories.length === 0) return null;

  return (
    <section className="mt-12 sm:mt-16">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight text-text">
          {title || "Catégories associées"}
        </h2>
        <Link
          href="/products"
          className="hidden text-sm font-medium text-accent hover:text-accent-hover sm:block"
        >
          Tout voir →
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-[18px] min-[390px]:grid-cols-2 md:grid-cols-4">
        {categories.map((category) => (
          <CategoryCard key={category.id} category={category} />
        ))}
      </div>
    </section>
  );
}
