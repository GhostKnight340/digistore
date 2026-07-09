import Link from "next/link";
import AccountNav from "@/components/account/AccountNav";
import PageHeader from "@/components/account/PageHeader";
import { BagIcon, ArrowRightIcon } from "@/components/account/icons";
import {
  getAccountOrders,
  requireCustomer,
  isProfileIncomplete,
} from "@/lib/auth";
import { formatMAD } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusShort } from "@/lib/orderStatus";
import { getPublicOrderLabel } from "@/lib/orderNumber";

export const dynamic = "force-dynamic";

type AccountOrder = Awaited<ReturnType<typeof getAccountOrders>>[number];

function formatFrenchDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
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
  const incomplete = isProfileIncomplete(customer);

  return (
    <div className="container-page py-10">
      <div className="grid gap-[26px] lg:grid-cols-[264px_1fr]">
        <AccountNav
          name={customer.name}
          email={incomplete ? "" : customer.email}
          active="orders"
          verified={!incomplete && customer.emailVerified}
          ordersCount={orders.length}
        />
        <section className="space-y-5">
          <PageHeader
            title="Mes commandes"
            subtitle="Historique complet de vos achats numériques."
          />

          <div className="rounded-[18px] border border-border bg-card p-[22px] shadow-soft sm:p-[26px]">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
                  <BagIcon className="h-7 w-7" />
                </span>
                <p className="mt-4 text-[15px] font-semibold text-white">
                  Aucune commande pour le moment
                </p>
                <p className="mt-1 max-w-sm text-[13px] text-muted">
                  Vos prochaines commandes apparaîtront ici avec leur statut de suivi.
                </p>
                <Link href="/" className="btn-primary mt-5 text-sm">
                  Parcourir le catalogue
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/order/${order.publicOrderPathSegment}`}
                    className="flex items-center gap-3.5 rounded-[13px] border border-border bg-base px-4 py-3 transition-colors hover:border-border-strong"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] border border-border bg-surface text-faint">
                      <BagIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {itemSummary(order)}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[12px] text-faint">
                        {getPublicOrderLabel(order)} · {formatFrenchDate(order.createdAt)} ·{" "}
                        {itemCountLabel(order)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${orderStatusBadgeClass(
                          order.status,
                        )}`}
                      >
                        {orderStatusShort(order.status)}
                      </span>
                      <span className="font-mono text-sm font-semibold text-white">
                        {formatMAD(order.totalMad)}
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
