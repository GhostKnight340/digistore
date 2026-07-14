import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProductBySlug,
  getParentProductSlugs,
  getProductsByCategorySlug,
} from "@/lib/db/catalog";
import ProductArt from "@/components/ProductArt";
import ProductCard from "@/components/ProductCard";
import AddToCartForm from "@/components/AddToCartForm";
import RegionBadge, { regionTitleSuffix } from "@/components/RegionBadge";
import RegionPanel from "@/components/RegionPanel";
import RegionFlag from "@/components/RegionFlag";
import NavigatorTips from "@/components/trust/NavigatorTips";
import AcceptedPayments from "@/components/trust/AcceptedPayments";
import { getRegion } from "@/lib/regions";

export async function generateStaticParams() {
  const slugs = await getParentProductSlugs().catch(() => []);
  return slugs.map((id) => ({ id }));
}

const howItWorks = [
  { n: "01", title: "Choisissez votre montant", text: "Sélectionnez la valeur ou la formule qui vous convient." },
  { n: "02", title: "Payez en toute sécurité", text: "Choisissez un mode de paiement disponible." },
  { n: "03", title: "Recevez votre produit numérique", text: "Disponible après confirmation du paiement." },
];

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string; region?: string }>;
}) {
  const { id } = await params;
  const { variant: rawVariant, region: rawRegion } = await searchParams;
  const product = await getProductBySlug(id);
  if (!product) notFound();

  const variants = product.variants ?? [];
  // Distinct variant regions, in variant order. Multi-region → show a selector.
  const regions = [...new Set(variants.map((v) => v.region))].filter(Boolean);
  const multiRegion = regions.length > 1;

  // Resolve the active region: explicit ?region=, else the requested variant's
  // region, else the first available region (or the parent product's region).
  const selectedRegion =
    (rawRegion && regions.includes(rawRegion) && rawRegion) ||
    variants.find((v) => v.id === rawVariant)?.region ||
    regions[0] ||
    product.region;

  // Only denominations available in the selected region.
  const regionVariants = multiRegion
    ? variants.filter((v) => v.region === selectedRegion)
    : variants;

  // Selected value: the requested one if it's in this region, else reset to the
  // first value available in the selected region.
  const selectedVariant =
    regionVariants.find((item) => item.id === rawVariant) ??
    regionVariants.find((item) => item.id === product.selectedVariantId) ??
    regionVariants[0];

  const displayRegion = selectedVariant?.region ?? product.region;
  const variantHref = (variantId: string) =>
    `/products/${product.id}?region=${encodeURIComponent(selectedRegion)}&variant=${encodeURIComponent(variantId)}`;

  const related = (await getProductsByCategorySlug(product.category))
    .filter((item) => item.parentId !== product.id)
    .slice(0, 4);

  return (
    <div className="container-page pt-8 pb-20 sm:py-10">
      <nav className="mb-9 flex flex-wrap items-center gap-2 text-[13.5px] text-faint">
        <Link href="/" className="text-muted transition hover:text-white">
          Accueil
        </Link>
        <span>/</span>
        <Link href="/products" className="text-muted transition hover:text-white">
          Produits
        </Link>
        <span>/</span>
        <span className="text-text">{product.name}</span>
      </nav>

      <div className="grid min-w-0 gap-10 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
        <div>
          <div className="relative">
            <ProductArt
              category={product.category}
              imageUrl={product.imageUrl}
              label={product.categoryName}
              className="aspect-[4/3] w-full rounded-[18px] border border-border shadow-card"
            />
            <RegionBadge code={displayRegion} variant="overlay" className="absolute left-3.5 top-3.5" />
          </div>

          {(product.longDescription || product.description) && (
            <ProductInfoCard text={product.longDescription || product.description} />
          )}

          <NavigatorTips context={[product.categoryName, product.name]} />

          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight text-text">
              Comment ça marche
            </h2>
            <div className="mt-5 flex flex-col gap-2">
              {howItWorks.map((step) => (
                <article
                  key={step.n}
                  className="flex gap-4 rounded-[14px] border border-border bg-surface p-4"
                >
                  <span className="w-6 shrink-0 font-mono text-[13px] text-accent">
                    {step.n}
                  </span>
                  <div>
                    <h3 className="text-[14.5px] font-medium text-text">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-[13px] text-muted">{step.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <AcceptedPayments className="mt-10" />
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
            Livraison après confirmation
          </span>

          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-text">
            {product.name}
            {regionTitleSuffix(displayRegion).label && (
              <>
                {" "}
                <span className={regionTitleSuffix(displayRegion).className}>
                  {regionTitleSuffix(displayRegion).label}
                </span>
              </>
            )}
          </h1>

          <div className="mt-6 flex flex-wrap gap-2">
            <span className="chip">{product.deliveryType}</span>
          </div>

          <div className="mt-5">
            <RegionPanel code={displayRegion} />
          </div>

          <div className="mt-7 rounded-2xl border border-border bg-surface p-4 sm:p-6">
            {multiRegion && (
              <div className="mb-5">
                <p className="mb-2 text-sm font-medium text-faint">Région</p>
                <div className="flex flex-wrap gap-2">
                  {regions.map((code) => {
                    const r = getRegion(code);
                    const active = code === selectedRegion;
                    return (
                      <Link
                        key={code}
                        href={`/products/${product.id}?region=${encodeURIComponent(code)}`}
                        aria-current={active ? "true" : undefined}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                          active
                            ? "border-accent bg-accent/10 text-white"
                            : "border-border text-muted hover:border-border-strong hover:text-white"
                        }`}
                      >
                        <span className="h-3 w-[17px] shrink-0 overflow-hidden rounded-[2px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
                          <RegionFlag code={r.code} />
                        </span>
                        <span className="font-medium">{r.name}</span>
                        <span className="font-mono text-xs text-faint">{r.code}</span>
                      </Link>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-amber-400/90">
                  La carte fonctionne uniquement avec un compte de la région sélectionnée.
                </p>
              </div>
            )}
            {regionVariants.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-sm font-medium text-faint">Montant</p>
                <div className="grid gap-2 min-[420px]:grid-cols-2">
                  {regionVariants.map((item) => (
                    <Link
                      key={item.id}
                      href={variantHref(item.id)}
                      className={`rounded-xl border px-3 py-2 text-sm transition ${
                        item.id === selectedVariant?.id
                          ? "border-accent bg-accent/10 text-white"
                          : "border-border text-muted hover:border-border-strong hover:text-white"
                      }`}
                    >
                      <span className="block font-medium">{item.title}</span>
                      <span className="font-mono text-xs">{item.price} DH</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <AddToCartForm
              productId={selectedVariant?.id ?? product.id}
              price={selectedVariant?.price ?? product.price}
              identity={{
                parentId: product.id,
                faceValue: selectedVariant?.faceValue ?? null,
                faceCurrency: selectedVariant?.faceCurrency,
                region: selectedVariant?.region ?? product.region,
              }}
            />
            <div className="mt-4 flex items-center gap-2 text-xs text-faint">
              Paiement sécurisé
            </div>
          </div>

          <div className="mt-[18px] grid gap-2.5 min-[420px]:grid-cols-2">
            {["Reçu par e-mail", "Support local"].map((text) => (
              <div
                key={text}
                className="flex items-center gap-2.5 rounded-[11px] border border-border bg-surface px-3.5 py-3 text-[13px] text-muted"
              >
                <span className="h-2 w-2 rounded-full bg-accent" />
                {text}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-semibold tracking-tight text-text">
            Plus de {product.categoryName}
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-[18px] min-[390px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Contextual "Bon à savoir" tip card shown under the product media. Renders the
 * product's own description (any product, any length) as separated paragraphs,
 * with ⚠️-prefixed lines highlighted as notices — noticeable but not a full
 * error alert. Purely presentational; the content/data source is unchanged.
 */
function ProductInfoCard({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-3.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent/10">
          <LightbulbIcon className="h-[18px] w-[18px] text-[#9FB8FF]" />
        </span>
        <h2 className="text-sm font-semibold text-text">Bon à savoir</h2>
      </div>
      <div className="space-y-2.5 px-5 py-4 text-[14px] leading-relaxed text-muted">
        {paragraphs.map((para, index) =>
          para.startsWith("⚠") ? (
            <p
              key={index}
              className="rounded-lg border border-[#F7B14A]/25 bg-[#F7B14A]/[0.07] px-3 py-2 text-[13.5px] font-medium text-[#D9B27C]"
            >
              {para}
            </p>
          ) : (
            <p key={index}>{para}</p>
          ),
        )}
      </div>
    </section>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.46.35.9.86 1.1 1.7.08.3.35.5.65.5h3.7c.3 0 .57-.2.65-.5.2-.84.64-1.35 1.1-1.7A6 6 0 0 0 12 3z" />
    </svg>
  );
}
