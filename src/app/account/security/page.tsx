import { getAccountOrders, requireCustomer } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import AccountShell from "@/components/account/AccountShell";
import SecurityClient from "./SecurityClient";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);

  return (
    <AccountShell
      active="security"
      name={customer.name}
      email={customer.email}
      emailVerified={customer.emailVerified}
      ordersCount={orders.length}
      title="Sécurité"
      subtitle="Protégez votre compte et vos codes."
    >
      <SecurityClient emailVerified={customer.emailVerified} />

      {/* Account activity (real data — replaces the mock "sessions" panel) */}
      <section className="acct-panel p-6 sm:p-[26px]">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">Activité du compte</h2>
        <p className="mt-1 text-[13.5px] text-[#8891a3]">Dernières informations de connexion et de sécurité.</p>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          <ActivityRow
            label="Dernière connexion"
            value={customer.lastLoginAt ? formatDate(customer.lastLoginAt.toISOString()) : "Jamais"}
          />
          <ActivityRow
            label="Dernière modification du mot de passe"
            value={
              customer.lastPasswordChangeAt
                ? formatDate(customer.lastPasswordChangeAt.toISOString())
                : "Pas encore modifié"
            }
          />
        </div>
      </section>
    </AccountShell>
  );
}

function ActivityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="acct-well px-4 py-3.5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className="mt-1.5 text-sm font-medium text-white">{value}</p>
    </div>
  );
}
