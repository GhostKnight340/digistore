import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategory } from "@/lib/products";
import {
  getStorefrontProduct,
  getStorefrontProductsByCategory,
} from "@/lib/db/storefront";
import ProductArt from "@/components/ProductArt";
import ProductCard from "@/components/ProductCard";
import AddToCartForm from "@/components/AddToCartForm";

export const dynamic = "force-dynamic";

const howItWorks = [
  {
    n: "01",
    title: "Choisissez votre montant",
    text: "Sélectionnez la valeur de la carte qui vous convient.",
  },
  {
    n: "02",
    title: "Payez en toute sécurité",
    text: "Carte bancaire ou portefeuille, paiement chiffré.",
  },
  {
    n: "03",
    title: "Recevez votre code",
    text: "Code affiché à l'écran et envoyé par email instantanément.",
  },
];

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getStorefrontProduct(id);
  if (!product) notFound();

  const category = getCategory(product.category);
  const related = (await getStorefrontProductsByCategory(product.category))
    .filter((item) => item.id !== product.id)
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
          {product.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.thumbnail}
              alt={product.name}
              className="aspect-[1.4] w-full rounded-[18px] border border-border object-cover"
            />
          ) : (
            <ProductArt
              category={product.category}
              label={category?.name}
              className="aspect-[1.4] w-full rounded-[18px] border border-border"
            />
          )}

          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight text-text">
              Comment ca marche
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="h-3 w-3"
              aria-hidden
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Livraison instantanée
          </span>

          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-text">
            {product.name}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            {product.description}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <span className="chip">Région: {product.region}</span>
            <span className="chip">{product.deliveryType}</span>
          </div>

          <div className="mt-7 rounded-2xl border border-border bg-surface p-6">
            <AddToCartForm productId={product.id} price={product.price} />
            <div className="mt-4 flex items-center gap-2 text-xs text-faint">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Paiement sécurisé - Visa, Mastercard, PayPal
            </div>
          </div>

          <div className="mt-[18px] grid gap-2.5 sm:grid-cols-2">
            {[
              "Reçu par email",
              "Support local",
            ].map((text) => (
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
            Plus de {category?.name}
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
