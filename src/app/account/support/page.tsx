import Link from "next/link";
import AccountNav from "@/components/account/AccountNav";
import PageHeader from "@/components/account/PageHeader";
import { LifebuoyIcon, ArrowRightIcon } from "@/components/account/icons";
import { requireCustomer, getAccountOrders, isProfileIncomplete } from "@/lib/auth";
import { listSupportTicketsForCustomer } from "@/lib/db/supportTickets";
import { findSupportCategory } from "@/lib/support/config";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: "En cours", cls: "border-[#F7B14A]/30 bg-[#F7B14A]/10 text-[#F7B14A]" },
  answered: { label: "Répondue", cls: "border-accent/30 bg-accent/10 text-[#9FB8FF]" },
  closed: { label: "Clôturée", cls: "border-green-500/30 bg-green-500/10 text-green-400" },
};

const RESOLUTION_LABEL: Record<string, string> = {
  resolved: "Résolu",
  cancelled: "Annulé",
  dismissed: "Sans suite",
};

function categoryLabel(key: string): string {
  return findSupportCategory(key)?.label ?? key;
}

function formatFrenchDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function AccountSupportPage() {
  const customer = await requireCustomer();
  const incomplete = isProfileIncomplete(customer);
  const accountEmail = incomplete ? null : customer.email;
  const [orders, tickets] = await Promise.all([
    getAccountOrders(customer.id),
    listSupportTicketsForCustomer(customer.id, accountEmail),
  ]);

  return (
    <div className="container-page py-10">
      <div className="grid gap-[26px] lg:grid-cols-[264px_1fr]">
        <AccountNav
          name={customer.name}
          email={incomplete ? "" : customer.email}
          active="support"
          verified={!incomplete && customer.emailVerified}
          ordersCount={orders.length}
          supportCount={tickets.length}
        />
        <section className="space-y-5">
          <PageHeader
            title="Mes demandes de support"
            subtitle="Suivez vos demandes, consultez les réponses de notre équipe et donnez votre avis."
          />

          <div className="rounded-[18px] border border-border bg-card p-[22px] shadow-soft sm:p-[26px]">
            {tickets.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
                  <LifebuoyIcon className="h-7 w-7" />
                </span>
                <p className="mt-4 text-[15px] font-semibold text-white">Aucune demande de support</p>
                <p className="mt-1 max-w-sm text-[13px] text-muted">
                  Une question ou un souci avec une commande ? Notre équipe est là pour vous aider.
                </p>
                <Link href="/support" className="btn-primary mt-5 text-sm">
                  Contacter le support
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((t) => {
                  const meta = STATUS_META[t.status] ?? {
                    label: t.status,
                    cls: "border-border bg-surface2 text-muted",
                  };
                  const lastReply = t.replies[t.replies.length - 1];
                  const canGiveFeedback = t.status === "closed" && !t.feedbackGiven && t.feedbackToken;
                  return (
                    <div key={t.reference} className="rounded-[13px] border border-border bg-base px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="font-mono text-[13px] font-bold text-accent">{t.reference}</span>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${meta.cls}`}
                        >
                          {meta.label}
                          {t.status === "closed" && t.resolution
                            ? ` · ${RESOLUTION_LABEL[t.resolution] ?? t.resolution}`
                            : ""}
                        </span>
                        <span className="min-w-0 flex-1 basis-40 truncate text-sm text-white">
                          {categoryLabel(t.category)} — {t.subIssueLabel}
                        </span>
                        <span className="text-xs text-faint">{formatFrenchDate(t.createdAt)}</span>
                      </div>

                      {t.message && (
                        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
                          {t.message}
                        </p>
                      )}

                      {lastReply && (
                        <div className="mt-2.5 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2.5">
                          <p className="text-[11px] uppercase tracking-wide text-faint">
                            Réponse de notre équipe
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-white">
                            {lastReply.body}
                          </p>
                        </div>
                      )}

                      {t.status === "closed" && (
                        <div className="mt-2.5">
                          {canGiveFeedback ? (
                            <Link
                              href={`/support/feedback?token=${t.feedbackToken}`}
                              className="btn-primary py-1.5 text-xs"
                            >
                              Donner mon avis
                            </Link>
                          ) : t.feedbackGiven ? (
                            <p className="text-[12px] text-faint">Merci, votre avis a bien été enregistré.</p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
