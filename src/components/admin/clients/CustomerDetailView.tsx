"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatMAD } from "@/lib/format";
import type {
  CustomerOverviewDTO,
  CustomerOrderRowDTO,
  CustomerPaymentRowDTO,
  CustomerPromotionsDTO,
  CustomerSecurityDTO,
  CustomerSupportTicketDTO,
} from "@/lib/customerAdminDto";
import type { CustomerNoteDTO } from "@/lib/db/customerNotes";
import type { AuditLogEntryDTO } from "@/lib/db/adminAudit";
import {
  getCustomerOrdersAction,
  getCustomerPaymentsAction,
  getCustomerGhostCreditAction,
  getCustomerPromotionsAction,
  getCustomerSupportAction,
  getCustomerSecurityAction,
  getCustomerActivityAction,
  getCustomerNotesAction,
  setCustomerStatusAction,
  revokeCustomerSessionsAction,
  resendVerificationAction,
  sendPasswordResetAction,
  startCustomerEmailChangeAction,
  addCustomerNoteAction,
  archiveCustomerNoteAction,
  customerWalletAdjustAction,
  customerWalletFreezeAction,
  customerWalletReconcileAction,
  customerSupportReplyAction,
} from "@/app/actions/customers";
import ActionDialog, { type ActionField } from "./ActionDialog";
import { CustomerStatusBadge, formatAdminDate, formatAdminDateTime } from "./shared";

type TabKey =
  | "overview"
  | "orders"
  | "payments"
  | "credit"
  | "promotions"
  | "support"
  | "security"
  | "activity";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Aperçu" },
  { key: "orders", label: "Commandes" },
  { key: "payments", label: "Paiements" },
  { key: "credit", label: "Ghost Credit" },
  { key: "promotions", label: "Promotions" },
  { key: "support", label: "Support" },
  { key: "security", label: "Compte & sécurité" },
  { key: "activity", label: "Activité" },
];

// A pending confirmation. `run` receives the dialog inputs and performs the
// server action; the view refreshes on success.
interface Pending {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  requireReason?: boolean;
  fields?: ActionField[];
  run: (v: { reason: string; fields: Record<string, string> }) => Promise<{ ok: boolean; error?: string }>;
}

