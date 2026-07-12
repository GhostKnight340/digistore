import Link from "next/link";

/**
 * Compact closing support/catalogue CTA for a category landing page. Small by
 * design (not a second hero); uses the real support and catalogue routes and
 * the current button styles.
 */
export default function CategoryFinalCta() {
  return (
    <section className="mt-12 sm:mt-16">
      <div className="flex flex-col items-center gap-4 rounded-[18px] border border-border bg-gradient-to-b from-surface to-surface/40 px-6 py-8 text-center sm:py-10">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-text">
            Besoin d&apos;aide avant de commander&nbsp;?
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Notre équipe répond à vos questions avant l&apos;achat.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/support" className="btn-primary h-11 px-6 text-[15px]">
            Contacter le support
          </Link>
          <Link href="/products" className="btn-ghost h-11 px-6 text-[15px]">
            Voir tout le catalogue
          </Link>
        </div>
      </div>
    </section>
  );
}
