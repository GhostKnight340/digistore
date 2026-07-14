import RegionBadge from "@/components/RegionBadge";
import ProductArt from "@/components/ProductArt";
import TrackedLink from "@/components/gta/TrackedLink";
import { formatDH } from "@/lib/format";
import { getRegion } from "@/lib/regions";
import { GTA_CAMPAIGN_ID, type GtaPlatform } from "@/lib/gtaPreorder";
import type { Product } from "@/lib/types";

/**
 * A recommended gift-card card for the GTA VI landing page. Purely
 * presentational over a REAL catalogue product (resolved live via
 * `getProductBySlug`) — no price/region/media/stock is hardcoded. It shows the
 * product name, denomination, region, Ghost.ma price (DH), availability and a
 * "Voir cette carte" CTA that opens the normal grouped product page with the
 * region (and denomination, when unambiguous) preselected through the existing
 * `?region=&variant=` behavior. It never says "Acheter GTA VI".
 */
export default function GtaGiftCard({
  product,
  platform,
}: {
  product: Product;
  platform: GtaPlatform;
}) {
  const variants = product.variants ?? [];
  const single = variants.length === 1 ? variants[0] : null;
  const region = single?.region ?? product.region;
  const regionInfo = getRegion(region);
  const startingPrice = variants.length
    ? Math.min(...variants.map((v) => v.price))
    : product.price;
  const inStock = product.stockStatus
    ? product.stockStatus === "in_stock"
    : variants.some((v) => v.stockStatus === "in_stock");
  // More than one denomination → the price is a starting point ("à partir de").
  const multiDenom = variants.length > 1;

  // Denomination line: the single variant's face value when unambiguous, else a
  // neutral "plusieurs montants" label (never an invented amount).
  const denomination =
    single && single.faceValue != null
      ? `${single.faceValue} ${single.faceCurrency}`
      : variants.length > 1
        ? "Plusieurs montants"
        : formatDH(startingPrice);

  const href =
    `/products/${product.id}?region=${encodeURIComponent(region)}` +
    (single ? `&variant=${encodeURIComponent(single.id)}` : "");

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-surface">
      <div className="relative shrink-0">
        <ProductArt
          category={product.category}
          imageUrl={product.imageUrl}
          label={product.name}
          className="aspect-[16/9] w-full rounded-t-[14px]"
        />
        <RegionBadge code={region} variant="overlay" className="absolute left-2.5 top-2.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-[14.5px] font-medium leading-snug text-text">
          {product.name}
        </h3>
        <dl className="mt-3 space-y-1.5 text-[12.5px]">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-faint">Montant</dt>
            <dd className="font-medium text-muted">{denomination}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-faint">Région</dt>
            <dd className="font-medium text-muted">{regionInfo.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-faint">Disponibilité</dt>
            <dd
              className={`inline-flex items-center gap-1.5 font-medium ${
                inStock ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  inStock ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {inStock ? "En stock" : "Bientôt disponible"}
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          {multiDenom && (
            <span className="block text-[11px] font-medium text-faint">
              À partir de
            </span>
          )}
          <span className="font-mono text-lg font-semibold tracking-tight text-text">
            {formatDH(startingPrice)}
          </span>
        </div>
        <TrackedLink
          href={href}
          event="select_gift_card"
          params={{ campaign: GTA_CAMPAIGN_ID, platform, item_id: product.id }}
          className="btn-primary mt-4 h-10 w-full justify-center text-[14px]"
          ariaLabel={`Voir cette carte : ${product.name}`}
        >
          Voir cette carte
        </TrackedLink>
      </div>
    </article>
  );
}
