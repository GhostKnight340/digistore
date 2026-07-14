import AccountNav from "@/components/account/AccountNav";
import PageHeader from "@/components/account/PageHeader";
import { WalletIcon } from "@/components/account/icons";
import { requireCustomer, getAccountOrders, isProfileIncomplete } from "@/lib/auth";
import { countSupportTicketsForCustomer } from "@/lib/db/supportTickets";
import { getGhostCreditWallet } from "@/lib/db/ghostCredit";
import { formatDH } from "@/lib/format";
import type { GhostCreditTransactionDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";

function formatFrenchDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

/** Human French label + tone for a ledger reason (never color-only — the text
 *  label always accompanies the tone). */
function reasonLabel(txn: GhostCreditTransactionDTO): string {
  switch (txn.reason) {
    case "promo_reward":
      return txn.promoCode ? `Crédit promo · ${txn.promoCode}` : "Crédit promo";
    case "promo_reversal":
      return "Reprise (remboursement)";
    case "order_spend":
      return "Utilisé sur une commande";
    case "order_spend_refund":
      return "Restitué (commande non finalisée)";
    case "admin_grant":
      return "Crédit manuel";
    case "admin_reversal":
      return "Reprise manuelle";
    case "expiration":
      return "Expiré (60 j d'inactivité)";
    default:
      return txn.reason;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "reversed":
      return "Repris";
    case "expired":
      return "Expiré";
    default:
      return "";
  }
}

export default async function AccountWalletPage() {
  const customer = await requireCustomer();
  const incomplete = isProfileIncomplete(customer);
  const [wallet, orders, supportCount] = await Promise.all([
    getGhostCreditWallet(customer.id),
    getAccountOrders(customer.id),
    countSupportTicketsForCustomer(customer.id, incomplete ? null : customer.email),
  ]);

  return (
    <div className="container-page py-10">
      <div className="grid gap-[26px] lg:grid-cols-[264px_1fr]">
        <AccountNav
          name={customer.name}
          email={incomplete ? "" : customer.email}
          active="wallet"
          verified={!incomplete && customer.emailVerified}
          ordersCount={orders.length}
          supportCount={supportCount}
        />
        <section className="space-y-5">
          <PageHeader
            title="Crédit Ghost"
            subtitle="Votre solde de crédit Ghost et l'historique de vos transactions."
          />

          {/* Balance card */}
          <div
            className="relative overflow-hidden rounded-[18px] border border-accent/25 p-6"
            style={{ background: "linear-gradient(150deg,#16203a,#0f1218)" }}
          >
            <div
              className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full opacity-70 blur-2xl"
              style={{ background: "radial-gradient(circle, rgba(62,123,250,0.28), transparent 70%)" }}
            />
            <div className="relative flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent/15 text-[#9FB8FF]">
                <WalletIcon className="h-7 w-7" />
              </span>
              <div>
                <p className="text-[12.5px] font-medium uppercase tracking-wide text-[#9FB8FF]">
                  Solde disponible
                </p>
                <p className="mt-1 font-mono text-[32px] font-semibold leading-none text-white">
                  {formatDH(wallet.balanceMad)}
                </p>
              </div>
            </div>
            <p className="relative mt-4 text-[12.5px] leading-relaxed text-muted">
              Le crédit Ghost est ajouté après confirmation des commandes éligibles et n&apos;est utilisable
              que sur Ghost.ma — il n&apos;est pas retirable en argent.
              {wallet.balanceMad > 0 && wallet.expiresAt
                ? ` Votre solde expire le ${formatFrenchDate(wallet.expiresAt)} s'il reste inactif — chaque nouveau crédit relance ce délai de 60 jours.`
                : " Le solde expire après 60 jours d'inactivité ; chaque nouveau crédit relance ce délai."}
            </p>
            {wallet.frozen && (
              <p className="relative mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
                Votre crédit Ghost est temporairement bloqué et en cours de vérification. Contactez le support
                si besoin.
              </p>
            )}
          </div>

          {/* Ledger */}
          <div className="rounded-[18px] border border-border bg-card p-[22px] shadow-soft sm:p-[26px]">
            <h2 className="text-[15px] font-semibold text-white">Historique</h2>
            {wallet.transactions.length === 0 ? (
              <div className="mt-4 flex flex-col items-center px-6 py-8 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
                  <WalletIcon className="h-6 w-6" />
                </span>
                <p className="mt-4 text-[14px] font-semibold text-white">Aucune transaction</p>
                <p className="mt-1 max-w-sm text-[13px] text-muted">
                  Utilisez un code promo « crédit Ghost » lors du paiement pour commencer à gagner du crédit.
                </p>
              </div>
            ) : (
              <ul className="mt-3.5 space-y-2">
                {wallet.transactions.map((txn) => {
                  const isCredit = txn.direction === "credit";
                  const inactive = txn.status !== "active";
                  return (
                    <li
                      key={txn.id}
                      className="flex items-center gap-3.5 rounded-[13px] border border-border bg-canvas px-4 py-3"
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold ${
                          isCredit ? "bg-[#5BC98C]/12 text-[#5BC98C]" : "bg-red-500/10 text-red-300"
                        }`}
                        aria-hidden
                      >
                        {isCredit ? "+" : "−"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-white">
                          {reasonLabel(txn)}
                          {inactive && (
                            <span className="ml-2 rounded-full border border-white/15 px-1.5 py-0.5 text-[10.5px] text-muted">
                              {statusLabel(txn.status)}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11.5px] text-faint">
                          {formatFrenchDate(txn.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-[14px] font-semibold ${
                          inactive ? "text-faint line-through" : isCredit ? "text-[#5BC98C]" : "text-red-300"
                        }`}
                      >
                        {isCredit ? "+" : "−"}
                        {formatDH(txn.amountMad)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
