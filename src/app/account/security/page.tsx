import AccountNav from "@/components/account/AccountNav";
import PageHeader from "@/components/account/PageHeader";
import { ShieldIcon } from "@/components/account/icons";
import {
  requireCustomer,
  getAccountOrders,
  isProfileIncomplete,
} from "@/lib/auth";
import { countSupportTicketsForCustomer } from "@/lib/db/supportTickets";
import { formatDate } from "@/lib/format";
import SecurityClient from "./SecurityClient";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);
  const incomplete = isProfileIncomplete(customer);
  const supportCount = await countSupportTicketsForCustomer(
    customer.id,
    !incomplete && customer.emailVerified ? customer.email : null,
  );

  return (
    <div className="container-page py-10">
      <div className="grid gap-[26px] lg:grid-cols-[264px_1fr]">
        <AccountNav
          name={customer.name}
          email={incomplete ? "" : customer.email}
          active="security"
          verified={!incomplete && customer.emailVerified}
          ordersCount={orders.length}
          supportCount={supportCount}
        />
        <section className="space-y-5">
          <PageHeader
            title="Sécurité"
            subtitle="Protégez votre compte et vos codes."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Info
              label="E-mail"
              value={customer.emailVerified ? "Vérifié" : "Non vérifié"}
              tone={customer.emailVerified ? "success" : "default"}
            />
            <Info
              label="Dernière connexion"
              value={
                customer.lastLoginAt
                  ? formatDate(customer.lastLoginAt.toISOString())
                  : "Jamais"
              }
            />
            <Info
              label="Mot de passe"
              value={
                customer.lastPasswordChangeAt
                  ? formatDate(customer.lastPasswordChangeAt.toISOString())
                  : "Pas encore modifié"
              }
            />
          </div>

          <SecurityClient emailVerified={customer.emailVerified} />
        </section>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success";
}) {
  return (
    <div
      className={`rounded-2xl border bg-card p-5 ${
        tone === "success" ? "border-green-500/25" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 text-faint">
        <ShieldIcon className="h-4 w-4" />
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      <p className="mt-3 break-words text-base font-semibold tracking-[-0.01em] text-white">
        {value}
      </p>
    </div>
  );
}
