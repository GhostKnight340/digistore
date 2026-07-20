"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  previewEmailAction,
  summarizeSendAction,
  sendEmailAction,
  sendTestEmailAction,
  saveDraftAction,
} from "@/app/actions/adminEmails";
import { COMPOSER_TEMPLATES } from "@/lib/email/composerTemplates";
import { MODULE_TYPES } from "@/lib/email/composerModules";
import type { ComposePayload } from "@/lib/email/adminEmailService";
import RecipientPicker from "./RecipientPicker";
import ModuleEditor, { blankModule, MODULE_LABELS } from "./ModuleEditor";
import type { ClientRecipient, ComposerPermissions, ComposerState, EmailModule } from "./types";
import { newId } from "./types";

type PreviewData = { subject: string; preheader: string; html: string; missingVariables: string[] };

type SummaryData = Awaited<ReturnType<typeof summarizeSendAction>>;

export default function EmailComposer({
  permissions,
  initialDraft,
  adminTestEmail,
}: {
  permissions: ComposerPermissions;
  initialDraft: (ComposerState & { draftId: string }) | null;
  adminTestEmail: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<ComposerState>(
    initialDraft ?? {
      templateKey: "custom",
      recipientMode: "existing",
      subject: "",
      preheader: "",
      eyebrow: "Ghost.ma",
      title: "",
      recipients: [],
      modules: [],
    },
  );
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.draftId ?? null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [previewOpen, setPreviewOpen] = useState(false); // mobile sheet
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<SummaryData | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback(<K extends keyof ComposerState>(key: K, value: ComposerState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const toPayload = useCallback(
    (): ComposePayload => ({
      templateKey: state.templateKey,
      recipientMode: state.recipientMode,
      subject: state.subject,
      preheader: state.preheader,
      eyebrow: state.eyebrow,
      title: state.title,
      recipients: state.recipients.map((r) => ({ customerId: r.customerId, email: r.email, name: r.name })),
      modules: state.modules,
    }),
    [state],
  );

  // Live preview (debounced).
  useEffect(() => {
    if (!permissions.compose) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await previewEmailAction(toPayload(), 0);
        if (res.ok && res.html) {
          setPreview({
            subject: res.subject ?? "",
            preheader: res.preheader ?? "",
            html: res.html,
            missingVariables: res.missingVariables ?? [],
          });
        }
      } catch {
        /* preview is best-effort */
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [toPayload, permissions.compose]);

  const applyTemplate = useCallback((key: string) => {
    const tpl = COMPOSER_TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    setState((s) => ({
      ...s,
      templateKey: key,
      subject: tpl.subject,
      preheader: tpl.preheader,
      eyebrow: tpl.eyebrow,
      title: tpl.title,
      modules: tpl.modules.map((m) => ({ ...m, id: newId() }) as EmailModule),
    }));
  }, []);

  const addModule = useCallback((type: EmailModule["type"]) => {
    setState((s) => ({ ...s, modules: [...s.modules, blankModule(type)] }));
  }, []);

  const updateModule = useCallback((id: string, m: EmailModule) => {
    setState((s) => ({ ...s, modules: s.modules.map((x) => (x.id === id ? m : x)) }));
  }, []);

  const removeModule = useCallback((id: string) => {
    setState((s) => ({ ...s, modules: s.modules.filter((x) => x.id !== id) }));
  }, []);

  const move = useCallback((id: string, dir: -1 | 1) => {
    setState((s) => {
      const idx = s.modules.findIndex((x) => x.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= s.modules.length) return s;
      const modules = [...s.modules];
      [modules[idx], modules[next]] = [modules[next], modules[idx]];
      return { ...s, modules };
    });
  }, []);

  const showFlash = (kind: "ok" | "err", msg: string) => {
    setFlash({ kind, msg });
    setTimeout(() => setFlash(null), 5000);
  };

  const doSaveDraft = async () => {
    setBusy(true);
    try {
      const res = await saveDraftAction(toPayload(), draftId);
      if (res.ok && res.draftId) {
        setDraftId(res.draftId);
        showFlash("ok", "Brouillon enregistré.");
      } else {
        showFlash("err", res.error ?? "Échec de l'enregistrement.");
      }
    } finally {
      setBusy(false);
    }
  };

  const doTest = async () => {
    const address = window.prompt("Adresse pour l'e-mail de test :", adminTestEmail);
    if (!address) return;
    setBusy(true);
    try {
      const res = await sendTestEmailAction(toPayload(), address);
      showFlash(res.ok ? "ok" : "err", res.ok ? `Test envoyé à ${address}.` : res.error ?? "Échec du test.");
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = async () => {
    setBusy(true);
    try {
      const summary = await summarizeSendAction(toPayload());
      if (!summary.ok) {
        showFlash("err", summary.error ?? "Impossible d'envoyer.");
        return;
      }
      setConfirm(summary);
    } finally {
      setBusy(false);
    }
  };

  const doSend = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      const res = await sendEmailAction(toPayload());
      if (res.ok) {
        showFlash("ok", `Envoyé : ${res.sentCount} réussi(s), ${res.failedCount} échec(s).`);
        if (res.sendId) router.push(`/admin/emails/history/${res.sendId}`);
      } else {
        showFlash("err", res.error ?? "Échec de l'envoi.");
      }
    } finally {
      setBusy(false);
    }
  };

  const canSend = permissions.send && state.recipients.length > 0 && state.modules.length > 0 && state.subject.trim().length > 0;

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-white">Envoyer un e-mail</h1>
          <p className="text-sm text-muted">Composez et envoyez un e-mail transactionnel ou de service client.</p>
        </div>
        <Link href="/admin/emails/history" className="btn-ghost text-sm">Historique</Link>
      </div>

      {flash && (
        <div className={`mb-4 rounded-xl px-4 py-2 text-sm ${flash.kind === "ok" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
          {flash.msg}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ── Left: editor ── */}
        <div className="space-y-4">
          <RecipientPicker
            mode={state.recipientMode}
            recipients={state.recipients}
            onModeChange={(m) => set("recipientMode", m)}
            onChange={(r: ClientRecipient[]) => set("recipients", r)}
          />

          <div className="card p-4">
            <label className="mb-1 block text-xs font-medium text-muted">Modèle</label>
            <select className="input text-sm" value={state.templateKey} onChange={(e) => applyTemplate(e.target.value)}>
              {COMPOSER_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted">Objet</label>
                <input className="input text-sm" value={state.subject} onChange={(e) => set("subject", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Pré-en-tête</label>
                <input className="input text-sm" value={state.preheader} onChange={(e) => set("preheader", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Surtitre</label>
                <input className="input text-sm" value={state.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted">Titre principal</label>
                <input className="input text-sm" value={state.title} onChange={(e) => set("title", e.target.value)} />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-faint">
              Variables : {"{{customer.name}}"} · {"{{customer.creditBalance}}"} · {"{{order.number}}"} · {"{{store.name}}"} · {"{{support.email}}"}
            </p>
          </div>

          {/* Modules */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text">Contenu</h2>
              <span className="chip">{state.modules.length} module(s)</span>
            </div>

            <div className="space-y-3">
              {state.modules.map((m, i) => (
                <div key={m.id} className="rounded-xl border border-border bg-surface2/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-accent">{MODULE_LABELS[m.type]}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={i === 0} onClick={() => move(m.id, -1)} className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface2 disabled:opacity-30" aria-label="Monter">↑</button>
                      <button type="button" disabled={i === state.modules.length - 1} onClick={() => move(m.id, 1)} className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface2 disabled:opacity-30" aria-label="Descendre">↓</button>
                      <button type="button" onClick={() => removeModule(m.id)} className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/10" aria-label="Supprimer">✕</button>
                    </div>
                  </div>
                  <ModuleEditor
                    module={m}
                    recipients={state.recipients}
                    canGrantCredit={permissions.creditGrant}
                    onChange={(next) => updateModule(m.id, next)}
                  />
                </div>
              ))}
              {state.modules.length === 0 && (
                <p className="text-sm text-muted">Aucun module. Ajoutez du contenu ci-dessous.</p>
              )}
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">Ajouter un module</label>
              <div className="flex flex-wrap gap-2">
                {MODULE_TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => addModule(t)} className="chip hover:border-accent hover:text-accent">
                    + {MODULE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions (sticky-ish on mobile) */}
          <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 rounded-xl border border-border bg-card/95 p-3 backdrop-blur">
            <button type="button" onClick={doSaveDraft} disabled={busy || !permissions.compose} className="btn-ghost text-sm">
              Enregistrer le brouillon
            </button>
            <button type="button" onClick={doTest} disabled={busy || !permissions.send} className="btn-ghost text-sm">
              Envoyer un test
            </button>
            <button type="button" onClick={() => setPreviewOpen(true)} className="btn-ghost text-sm lg:hidden">
              Aperçu
            </button>
            <button type="button" onClick={openConfirm} disabled={busy || !canSend} className="btn-primary text-sm">
              Envoyer
            </button>
          </div>
        </div>

        {/* ── Right: preview (desktop) ── */}
        <div className="hidden lg:block">
          <div className="sticky top-4">
            <PreviewPanel preview={preview} mode={previewMode} onModeChange={setPreviewMode} />
          </div>
        </div>
      </div>

      {/* Mobile preview sheet */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 lg:hidden" onClick={() => setPreviewOpen(false)}>
          <div className="mt-auto max-h-[90vh] overflow-y-auto rounded-t-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text">Aperçu</h2>
              <button type="button" onClick={() => setPreviewOpen(false)} className="btn-ghost text-xs">Fermer</button>
            </div>
            <PreviewPanel preview={preview} mode={previewMode} onModeChange={setPreviewMode} />
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirm && confirm.ok && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text">Confirmer l&apos;envoi</h2>
            <p className="mt-2 text-sm text-muted">
              Cette action enverra l&apos;e-mail à <strong>{confirm.recipientCount}</strong> destinataire(s)
              {confirm.totalCreditMad > 0 && (
                <> et ajoutera un total de <strong>{confirm.totalCreditMad} DH</strong> de crédit Ghost à{" "}
                <strong>{confirm.creditRecipientCount}</strong> client(s)</>
              )}
              . Cette opération sera enregistrée dans l&apos;historique.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-muted">
              <li>Objet : {state.subject || "(vide)"}</li>
              <li>Modèle : {COMPOSER_TEMPLATES.find((t) => t.key === state.templateKey)?.label}</li>
              <li>Modules : {state.modules.length}</li>
              <li>Clients avec compte : {confirm.customerCount} · Adresses manuelles : {confirm.manualCount}</li>
              {confirm.blockedCreditCount > 0 && (
                <li className="text-amber-500">{confirm.blockedCreditCount} adresse(s) ne peuvent pas recevoir de crédit (pas de compte).</li>
              )}
              {confirm.missingVariablesByRecipient.length > 0 && (
                <li className="text-amber-500">
                  Variables manquantes pour {confirm.missingVariablesByRecipient.length} destinataire(s).
                </li>
              )}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="btn-ghost text-sm">Annuler</button>
              <button type="button" onClick={doSend} className="btn-primary text-sm">
                {confirm.totalCreditMad > 0 ? "Confirmer et créditer" : "Confirmer l'envoi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewPanel({
  preview,
  mode,
  onModeChange,
}: {
  preview: PreviewData | null;
  mode: "desktop" | "mobile";
  onModeChange: (m: "desktop" | "mobile") => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 className="text-sm font-semibold text-text">Aperçu</h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => onModeChange("desktop")} className={`rounded-lg px-2 py-1 text-xs ${mode === "desktop" ? "bg-accent text-white" : "text-muted hover:bg-surface2"}`}>Bureau</button>
          <button type="button" onClick={() => onModeChange("mobile")} className={`rounded-lg px-2 py-1 text-xs ${mode === "mobile" ? "bg-accent text-white" : "text-muted hover:bg-surface2"}`}>Mobile</button>
        </div>
      </div>
      {preview ? (
        <div className="p-3">
          <div className="mb-2 rounded-lg bg-surface p-2 text-xs">
            <div className="truncate font-medium text-text">{preview.subject || "(objet vide)"}</div>
            <div className="truncate text-muted">{preview.preheader}</div>
          </div>
          {preview.missingVariables.length > 0 && (
            <div className="mb-2 rounded-lg bg-amber-500/15 px-2 py-1 text-[11px] text-amber-500">
              Variables non résolues : {preview.missingVariables.join(", ")}
            </div>
          )}
          <div className="mx-auto overflow-hidden rounded-lg border border-border bg-white" style={{ maxWidth: mode === "mobile" ? 380 : "100%" }}>
            <iframe title="Aperçu e-mail" srcDoc={preview.html} className="h-[560px] w-full" sandbox="" />
          </div>
        </div>
      ) : (
        <p className="p-4 text-sm text-muted">L&apos;aperçu s&apos;affichera ici.</p>
      )}
    </div>
  );
}
