import Link from "next/link";
import AccountShell from "@/components/account/AccountShell";
import FavorisGrid from "@/components/account/FavorisGrid";
import NavigatorTip from "@/components/category/NavigatorTip";
import { requireCustomer, isProfileIncomplete, getAccountOrders } from "@/lib/auth";
import { countSupportTicketsForCustomer } from "@/lib/db/supportTickets";
import { getWishlistCards } from "@/lib/db/wishlist";
import { getPublicCollectionCards } from "@/lib/db/collections";
import { getStoreSettings } from "@/lib/db/catalog";
import { collectionHref } from "@/lib/collectionUrl";

export const dynamic = "force-dynamic";

export default async function AccountFavorisPage() {
  const customer = await requireCustomer();
  const incomplete = isProfileIncomplete(customer);
  const [items, orders, supportCount, collections, settings] = await Promise.all([
    getWishlistCards(customer.id),
    getAccountOrders(customer.id),
    countSupportTicketsForCustomer(customer.id, incomplete ? null : customer.email),
    getPublicCollectionCards().catch(() => []),
    getStoreSettings().catch(() => undefined),
  ]);
  const wishlistEnabled = settings?.features?.wishlistEnabled ?? true;

  return (
    <AccountShell
      name={customer.name}
      email={incomplete ? "" : customer.email}
      active="favoris"
      verified={!incomplete && customer.emailVerified}
      ordersCount={orders.length}
      supportCount={supportCount}
      title="Favoris"
      subtitle="Vos produits enregistrés, synchronisés sur tous vos appareils."
    >
      {!wishlistEnabled ? (
        <div className="rounded-[18px] border border-border bg-card p-8 text-center shadow-soft">
          <p className="text-[15px] font-semibold text-white">Favoris indisponibles</p>
          <p className="mt-1 text-[13px] text-muted">
            Cette fonctionnalité est actuellement désactivée.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="rounded-[18px] border border-border bg-card p-4 shadow-soft sm:p-[26px]">
            <FavorisGrid items={items} />
          </div>

          {items.length === 0 && collections.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
                Collections à découvrir
              </h2>
              <div className="flex flex-wrap gap-2">
                {collections.slice(0, 6).map((c) => (
                  <Link
                    key={c.slug}
                    href={collectionHref(c.slug)}
                    className="rounded-full border border-border px-3.5 py-1.5 text-[13px] font-medium text-muted transition hover:border-accent hover:text-white"
                  >
                    {c.title}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {items.length === 0 && (
            <NavigatorTip
              tip={{
                enabled: true,
                title: "Astuce",
                message:
                  "Touchez le cœur sur n'importe quel produit pour l'ajouter à vos favoris.",
                type: "information",
                ctaLabel: "",
                ctaUrl: "",
              }}
            />
          )}
        </div>
      )}
    </AccountShell>
  );
}
