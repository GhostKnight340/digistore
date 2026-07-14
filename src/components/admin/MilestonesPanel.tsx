"use client";

import { useCallback, useEffect, useState } from "react";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import { formatMAD } from "@/lib/format";
import {
  getMilestonesAction,
  getMilestoneDetailAction,
  saveMilestoneAction,
  setMilestoneActiveAction,
  archiveMilestoneAction,
  duplicateMilestoneAction,
  reorderMilestonesAction,
} from "@/app/actions/milestones";
import type { AdminMilestoneDTO, AdminMilestoneDetailDTO, SaveMilestoneInput } from "@/lib/dto";

type Draft = SaveMilestoneInput;
type Msg = { text: string; ok: boolean } | null;

function emptyDraft(order: number): Draft {
  return {
    internalName: "",
    publicTitle: "",
    publicDescription: "",
    thresholdMad: 500,
    rewardMad: 25,
    active: true,
    startsAt: null,
    endsAt: null,
    displayOrder: order,
  };
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function milestoneStatus(m: AdminMilestoneDTO): { label: string; cls: string } {
  if (m.archivedAt) return { label: "Archivé", cls: "border-white/15 bg-white/5 text-muted" };
  const now = Date.now();
  if (!m.active) return { label: "Inactif", cls: "border-red-500/40 bg-red-500/10 text-red-300" };
  if (m.startsAt && new Date(m.startsAt).getTime() > now)
    return { label: "Programmé", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" };
  if (m.endsAt && new Date(m.endsAt).getTime() < now)
    return { label: "Expiré", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" };
  return { label: "Actif", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" };
}

export default function MilestonesPanel() {
  const [items, setItems] = useState<AdminMilestoneDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [draft, setDraft] = useState<Draft>(emptyDraft(0));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminMilestoneDetailDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await getMilestonesAction());
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((p) => ({ ...p, [key]: value }));
  }

  function startCreate() {
    setDraft(emptyDraft(items.filter((i) => !i.archivedAt).length));
    setEditingId(null);
    setDetail(null);
    setMsg(null);
    setMode("edit");
  }

  async function startEdit(m: AdminMilestoneDTO) {
    setDraft({
      id: m.id,
      internalName: m.internalName,
      publicTitle: m.publicTitle,
      publicDescription: m.publicDescription,
      thresholdMad: m.thresholdMad,
      rewardMad: m.rewardMad,
      active: m.active,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      displayOrder: m.displayOrder,
    });
    setEditingId(m.id);
    setMsg(null);
    setDetail(await getMilestoneDetailAction(m.id));
    setMode("edit");
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const result = await saveMilestoneAction(draft);
    setSaving(false);
    if (result.ok) {
      await load();
      setMode("list");
    } else setMsg({ text: result.error ?? "Erreur.", ok: false });
  }

  async function toggle(m: AdminMilestoneDTO) {
    const r = await setMilestoneActiveAction(m.id, !m.active);
    if (r.ok) await load();
    else setMsg({ text: r.error ?? "Erreur.", ok: false });
  }
  async function archive(m: AdminMilestoneDTO) {
    const r = await archiveMilestoneAction(m.id, !m.archivedAt);
    if (r.ok) await load();
  }
  async function duplicate(m: AdminMilestoneDTO) {
    const r = await duplicateMilestoneAction(m.id);
    if (r.ok) await load();
  }
  async function move(index: number, dir: -1 | 1) {
    const active = items.filter((i) => !i.archivedAt);
    const target = index + dir;
    if (target < 0 || target >= active.length) return;
    const ids = active.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderMilestonesAction(ids);
    await load();
  }

  if (mode === "edit") {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <button type="button" onClick={() => setMode("list")} className="text-[12.5px] text-muted hover:text-white">
            ← Retour aux paliers
          </button>
          <h1 className="mt-1 text-lg font-semibold text-white">
            {editingId ? "Modifier le palier" : "Nouveau palier de dépenses"}
          </h1>
        </header>

        {msg && !msg.ok && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">{msg.text}</p>
        )}

        {detail && (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Clients ayant débloqué" value={String(detail.customersUnlocked)} />
            <Stat label="Reprises" value={String(detail.reversedCount)} />
            <Stat label="Crédit total accordé" value={formatMAD(detail.totalRewardGrantedMad)} />
          </div>
        )}

        <section className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom interne">
              <input className="input" value={draft.internalName} onChange={(e) => update("internalName", e.target.value)} placeholder="Palier 500 DH" />
            </Field>
            <Field label="Titre client">
              <input className="input" value={draft.publicTitle} onChange={(e) => update("publicTitle", e.target.value)} placeholder="Dépensez 500 DH" />
            </Field>
          </div>
          <Field label="Description client (facultatif)">
            <textarea className="input min-h-[60px]" value={draft.publicDescription ?? ""} onChange={(e) => update("publicDescription", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Seuil de dépenses cumulées (DH)">
              <input type="number" min={1} className="input font-mono" value={draft.thresholdMad} onChange={(e) => update("thresholdMad", Number(e.target.value))} />
            </Field>
            <Field label="Récompense en crédit Ghost (DH)">
              <input type="number" min={1} className="input font-mono" value={draft.rewardMad} onChange={(e) => update("rewardMad", Number(e.target.value))} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Début (facultatif)">
              <input type="datetime-local" className="input" value={toLocalInput(draft.startsAt)} onChange={(e) => update("startsAt", e.target.value || null)} />
            </Field>
            <Field label="Fin (facultatif)">
              <input type="datetime-local" className="input" value={toLocalInput(draft.endsAt)} onChange={(e) => update("endsAt", e.target.value || null)} />
            </Field>
          </div>
          <div className="flex items-center justify-between">
            <ToggleSwitch checked={draft.active} onChange={(v) => update("active", v)} label="Actif" />
          </div>
          {editingId && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-300/90">
              Modifier le seuil ou la récompense d&apos;un palier déjà attribué archive l&apos;ancien palier et en
              crée un nouveau, afin de ne jamais altérer les récompenses déjà accordées.
            </p>
          )}
        </section>

        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={() => setMode("list")} className="btn-ghost text-sm">Annuler</button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-60">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    );
  }

  const active = items.filter((i) => !i.archivedAt);
  const archived = items.filter((i) => i.archivedAt);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Paliers de dépenses</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Récompenses en crédit Ghost débloquées par la dépense cumulée éligible, attribuées une fois par client.
          </p>
        </div>
        <button type="button" onClick={startCreate} className="btn-primary text-sm">+ Créer un palier</button>
      </header>

      {msg && (
        <p className={`rounded-xl border px-3.5 py-2.5 text-[13px] ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>{msg.text}</p>
      )}

      {loading ? (
        <div className="card grid place-items-center py-16 text-sm text-muted">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="card grid place-items-center gap-3 py-16 text-center">
          <p className="text-sm font-semibold text-white">Aucun palier</p>
          <button type="button" onClick={startCreate} className="btn-primary mt-1 text-sm">+ Créer un palier</button>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {active.map((m, index) => {
              const st = milestoneStatus(m);
              return (
                <div key={m.id} className="card flex flex-wrap items-center gap-3 p-4">
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="text-muted hover:text-white disabled:opacity-30" aria-label="Monter">▲</button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === active.length - 1} className="text-muted hover:text-white disabled:opacity-30" aria-label="Descendre">▼</button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[15px] font-semibold text-white">{formatMAD(m.thresholdMad)}</span>
                      <span className="text-muted">→</span>
                      <span className="font-mono text-[14px] text-[#9FB8FF]">{formatMAD(m.rewardMad)} crédit</span>
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">{m.internalName} · {m.publicTitle}</p>
                  </div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => startEdit(m)} className="btn-ghost h-8 px-3 text-[12px]">Modifier</button>
                    <button type="button" onClick={() => toggle(m)} className="btn-ghost h-8 px-3 text-[12px]">{m.active ? "Désactiver" : "Activer"}</button>
                    <button type="button" onClick={() => duplicate(m)} className="btn-ghost h-8 px-3 text-[12px]">Dupliquer</button>
                    <button type="button" onClick={() => archive(m)} className="btn-ghost h-8 px-3 text-[12px]">Archiver</button>
                  </div>
                </div>
              );
            })}
          </div>

          {archived.length > 0 && (
            <details className="card p-4">
              <summary className="cursor-pointer text-[13px] font-medium text-muted">Archivés ({archived.length})</summary>
              <div className="mt-3 space-y-2">
                {archived.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-canvas px-3 py-2 text-[12.5px]">
                    <span className="font-mono text-muted">{formatMAD(m.thresholdMad)} → {formatMAD(m.rewardMad)} (v{m.version})</span>
                    <button type="button" onClick={() => archive(m)} className="btn-ghost h-7 px-2.5 text-[11.5px]">Désarchiver</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-white">{label}</span>
      {children}
    </label>
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
