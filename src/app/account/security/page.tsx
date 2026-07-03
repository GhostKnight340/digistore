import AccountNav from "@/components/account/AccountNav";
import { requireCustomer, getAccountOrders } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import SecurityClient from "./SecurityClient";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);

  return (
    <div className="container-page py-10">
      <div className="grid gap-8 lg:grid-cols-[264px_1fr]">
        <AccountNav
          name={customer.name}
          email={customer.email}
          verified={customer.emailVerified}
          ordersCount={orders.length}
        />
        <section>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent-strong">Espace client</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Sécurité</h1>
          <p className="mt-1.5 text-sm text-muted">Protégez votre compte et vos codes.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Info label="E-mail" value={customer.emailVerified ? "Vérifié" : "Non vérifié"} />
            <Info label="Dernière connexion" value={customer.lastLoginAt ? formatDate(customer.lastLoginAt.toISOString()) : "Jamais"} />
            <Info label="Mot de passe" value={customer.lastPasswordChangeAt ? formatDate(customer.lastPasswordChangeAt.toISOString()) : "Pas encore modifié"} />
          </div>
          <SecurityClient emailVerified={customer.emailVerified} />
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
    </div>
  );
}
