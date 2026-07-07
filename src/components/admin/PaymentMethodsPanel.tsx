"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminPaymentConfigAction } from "@/app/actions/payments";
import {
  createPaymentMethodAction,
  updatePaymentMethodAction,
  reorderPaymentMethodsAction,
  archivePaymentMethodAction,
  restorePaymentMethodAction,
  deletePaymentMethodAction,
  updateSupportConfigAction,
} from "@/app/actions/admin";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import PreviewCard from "@/components/admin/payment-methods/PreviewCard";
import AddMethodDialog from "@/components/admin/payment-methods/AddMethodDialog";
import MethodEditorDrawer from "@/components/admin/payment-methods/MethodEditorDrawer";
import { paymentMethodDisplay } from "@/lib/paymentDisplay";
import { PAYMENT_METHOD_TYPES, paymentMethodTypeLabel, validatePaymentMethod } from "@/lib/paymentMethod";
import type { PaymentMethodDTO, PaymentMethodType, SaveMethodInput, SupportConfigDTO } from "@/lib/dto";

function isComplete(method: PaymentMethodDTO): boolean {
  if (method.type === "card" && method.details.comingSoon) return true;
  return validatePaymentMethod(method).complete;
}

function formatUpdated(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(iso));
  } catch {
    return "";
  }
}

