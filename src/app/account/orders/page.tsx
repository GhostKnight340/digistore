import Link from "next/link";
import AccountNav from "@/components/account/AccountNav";
import { getAccountOrders, requireCustomer } from "@/lib/auth";
import { formatDate, formatMAD } from "@/lib/format";

export const dynamic = "force-dynamic";

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
              <p className="p-6 text-sm text-muted">Aucune commande liee a ce compte.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 font-medium">Commande</th>
                      <th className="px-5 py-3 font-medium">Statut</th>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-border/60">
                        <td className="px-5 py-3">
                          <Link href={`/order/${order.id}`} className="font-medium text-accent">{order.id}</Link>
                          <p className="mt-1 text-xs text-muted">{order.items.length} article(s)</p>
                        </td>
                        <td className="px-5 py-3 text-muted">{order.status}</td>
                        <td className="px-5 py-3 text-muted">{formatDate(order.createdAt.toISOString())}</td>
                        <td className="px-5 py-3 font-semibold text-white">{formatMAD(order.totalMad)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
