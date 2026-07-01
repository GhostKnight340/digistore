import AccountNav from "@/components/account/AccountNav";
import { requireCustomer } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import SecurityClient from "./SecurityClient";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const customer = await requireCustomer();

  return (
    <div className="container-page py-10">
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <AccountNav name={customer.name} email={customer.email} />
        <section>
          <h1 className="text-3xl font-bold text-white">Sécurité</h1>
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
