import Link from "next/link";
import { getAccountOrders, requireCustomer } from "@/lib/auth";
import AccountShell, { ArrowRightIcon } from "@/components/account/AccountShell";
import { BagIcon } from "@/components/account/icons";
import OrdersView from "@/components/account/OrdersView";
import { toOrderRowData } from "@/components/account/orderView";

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);
  const rows = orders.map((order) => toOrderRowData(order, true));

  return (
    <AccountShell
      active="orders"
      name={customer.name}
      email={customer.email}
      emailVerified={customer.emailVerified}
      ordersCount={orders.length}
      title="Mes commandes"
      subtitle="Historique complet de vos achats numériques."
    >
      {rows.length === 0 ? (
        <div className="acct-panel p-6 sm:p-[26px]">
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="mb-5 grid h-[66px] w-[66px] place-items-center rounded-[18px] border border-white/[0.08] bg-[#0c0d11] text-accent-strong">
              <BagIcon size={28} />
            </span>
            <p className="text-base font-semibold text-white">Aucune commande pour le moment</p>
            <p className="mx-auto mt-1.5 max-w-[320px] text-[13.5px] leading-[1.55] text-[#8891a3]">
              Dès que vous achetez un code, il apparaît ici avec son statut de livraison et son reçu.
            </p>
            <Link href="/" className="btn-primary mt-5 h-[46px] gap-2 px-[22px] text-sm">
              Parcourir le catalogue
              <ArrowRightIcon size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <OrdersView orders={rows} />
      )}
    </AccountShell>
  );
}