export default function PaymentMethodsPanel() {
  const [methods, setMethods] = useState<PaymentMethodDTO[]>([]);
  const [support, setSupport] = useState<SupportConfigDTO | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethodDTO | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    try {
      const config = await getAdminPaymentConfigAction();
      setMethods(config.methods);
      setSupport(config.support);
    } catch (error) {
      console.error("Failed to load payment methods", error);
      setLoadError("Impossible de charger les modes de paiement.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeMethods = useMemo(
    () => methods.filter((m) => !m.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder),
    [methods],
  );
  const archivedMethods = useMemo(() => methods.filter((m) => m.archivedAt), [methods]);
  const previewMethods = useMemo(
    () => activeMethods.filter((m) => m.status === "active" && m.visible),
    [activeMethods],
  );
  const warnings = useMemo(
    () => activeMethods.filter((m) => m.status === "active" && m.visible && !isComplete(m)),
    [activeMethods],
  );

  const editingMethod = editingId ? methods.find((m) => m.id === editingId) ?? null : null;

  async function handleToggleStatus(method: PaymentMethodDTO) {
    const nextActive = method.status !== "active";
    if (nextActive && method.visible && !isComplete(method)) {
      setLoadError(`"${method.name}" a des champs requis manquants — complétez-les avant d'activer.`);
      setTimeout(() => setLoadError(""), 4000);
      return;
    }
    setMethods((prev) =>
      prev.map((m) => (m.id === method.id ? { ...m, status: nextActive ? "active" : "inactive" } : m)),
    );
    await updatePaymentMethodAction(method.id, { status: nextActive ? "active" : "inactive" });
  }

  async function handleMove(method: PaymentMethodDTO, direction: -1 | 1) {
    const index = activeMethods.findIndex((m) => m.id === method.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activeMethods.length) return;
    const next = [...activeMethods];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    const reordered = next.map((m, i) => ({ ...m, sortOrder: i }));
    setMethods((prev) => [...reordered, ...prev.filter((m) => m.archivedAt)]);
    setReordering(true);
    await reorderPaymentMethodsAction(next.map((m) => m.id));
    setReordering(false);
  }

  async function handleCreate(type: PaymentMethodType) {
    const meta = PAYMENT_METHOD_TYPES.find((t) => t.type === type)!;
    const input: SaveMethodInput = {
      type,
      name: meta.label,
      subtitle: meta.description,
      customerNote: "",
      status: "inactive",
      visible: true,
      logoUrl: null,
      initials: meta.defaultInitials,
      accentColor: meta.defaultAccent,
      logoType: "initials",
      details: type === "card" ? { comingSoon: true } : {},
      proofRequired: type !== "card" && type !== "paypal",
      internalNote: "",
      minAmount: null,
      maxAmount: null,
      regions: [],
    };
    const res = await createPaymentMethodAction(input);
    setAddOpen(false);
    if (res.ok && res.id) {
      await load();
      setEditingId(res.id);
    }
  }

  async function handleSave(id: string, data: Partial<SaveMethodInput>): Promise<boolean> {
    const res = await updatePaymentMethodAction(id, data);
    if (res.ok) await load();
    return res.ok;
  }

  async function handleArchive(id: string) {
    await archivePaymentMethodAction(id);
    setEditingId(null);
    setDeleteTarget(null);
    await load();
  }

  async function handleRestore(id: string) {
    await restorePaymentMethodAction(id);
    await load();
  }

  async function handleDelete(id: string) {
    const res = await deletePaymentMethodAction(id);
    if (res.ok) {
      setEditingId(null);
      setDeleteTarget(null);
      await load();
    } else {
      setLoadError(res.error ?? "Suppression impossible.");
      setTimeout(() => setLoadError(""), 4000);
    }
  }

  if (!loaded) {
    return <p className="text-sm text-muted">Chargement...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-faint">
            <span>Store settings</span>
            <span>/</span>
            <span className="text-muted">Payment methods</span>
          </div>
          <h2 className="text-[22px] font-semibold text-white">Modes de paiement</h2>
          <p className="mt-1 text-[13.5px] text-faint">
            Choisissez comment vos clients paient. L&apos;ordre ici est celui affiché au checkout.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="btn-primary flex h-10 shrink-0 items-center gap-2 px-4 text-[13.5px]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Ajouter un mode de paiement
        </button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {loadError}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex items-center gap-3 rounded-[11px] border border-[rgba(232,168,56,0.26)] bg-[rgba(232,168,56,0.09)] px-4 py-3">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#E8A838" strokeWidth={2}>
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="flex-1 text-[13px] text-[#E3C089]">
            {warnings.length} méthode{warnings.length > 1 ? "s" : ""} active{warnings.length > 1 ? "s" : ""} et
            visible{warnings.length > 1 ? "s" : ""} avec des informations manquantes.
          </span>
          <span className="font-mono text-xs text-[#8a7a4d]">{warnings.length} à corriger</span>
        </div>
      )}

      <SupportCard support={support} onSave={async (data) => { await updateSupportConfigAction(data); await load(); }} />

      {activeMethods.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <div className="grid gap-0 overflow-hidden rounded-2xl border border-border lg:grid-cols-[1fr_356px]">
          <div className="min-w-0 overflow-x-auto p-4">
            <div className="hidden min-w-[720px] grid-cols-[34px_1fr_120px_108px_96px_88px_64px] gap-3 border-b border-border/60 px-3 pb-2.5 font-mono text-[11px] uppercase tracking-wide text-faint sm:grid">
              <span />
              <span>Méthode</span>
              <span>Type</span>
              <span>Statut</span>
              <span>Visibilité</span>
              <span>Mis à jour</span>
              <span className="text-right">Actions</span>
            </div>

            <div className="min-w-[720px] space-y-1 pt-1 sm:min-w-0">
              {activeMethods.map((method, index) => (
                <MethodRow
                  key={method.id}
                  method={method}
                  index={index}
                  total={activeMethods.length}
                  selected={selectedId === method.id}
                  complete={isComplete(method)}
                  disabled={reordering}
                  onSelect={() => setSelectedId((id) => (id === method.id ? null : method.id))}
                  onMoveUp={() => handleMove(method, -1)}
                  onMoveDown={() => handleMove(method, 1)}
                  onToggleStatus={() => handleToggleStatus(method)}
                  onEdit={() => setEditingId(method.id)}
                  onArchive={() => setDeleteTarget(method)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-[11px] border-[1.5px] border-dashed border-white/10 text-[13.5px] font-medium text-faint hover:border-accent/40 hover:text-[#9FB8FF]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Ajouter un autre mode de paiement
            </button>

            {archivedMethods.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  className="text-xs text-faint hover:text-muted"
                >
                  {showArchived ? "Masquer" : "Afficher"} {archivedMethods.length} méthode{archivedMethods.length > 1 ? "s" : ""} archivée{archivedMethods.length > 1 ? "s" : ""}
                </button>
                {showArchived && (
                  <div className="mt-2 space-y-2">
                    {archivedMethods.map((m) => (
                      <div key={m.id} className="flex items-center justify-between rounded-xl border border-border bg-surface/60 px-3 py-2">
                        <span className="text-sm text-muted">{m.name}</span>
                        <button type="button" onClick={() => handleRestore(m.id)} className="text-xs text-accent hover:text-accent-hover">
                          Restaurer
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border bg-white/[0.012] p-5 lg:border-l lg:border-t-0">
            <div className="mb-1.5 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9FB8FF" strokeWidth={2}>
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span className="font-mono text-xs uppercase tracking-wide text-[#9FB8FF]">Aperçu checkout</span>
            </div>
            <p className="mb-4 text-xs text-faint">
              Exactement ce qu&apos;un client voit. Seules les méthodes <b className="text-muted">actives et visibles</b> apparaissent.
            </p>
            <div className="rounded-[14px] border border-border bg-[#0B0C10] p-4">
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-faint">Mode de paiement</div>
              {previewMethods.length === 0 ? (
                <p className="px-1 py-6 text-center text-[12.5px] text-faint">
                  Aucune méthode visible — les clients ne peuvent pas commander.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {previewMethods.map((m) => (
                    <PreviewCard key={m.id} method={m} selected={selectedId ? selectedId === m.id : m.id === previewMethods[0].id} />
                  ))}
                </div>
              )}
              <button type="button" className="mt-4 h-11 w-full rounded-[11px] bg-accent text-sm font-semibold text-white">
                Confirmer la commande
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && <AddMethodDialog onCancel={() => setAddOpen(false)} onContinue={handleCreate} />}

      {editingMethod && (
        <MethodEditorDrawer
          method={editingMethod}
          sortPosition={activeMethods.findIndex((m) => m.id === editingMethod.id)}
          sortTotal={activeMethods.length}
          onClose={() => setEditingId(null)}
          onSave={handleSave}
          onArchive={handleArchive}
          onDelete={(id) => setDeleteTarget(methods.find((m) => m.id === id) ?? null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          method={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onArchive={() => handleArchive(deleteTarget.id)}
          onDelete={() => handleDelete(deleteTarget.id)}
        />
      )}
    </div>
  );
}

function MethodRow({
  method,
  index,
  total,
  selected,
  complete,
  disabled,
  onSelect,
  onMoveUp,
  onMoveDown,
  onToggleStatus,
  onEdit,
  onArchive,
}: {
  method: PaymentMethodDTO;
  index: number;
  total: number;
  selected: boolean;
  complete: boolean;
  disabled: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleStatus: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const display = paymentMethodDisplay(method);
  const active = method.status === "active";
  const warn = active && method.visible && !complete;
  const comingSoon = method.type === "card" && Boolean(method.details.comingSoon);

  return (
    <div
      onClick={onSelect}
      className={`grid cursor-pointer grid-cols-[34px_1fr_120px_108px_96px_88px_64px] items-center gap-3 rounded-[10px] border-b border-white/5 px-3 py-3.5 transition ${
        selected ? "bg-accent/[0.06] shadow-[inset_0_0_0_1px_rgba(62,123,250,0.25)]" : ""
      }`}
    >
      <div className="flex flex-col items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          disabled={disabled || index === 0}
          onClick={onMoveUp}
          title="Monter"
          className="grid h-[15px] w-5 place-items-center rounded text-muted disabled:text-[#2c313b]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          type="button"
          disabled={disabled || index === total - 1}
          onClick={onMoveDown}
          title="Descendre"
          className="grid h-[15px] w-5 place-items-center rounded text-muted disabled:text-[#2c313b]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <PaymentBrandMark display={display} active className="h-10 w-10 shrink-0 rounded-[11px]" />
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-semibold text-text">{method.name}</div>
          <div className="truncate text-xs text-faint">{method.subtitle}</div>
        </div>
        {warn && (
          <span title="Champs requis manquants" className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-red-500/[0.14]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E05C5C" strokeWidth={2.4}>
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </span>
        )}
      </div>

      <div className="font-mono text-xs text-[#9A9FAB]">{paymentMethodTypeLabel(method.type)}</div>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <ToggleSwitch checked={active} onChange={onToggleStatus} showState={false} small />
        <span
          className={`text-xs font-medium ${
            comingSoon ? "text-[#E3C089]" : active ? "text-[#5BC98C]" : "text-faint"
          }`}
        >
          {comingSoon ? "Bientôt" : active ? "Actif" : "Inactif"}
        </span>
      </div>

      <div>
        <span
          className={`inline-flex h-6 items-center gap-1.5 rounded-[7px] border px-2.5 text-[11.5px] font-medium ${
            method.visible
              ? "border-accent/25 bg-accent/10 text-[#7FA6FF]"
              : "border-border bg-surface text-faint"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {method.visible ? "Visible" : "Masqué"}
        </span>
      </div>

      <div className="font-mono text-xs text-faint">{formatUpdated(method.updatedAt)}</div>

      <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <button type="button" title="Modifier" onClick={onEdit} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white/[0.06] hover:text-white">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
        <button type="button" title="Plus" onClick={onArchive} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white/[0.06] hover:text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-border px-6 py-20 text-center">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 text-accent">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="2" y="5" width="20" height="14" rx="2.5" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      </div>
      <h3 className="text-[19px] font-semibold text-white">Aucun mode de paiement</h3>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Ajoutez au moins un mode de paiement pour que vos clients puissent commander.
      </p>
      <button type="button" onClick={onAdd} className="btn-primary mt-6 h-10 px-5 text-sm">
        Ajouter un mode de paiement
      </button>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {["Virement bancaire", "Crypto · USDT", "PayPal"].map((label) => (
          <span key={label} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function DeleteConfirmDialog({
  method,
  onCancel,
  onArchive,
  onDelete,
}: {
  method: PaymentMethodDTO;
  onCancel: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-base p-6 shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
        <h3 className="text-base font-semibold text-white">Supprimer « {method.name} » ?</h3>
        <p className="mt-2 text-sm text-muted">
          Si des commandes utilisent cette méthode, la suppression sera refusée. Nous recommandons
          d&apos;archiver plutôt que de supprimer.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost h-9 px-4 text-xs">
            Annuler
          </button>
          <button type="button" onClick={onArchive} className="h-9 rounded-lg border border-border-strong px-4 text-xs font-medium text-white hover:bg-white/5">
            Archiver plutôt
          </button>
          <button type="button" onClick={onDelete} className="h-9 rounded-lg bg-[#E05C5C] px-4 text-xs font-medium text-white hover:bg-[#c94f4f]">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function SupportCard({
  support,
  onSave,
}: {
  support: SupportConfigDTO | null;
  onSave: (data: { whatsappNumber: string; supportEmail: string; instructions: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [whatsapp, setWhatsapp] = useState(support?.whatsappNumber ?? "");
  const [email, setEmail] = useState(support?.supportEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setWhatsapp(support?.whatsappNumber ?? "");
    setEmail(support?.supportEmail ?? "");
  }, [support]);

  if (!support) return null;

  return (
    <div className="rounded-2xl border border-border p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <p className="text-sm font-semibold text-white">Support client</p>
          <p className="text-xs text-faint">WhatsApp {support.whatsappNumber} · {support.supportEmail}</p>
        </div>
        <span className="text-xs text-muted">{open ? "Réduire" : "Modifier"}</span>
      </button>
      {open && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Numéro WhatsApp</label>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="input h-10 py-0 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">E-mail de support</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="input h-10 py-0 text-sm" />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                onSave({ whatsappNumber: whatsapp, supportEmail: email, instructions: support.instructions });
                setSaving(false);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
              className="btn-primary h-10 px-4 text-xs disabled:opacity-50"
            >
              {saving ? "..." : "Enregistrer"}
            </button>
            {saved && <span className="text-xs text-green-400">Sauvegardé</span>}
          </div>
        </div>
      )}
    </div>
  );
}
