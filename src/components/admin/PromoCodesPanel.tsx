"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import { formatMAD } from "@/lib/format";
import { promoStatusLabel, promoStatusBadgeClass, promoRewardTypeLabel } from "@/lib/promo/labels";
import { PROMO_REWARD_TYPES } from "@/lib/promo/engine";
import {
  getPromoCodesAction,
  getPromoCodeDetailAction,
  getPromoScopeOptionsAction,
  savePromoCodeAction,
  setPromoActiveAction,
  archivePromoCodeAction,
  duplicatePromoCodeAction,
  deletePromoCodeAction,
} from "@/app/actions/promo-codes";
import type {
  AdminPromoCodeSummaryDTO,
  AdminPromoCodeDetailDTO,
  PromoScopeOptionDTO,
  SavePromoCodeInput,
} from "@/lib/dto";
import type { PromoRewardType } from "@/lib/types";

type Mode = "list" | "edit" | "detail";
type Draft = SavePromoCodeInput;
type Msg = { text: string; ok: boolean } | null;

function emptyDraft(): Draft {
  return {
    code: "",
    internalName: "",
    description: "",
    active: true,
    rewardType: "PERCENT_DISCOUNT",
    percentValue: 10,
    fixedAmountMad: null,
    maxDiscountMad: null,
    maxCreditMad: null,
    creditExpiresInDays: null,
    creditExpiresAt: null,
    startAt: null,
    endAt: null,
    maxTotalUses: null,
    maxUsesPerCustomer: null,
    firstOrderOnly: false,
    loggedInOnly: false,
    minSubtotalMad: null,
    maxSubtotalMad: null,
    productIds: [],
    categoryIds: [],
  };
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local wants YYYY-MM-DDTHH:mm in local time.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const isCreditType = (t: PromoRewardType) => t === "FIXED_GHOST_CREDIT" || t === "PERCENT_GHOST_CREDIT";
const isPercentType = (t: PromoRewardType) => t === "PERCENT_DISCOUNT" || t === "PERCENT_GHOST_CREDIT";

export default function PromoCodesPanel() {
  const [items, setItems] = useState<AdminPromoCodeSummaryDTO[]>([]);
  const [scope, setScope] = useState<{ products: PromoScopeOptionDTO[]; categories: PromoScopeOptionDTO[] }>({
    products: [],
    categories: [],
  });
  const [mode, setMode] = useState<Mode>("list");
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPromoCodeDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, options] = await Promise.all([getPromoCodesAction(), getPromoScopeOptionsAction()]);
    setItems(list);
    setScope(options);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function startCreate() {
    setDraft(emptyDraft());
    setEditingId(null);
    setMsg(null);
    setMode("edit");
  }

  async function startEdit(id: string) {
    setMsg(null);
    const d = await getPromoCodeDetailAction(id);
    if (!d) return;
    const p = d.promo;
    setDraft({
      id: p.id,
      code: p.code,
      internalName: p.internalName,
      description: p.description,
      active: p.active,
      rewardType: p.rewardType,
      percentValue: p.percentValue,
      fixedAmountMad: p.fixedAmountMad,
      maxDiscountMad: p.maxDiscountMad,
      maxCreditMad: p.maxCreditMad,
      creditExpiresInDays: p.creditExpiresInDays,
      creditExpiresAt: p.creditExpiresAt,
      startAt: p.startAt,
      endAt: p.endAt,
      maxTotalUses: p.maxTotalUses,
      maxUsesPerCustomer: p.maxUsesPerCustomer,
      firstOrderOnly: p.firstOrderOnly,
      loggedInOnly: p.loggedInOnly,
      minSubtotalMad: p.minSubtotalMad,
      maxSubtotalMad: p.maxSubtotalMad,
      productIds: p.productIds,
      categoryIds: p.categoryIds,
    });
    setEditingId(id);
    setMode("edit");
  }

  async function openDetail(id: string) {
    setMsg(null);
    const d = await getPromoCodeDetailAction(id);
    if (!d) return;
    setDetail(d);
    setMode("detail");
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const result = await savePromoCodeAction(draft);
    setSaving(false);
    if (result.ok) {
      setMsg({ text: "Code promo enregistré.", ok: true });
      await load();
      setMode("list");
    } else {
      setMsg({ text: result.error ?? "Erreur.", ok: false });
    }
  }

  async function toggleActive(item: AdminPromoCodeSummaryDTO) {
    const result = await setPromoActiveAction(item.id, item.status === "disabled");
    if (result.ok) await load();
    else setMsg({ text: result.error ?? "Erreur.", ok: false });
  }

  async function duplicate(id: string) {
    const result = await duplicatePromoCodeAction(id);
    if (result.ok) {
      setMsg({ text: "Code dupliqué.", ok: true });
      await load();
    } else setMsg({ text: result.error ?? "Erreur.", ok: false });
  }

  async function archive(id: string, archived: boolean) {
    const result = await archivePromoCodeAction(id, archived);
    if (result.ok) await load();
    else setMsg({ text: result.error ?? "Erreur.", ok: false });
  }

  async function remove(item: AdminPromoCodeSummaryDTO) {
    if (!window.confirm(`Supprimer définitivement le code ${item.code} ? Cette action est irréversible.`)) return;
    const result = await deletePromoCodeAction(item.id);
    if (result.ok) {
      setMsg({ text: "Code supprimé.", ok: true });
      await load();
    } else setMsg({ text: result.error ?? "Erreur.", ok: false });
  }

  if (mode === "edit") {
    return (
      <PromoEditor
        draft={draft}
        update={update}
        setDraft={setDraft}
        scope={scope}
        saving={saving}
        msg={msg}
        editing={Boolean(editingId)}
        onSave={save}
        onCancel={() => {
          setMode("list");
          setMsg(null);
        }}
      />
    );
  }

  if (mode === "detail" && detail) {
    return <PromoDetail detail={detail} onBack={() => setMode("list")} onEdit={() => startEdit(detail.promo.id)} />;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Codes promo</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Réductions immédiates et récompenses en crédit Ghost.
          </p>
        </div>
        <button type="button" onClick={startCreate} className="btn-primary text-sm">
          + Créer un code
        </button>
      </header>

      {msg && (
        <p
          className={`rounded-xl border px-3.5 py-2.5 text-[13px] ${
            msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {msg.text}
        </p>
      )}

      {loading ? (
        <div className="card grid place-items-center py-16 text-sm text-muted">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="card grid place-items-center gap-3 py-16 text-center">
          <p className="text-sm font-semibold text-white">Aucun code promo</p>
          <p className="max-w-sm text-[13px] text-muted">
            Créez votre premier code de réduction ou de crédit Ghost.
          </p>
          <button type="button" onClick={startCreate} className="btn-primary mt-1 text-sm">
            + Créer un code
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[880px] text-left text-[13px]">
              <thead className="border-b border-border text-[11.5px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Nom interne</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Valeur</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Validité</th>
                  <th className="px-4 py-3 font-medium">Utilis.</th>
                  <th className="px-4 py-3 font-medium">Portée</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openDetail(item.id)}
                        className="font-mono font-semibold text-white hover:text-accent"
                      >
                        {item.code}
                      </button>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-muted">{item.internalName}</td>
                    <td className="px-4 py-3 text-muted">{item.rewardTypeLabel}</td>
                    <td className="px-4 py-3 font-mono text-text">{item.valueLabel}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted">{validityLabel(item)}</td>
                    <td className="px-4 py-3 font-mono text-text">
                      {item.usedCount}
                      {item.maxTotalUses != null ? ` / ${item.maxTotalUses}` : ""}
                    </td>
                    <td className="max-w-[150px] truncate px-4 py-3 text-[12px] text-muted">{item.scopeLabel}</td>
                    <td className="px-4 py-3">
                      <RowActions
                        item={item}
                        onEdit={() => startEdit(item.id)}
                        onToggle={() => toggleActive(item)}
                        onDuplicate={() => duplicate(item.id)}
                        onArchive={() => archive(item.id, item.status !== "archived")}
                        onDelete={() => remove(item)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2.5 lg:hidden">
            {items.map((item) => (
              <div key={item.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => openDetail(item.id)} className="min-w-0 text-left">
                    <p className="font-mono text-[15px] font-semibold text-white">{item.code}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">{item.internalName}</p>
                  </button>
                  <StatusPill status={item.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                  <span>{item.rewardTypeLabel}</span>
                  <span className="font-mono text-text">{item.valueLabel}</span>
                  <span>
                    {item.usedCount}
                    {item.maxTotalUses != null ? ` / ${item.maxTotalUses}` : ""} utilis.
                  </span>
                  <span>{item.scopeLabel}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(item.id)} className="btn-ghost h-8 px-3 text-[12px]">
                    Modifier
                  </button>
                  <button type="button" onClick={() => toggleActive(item)} className="btn-ghost h-8 px-3 text-[12px]">
                    {item.status === "disabled" ? "Activer" : "Désactiver"}
                  </button>
                  <button type="button" onClick={() => duplicate(item.id)} className="btn-ghost h-8 px-3 text-[12px]">
                    Dupliquer
                  </button>
                  <button
                    type="button"
                    onClick={() => archive(item.id, item.status !== "archived")}
                    className="btn-ghost h-8 px-3 text-[12px]"
                  >
                    {item.status === "archived" ? "Désarchiver" : "Archiver"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Row helpers ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${promoStatusBadgeClass(
        status,
      )}`}
    >
      {promoStatusLabel(status)}
    </span>
  );
}

function validityLabel(item: AdminPromoCodeSummaryDTO): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  if (!item.startAt && !item.endAt) return "Sans limite";
  if (item.startAt && item.endAt) return `${fmt(item.startAt)} → ${fmt(item.endAt)}`;
  if (item.endAt) return `Jusqu'au ${fmt(item.endAt)}`;
  return `Dès le ${fmt(item.startAt!)}`;
}

function RowActions({
  item,
  onEdit,
  onToggle,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  item: AdminPromoCodeSummaryDTO;
  onEdit: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const deletable = item.usedCount === 0;
  return (
    <div className="flex items-center justify-end gap-1.5">
      <IconBtn label="Modifier" onClick={onEdit}>M</IconBtn>
      <IconBtn label={item.status === "disabled" ? "Activer" : "Désactiver"} onClick={onToggle}>
        {item.status === "disabled" ? "▶" : "❚❚"}
      </IconBtn>
      <IconBtn label="Dupliquer" onClick={onDuplicate}>⧉</IconBtn>
      <IconBtn label={item.status === "archived" ? "Désarchiver" : "Archiver"} onClick={onArchive}>🗄</IconBtn>
      {deletable && (
        <IconBtn label="Supprimer" onClick={onDelete} danger>
          ✕
        </IconBtn>
      )}
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-8 w-8 place-items-center rounded-lg border text-[12px] transition-colors ${
        danger
          ? "border-red-500/30 text-red-300 hover:bg-red-500/10"
          : "border-border text-muted hover:border-border-strong hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────

function PromoEditor({
  draft,
  update,
  setDraft,
  scope,
  saving,
  msg,
  editing,
  onSave,
  onCancel,
}: {
  draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  scope: { products: PromoScopeOptionDTO[]; categories: PromoScopeOptionDTO[] };
  saving: boolean;
  msg: Msg;
  editing: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = draft.rewardType;
  const credit = isCreditType(t);
  const percent = isPercentType(t);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onCancel} className="text-[12.5px] text-muted hover:text-white">
            ← Retour à la liste
          </button>
          <h1 className="mt-1 text-lg font-semibold text-white">
            {editing ? "Modifier le code promo" : "Nouveau code promo"}
          </h1>
        </div>
        <ToggleSwitch checked={draft.active} onChange={(v) => update("active", v)} label="Actif" />
      </header>

      {msg && !msg.ok && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
          {msg.text}
        </p>
      )}

      {/* General */}
      <section className="card space-y-4 p-5">
        <h2 className="text-[14px] font-semibold text-white">Général</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Ex : GHOST10 — normalisé en majuscules, unique.">
            <input
              className="input font-mono uppercase"
              value={draft.code}
              onChange={(e) => update("code", e.target.value.toUpperCase())}
              placeholder="GHOST10"
            />
          </Field>
          <Field label="Nom interne" hint="Ex : Promotion de lancement Instagram">
            <input
              className="input"
              value={draft.internalName}
              onChange={(e) => update("internalName", e.target.value)}
              placeholder="Promotion de lancement"
            />
          </Field>
        </div>
        <Field label="Notes internes (facultatif)">
          <textarea
            className="input min-h-[70px]"
            value={draft.description ?? ""}
            onChange={(e) => update("description", e.target.value)}
          />
        </Field>
      </section>

      {/* Reward type */}
      <section className="card space-y-4 p-5">
        <h2 className="text-[14px] font-semibold text-white">Type de récompense</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROMO_REWARD_TYPES.map((rt) => (
            <button
              key={rt}
              type="button"
              onClick={() => update("rewardType", rt)}
              className={`rounded-xl border px-3.5 py-3 text-left text-[13px] transition-colors ${
                t === rt ? "border-accent/60 bg-accent/10 text-white" : "border-border text-muted hover:border-border-strong"
              }`}
            >
              <span className="font-medium">{promoRewardTypeLabel(rt)}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {percent && (
            <Field label={credit ? "Pourcentage crédit Ghost (%)" : "Pourcentage de réduction (%)"}>
              <NumberInput value={draft.percentValue} onChange={(v) => update("percentValue", v)} placeholder="10" />
            </Field>
          )}
          {t === "PERCENT_DISCOUNT" && (
            <Field label="Réduction maximale (DH, facultatif)">
              <NumberInput value={draft.maxDiscountMad} onChange={(v) => update("maxDiscountMad", v)} placeholder="50" />
            </Field>
          )}
          {t === "FIXED_DISCOUNT" && (
            <Field label="Montant de la réduction (DH)">
              <NumberInput value={draft.fixedAmountMad} onChange={(v) => update("fixedAmountMad", v)} placeholder="20" />
            </Field>
          )}
          {t === "FIXED_GHOST_CREDIT" && (
            <Field label="Montant du crédit Ghost (DH)">
              <NumberInput value={draft.fixedAmountMad} onChange={(v) => update("fixedAmountMad", v)} placeholder="25" />
            </Field>
          )}
          {t === "PERCENT_GHOST_CREDIT" && (
            <Field label="Crédit Ghost maximal (DH, facultatif)">
              <NumberInput value={draft.maxCreditMad} onChange={(v) => update("maxCreditMad", v)} placeholder="50" />
            </Field>
          )}
        </div>

        {credit && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Expiration du crédit (jours après obtention, facultatif)">
                <NumberInput
                  value={draft.creditExpiresInDays}
                  onChange={(v) => update("creditExpiresInDays", v)}
                  placeholder="90"
                />
              </Field>
              <Field label="Ou date d'expiration fixe (facultatif)">
                <input
                  type="datetime-local"
                  className="input"
                  value={toLocalInput(draft.creditExpiresAt ?? null)}
                  onChange={(e) => update("creditExpiresAt", e.target.value || null)}
                />
              </Field>
            </div>
            <p className="rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2 text-[12px] text-[#9FB8FF]">
              Le crédit Ghost est calculé sur le sous-total éligible et attribué après confirmation du paiement.
              Le client doit être connecté (option imposée automatiquement).
            </p>
          </>
        )}
        <p className="text-[12px] text-faint">
          Une réduction immédiate et un crédit Ghost ne peuvent pas être combinés dans un même code.
        </p>
      </section>

      {/* Validity */}
      <section className="card space-y-4 p-5">
        <h2 className="text-[14px] font-semibold text-white">Période de validité</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Début (facultatif)">
            <input
              type="datetime-local"
              className="input"
              value={toLocalInput(draft.startAt ?? null)}
              onChange={(e) => update("startAt", e.target.value || null)}
            />
          </Field>
          <Field label="Expiration (facultatif)">
            <input
              type="datetime-local"
              className="input"
              value={toLocalInput(draft.endAt ?? null)}
              onChange={(e) => update("endAt", e.target.value || null)}
            />
          </Field>
        </div>
        <p className="text-[12px] text-faint">Sans dates, le code n&apos;expire jamais. Fuseau horaire : Africa/Casablanca.</p>
      </section>

      {/* Usage limits */}
      <section className="card space-y-4 p-5">
        <h2 className="text-[14px] font-semibold text-white">Limites d&apos;utilisation</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre total d'utilisations (facultatif)">
            <NumberInput value={draft.maxTotalUses} onChange={(v) => update("maxTotalUses", v)} placeholder="100" />
          </Field>
          <Field label="Utilisations max par client (facultatif)">
            <NumberInput value={draft.maxUsesPerCustomer} onChange={(v) => update("maxUsesPerCustomer", v)} placeholder="1" />
          </Field>
          <Field label="Sous-total éligible minimum (DH, facultatif)">
            <NumberInput value={draft.minSubtotalMad} onChange={(v) => update("minSubtotalMad", v)} placeholder="100" />
          </Field>
          <Field label="Sous-total éligible maximum (DH, facultatif)">
            <NumberInput value={draft.maxSubtotalMad} onChange={(v) => update("maxSubtotalMad", v)} placeholder="1000" />
          </Field>
        </div>
        <div className="flex flex-col gap-2.5">
          <label className="flex items-center gap-2.5 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={draft.firstOrderOnly ?? false}
              onChange={(e) => update("firstOrderOnly", e.target.checked)}
            />
            Réservé à la première commande
          </label>
          <label className={`flex items-center gap-2.5 text-[13px] ${credit ? "text-faint" : "text-muted"}`}>
            <input
              type="checkbox"
              checked={credit ? true : draft.loggedInOnly ?? false}
              disabled={credit}
              onChange={(e) => update("loggedInOnly", e.target.checked)}
            />
            Réservé aux clients connectés {credit && "(imposé pour le crédit Ghost)"}
          </label>
        </div>
      </section>

      {/* Applicability */}
      <section className="card space-y-4 p-5">
        <h2 className="text-[14px] font-semibold text-white">Produits & catégories éligibles</h2>
        <p className="rounded-lg border border-border bg-canvas px-3 py-2 text-[12px] text-muted">
          Sans sélection, le code s&apos;applique à <strong className="text-white">tous les produits</strong>. Si vous
          sélectionnez à la fois des produits et des catégories, un article est éligible s&apos;il correspond à
          <strong className="text-white"> l&apos;un OU l&apos;autre</strong> (produit sélectionné OU catégorie sélectionnée).
        </p>
        <MultiSelect
          label="Produits (parents)"
          options={scope.products}
          selected={draft.productIds ?? []}
          onChange={(ids) => setDraft((p) => ({ ...p, productIds: ids }))}
        />
        <MultiSelect
          label="Catégories"
          options={scope.categories}
          selected={draft.categoryIds ?? []}
          onChange={(ids) => setDraft((p) => ({ ...p, categoryIds: ids }))}
        />
      </section>

      <div className="sticky bottom-0 flex items-center justify-end gap-2.5 border-t border-border bg-canvas/95 py-3 backdrop-blur">
        <button type="button" onClick={onCancel} className="btn-ghost text-sm">
          Annuler
        </button>
        <button type="button" onClick={onSave} disabled={saving} className="btn-primary text-sm disabled:opacity-60">
          {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le code"}
        </button>
      </div>
    </div>
  );
}

// ── Multi-select (searchable) ────────────────────────────────────────────────

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: PromoScopeOptionDTO[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => !selectedSet.has(o.id))
      .filter((o) => !q || o.name.toLowerCase().includes(q) || (o.meta ?? "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [options, selectedSet, query]);
  const selectedOptions = options.filter((o) => selectedSet.has(o.id));

  return (
    <div>
      <p className="mb-1.5 text-[12.5px] font-medium text-white">{label}</p>
      {selectedOptions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedOptions.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[12px] text-accent-strong"
            >
              {o.name}
              <button
                type="button"
                aria-label={`Retirer ${o.name}`}
                onClick={() => onChange(selected.filter((id) => id !== o.id))}
                className="text-accent-strong/70 hover:text-white"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Rechercher…`}
      />
      {query.trim() && (
        <div className="mt-1.5 max-h-52 overflow-auto rounded-xl border border-border bg-canvas">
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-[12.5px] text-faint">Aucun résultat.</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange([...selected, o.id]);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] text-muted hover:bg-white/[0.03] hover:text-white"
              >
                <span>{o.name}</span>
                {o.meta ? <span className="text-[11.5px] text-faint">{o.meta}</span> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Detail view ──────────────────────────────────────────────────────────────

function PromoDetail({
  detail,
  onBack,
  onEdit,
}: {
  detail: AdminPromoCodeDetailDTO;
  onBack: () => void;
  onEdit: () => void;
}) {
  const p = detail.promo;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="text-[12.5px] text-muted hover:text-white">
            ← Retour à la liste
          </button>
          <div className="mt-1 flex items-center gap-2.5">
            <h1 className="font-mono text-lg font-semibold text-white">{p.code}</h1>
            <StatusPill status={p.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{p.internalName}</p>
        </div>
        <button type="button" onClick={onEdit} className="btn-ghost text-sm">
          Modifier
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Utilisations" value={String(detail.totalUses)} />
        <Stat label="Clients uniques" value={String(detail.uniqueCustomers)} />
        <Stat label="Utilisations restantes" value={detail.remainingUses == null ? "∞" : String(detail.remainingUses)} />
        <Stat label="Chiffre d'affaires associé" value={formatMAD(detail.revenueMad)} />
        <Stat label="Réduction immédiate totale" value={formatMAD(detail.totalImmediateDiscountMad)} />
        <Stat label="Crédit Ghost fixe accordé" value={formatMAD(detail.totalFixedCreditMad)} />
        <Stat label="Crédit Ghost % accordé" value={formatMAD(detail.totalPercentCreditMad)} />
        <Stat label="Crédit Ghost total accordé" value={formatMAD(detail.totalCreditGrantedMad)} />
        <Stat label="Crédit Ghost moyen / commande" value={formatMAD(detail.averageCreditPerOrderMad)} />
        <Stat label="Sous-total éligible généré" value={formatMAD(detail.eligibleSubtotalGeneratedMad)} />
      </div>

      {/* Configuration + restrictions */}
      <section className="card space-y-2 p-5 text-[13px]">
        <h2 className="text-[14px] font-semibold text-white">Configuration</h2>
        <Row label="Type">{promoRewardTypeLabel(p.rewardType)}</Row>
        {p.percentValue != null && <Row label="Pourcentage">{p.percentValue} %</Row>}
        {p.fixedAmountMad != null && <Row label="Montant fixe">{formatMAD(p.fixedAmountMad)}</Row>}
        {p.maxDiscountMad != null && <Row label="Réduction max">{formatMAD(p.maxDiscountMad)}</Row>}
        {p.maxCreditMad != null && <Row label="Crédit max">{formatMAD(p.maxCreditMad)}</Row>}
        <Row label="Portée">
          {p.productIds.length === 0 && p.categoryIds.length === 0
            ? "Tous les produits"
            : `${p.productIds.length} produit(s) + ${p.categoryIds.length} catégorie(s)`}
        </Row>
        <Row label="Validité">
          {p.startAt ? new Date(p.startAt).toLocaleString("fr-FR") : "—"} →{" "}
          {p.endAt ? new Date(p.endAt).toLocaleString("fr-FR") : "sans limite"}
        </Row>
        {p.minSubtotalMad != null && <Row label="Sous-total min">{formatMAD(p.minSubtotalMad)}</Row>}
        {p.firstOrderOnly && <Row label="Restriction">Première commande uniquement</Row>}
      </section>

      {/* Orders using the code */}
      <section className="card p-5">
        <h2 className="text-[14px] font-semibold text-white">Commandes ({detail.orders.length})</h2>
        {detail.orders.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Aucune commande n&apos;a encore utilisé ce code.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[12.5px]">
              <thead className="border-b border-border text-[11px] uppercase text-faint">
                <tr>
                  <th className="px-2 py-2 font-medium">Commande</th>
                  <th className="px-2 py-2 font-medium">Statut</th>
                  <th className="px-2 py-2 font-medium">Redemption</th>
                  <th className="px-2 py-2 font-medium">Total</th>
                  <th className="px-2 py-2 font-medium">Réduction</th>
                  <th className="px-2 py-2 font-medium">Crédit prévu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.orders.map((o) => (
                  <tr key={o.orderId}>
                    <td className="px-2 py-2 font-mono text-white">{o.publicOrderNumber}</td>
                    <td className="px-2 py-2 text-muted">{o.status}</td>
                    <td className="px-2 py-2 text-muted">{o.redemptionStatus}</td>
                    <td className="px-2 py-2 font-mono text-text">{formatMAD(o.totalMad)}</td>
                    <td className="px-2 py-2 font-mono text-text">{o.discountMad ? `-${formatMAD(o.discountMad)}` : "—"}</td>
                    <td className="px-2 py-2 font-mono text-text">{o.expectedCreditMad ? formatMAD(o.expectedCreditMad) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Audit history */}
      <section className="card p-5">
        <h2 className="text-[14px] font-semibold text-white">Historique</h2>
        {detail.events.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Aucun évènement.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {detail.events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 text-[12.5px]">
                <span className="mt-0.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">{e.type}</span>
                <div className="min-w-0 flex-1">
                  {e.note && <p className="text-muted">{e.note}</p>}
                  <p className="text-faint">
                    {new Date(e.createdAt).toLocaleString("fr-FR")}
                    {e.createdBy ? ` · ${e.createdBy}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-white">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-faint">{hint}</span>}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      className="input font-mono"
      value={value == null ? "" : value}
      onChange={(e) => {
        const v = e.target.value.trim();
        onChange(v === "" ? null : Number(v));
      }}
      placeholder={placeholder}
      min={0}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <p className="text-[11.5px] text-faint">{label}</p>
      <p className="mt-1 font-mono text-[15px] font-semibold text-white">{value}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right text-text">{children}</span>
    </div>
  );
}
