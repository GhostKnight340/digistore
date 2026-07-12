import Link from "next/link";
import {
  requireCustomer,
  getAccountOrders,
  canDisconnectProvider,
  isProfileIncomplete,
} from "@/lib/auth";
import { formatDate, formatDH } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusShort } from "@/lib/orderStatus";
import { getPublicOrderLabel } from "@/lib/orderNumber";
import { getDiscordApplicationId } from "@/lib/discord/config";
import AccountNav from "@/components/account/AccountNav";
import PageHeader from "@/components/account/PageHeader";
import AccountProfileForm from "./AccountProfileForm";
import DiscordConnection from "@/components/account/DiscordConnection";
import LoginMethods from "@/components/account/LoginMethods";
import {
  UserIcon,
  MailIcon,
  ShieldIcon,
  BagIcon,
  ArrowRightIcon,
} from "@/components/account/icons";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);
  const incomplete = isProfileIncomplete(customer);
  const verified = !incomplete && customer.emailVerified;
  // Sidebar/metrics must never surface the internal placeholder email.
  const displayEmail = incomplete ? "" : customer.email;
  const recentOrders = orders.slice(0, 3);

  return (
    <div className="container-page py-10">
      <div className="grid gap-[26px] lg:grid-cols-[264px_1fr]">
        <AccountNav
          name={customer.name}
          email={displayEmail}
          active="dashboard"
          verified={verified}
          ordersCount={orders.length}
        />
        <section className="space-y-5">
          <PageHeader
            title="Mon compte"
            subtitle="Gérez votre profil, vos commandes et votre sécurité."
          />

          {/* Info cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <InfoCard
              Icon={UserIcon}
              label="Nom"
              value={customer.name}
              hint="Titulaire du compte"
            />
            <InfoCard
              Icon={MailIcon}
              label="E-mail"
              value={incomplete ? "Non renseigné" : customer.email}
              hint="Adresse principale"
            />
            <InfoCard
              Icon={ShieldIcon}
              label="Statut"
              value={incomplete ? "À compléter" : verified ? "Vérifié" : "À vérifier"}
              hint={verified ? "E-mail confirmé" : "Profil à finaliser"}
              tone={verified ? "success" : "default"}
            />
          </div>

          {incomplete ? (
            <div className="rounded-[18px] border border-amber-500/25 bg-amber-500/[0.05] p-6">
              <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">
                Complétez votre profil
              </h2>
              <p className="mt-1 text-sm text-muted">
                Ajoutez une adresse e-mail réelle pour finaliser votre compte, ou associez
                Discord à un compte Ghost.ma existant.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/auth/discord/complete" className="btn-primary text-sm">
                  Compléter mon profil
                </Link>
                <Link href="/auth/discord/complete" className="btn-ghost text-sm">
                  J’ai déjà un compte Ghost.ma
                </Link>
              </div>
            </div>
          ) : (
            <AccountProfileForm name={customer.name} phone={customer.phone} />
          )}

          <LoginMethods
            googleConnected={Boolean(customer.googleId)}
            discordConnected={Boolean(customer.discordId)}
            discordUsername={customer.discordUsername}
            hasPassword={customer.hasPassword}
            emailUsable={!incomplete}
            canDisconnectGoogle={canDisconnectProvider(customer, "google")}
            canDisconnectDiscord={canDisconnectProvider(customer, "discord")}
          />

          <DiscordConnection
            discordId={customer.discordId}
            discordUsername={customer.discordUsername}
            discordGlobalName={customer.discordGlobalName}
            discordAvatar={customer.discordAvatar}
            discordDmActivated={customer.discordDmActivated}
            discordDmUsername={customer.discordDmUsername}
            discordDmDisplayName={customer.discordDmDisplayName}
            discordDmAvatar={customer.discordDmAvatar}
            discordOrderDeliveryEnabled={customer.discordOrderDeliveryEnabled}
            applicationId={getDiscordApplicationId() ?? null}
          />

          {/* Recent orders */}
          <div className="rounded-[18px] border border-border bg-card p-[22px] shadow-soft sm:p-[26px]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">
                  Commandes récentes
                </h2>
                <p className="mt-1 text-[13px] text-muted">
                  Vos derniers achats liés à ce compte.
                </p>
              </div>
              <Link
                href="/account/orders"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong px-3.5 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2"
              >
                Tout voir
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-5 space-y-2.5">
              {recentOrders.length === 0 ? (
                <EmptyOrders />
              ) : (
                recentOrders.map((order) => (
                  <OrderRow
                    key={order.id}
                    href={`/order/${order.publicOrderPathSegment}`}
                    label={getPublicOrderLabel(order)}
                    meta={formatDate(order.createdAt.toISOString())}
                    status={order.status}
                    amount={formatDH(order.totalMad)}
                  />
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoCard({
  Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  Icon: typeof UserIcon;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success";
}) {
  return (
    <div
      className={`rounded-2xl border bg-card p-5 ${
        tone === "success" ? "border-green-500/25" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 text-faint">
        <Icon className="h-4 w-4" />
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      <p className="mt-3 break-words text-base font-semibold tracking-[-0.01em] text-white">
        {value}
      </p>
      <p className="mt-1 text-[12px] text-faint">{hint}</p>
    </div>
  );
}

function OrderRow({
  href,
  label,
  meta,
  status,
  amount,
}: {
  href: string;
  label: string;
  meta: string;
  status: string;
  amount: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-[13px] border border-border bg-canvas px-4 py-3 transition-colors hover:border-border-strong"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] border border-border bg-surface text-faint">
        <BagIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{label}</span>
        <span className="mt-0.5 block font-mono text-[12px] text-faint">{meta}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${orderStatusBadgeClass(
            status,
          )}`}
        >
          {orderStatusShort(status)}
        </span>
        <span className="font-mono text-sm font-semibold text-white">{amount}</span>
      </span>
    </Link>
  );
}

function EmptyOrders() {
  return (
    <div className="flex flex-col items-center rounded-[13px] border border-border bg-canvas px-6 py-10 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
        <BagIcon className="h-7 w-7" />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-white">
        Aucune commande pour le moment
      </p>
      <p className="mt-1 max-w-xs text-[13px] text-muted">
        Vos achats de cartes et codes numériques apparaîtront ici.
      </p>
      <Link href="/" className="btn-primary mt-5 text-sm">
        Parcourir le catalogue
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}
