import type { CategoryInfoItem } from "@/lib/categoryLanding";
import { CategoryInfoIcon } from "./categoryIcons";

/**
 * Up to four compact trust / information points for a category. Matches the
 * TrustStrip card idiom (accent-soft icon chip + title + optional one-liner).
 * Items are already filtered/ordered by the caller (visibleInfoItems).
 */
export default function CategoryInfoPoints({
  items,
}: {
  items: CategoryInfoItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-8 sm:mt-10">
      <div className="grid gap-[14px] min-[430px]:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-[14px] border border-border bg-surface2 p-5"
          >
            <span className="mb-3 grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-accent-soft text-accent">
              <CategoryInfoIcon name={item.icon} />
            </span>
            <h3 className="text-[14.5px] font-semibold text-text">{item.title}</h3>
            {item.description && (
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {item.description}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
