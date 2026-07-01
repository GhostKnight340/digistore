import Link from "next/link";
import AccountNav from "@/components/account/AccountNav";
import { getAccountOrders, requireCustomer } from "@/lib/auth";
import { formatMAD } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusShort } from "@/lib/orderStatus";

export const dynamic = "force-dynamic";

type AccountOrder = Awaited<ReturnType<typeof getAccountOrders>>[number];

function formatFrenchDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function itemCountLabel(order: AccountOrder) {
  const count = order.items.reduce((total, item) => total + item.quantity, 0);
  if (count <= 0) return "Aucun article";
  return `${count} article${count > 1 ? "s" : ""}`;
}

function itemSummary(order: AccountOrder) {
  const firstItem = order.items[0];
  if (!firstItem) return "Commande";

  const productName = firstItem.variant?.name || firstItem.product.name;
  if (order.items.length <= 1) return productName;

  const otherLines = order.items.length - 1;
  return `${productName} + ${otherLines} autre${otherLines > 1 ? "s" : ""}`;
}

export default async function AccountOrdersPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);

  return (
    <div className="container-page py-10">
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <AccountNav name={customer.name} email={customer.email} />
        <section>
          <h1 className="text-3xl font-bold text-white">Mes commandes</h1>
          <div className="card mt-8 overflow-hidden">
            {orders.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <h2 className="text-lg font-semibold text-white">Aucune commande</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                  Vos prochaines commandes apparaîtront ici avec leur statut de suivi.
                </p>
                <Link
                  href="/"
                  className="mt-5 inline-flex items-center justify-center rounded-md border border-accent/50 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
                >
                  Parcourir la boutique
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                <div className="hidden grid-cols-[1.15fr_1.25fr_1fr_0.8fr_0.95fr] items-center gap-4 border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted md:grid">
                  <span>Commande</span>
                  <span>Articles</span>
                  <span>Statut</span>
                  <span>Date</span>
                  <span className="text-right">Total</span>
                </div>
                {orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/order/${order.id}`}
                    className="grid gap-3 px-5 py-4 text-sm transition hover:bg-surface/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent md:grid-cols-[1.15fr_1.25fr_1fr_0.8fr_0.95fr] md:items-center md:gap-4"
                  >
                    <div>
                      <p className="font-semibold text-white">{order.publicOrderNumber}</p>
                      <p className="mt-1 text-xs text-muted md:hidden">
                        {formatFrenchDate(order.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-white">{itemSummary(order)}</p>
                      <p className="mt-1 text-xs text-muted">{itemCountLabel(order)}</p>
                    </div>
                    <div>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${orderStatusBadgeClass(
                          order.status,
                        )}`}
                      >
                        {orderStatusShort(order.status)}
                      </span>
                    </div>
                    <p className="hidden text-sm text-muted md:block">
                      {formatFrenchDate(order.createdAt)}
                    </p>
                    <div className="flex items-center justify-between gap-3 md:block md:text-right">
                      <p className="font-semibold text-white">{formatMAD(order.totalMad)}</p>
                      <span className="text-xs font-semibold text-accent md:mt-1 md:block">
                        Voir la commande
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
