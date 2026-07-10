"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getExpensesAction,
  getExpenseSummaryAction,
  getUpcomingPaymentsAction,
  getExpenseDetailAction,
  createRecurringExpenseAction,
  createOneTimeExpenseAction,
  updateRecurringExpenseAction,
  markRecurringPaidAction,
  markEntryPaidAction,
  confirmUsageAction,
  skipOccurrenceAction,
  setRecurringStatusAction,
  deleteExpenseAction,
  runDueRemindersAction,
  correctOccurrenceAction,
  dropSubscriptionAction,
} from "@/app/actions/expenses";
import type {
  LedgerRowDTO,
  ExpenseSummaryDTO,
  UpcomingPaymentsDTO,
  UpcomingPaymentDTO,
  ExpenseDetailDTO,
  ExpenseEntryDTO,
} from "@/lib/expenses/types";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CURRENCIES,
  EXPENSE_FREQUENCIES,
  OCCURRENCE_CORRECTION_STATUSES,
  expenseCategoryLabel,
  expenseTypeLabel,
  expenseStatusLabel,
  expenseFrequencyLabel,
} from "@/lib/expenses/constants";
import { formatOriginal, formatMadAmount, formatExpenseDate } from "@/lib/expenses/currency";

const VIEWS = [
  { id: "all", label: "Toutes" },
  { id: "upcoming", label: "À venir" },
  { id: "paid", label: "Payées" },
  { id: "overdue", label: "En retard" },
  { id: "recurring", label: "Récurrentes" },
  { id: "one_time", label: "Ponctuelles" },
  { id: "variable", label: "Variables" },
  { id: "cancelled", label: "Annulées" },
];

