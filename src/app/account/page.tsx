import Link from "next/link";
import {
  requireCustomer,
  getAccountOrders,
  canDisconnectProvider,
  isProfileIncomplete,
} from "@/lib/auth";
import { formatDate, formatMAD } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusShort } from "@/lib/orderStatus";
import { getPublicOrderLabel } from "@/lib/orderNumber";
import { getDiscordApplicationId } from "@/lib/discord/config";
import AccountNav from "@/components/account/AccountNav";
import AccountProfileForm from "./AccountProfileForm";
import DiscordConnection from "@/components/account/DiscordConnection";
import LoginMethods from "@/components/account/LoginMethods";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const customer = await requireCustomer();
  const orders = await getAccountOrders(customer.id);
  const incomplete = isProfileIncomplete(customer);
  // Sidebar/metrics must never surface the internal placeholder email.
  const displayEmail = incomplete ? "" : customer.email;

  return (
    <div className="container-page py-10">
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <AccountNav name={customer.name} email={displayEmail} />
        <section>
          <h1 className="text-3xl font-bold text-white">Mon compte</h1>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Metric label="Nom" value={customer.name} />
            <Metric label="E-mail" value={incomplete ? "Non renseigné" : customer.email} />
            <Metric
              label="Statut"
              value={incomplete ? "Profil à compléter" : customer.emailVerified ? "Vérifié" : "À vérifier"}
            />
          </div>

          {incomplete ? (
            <div className="card mt-6 border-amber-500/25 bg-amber-500/[0.05] p-6">
              <h2 className="text-lg font-bold text-white">Complétez votre profil</h2>
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
          <div className="card mt-6 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">Commandes récentes</h2>
                <p className="mt-1 text-sm text-muted">Vos derniers achats liés à ce compte.</p>
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