export default function CustomerDetailView({
  overview,
  customerId,
}: {
  overview: CustomerOverviewDTO;
  customerId: string;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    // Server actions revalidate the route; a soft reload re-renders overview.
    window.location.reload();
  }, []);

  async function confirm(v: { reason: string; fields: Record<string, string> }) {
    if (!pending) return;
    setBusy(true);
    setDialogError(null);
    try {
      const res = await pending.run(v);
      if (res.ok) {
        setPending(null);
        refresh();
      } else {
        setDialogError(res.error ?? "Échec de l'action.");
      }
    } catch {
      setDialogError("Échec de l'action.");
    } finally {
      setBusy(false);
    }
  }

  const { identity } = overview;

  return (
    <div className="min-w-0">
      <Link href="/admin/clients" className="text-sm text-accent hover:text-accent-hover">
        ← Tous les clients
      </Link>

      {/* Header */}
      <header className="mt-3 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-white">{identity.name}</h1>
            <CustomerStatusBadge status={identity.status} verified={identity.emailVerified} />
          </div>
          <p className="mt-1 text-sm text-faint">{identity.email}</p>
          {identity.statusReason && identity.status !== "active" && (
            <p className="mt-1 text-xs text-amber-400">Motif : {identity.statusReason}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {identity.status === "disabled" ? (
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() =>
                setPending({
                  title: "Réactiver le compte",
                  description: "Le client pourra de nouveau se connecter et acheter.",
                  requireReason: true,
                  run: (v) =>
                    setCustomerStatusAction({ customerId, status: "active", reason: v.reason }),
                })
              }
            >
              Réactiver
            </button>
          ) : (
            <button
              type="button"
              className="btn-ghost text-sm text-red-400"
              onClick={() =>
                setPending({
                  title: "Désactiver le compte",
                  description:
                    "Bloque la connexion et les achats. Les commandes et l'historique sont conservés. Les sessions actives sont révoquées.",
                  tone: "danger",
                  confirmLabel: "Désactiver",
                  requireReason: true,
                  run: (v) =>
                    setCustomerStatusAction({ customerId, status: "disabled", reason: v.reason }),
                })
              }
            >
              Désactiver
            </button>
          )}
          <StatusMenu customerId={customerId} current={identity.status} onPick={setPending} />
        </div>
      </header>

      {/* Tabs */}
      <nav
        className="mt-4 flex gap-1 overflow-x-auto border-b border-border"
        role="tablist"
        aria-label="Sections client"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`tab-${t.key}`}
            id={`tabbtn-${t.key}`}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              tab === t.key
                ? "border-accent text-white"
                : "border-transparent text-muted hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div id={`tab-${tab}`} role="tabpanel" aria-labelledby={`tabbtn-${tab}`} className="mt-6">
        {tab === "overview" && <OverviewTab overview={overview} customerId={customerId} />}
        {tab === "orders" && <OrdersTab customerId={customerId} />}
        {tab === "payments" && <PaymentsTab customerId={customerId} />}
        {tab === "credit" && <GhostCreditTab customerId={customerId} onAction={setPending} />}
        {tab === "promotions" && <PromotionsTab customerId={customerId} />}
        {tab === "support" && <SupportTab customerId={customerId} onAction={setPending} />}
        {tab === "security" && (
          <SecurityTab customerId={customerId} onAction={setPending} />
        )}
        {tab === "activity" && <ActivityTab customerId={customerId} />}
      </div>

      <ActionDialog
        open={pending != null}
        title={pending?.title ?? ""}
        description={pending?.description}
        confirmLabel={pending?.confirmLabel}
        tone={pending?.tone}
        requireReason={pending?.requireReason}
        fields={pending?.fields}
        busy={busy}
        error={dialogError}
        onCancel={() => {
          setPending(null);
          setDialogError(null);
        }}
        onConfirm={confirm}
      />
    </div>
  );
}

