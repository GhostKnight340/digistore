import Link from "next/link";
import { requireCustomer, getAccountOrders } from "@/lib/auth";
import { formatDate, formatMAD } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusShort } from "@/lib/orderStatus";
import { getPublicOrderLabel } from "@/lib/orderNumber";
import AccountNav from "@/components/account/AccountNav";
import AccountProfileForm from "./AccountProfileForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);

  return (
    <div className="container-page py-10">
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <AccountNav name={customer.name} email={customer.email} />
        <section>
          <h1 className="text-3xl font-bold text-white">Mon compte</h1>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Metric label="Nom" value={customer.name} />
            <Metric label="E-mail" value={customer.email} />
            <Metric label="Statut" value={customer.emailVerified ? "Vérifié" : "À vérifier"} />
          </div>
          <AccountProfileForm
            firstName={customer.firstName}
            lastName={customer.lastName}
            phone={customer.phone}
          />
          <div className="card mt-6 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">Commandes recentes</h2>
                <p className="mt-1 text-sm text-muted">Vos derniers achats lies a ce compte.</p>
              </div>
              <Link href="/account/orders" className="btn-ghost text-sm">Tout voir</Link>
            </div>
            <div className="mt-5 space-y-3">
              {orders.slice(0, 5).length === 0 ? (
                <p className="text-sm text-muted">Aucune commande pour le moment.</p>
              ) : (
                orders.slice(0, 5).map((order) => (
                  <Link key={order.id} href={`/order/${order.publicOrderPathSegment}`} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
                    <span>
                      <span className="block font-medium text-white">{getPublicOrderLabel(order)}</span>
                      <span className="text-xs text-muted">{formatDate(order.createdAt.toISOString())}</span>
                    </span>
                    <span className="text-right">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${orderStatusBadgeClass(order.status)}`}>
                        {orderStatusShort(order.status)}
                      </span>
                      <span className="mt-1 block font-semibold text-white">{formatMAD(order.totalMad)}</span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className="mt-2 break-words text-lg font-bold text-white">{value}</p>
    </div>
  );
}
