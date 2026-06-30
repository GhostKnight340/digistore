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

export async function generateStaticParams() {
  const slugs = await getParentProductSlugs().catch(() => []);
  return slugs.map((id) => ({ id }));
}

const howItWorks = [
  { n: "01", title: "Choisissez votre montant", text: "S?lectionnez la valeur ou la formule qui vous convient." },
  { n: "02", title: "Payez en toute s?curit?", text: "Choisissez un mode de paiement disponible." },
  { n: "03", title: "Recevez votre produit num?rique", text: "Disponible apr?s confirmation du paiement." },
];

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant: rawVariant } = await searchParams;
  const product = await getProductBySlug(id);
  if (!product) notFound();
  const selectedVariant =
    product.variants?.find((item) => item.id === rawVariant) ??
    product.variants?.find((item) => item.id === product.selectedVariantId) ??
    product.variants?.[0];

  const related = (await getProductsByCategorySlug(product.category))
    .filter((item) => item.parentId !== product.id)
    .slice(0, 4);

  return (
    <div className="container-page py-8 sm:py-10">
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

      <div className="grid gap-10 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
        <div>
          <ProductArt
            category={product.category}
            imageUrl={product.imageUrl}
            label={product.categoryName}
            className="aspect-[4/3] w-full rounded-[18px] border border-border shadow-card"
          />

          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight text-text">
              Comment ?a marche
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
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
            Livraison apr?s confirmation
          </span>

          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-text">
            {product.name}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            {product.description}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <span className="chip">R?gion : {product.region}</span>
            <span className="chip">{product.deliveryType}</span>
          </div>

          <div className="mt-7 rounded-2xl border border-border bg-surface p-6">
            {product.variants && product.variants.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-sm font-medium text-faint">Montant</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {product.variants.map((item) => (
                    <Link
                      key={item.id}
                      href={`/products/${product.id}?variant=${encodeURIComponent(item.id)}`}
                      className={`rounded-xl border px-3 py-2 text-sm transition ${
                        item.id === selectedVariant?.id
                          ? "border-accent bg-accent/10 text-white"
                          : "border-border text-muted hover:border-border-strong hover:text-white"
                      }`}
                    >
                      <span className="block font-medium">{item.title}</span>
                      <span className="font-mono text-xs">{item.price} MAD</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <AddToCartForm
              productId={selectedVariant?.id ?? product.id}
              price={selectedVariant?.price ?? product.price}
            />
            <div className="mt-4 flex items-center gap-2 text-xs text-faint">
              Paiement s?curis?
            </div>
          </div>

          <div className="mt-[18px] grid gap-2.5 sm:grid-cols-2">
            {["Re?u par e-mail", "Support local"].map((text) => (
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
          <div className="mt-6 grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