function StatusMenu({
  current,
  customerId,
  onPick,
}: {
  current: string;
  customerId: string;
  onPick: (p: Pending) => void;
}) {
  const [open, setOpen] = useState(false);
  const options: { status: string; label: string }[] = [
    { status: "review", label: "Marquer en revue" },
    { status: "fraud_hold", label: "Blocage fraude" },
    { status: "active", label: "Remettre actif" },
  ].filter((o) => o.status !== current);

  return (
    <div className="relative">
      <button type="button" className="btn-ghost text-sm" onClick={() => setOpen((v) => !v)}>
        Statut ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-border bg-card p-1 shadow-card">
          {options.map((o) => (
            <button
              key={o.status}
              type="button"
              className="block w-full rounded px-3 py-2 text-left text-sm text-muted hover:bg-surface hover:text-white"
              onClick={() => {
                setOpen(false);
                onPick({
                  title: o.label,
                  requireReason: true,
                  run: (v) =>
                    setCustomerStatusAction({ customerId, status: o.status, reason: v.reason }),
                });
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right text-white">{value}</span>
    </div>
  );
}

function OverviewTab({
  overview,
  customerId,
}: {
  overview: CustomerOverviewDTO;
  customerId: string;
}) {
  const { identity, commerce, wallet, support } = overview;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Identité">
        <Row label="Nom" value={identity.name} />
        <Row label="E-mail" value={identity.email} />
        <Row label="Téléphone" value={identity.hasPhone ? identity.phoneMasked : "—"} />
        <Row label="Vérifié" value={identity.emailVerified ? "Oui" : "Non"} />
        <Row label="Inscription" value={identity.signupMethod} />
        <Row label="Langue" value={identity.preferredLanguage ?? "—"} />
        <Row label="Créé le" value={formatAdminDate(identity.createdAt)} />
        <Row label="Dernière activité" value={formatAdminDate(identity.lastActivityAt)} />
        <details className="mt-2 text-xs text-faint">
          <summary className="cursor-pointer">Détails techniques</summary>
          <p className="mt-1 font-mono break-all">ID : {identity.id}</p>
        </details>
      </Card>

      <Card title="Commerce">
        <Row label="Commandes complétées" value={commerce.completedOrders} />
        <Row label="En attente" value={commerce.pendingOrders} />
        <Row label="Annulées / remboursées" value={commerce.cancelledOrRefundedOrders} />
        <Row label="Dépense totale client" value={formatMAD(commerce.completedSpendMad)} />
        <Row label="Panier moyen" value={formatMAD(commerce.averageOrderValueMad)} />
        <Row label="Dernière commande" value={formatAdminDate(commerce.lastOrderAt)} />
        {commerce.topCategories.length > 0 && (
          <Row
            label="Catégories"
            value={commerce.topCategories.map((c) => c.name).join(", ")}
          />
        )}
        {commerce.topProducts.length > 0 && (
          <Row label="Produits" value={commerce.topProducts.map((p) => p.name).join(", ")} />
        )}
      </Card>

      <Card title="Portefeuille Ghost Credit">
        <Row label="Disponible" value={formatMAD(wallet.availableMad)} />
        <Row label="Bloqué (commandes)" value={formatMAD(wallet.lockedMad)} />
        <Row label="En attente" value={formatMAD(wallet.pendingMad)} />
        <Row label="Expiration" value={formatAdminDate(wallet.expiresAt)} />
        <Row label="Dernier gain qualifiant" value={formatAdminDate(wallet.lastQualifyingCreditAt)} />
        <Row
          label="Gelé"
          value={wallet.frozen ? `Oui${wallet.frozenReason ? ` — ${wallet.frozenReason}` : ""}` : "Non"}
        />
      </Card>

      <Card title="Support">
        <Row label="Tickets ouverts" value={support.openTickets} />
        <Row label="Dernière interaction" value={formatAdminDate(support.lastInteractionAt)} />
        <Row label="Problèmes commande" value={support.unresolvedOrderIssues} />
      </Card>

      <div className="lg:col-span-2">
        <NotesCard customerId={customerId} />
      </div>
    </div>
  );
}

// ── Notes ────────────────────────────────────────────────────────────────────

const NOTE_CATS: { value: string; label: string }[] = [
  { value: "general", label: "Général" },
  { value: "support", label: "Support" },
  { value: "fraud", label: "Fraude / risque" },
  { value: "payment", label: "Paiement" },
];

function NotesCard({ customerId }: { customerId: string }) {
  const [notes, setNotes] = useState<CustomerNoteDTO[] | null>(null);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setNotes(await getCustomerNotesAction(customerId));
  }, [customerId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      const res = await addCustomerNoteAction({ customerId, category, body });
      if (res.ok) {
        setBody("");
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Notes internes (privées)">
      <div className="mb-4 space-y-2">
        <textarea
          className="input min-h-[70px]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Note interne — jamais visible par le client"
          aria-label="Nouvelle note"
        />
        <div className="flex flex-wrap gap-2">
          <select
            className="input h-9 w-auto text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Catégorie de note"
          >
            {NOTE_CATS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary text-sm" onClick={add} disabled={saving}>
            {saving ? "…" : "Ajouter"}
          </button>
        </div>
      </div>
      {notes == null ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-faint">Aucune note.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border border-border p-3 text-sm ${n.archived ? "opacity-50" : ""}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-faint">
                <span>
                  {NOTE_CATS.find((c) => c.value === n.category)?.label ?? n.category} · {n.authorName} ·{" "}
                  {formatAdminDateTime(n.createdAt)}
                  {n.archived && " · archivée"}
                </span>
                {!n.archived && (
                  <button
                    type="button"
                    className="text-faint hover:text-white"
                    onClick={async () => {
                      await archiveCustomerNoteAction({ noteId: n.id, customerId });
                      await load();
                    }}
                  >
                    Archiver
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-white">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Generic async tab wrapper ────────────────────────────────────────────────

function useTabData<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    loader()
      .then(setData)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, reload };
}

// ── Orders ───────────────────────────────────────────────────────────────────

function OrdersTab({ customerId }: { customerId: string }) {
  const { data, loading } = useTabData<CustomerOrderRowDTO[]>(() =>
    getCustomerOrdersAction(customerId),
  );
  if (loading) return <p className="text-sm text-muted">Chargement…</p>;
  if (!data || data.length === 0) return <p className="text-sm text-faint">Aucune commande.</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2">N°</th>
            <th scope="col" className="px-3 py-2">Date</th>
            <th scope="col" className="px-3 py-2">Articles</th>
            <th scope="col" className="px-3 py-2 text-right">Total</th>
            <th scope="col" className="px-3 py-2 text-right">Crédit</th>
            <th scope="col" className="px-3 py-2">Paiement</th>
            <th scope="col" className="px-3 py-2">Statut</th>
            <th scope="col" className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {data.map((o) => (
            <tr key={o.id} className="border-b border-border/60">
              <td className="px-3 py-2 font-mono">{o.publicOrderNumber}</td>
              <td className="px-3 py-2 text-muted">{formatAdminDate(o.createdAt)}</td>
              <td className="max-w-[240px] truncate px-3 py-2 text-muted">{o.itemsSummary}</td>
              <td className="px-3 py-2 text-right font-mono">{formatMAD(o.totalMad)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatMAD(o.ghostCreditAppliedMad)}</td>
              <td className="px-3 py-2 text-muted">{o.paymentMethod}</td>
              <td className="px-3 py-2">
                {o.hasProblem && <span aria-hidden className="mr-1 text-amber-400">●</span>}
                {o.status}
              </td>
              <td className="px-3 py-2 text-right">
                <Link href={`/admin/orders/${o.id}`} className="text-accent hover:text-accent-hover">
                  Ouvrir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Payments ─────────────────────────────────────────────────────────────────

function PaymentsTab({ customerId }: { customerId: string }) {
  const { data, loading } = useTabData<CustomerPaymentRowDTO[]>(() =>
    getCustomerPaymentsAction(customerId),
  );
  if (loading) return <p className="text-sm text-muted">Chargement…</p>;
  if (!data || data.length === 0) return <p className="text-sm text-faint">Aucun paiement.</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2">Commande</th>
            <th scope="col" className="px-3 py-2">Méthode</th>
            <th scope="col" className="px-3 py-2 text-right">Dû</th>
            <th scope="col" className="px-3 py-2 text-right">Reçu</th>
            <th scope="col" className="px-3 py-2">Réf.</th>
            <th scope="col" className="px-3 py-2">Preuve</th>
            <th scope="col" className="px-3 py-2">Statut</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.orderId} className="border-b border-border/60">
              <td className="px-3 py-2 font-mono">
                <Link href={`/admin/orders/${p.orderId}`} className="text-accent hover:text-accent-hover">
                  {p.publicOrderNumber}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted">{p.paymentMethod}</td>
              <td className="px-3 py-2 text-right font-mono">{formatMAD(p.amountDueMad)}</td>
              <td className="px-3 py-2 text-right font-mono">
                {p.amountReceivedMad != null ? formatMAD(p.amountReceivedMad) : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-faint">{p.providerReferenceMasked || "—"}</td>
              <td className="px-3 py-2 text-muted">{p.hasProof ? "Oui" : "—"}</td>
              <td className="px-3 py-2 text-muted">{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Ghost Credit ─────────────────────────────────────────────────────────────

function GhostCreditTab({
  customerId,
  onAction,
}: {
  customerId: string;
  onAction: (p: Pending) => void;
}) {
  const { data, loading } = useTabData(() => getCustomerGhostCreditAction(customerId));
  if (loading) return <p className="text-sm text-muted">Chargement…</p>;
  if (!data) return <p className="text-sm text-faint">Indisponible.</p>;
  const { wallet, locked } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() =>
            onAction({
              title: "Créditer le portefeuille",
              description: "Un ajout manuel ne réinitialise pas le délai d'inactivité.",
              requireReason: true,
              fields: [{ key: "amount", label: "Montant (MAD)", type: "number", required: true }],
              run: (v) =>
                customerWalletAdjustAction({
                  customerId,
                  direction: "credit",
                  amountMad: Number(v.fields.amount) || 0,
                  reason: v.reason,
                }),
            })
          }
        >
          Créditer
        </button>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() =>
            onAction({
              title: "Débiter le portefeuille",
              requireReason: true,
              fields: [{ key: "amount", label: "Montant (MAD)", type: "number", required: true }],
              run: (v) =>
                customerWalletAdjustAction({
                  customerId,
                  direction: "debit",
                  amountMad: Number(v.fields.amount) || 0,
                  reason: v.reason,
                }),
            })
          }
        >
          Débiter / annuler
        </button>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() =>
            onAction({
              title: wallet.frozen ? "Dégeler le portefeuille" : "Geler le portefeuille",
              requireReason: true,
              tone: wallet.frozen ? "default" : "danger",
              run: (v) =>
                customerWalletFreezeAction({ customerId, frozen: !wallet.frozen, reason: v.reason }),
            })
          }
        >
          {wallet.frozen ? "Dégeler" : "Geler"}
        </button>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() =>
            onAction({
              title: "Réconcilier le cache",
              description: "Recalcule le solde en cache depuis le registre. N'altère jamais l'historique.",
              run: () => customerWalletReconcileAction({ customerId }),
            })
          }
        >
          Réconcilier
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Disponible">
          <p className="font-mono text-2xl text-white">{formatMAD(wallet.balanceMad)}</p>
          {wallet.frozen && <p className="mt-1 text-xs text-amber-400">Portefeuille gelé</p>}
        </Card>
        <Card title="Expiration">
          <p className="text-white">{formatAdminDate(wallet.expiresAt)}</p>
          <p className="mt-1 text-xs text-faint">
            Rappel : {data.reminderEnabled ? "activé" : "désactivé"}
          </p>
        </Card>
        <Card title="Bloqué (commandes)">
          <p className="font-mono text-2xl text-white">
            {formatMAD(locked.reduce((s, l) => s + l.amountMad, 0))}
          </p>
        </Card>
      </div>

      {locked.length > 0 && (
        <Card title="Crédit bloqué par commande">
          <ul className="space-y-2 text-sm">
            {locked.map((l) => (
              <li key={l.orderId} className="flex items-center justify-between gap-2">
                <Link href={`/admin/orders/${l.orderId}`} className="font-mono text-accent">
                  {l.publicOrderNumber}
                </Link>
                <span className="text-muted">{l.status}</span>
                <span className="text-faint">{formatAdminDate(l.createdAt)}</span>
                <span className="font-mono text-white">{formatMAD(l.amountMad)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Registre (append-only)">
        {wallet.transactions.length === 0 ? (
          <p className="text-sm text-faint">Aucune écriture.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {wallet.transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5">
                <span className="min-w-0">
                  <span className="text-white">{t.reason}</span>
                  {t.note && <span className="ml-2 text-xs text-faint">{t.note}</span>}
                  {t.status !== "active" && (
                    <span className="ml-2 text-xs text-amber-400">{t.status}</span>
                  )}
                </span>
                <span className="shrink-0 text-faint">{formatAdminDate(t.createdAt)}</span>
                <span
                  className={`shrink-0 font-mono ${t.direction === "credit" ? "text-green-400" : "text-red-400"}`}
                >
                  {t.direction === "credit" ? "+" : "−"}
                  {formatMAD(t.amountMad)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── Promotions & milestones ──────────────────────────────────────────────────

function PromotionsTab({ customerId }: { customerId: string }) {
  const { data, loading } = useTabData<CustomerPromotionsDTO>(() =>
    getCustomerPromotionsAction(customerId),
  );
  if (loading) return <p className="text-sm text-muted">Chargement…</p>;
  if (!data) return <p className="text-sm text-faint">Indisponible.</p>;
  return (
    <div className="space-y-5">
      <Card title="Paliers de fidélité">
        <Row label="Dépense qualifiante" value={formatMAD(data.milestones.qualifyingSpendMad)} />
        {data.milestones.next ? (
          <Row
            label={`Prochain : ${data.milestones.next.title}`}
            value={`${formatMAD(data.milestones.next.remainingMad)} restants`}
          />
        ) : (
          <p className="mt-1 text-sm text-faint">Tous les paliers actifs sont atteints.</p>
        )}
        {data.milestones.unlocked.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {data.milestones.unlocked.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="text-white">
                  {m.title}
                  {m.status === "reversed" && (
                    <span className="ml-2 text-xs text-amber-400">annulé</span>
                  )}
                </span>
                <span className="font-mono text-green-400">+{formatMAD(m.rewardMad)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Historique promo">
        {data.promos.length === 0 ? (
          <p className="text-sm text-faint">Aucune utilisation de code promo.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.promos.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 border-b border-border/50 py-1.5">
                <span className="font-mono text-white">{p.code}</span>
                <span className="text-muted">{p.rewardType}</span>
                <span className="text-faint">{p.orderNumber ?? "—"}</span>
                <span className={p.reversed ? "text-amber-400" : "text-muted"}>{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── Support ──────────────────────────────────────────────────────────────────

function SupportTab({
  customerId,
  onAction,
}: {
  customerId: string;
  onAction: (p: Pending) => void;
}) {
  const { data, loading } = useTabData<CustomerSupportTicketDTO[]>(() =>
    getCustomerSupportAction(customerId),
  );
  if (loading) return <p className="text-sm text-muted">Chargement…</p>;
  if (!data || data.length === 0) return <p className="text-sm text-faint">Aucune demande de support.</p>;
  return (
    <ul className="space-y-3">
      {data.map((t) => (
        <li key={t.id} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-mono text-sm text-white">{t.reference}</span>
              <span className="ml-2 text-xs text-faint">
                {t.category} · {t.subIssueLabel}
                {t.orderRef ? ` · ${t.orderRef}` : ""}
              </span>
            </div>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              {t.status}
              {t.resolution ? ` (${t.resolution})` : ""}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-muted">{t.latestMessage}</p>
          <div className="mt-3 flex items-center justify-between text-xs text-faint">
            <span>
              {t.replyCount} réponse{t.replyCount === 1 ? "" : "s"} · {formatAdminDate(t.updatedAt)}
            </span>
            {t.status !== "closed" && (
              <button
                type="button"
                className="text-accent hover:text-accent-hover"
                onClick={() =>
                  onAction({
                    title: `Répondre — ${t.reference}`,
                    description: "La réponse est envoyée au client via le système d'e-mails existant.",
                    confirmLabel: "Envoyer",
                    fields: [{ key: "body", label: "Message", required: true }],
                    run: (v) =>
                      customerSupportReplyAction({
                        customerId,
                        ticketId: t.id,
                        body: v.fields.body ?? "",
                      }),
                  })
                }
              >
                Répondre
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Account & security ───────────────────────────────────────────────────────

function SecurityTab({
  customerId,
  onAction,
}: {
  customerId: string;
  onAction: (p: Pending) => void;
}) {
  const { data, loading } = useTabData<CustomerSecurityDTO | null>(() =>
    getCustomerSecurityAction(customerId),
  );
  if (loading) return <p className="text-sm text-muted">Chargement…</p>;
  if (!data) return <p className="text-sm text-faint">Indisponible.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Authentification">
        <Row label="E-mail vérifié" value={data.emailVerified ? "Oui" : "Non"} />
        <Row label="Fournisseurs" value={data.providers.join(", ") || "—"} />
        <Row label="Google lié" value={data.googleLinked ? "Oui" : "Non"} />
        <Row label="Mot de passe défini" value={data.hasPassword ? "Oui" : "Non"} />
        <Row label="Dernière connexion" value={formatAdminDate(data.lastLoginAt)} />
        <Row label="Sessions révoquées le" value={formatAdminDate(data.sessionsValidAfter)} />
        <Row label="Consentement marketing" value={data.marketingConsent ? "Oui" : "Non"} />
      </Card>

      <Card title="Actions">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() =>
              onAction({
                title: "Révoquer les sessions",
                description: "Déconnecte le client de tous ses appareils.",
                requireReason: true,
                run: (v) => revokeCustomerSessionsAction({ customerId, reason: v.reason }),
              })
            }
          >
            Forcer la déconnexion (révoquer les sessions)
          </button>
          {!data.emailVerified && (
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() =>
                onAction({
                  title: "Renvoyer la vérification",
                  description: "Envoie un nouvel e-mail de vérification au client.",
                  run: () => resendVerificationAction(customerId),
                })
              }
            >
              Renvoyer l&apos;e-mail de vérification
            </button>
          )}
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() =>
              onAction({
                title: "Envoyer une réinitialisation de mot de passe",
                description: "Envoie un lien de réinitialisation au client (l'admin ne voit jamais le mot de passe).",
                run: () => sendPasswordResetAction(customerId),
              })
            }
          >
            Envoyer un lien de réinitialisation
          </button>
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() =>
              onAction({
                title: "Changer l'e-mail",
                description:
                  "L'adresse est mise à jour, la vérification est réinitialisée et un e-mail est envoyé à la nouvelle adresse. Les sessions sont révoquées.",
                requireReason: true,
                fields: [
                  { key: "email", label: "Nouvelle adresse e-mail", type: "email", required: true },
                ],
                run: (v) =>
                  startCustomerEmailChangeAction({
                    customerId,
                    newEmail: v.fields.email ?? "",
                    reason: v.reason,
                  }),
              })
            }
          >
            Changer l&apos;adresse e-mail (vérifié)
          </button>
        </div>
        <p className="mt-3 text-xs text-faint">
          L&apos;admin ne peut jamais lire ou définir un mot de passe.
        </p>
      </Card>

      <div className="lg:col-span-2">
        <Card title="Événements récents">
          {data.recentEvents.length === 0 ? (
            <p className="text-sm text-faint">Aucun événement.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.recentEvents.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-muted">{e.label}</span>
                  <span className="text-faint">{formatAdminDateTime(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Activity / audit ─────────────────────────────────────────────────────────

function ActivityTab({ customerId }: { customerId: string }) {
  const { data, loading } = useTabData<AuditLogEntryDTO[]>(() =>
    getCustomerActivityAction(customerId),
  );
  if (loading) return <p className="text-sm text-muted">Chargement…</p>;
  if (!data || data.length === 0) return <p className="text-sm text-faint">Aucune activité admin.</p>;
  return (
    <div className="card divide-y divide-border/60">
      {data.map((e) => (
        <div key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="text-sm text-white">{e.action}</span>
            {e.reason && <span className="ml-2 text-xs text-faint">« {e.reason} »</span>}
          </div>
          <div className="text-xs text-faint">
            {e.adminName} · {formatAdminDateTime(e.createdAt)}
          </div>
        </div>
      ))}
    </div>
  );
}
