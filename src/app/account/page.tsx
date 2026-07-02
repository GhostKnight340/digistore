import Link from "next/link";
import { requireCustomer, getAccountOrders } from "@/lib/auth";
import AccountShell, { ArrowRightIcon } from "@/components/account/AccountShell";
import { BagIcon, MailIcon, ShieldCheckIcon, UserIcon } from "@/components/account/icons";
import OrderRow from "@/components/account/OrderRow";
import { toOrderRowData } from "@/components/account/orderView";
import AccountProfileForm from "./AccountProfileForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);
  const recent = orders.slice(0, 3);

  return (
    <AccountShell
      active="dashboard"
      name={customer.name}
      email={customer.email}
      emailVerified={customer.emailVerified}
      ordersCount={orders.length}
      title="Mon compte"
      subtitle="Gérez votre profil, vos commandes et votre sécurité."
    >
      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <InfoCard
          icon={<UserIcon size={14} className="text-faint" />}
          label="NOM"
          value={customer.name}
          hint="Compte client"
        />
        <InfoCard
          icon={<MailIcon size={14} className="text-faint" />}
          label="E-MAIL"
          value={customer.email}
          hint="Adresse principale"
        />
        {customer.emailVerified ? (
          <div className="rounded-2xl border border-[#2fbf71]/[0.22] bg-gradient-to-b from-[#101a14] to-[#0e140f] p-5">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheckIcon size={14} className="text-[#2fbf71]" />
              <span className="font-mono text-[10.5px] tracking-[0.14em] text-[#5aa87a]">STATUT</span>
            </div>
            <p className="text-base font-semibold tracking-[-0.01em] text-[#43cf86]">Vérifié</p>
            <p className="mt-0.5 text-[12.5px] text-[#5aa87a]">E-mail confirmé</p>
          </div>
        ) : (
          <InfoCard
            icon={<ShieldCheckIcon size={14} className="text-amber-400" />}
            label="STATUT"
            value="À vérifier"
            hint="E-mail non confirmé"
          />
        )}
      </div>

      {/* Personal info */}
      <AccountProfileForm phone={customer.phone} />

      {/* Recent orders */}
      <section className="acct-panel p-6 sm:p-[26px]">
        <div className="mb-5 flex items-start justify-between gap-3.5">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">Commandes récentes</h2>
            <p className="mt-1 text-[13.5px] text-[#8891a3]">Vos derniers achats liés à ce compte.</p>
          </div>
          <Link
            href="/account/orders"
            className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-[10px] border border-border-strong bg-surface2 px-3.5 text-[13px] font-medium text-text transition-colors hover:border-white/[0.24]"
          >
            Tout voir
            <ArrowRightIcon size={13} />
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyOrders />
        ) : (
          <div className="flex flex-col gap-2.5">
            {recent.map((order) => (
              <OrderRow key={order.id} data={toOrderRowData(order)} />
            ))}
          </div>
        )}
      </section>
    </AccountShell>
  );
}

function InfoCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-b from-[#121319] to-[#0e0f14] p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="font-mono text-[10.5px] tracking-[0.14em] text-faint">{label}</span>
      </div>
      <p className="truncate text-base font-semibold tracking-[-0.01em] text-white">{value}</p>
      <p className="mt-0.5 truncate text-[12.5px] text-[#8891a3]">{hint}</p>
    </div>
  );
}

function EmptyOrders() {
  return (
    <div className="flex flex-col items-center px-5 py-9 text-center">
      <span className="mb-4 grid h-[60px] w-[60px] place-items-center rounded-2xl border border-white/[0.08] bg-[#0c0d11] text-accent-strong">
        <BagIcon size={24} />
      </span>
      <p className="text-[15px] font-semibold text-white">Aucune commande pour le moment</p>
      <p className="mx-auto mt-1.5 max-w-[300px] text-[13.5px] leading-[1.55] text-[#8891a3]">
        Vos achats apparaîtront ici. Parcourez le catalogue pour recevoir votre premier code.
      </p>
      <Link href="/" className="btn-primary mt-5 h-11 gap-2 px-5 text-sm">
        Parcourir le catalogue
        <ArrowRightIcon size={14} />
      </Link>
    </div>
  );
}
