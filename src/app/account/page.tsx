import Link from "next/link";
import { requireCustomer, getAccountOrders } from "@/lib/auth";
import { formatMAD } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusShort } from "@/lib/orderStatus";
import { getPublicOrderLabel } from "@/lib/orderNumber";
import AccountNav from "@/components/account/AccountNav";
import {
  ArrowRightIcon,
  BagIcon,
  MailIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/account/AccountIcons";
import { OrderRow } from "@/components/account/OrderRow";
import AccountProfileForm from "./AccountProfileForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);
  const recent = orders.slice(0, 3);

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
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Mon compte</h1>
          <p className="mt-1.5 text-sm text-muted">Gérez votre profil, vos commandes et votre sécurité.</p>

          {/* Info cards */}
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            <InfoCard
              icon={<UserIcon className="h-[18px] w-[18px]" />}
              label="Nom"
              value={customer.name}
              hint="Titulaire du compte"
            />
            <InfoCard
              icon={<MailIcon className="h-[18px] w-[18px]" />}
              label="E-mail"
              value={customer.email}
              hint="Adresse principale"
            />
            <InfoCard
              icon={<ShieldIcon className="h-[18px] w-[18px]" />}
              label="Statut"
              value={customer.emailVerified ? "Vérifié" : "À vérifier"}
              hint={customer.emailVerified ? "E-mail confirmé" : "Vérifiez votre e-mail"}
              accent={customer.emailVerified ? "success" : "warning"}
            />
          </div>

          <AccountProfileForm phone={customer.phone} />

          {/* Recent orders */}
          <div className="card mt-5 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-semibold tracking-tight text-white">Commandes récentes</h2>
                <p className="mt-0.5 text-[13px] text-muted">Vos derniers achats liés à ce compte.</p>
              </div>
              {recent.length > 0 ? (
                <Link
                  href="/account/orders"
                  className="btn-ghost h-10 shrink-0 px-4 text-sm"
                >
                  Tout voir
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              ) : null}
            </div>

            {recent.length === 0 ? (
              <EmptyOrders />
            ) : (
              <div className="mt-5 space-y-3">
                {recent.map((order) => (
                  <OrderRow
                    key={order.id}
                    href={`/order/${order.publicOrderPathSegment}`}
                    title={getPublicOrderLabel(order)}
                    reference={order.publicOrderNumber}
                    createdAt={order.createdAt}
                    amount={formatMAD(order.totalMad)}
                    statusLabel={orderStatusShort(order.status)}
                    statusClass={orderStatusBadgeClass(order.status)}
                    thumbSeed={order.items[0]?.product?.name ?? getPublicOrderLabel(order)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: "success" | "warning";
}) {
  const ring =
    accent === "success"
      ? "border-green-500/25"
      : accent === "warning"
      ? "border-amber-500/25"
      : "border-border";
  const badge =
    accent === "success"
      ? "bg-green-500/10 text-green-400"
      : accent === "warning"
      ? "bg-amber-500/10 text-amber-400"
      : "bg-accent-soft text-accent-strong";
  return (
    <div className={`card p-5 ${ring}`}>
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${badge}`}>{icon}</span>
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">{label}</span>
      </div>
      <p className="mt-3 break-words text-base font-semibold tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function EmptyOrders() {
  return (
    <div className="mt-5 flex flex-col items-center rounded-[13px] border border-border bg-base/40 px-6 py-12 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
        <BagIcon className="h-7 w-7" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-white">Aucune commande pour le moment</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Vos achats de codes et cartes cadeaux apparaîtront ici dès votre première commande.
      </p>
      <Link href="/" className="btn-primary mt-5 h-11 px-5 text-sm">
        Parcourir le catalogue
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}