function statusTone(status: string): string {
  switch (status) {
    case "paid":
      return "text-green-400 border-green-500/30 bg-green-500/10";
    case "overdue":
      return "text-red-300 border-red-500/30 bg-red-500/10";
    case "upcoming":
    case "pending":
      return "text-[#9FB8FF] border-accent/30 bg-accent/10";
    case "estimated":
      return "text-[#D9B27C] border-[#F7B14A]/30 bg-[#F7B14A]/10";
    case "cancelled":
    case "not_applicable":
      return "text-faint border-border bg-surface2";
    case "credit":
      return "text-teal-300 border-teal-500/30 bg-teal-500/10";
    case "subscription_cancelled":
    case "subscription_expired":
      return "text-[#E08B8B] border-red-500/25 bg-red-500/[0.07]";
    case "unpaid":
    case "failed":
      return "text-[#D9B27C] border-[#F7B14A]/30 bg-[#F7B14A]/10";
    default:
      return "text-muted border-border bg-surface2";
  }
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusTone(status)}`}>
      {expenseStatusLabel(status)}
    </span>
  );
}

export default function ExpensesPanel() {
  const [summary, setSummary] = useState<ExpenseSummaryDTO | null>(null);
  const [rows, setRows] = useState<LedgerRowDTO[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingPaymentsDTO | null>(null);
  const [view, setView] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [recurringOpen, setRecurringOpen] = useState(false);
  const [oneTimeOpen, setOneTimeOpen] = useState(false);
  const [editRecurring, setEditRecurring] = useState<LedgerRowDTO | null>(null);
  const [payTarget, setPayTarget] = useState<LedgerRowDTO | UpcomingPaymentDTO | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ recurringId?: string; entryId?: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<LedgerRowDTO | null>(null);
  const [correctTarget, setCorrectTarget] = useState<ExpenseEntryDTO | null>(null);
  const [detailRefresh, setDetailRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, u] = await Promise.all([
        getExpenseSummaryAction(),
        getExpensesAction({
          view,
          category: categoryFilter || undefined,
          currency: currencyFilter || undefined,
        }),
        getUpcomingPaymentsAction(),
      ]);
      setSummary(s);
      setRows(r);
      setUpcoming(u);
    } catch {
      setMsg({ text: "Impossible de charger les dépenses.", ok: false });
    } finally {
      setLoading(false);
    }
  }, [view, categoryFilter, currencyFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await action();
      if (res.ok) {
        setMsg({ text: okText, ok: true });
        await load();
      } else {
        setMsg({ text: res.error ?? "Action impossible.", ok: false });
      }
    } catch {
      setMsg({ text: "Une erreur est survenue.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Dépenses</h2>
          <p className="text-sm text-muted">Suivi des coûts de Ghost.ma — abonnements, renouvellements, dépenses ponctuelles.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setEditRecurring(null); setRecurringOpen(true); }}
            className="btn-primary py-1.5 text-xs"
          >
            + Dépense récurrente
          </button>
          <button type="button" onClick={() => setOneTimeOpen(true)} className="btn-ghost py-1.5 text-xs">
            + Dépense ponctuelle
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await runDueRemindersAction();
                return { ok: r.ok, error: r.error };
              }, "Rappels traités.")
            }
            className="btn-ghost py-1.5 text-xs"
            title="Traiter les rappels et échéances en retard maintenant (comme le fait le cron quotidien)"
          >
            Rappels
          </button>
        </div>
      </div>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Dépenses ce mois" value={formatMadAmount(summary?.monthMad ?? 0)} loading={loading} />
        <SummaryCard label="Dépenses cette année" value={formatMadAmount(summary?.yearMad ?? 0)} loading={loading} />
        <SummaryCard
          label="Paiements à venir"
          value={`${summary?.upcomingCount ?? 0}`}
          sub={formatMadAmount(summary?.upcomingMad ?? 0)}
          loading={loading}
        />
        <SummaryCard
          label="Variables non confirmées"
          value={`${summary?.unconfirmedVariableCount ?? 0}`}
          sub={formatMadAmount(summary?.unconfirmedVariableMad ?? 0)}
          loading={loading}
          tone="warning"
        />
      </div>

      {/* Upcoming payments */}
      {upcoming && (
        <UpcomingSection
          upcoming={upcoming}
          onPay={(p) => setPayTarget(p)}
          onSkip={(id) => run(() => skipOccurrenceAction(id), "Échéance ignorée.")}
          onDetail={(t) => setDetailTarget(t)}
          busy={busy}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              view === v.id ? "border-accent bg-accent/15 text-white" : "border-border text-muted hover:text-white"
            }`}
          >
            {v.label}
          </button>
        ))}
        <select className="input ml-auto max-w-[180px] py-1.5 text-xs" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">Toutes catégories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{expenseCategoryLabel(c)}</option>
          ))}
        </select>
        <select className="input max-w-[120px] py-1.5 text-xs" value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)}>
          <option value="">Devise</option>
          {EXPENSE_CURRENCIES.map((c) => (
            <option key={c} value={c}>{c === "MAD" ? "DH" : c}</option>
          ))}
        </select>
      </div>

      {/* Ledger table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Catégorie</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Montant</th>
                <th className="px-4 py-3 font-medium">≈ DH</th>
                <th className="px-4 py-3 font-medium">Fréquence</th>
                <th className="px-4 py-3 font-medium">Prochain</th>
                <th className="px-4 py-3 font-medium">Dernier</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted">Chargement…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted">Aucune dépense.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/60 hover:bg-surface/40">
                    <td className="px-4 py-3">
                      <button type="button" className="font-medium text-white hover:text-accent" onClick={() => setDetailTarget(r.kind === "recurring" ? { recurringId: r.recurringExpenseId! } : { entryId: r.entryId! })}>
                        {r.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted">{expenseCategoryLabel(r.category)}</td>
                    <td className="px-4 py-3 text-muted">{expenseTypeLabel(r.type)}</td>
                    <td className="px-4 py-3 text-white">
                      {r.amountEstimated && r.amountOriginal == null ? "Variable" : formatOriginal(r.amountOriginal, r.currency)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{r.amountMad != null ? formatMadAmount(r.amountMad) : "—"}</td>
                    <td className="px-4 py-3 text-muted">{r.frequency ? expenseFrequencyLabel(r.frequency) : "—"}</td>
                    <td className="px-4 py-3 text-muted">{formatExpenseDate(r.nextPaymentDate)}</td>
                    <td className="px-4 py-3 text-muted">{formatExpenseDate(r.lastPaymentDate)}</td>
                    <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                    <td className="px-4 py-3">
                      <RowActions
                        row={r}
                        busy={busy}
                        onPay={() => setPayTarget(r)}
                        onEdit={() => { if (r.kind === "recurring") { setEditRecurring(r); setRecurringOpen(true); } }}
                        onSkip={() => r.recurringExpenseId && run(() => skipOccurrenceAction(r.recurringExpenseId!), "Échéance ignorée.")}
                        onPause={() => r.recurringExpenseId && run(() => setRecurringStatusAction(r.recurringExpenseId!, "paused"), "Mis à jour.")}
                        onResume={() => r.recurringExpenseId && run(() => setRecurringStatusAction(r.recurringExpenseId!, "active"), "Réactivé.")}
                        onDrop={() => setDropTarget(r)}
                        onDelete={() => confirm(`Supprimer « ${r.name} » ? (une dépense payée est archivée, pas effacée)`) && run(() => deleteExpenseAction(r.kind === "recurring" ? { recurringId: r.recurringExpenseId! } : { entryId: r.entryId! }, true), "Supprimé.")}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {recurringOpen && (
        <RecurringForm
          editId={editRecurring?.recurringExpenseId ?? null}
          busy={busy}
          onClose={() => { setRecurringOpen(false); setEditRecurring(null); }}
          onSubmit={async (input, editId) => {
            await run(
              () => (editId ? updateRecurringExpenseAction(editId, input) : createRecurringExpenseAction(input)),
              editId ? "Dépense modifiée." : "Dépense récurrente créée.",
            );
            setRecurringOpen(false);
            setEditRecurring(null);
          }}
        />
      )}
      {oneTimeOpen && (
        <OneTimeForm
          busy={busy}
          onClose={() => setOneTimeOpen(false)}
          onSubmit={async (input) => {
            await run(() => createOneTimeExpenseAction(input), "Dépense ponctuelle créée.");
            setOneTimeOpen(false);
          }}
        />
      )}
      {payTarget && (
        <MarkPaidDialog
          target={payTarget}
          busy={busy}
          onClose={() => setPayTarget(null)}
          onSubmit={async (paid) => {
            const isRecurring = "kind" in payTarget ? payTarget.kind === "recurring" : payTarget.isRecurring;
            const recurringId = "recurringExpenseId" in payTarget ? payTarget.recurringExpenseId : null;
            const entryId = "entryId" in payTarget ? payTarget.entryId : null;
            await run(
              () =>
                isRecurring && recurringId
                  ? markRecurringPaidAction(recurringId, paid)
                  : markEntryPaidAction(entryId!, paid),
              "Paiement enregistré.",
            );
            setPayTarget(null);
          }}
        />
      )}
      {detailTarget && (
        <ExpenseDetail
          target={detailTarget}
          refreshKey={detailRefresh}
          onClose={() => setDetailTarget(null)}
          onConfirmUsage={async (entryId, amount, currency) => {
            await run(() => confirmUsageAction(entryId, amount, currency), "Montant confirmé.");
            setDetailRefresh((x) => x + 1);
          }}
          onCorrect={(occ) => setCorrectTarget(occ)}
        />
      )}
      {dropTarget && (
        <DropDialog
          target={dropTarget}
          busy={busy}
          onClose={() => setDropTarget(null)}
          onSubmit={async (opts) => {
            if (dropTarget.recurringExpenseId) {
              await run(() => dropSubscriptionAction(dropTarget.recurringExpenseId!, opts), "Abonnement résilié.");
            }
            setDropTarget(null);
          }}
        />
      )}
      {correctTarget && (
        <CorrectionDialog
          occurrence={correctTarget}
          busy={busy}
          onClose={() => setCorrectTarget(null)}
          onSubmit={async (correction) => {
            await run(() => correctOccurrenceAction(correctTarget.id, correction), "Correction enregistrée.");
            setCorrectTarget(null);
            setDetailRefresh((x) => x + 1);
          }}
        />
      )}
    </section>
  );
}

function SummaryCard({ label, value, sub, loading, tone }: { label: string; value: string; sub?: string; loading?: boolean; tone?: "warning" }) {
  return (
    <div className={`card p-4 ${tone === "warning" ? "border-[#F7B14A]/25" : ""}`}>
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-white">{loading ? "…" : value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

// ── Row actions ──────────────────────────────────────────────────────────────

function ActBtn({ label, onClick, busy, tone }: { label: string; onClick: () => void; busy: boolean; tone?: "danger" }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`text-xs font-medium transition disabled:opacity-40 ${tone === "danger" ? "text-red-400/80 hover:text-red-400" : "text-accent hover:text-accent-hover"}`}
    >
      {label}
    </button>
  );
}

function RowActions({
  row, busy, onPay, onEdit, onSkip, onPause, onResume, onDrop, onDelete,
}: {
  row: LedgerRowDTO; busy: boolean;
  onPay: () => void; onEdit: () => void; onSkip: () => void; onPause: () => void; onResume: () => void; onDrop: () => void; onDelete: () => void;
}) {
  const isRecurring = row.kind === "recurring";
  const terminated = row.status === "cancelled" || row.status === "subscription_cancelled" || row.status === "subscription_expired";
  const paid = row.status === "paid";
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {!terminated && !paid && <ActBtn label="Payer" onClick={onPay} busy={busy} />}
      {isRecurring && !terminated && (
        <>
          <ActBtn label="Modifier" onClick={onEdit} busy={busy} />
          <ActBtn label="Ignorer" onClick={onSkip} busy={busy} />
          {row.status === "pending" ? (
            <ActBtn label="Reprendre" onClick={onResume} busy={busy} />
          ) : (
            <ActBtn label="Pause" onClick={onPause} busy={busy} />
          )}
          <ActBtn label="Résilier" onClick={onDrop} busy={busy} tone="danger" />
        </>
      )}
      {isRecurring && terminated && <ActBtn label="Réactiver" onClick={onResume} busy={busy} />}
      <ActBtn label="Suppr." onClick={onDelete} busy={busy} tone="danger" />
    </div>
  );
}

// ── Upcoming payments ────────────────────────────────────────────────────────

function UpcomingSection({
  upcoming, onPay, onSkip, onDetail, busy,
}: {
  upcoming: UpcomingPaymentsDTO;
  onPay: (p: UpcomingPaymentDTO) => void;
  onSkip: (recurringId: string) => void;
  onDetail: (t: { recurringId?: string; entryId?: string }) => void;
  busy: boolean;
}) {
  const groups: { label: string; items: UpcomingPaymentDTO[] }[] = [
    { label: "Aujourd'hui", items: upcoming.today },
    { label: "7 prochains jours", items: upcoming.next7Days },
    { label: "Plus tard ce mois", items: upcoming.laterThisMonth },
    { label: "Le mois prochain", items: upcoming.nextMonth },
  ].filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-white">Paiements à venir</h3>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">{g.label}</p>
            <div className="divide-y divide-border/60">
              {g.items.map((p) => (
                <div key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <button type="button" className="text-sm font-medium text-white hover:text-accent" onClick={() => onDetail(p.isRecurring ? { recurringId: p.recurringExpenseId! } : { entryId: p.entryId! })}>
                      {p.name}
                    </button>
                    <span className="ml-2 text-xs text-muted">
                      {p.amountEstimated && p.amountOriginal == null ? "Variable" : formatOriginal(p.amountOriginal, p.currency)}
                      {p.amountMad != null && p.currency.toUpperCase() !== "MAD" ? ` (≈ ${formatMadAmount(p.amountMad)})` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono text-xs ${p.status === "overdue" ? "text-red-300" : "text-muted"}`}>{formatExpenseDate(p.dueDate)}</span>
                    <StatusChip status={p.status} />
                    <ActBtn label="Payer" onClick={() => onPay(p)} busy={busy} />
                    {p.isRecurring && p.recurringExpenseId && <ActBtn label="Ignorer" onClick={() => onSkip(p.recurringExpenseId!)} busy={busy} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Modal shell + field helpers ──────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className={`card my-8 w-full ${wide ? "max-w-2xl" : "max-w-lg"} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-faint">{label}</span>
      {children}
    </label>
  );
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

// ── Types derived from the action signatures (no server-only import) ─────────

type RecurringInput = Parameters<typeof createRecurringExpenseAction>[0];
type OneTimeInput = Parameters<typeof createOneTimeExpenseAction>[0];
type PaidInfo = Parameters<typeof markEntryPaidAction>[1];

const REMINDER_OPTIONS = [7, 3, 1];

function RecurringForm({
  editId, busy, onClose, onSubmit,
}: {
  editId: string | null; busy: boolean;
  onClose: () => void;
  onSubmit: (input: RecurringInput, editId: string | null) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("hebergement");
  const [currency, setCurrency] = useState("MAD");
  const [amount, setAmount] = useState("");
  const [isUsageBased, setIsUsageBased] = useState(false);
  const [frequency, setFrequency] = useState("monthly");
  const [customIntervalDays, setCustomIntervalDays] = useState("30");
  const [nextBilling, setNextBilling] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [paymentAccount, setPaymentAccount] = useState("");
  const [notes, setNotes] = useState("");
  const [reminders, setReminders] = useState<number[]>([7, 3, 1]);
  const [remindOnDue, setRemindOnDue] = useState(true);
  const [remindOverdue, setRemindOverdue] = useState(true);
  const [status, setStatus] = useState("active");

  useEffect(() => {
    if (!editId) return;
    getExpenseDetailAction({ recurringId: editId }).then((d) => {
      const r = d?.recurring;
      if (!r) return;
      setName(r.name); setDescription(r.description); setCategory(r.category); setCurrency(r.currency);
      setAmount(r.amount != null ? String(r.amount) : ""); setIsUsageBased(r.isUsageBased);
      setFrequency(r.frequency); setCustomIntervalDays(String(r.customIntervalDays ?? 30));
      setNextBilling(toDateInput(r.nextBillingDate)); setStartDate(toDateInput(r.startDate)); setEndDate(toDateInput(r.endDate));
      setAutoRenew(r.autoRenew); setPaymentAccount(r.paymentAccount ?? ""); setNotes(r.notes ?? "");
      setReminders(r.reminderDaysBefore); setRemindOnDue(r.remindOnDue); setRemindOverdue(r.remindOverdue);
      setStatus(r.status === "cancelled" ? "active" : r.status);
    });
  }, [editId]);

  function submit() {
    onSubmit(
      {
        name, description, category, currency,
        amount: amount.trim() === "" ? null : Number(amount),
        isUsageBased, frequency,
        customIntervalDays: frequency === "custom" ? Number(customIntervalDays) : null,
        nextBillingDate: nextBilling ? new Date(nextBilling).toISOString() : "",
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        autoRenew, paymentAccount: paymentAccount || null, notes: notes || null,
        reminderDaysBefore: reminders, remindOnDue, remindOverdue, status,
      },
      editId,
    );
  }

  return (
    <Modal title={editId ? "Modifier la dépense récurrente" : "Nouvelle dépense récurrente"} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service / fournisseur *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vercel Pro" /></Field>
        <Field label="Categorie">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{expenseCategoryLabel(c)}</option>)}
          </select>
        </Field>
        <Field label="Montant"><input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="20" /></Field>
        <Field label="Devise">
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {EXPENSE_CURRENCIES.map((c) => <option key={c} value={c}>{c === "MAD" ? "DH (MAD)" : c}</option>)}
          </select>
        </Field>
        <Field label="Frequence">
          <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {EXPENSE_FREQUENCIES.map((f) => <option key={f} value={f}>{expenseFrequencyLabel(f)}</option>)}
          </select>
        </Field>
        {frequency === "custom" ? (
          <Field label="Intervalle (jours)"><input className="input" type="number" value={customIntervalDays} onChange={(e) => setCustomIntervalDays(e.target.value)} /></Field>
        ) : <div />}
        <Field label="Prochain paiement *"><input className="input" type="date" value={nextBilling} onChange={(e) => setNextBilling(e.target.value)} /></Field>
        <Field label="Compte / mode de paiement"><input className="input" value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value)} /></Field>
        <Field label="Debut (optionnel)"><input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Fin (optionnel)"><input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
      </div>
      <Field label="Description / notes"><textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={isUsageBased} onChange={(e) => setIsUsageBased(e.target.checked)} /> Basee sur usage</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} /> Renouvellement auto</label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="text-faint">Rappels :</span>
        {REMINDER_OPTIONS.map((d) => (
          <label key={d} className="flex items-center gap-1.5">
            <input type="checkbox" checked={reminders.includes(d)} onChange={(e) => setReminders((prev) => e.target.checked ? [...prev, d].sort((a, b) => b - a) : prev.filter((x) => x !== d))} /> {d}j avant
          </label>
        ))}
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={remindOnDue} onChange={(e) => setRemindOnDue(e.target.checked)} /> jour J</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={remindOverdue} onChange={(e) => setRemindOverdue(e.target.checked)} /> en retard</label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
        <button type="button" className="btn-primary" disabled={busy || !name.trim() || !nextBilling} onClick={submit}>{busy ? "..." : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

function OneTimeForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (input: OneTimeInput) => Promise<void> }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("autre");
  const [type, setType] = useState("one_time");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MAD");
  const [amountEstimated, setAmountEstimated] = useState(false);
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("pending");
  const [paymentAccount, setPaymentAccount] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<{ fileName: string; mimeType: string; dataBase64: string } | null>(null);

  async function onFile(file: File | null) {
    if (!file) { setReceipt(null); return; }
    const dataUrl: string = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
    const base64 = dataUrl.split(",")[1] ?? "";
    setReceipt({ fileName: file.name, mimeType: file.type, dataBase64: base64 });
  }

  function submit() {
    onSubmit({
      name, category, type,
      amount: amount.trim() === "" ? null : Number(amount),
      currency, amountEstimated: type === "usage_based" ? amountEstimated : false,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      status, paymentAccount: paymentAccount || null, invoiceReference: invoiceReference || null,
      notes: notes || null, receipt,
    });
  }

  return (
    <Modal title="Nouvelle depense ponctuelle" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titre *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Achat logo" /></Field>
        <Field label="Categorie">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{expenseCategoryLabel(c)}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="one_time">Ponctuelle</option>
            <option value="usage_based">Variable (usage)</option>
            <option value="credit">Credit / Remboursement</option>
          </select>
        </Field>
        <Field label="Statut">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">En attente</option>
            <option value="paid">Payee</option>
            <option value="upcoming">A venir</option>
            <option value="estimated">Estimee</option>
            <option value="credit">Credit / Remboursement</option>
          </select>
        </Field>
        <Field label="Montant"><input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Devise">
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {EXPENSE_CURRENCIES.map((c) => <option key={c} value={c}>{c === "MAD" ? "DH (MAD)" : c}</option>)}
          </select>
        </Field>
        <Field label="Date"><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        <Field label="Reference facture"><input className="input" value={invoiceReference} onChange={(e) => setInvoiceReference(e.target.value)} /></Field>
        <Field label="Compte / mode de paiement"><input className="input" value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value)} /></Field>
        <Field label="Justificatif (optionnel)"><input className="input" type="file" accept=".png,.jpg,.jpeg,.pdf,image/*,application/pdf" onChange={(e) => onFile(e.target.files?.[0] ?? null)} /></Field>
      </div>
      {type === "usage_based" && (
        <label className="mt-2 flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={amountEstimated} onChange={(e) => setAmountEstimated(e.target.checked)} /> Montant estime (a confirmer plus tard)</label>
      )}
      <Field label="Notes"><textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
        <button type="button" className="btn-primary" disabled={busy || !name.trim()} onClick={submit}>{busy ? "..." : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

function MarkPaidDialog({ target, busy, onClose, onSubmit }: { target: LedgerRowDTO | UpcomingPaymentDTO; busy: boolean; onClose: () => void; onSubmit: (paid: PaidInfo) => Promise<void> }) {
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState(target.amountOriginal != null ? String(target.amountOriginal) : "");
  const [paidCurrency, setPaidCurrency] = useState(target.currency);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    onSubmit({
      paidDate: new Date(paidDate).toISOString(),
      paidAmount: Number(paidAmount),
      paidCurrency,
      paymentReference: reference || null,
      note: note || null,
    });
  }

  return (
    <Modal title={`Marquer paye - ${target.name}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date de paiement"><input className="input" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></Field>
        <Field label="Montant paye"><input className="input" type="number" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} /></Field>
        <Field label="Devise">
          <select className="input" value={paidCurrency} onChange={(e) => setPaidCurrency(e.target.value)}>
            {EXPENSE_CURRENCIES.map((c) => <option key={c} value={c}>{c === "MAD" ? "DH (MAD)" : c}</option>)}
          </select>
        </Field>
        <Field label="Reference (optionnel)"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
      <Field label="Note (optionnel)"><textarea className="input min-h-[50px]" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <p className="mt-2 text-xs text-faint">Le taux de change actuel sera fige sur cette ecriture.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
        <button type="button" className="btn-primary" disabled={busy || !paidAmount} onClick={submit}>{busy ? "..." : "Confirmer le paiement"}</button>
      </div>
    </Modal>
  );
}

function ExpenseDetail({ target, refreshKey, onClose, onConfirmUsage, onCorrect }: { target: { recurringId?: string; entryId?: string }; refreshKey: number; onClose: () => void; onConfirmUsage: (entryId: string, amount: number, currency: string) => Promise<void>; onCorrect: (occ: ExpenseEntryDTO) => void }) {
  const [detail, setDetail] = useState<ExpenseDetailDTO | null>(null);
  const [confirmAmount, setConfirmAmount] = useState("");

  useEffect(() => {
    getExpenseDetailAction(target).then(setDetail);
  }, [target, refreshKey]);

  const r = detail?.recurring;
  const e = detail?.entry;
  const usagePending = e && e.type === "usage_based" && e.amountEstimated;

  return (
    <Modal title={r?.name ?? e?.name ?? "Detail"} onClose={onClose} wide>
      {!detail ? (
        <p className="text-sm text-muted">Chargement...</p>
      ) : (
        <div className="space-y-4 text-sm">
          {r && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Info label="Categorie" value={expenseCategoryLabel(r.category)} />
              <Info label="Montant" value={r.isUsageBased && r.amount == null ? "Variable" : formatOriginal(r.amount, r.currency)} />
              <Info label="Frequence" value={expenseFrequencyLabel(r.frequency)} />
              <Info label="Prochain paiement" value={formatExpenseDate(r.nextBillingDate)} />
              <Info label="Dernier paiement" value={formatExpenseDate(r.lastPaymentDate)} />
              <Info label="Statut" value={expenseStatusLabel(r.occurrenceStatus)} />
              <Info label="Compte" value={r.paymentAccount ?? "-"} />
              <Info label="Renouvellement auto" value={r.autoRenew ? "Oui" : "Non"} />
              {r.notes ? <Info label="Notes" value={r.notes} full /> : null}
              <Info label="Creee par" value={r.createdBy ?? "-"} />
            </div>
          )}
          {e && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Info label="Categorie" value={expenseCategoryLabel(e.category)} />
              <Info label="Type" value={expenseTypeLabel(e.type)} />
              <Info label="Montant" value={e.amountEstimated && e.amountOriginal == null ? "Estime (en attente)" : formatOriginal(e.amountOriginal, e.currency)} />
              <Info label="≈ DH" value={e.amountMad != null ? formatMadAmount(e.amountMad) : "-"} />
              <Info label="Statut" value={expenseStatusLabel(e.status)} />
              <Info label="Payee le" value={formatExpenseDate(e.paidDate)} />
              <Info label="Reference" value={e.invoiceReference ?? e.paymentReference ?? "-"} />
              {e.notes ? <Info label="Notes" value={e.notes} full /> : null}
            </div>
          )}

          {usagePending && e ? (
            <div className="rounded-lg border border-[#F7B14A]/25 bg-[#F7B14A]/[0.06] p-3">
              <p className="mb-2 text-xs font-medium text-[#D9B27C]">Confirmer le montant final</p>
              <div className="flex items-center gap-2">
                <input className="input max-w-[140px]" type="number" step="0.01" value={confirmAmount} onChange={(ev) => setConfirmAmount(ev.target.value)} placeholder="Montant reel" />
                <button type="button" className="btn-primary py-1.5 text-xs" disabled={!confirmAmount} onClick={() => onConfirmUsage(e.id, Number(confirmAmount), e.currency)}>Confirmer</button>
              </div>
            </div>
          ) : null}

          {detail.occurrences.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Historique des paiements</p>
              <div className="divide-y divide-border/60 rounded-lg border border-border">
                {detail.occurrences.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="text-muted">{formatExpenseDate(o.paidDate ?? o.occurrenceDate)}</span>
                    <span className="text-white">{formatOriginal(o.paidAmount ?? o.amountOriginal, o.paidCurrency ?? o.currency)}</span>
                    <span className="text-faint">{o.amountMad != null ? formatMadAmount(o.amountMad) : ""}</span>
                    <StatusChip status={o.status} />
                    <button type="button" className="text-accent hover:text-accent-hover" onClick={() => onCorrect(o)}>Corriger</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail.adjustments.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Ajustements</p>
              <ul className="space-y-1 text-xs text-muted">
                {detail.adjustments.map((a) => (
                  <li key={a.id}>{formatExpenseDate(a.createdAt)} - {a.field}: {String(a.oldValue ?? "-")} → {String(a.newValue ?? "-")} {a.createdBy ? `(${a.createdBy})` : ""}</li>
                ))}
              </ul>
            </div>
          )}

          {detail.notifications.filter((n) => n.kind !== "_claim").length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Notifications Discord</p>
              <ul className="space-y-1 text-xs">
                {detail.notifications.filter((n) => n.kind !== "_claim").map((n) => (
                  <li key={n.id} className={n.status === "sent" ? "text-muted" : "text-red-400/80"}>
                    {formatExpenseDate(n.createdAt)} - {n.kind} - {n.status === "sent" ? "envoye" : `echec${n.error ? ` (${n.error})` : ""}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className="text-white">{value}</p>
    </div>
  );
}

// ── Subscription drop + occurrence correction dialogs ────────────────────────

type DropOptions = Parameters<typeof dropSubscriptionAction>[1];
type OccurrenceCorrection = Parameters<typeof correctOccurrenceAction>[1];

const NOT_DEBITED = ["unpaid", "failed", "cancelled", "subscription_cancelled", "subscription_expired", "not_applicable"];

function DropDialog({ target, busy, onClose, onSubmit }: { target: LedgerRowDTO; busy: boolean; onClose: () => void; onSubmit: (opts: DropOptions) => Promise<void> }) {
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [terminationType, setTerminationType] = useState<"cancelled" | "expired">("cancelled");
  const [reason, setReason] = useState("");
  const [lastOccurrencePaid, setLastOccurrencePaid] = useState(true);

  return (
    <Modal title={`Résilier — ${target.name}`} onClose={onClose}>
      <p className="mb-3 text-xs text-muted">
        Marque l&apos;abonnement comme résilié/expiré : arrête toutes les échéances futures et les rappels. L&apos;historique payé est conservé.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <select className="input" value={terminationType} onChange={(e) => setTerminationType(e.target.value as "cancelled" | "expired")}>
            <option value="cancelled">Abonnement résilié</option>
            <option value="expired">Abonnement expiré</option>
          </select>
        </Field>
        <Field label="Date effective"><input className="input" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></Field>
      </div>
      <Field label="Motif"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Résiliation de l'abonnement" /></Field>
      <label className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" checked={lastOccurrencePaid} onChange={(e) => setLastOccurrencePaid(e.target.checked)} />
        La dernière échéance a bien été débitée
      </label>
      {!lastOccurrencePaid && (
        <p className="mt-1 text-xs text-[#D9B27C]">La dernière occurrence payée sera retirée des totaux (avec trace d&apos;audit).</p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => onSubmit({ effectiveDate: new Date(effectiveDate).toISOString(), terminationType, reason: reason || null, lastOccurrencePaid, note: null })}
        >
          {busy ? "..." : "Confirmer la résiliation"}
        </button>
      </div>
    </Modal>
  );
}

function CorrectionDialog({ occurrence, busy, onClose, onSubmit }: { occurrence: ExpenseEntryDTO; busy: boolean; onClose: () => void; onSubmit: (c: OccurrenceCorrection) => Promise<void> }) {
  const [status, setStatus] = useState(occurrence.status);
  const [paidDate, setPaidDate] = useState(toDateInput(occurrence.paidDate) || new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState(occurrence.paidAmount != null ? String(occurrence.paidAmount) : occurrence.amountOriginal != null ? String(occurrence.amountOriginal) : "");
  const [reference, setReference] = useState(occurrence.paymentReference ?? "");
  const [notes, setNotes] = useState(occurrence.notes ?? "");
  const [subscriptionContinued, setSubscriptionContinued] = useState(true);

  const debited = !NOT_DEBITED.includes(status);
  const isSubTermination = status === "subscription_cancelled" || status === "subscription_expired";

  return (
    <Modal title={`Corriger l'occurrence — ${occurrence.name}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nouveau statut">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {OCCURRENCE_CORRECTION_STATUSES.map((s) => <option key={s} value={s}>{expenseStatusLabel(s)}</option>)}
          </select>
        </Field>
        {debited && <Field label="Date de paiement"><input className="input" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></Field>}
        {debited && <Field label="Montant payé"><input className="input" type="number" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} /></Field>}
        <Field label="Référence"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
      <Field label="Notes"><textarea className="input min-h-[50px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {occurrence.recurringExpenseId && !isSubTermination && (
        <label className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={subscriptionContinued} onChange={(e) => setSubscriptionContinued(e.target.checked)} />
          L&apos;abonnement a continué après cette occurrence
        </label>
      )}
      {!debited && (
        <p className="mt-2 text-xs text-[#D9B27C]">Ce statut retire le montant des totaux ; l&apos;original reste visible dans l&apos;audit.</p>
      )}
      {isSubTermination && (
        <p className="mt-1 text-xs text-[#E08B8B]">L&apos;abonnement sera marqué inactif et les échéances futures désactivées.</p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() =>
            onSubmit({
              status,
              paidDate: debited ? new Date(paidDate).toISOString() : null,
              paidAmount: debited && paidAmount ? Number(paidAmount) : null,
              paidCurrency: occurrence.currency,
              paymentReference: reference || null,
              notes: notes || null,
              subscriptionContinued: isSubTermination ? false : subscriptionContinued,
            })
          }
        >
          {busy ? "..." : "Enregistrer la correction"}
        </button>
      </div>
    </Modal>
  );
}
