import Link from "next/link";
import AccountShell from "@/components/account/AccountShell";
import OrderCard from "@/components/account/OrderCard";
import { BagIcon, ArrowRightIcon } from "@/components/account/icons";
import {
  getAccountOrders,
  requireCustomer,
  isProfileIncomplete,
} from "@/lib/auth";
import { countSupportTicketsForCustomer } from "@/lib/db/supportTickets";

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);
  const incomplete = isProfileIncomplete(customer);
  const supportCount = await countSupportTicketsForCustomer(
    customer.id,
    incomplete ? null : customer.email,
  );

  return (
    <AccountShell
      name={customer.name}
      email={incomplete ? "" : customer.email}
      active="orders"
      verified={!incomplete && customer.emailVerified}
      ordersCount={orders.length}
      supportCount={supportCount}
      title="Mes commandes"
      subtitle="Historique complet de vos achats numériques."
    >
      <div className="rounded-[18px] border border-border bg-card p-4 shadow-soft sm:p-[26px]">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center px-2 py-10 text-center sm:px-6">
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
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </AccountShell>
  );
}
