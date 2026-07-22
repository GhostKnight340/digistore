"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  previewEmailAction,
  summarizeSendAction,
  sendEmailAction,
  sendTestEmailAction,
  saveDraftAction,
  deleteDraftAction,
} from "@/app/actions/adminEmails";
import { COMPOSER_TEMPLATES } from "@/lib/email/composerTemplates";
import type { ComposePayload } from "@/lib/email/adminEmailService";
import RecipientPicker from "./RecipientPicker";
import { blankModule } from "./ModuleEditor";
import type { ClientRecipient, ComposerPermissions, ComposerState, EmailModule } from "./types";
import { newId } from "./types";
import SectionShell from "./composer/SectionShell";
import TemplateGrid from "./composer/TemplateGrid";
import VariablePicker from "./composer/VariablePicker";
import ModuleCard from "./composer/ModuleCard";
import ModuleLibrary from "./composer/ModuleLibrary";
import PreviewPanel, { type PreviewData } from "./composer/PreviewPanel";
import ActionBar from "./composer/ActionBar";
import TestModal from "./composer/TestModal";
import ReviewModal, { type SendSummaryData } from "./composer/ReviewModal";
import { computeValidation } from "./composer/validation";

type DraftStatus = "saved" | "unsaved" | "saving";
type FocusField = "subject" | "preheader" | "title" | null;
type MobileTab = "recipients" | "message" | "preview" | "check";

const BLANK: ComposerState = {
  templateKey: "custom",
  recipientMode: "existing",
  subject: "",
  preheader: "",
  eyebrow: "Ghost.ma",
  title: "",
  recipients: [],
  modules: [],
};

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
  const [state, setState] = useState<ComposerState>(initialDraft ?? BLANK);
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.draftId ?? null);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("saved");
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Preview
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  // Preview-panel collapse, persisted (matches the admin sidebar behaviour).
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  useEffect(() => {
    try {
      setPreviewCollapsed(localStorage.getItem("email-composer:preview-collapsed") === "1");
    } catch {
      /* private mode / no storage — default expanded. */
    }
  }, []);
  const togglePreviewCollapsed = () =>
    setPreviewCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("email-composer:preview-collapsed", next ? "1" : "0");
      } catch {
        /* ignore persistence failure */
      }
      return next;
    });
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layout & UI
  const [isMobile, setIsMobile] = useState(false);
  const [tab, setTab] = useState<MobileTab>("recipients");
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: false });
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [focusField, setFocusField] = useState<FocusField>(null);

  // Flows
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<SendSummaryData | null>(null);
  const [undo, setUndo] = useState<{ module: EmailModule; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const validation = useMemo(() => computeValidation(state), [state]);
  const creditTotal = useMemo(() => {
    const eligible = state.recipients.filter((r) => r.customerId).length;
    return state.modules
      .filter((m): m is Extract<EmailModule, { type: "credit" }> => m.type === "credit" && m.behavior === "grant")
      .reduce((sum, m) => sum + m.amountMad * eligible, 0);
  }, [state.modules, state.recipients]);
  const templateLabel = COMPOSER_TEMPLATES.find((t) => t.key === state.templateKey)?.label ?? "—";

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

  // ── State helpers (mark unsaved on any edit) ────────────────────────────────
  const edit = useCallback((updater: (s: ComposerState) => ComposerState) => {
    setState(updater);
    setDraftStatus("unsaved");
  }, []);
  const set = useCallback(
    <K extends keyof ComposerState>(key: K, value: ComposerState[K]) => edit((s) => ({ ...s, [key]: value })),
    [edit],
  );

  // ── Layout detection ────────────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ── Overflow menu outside-click ─────────────────────────────────────────────
  useEffect(() => {
    if (!overflowOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [overflowOpen]);

  // ── Live preview (debounced) ────────────────────────────────────────────────
  useEffect(() => {
    if (!permissions.compose) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreviewLoading(true);
    previewTimer.current = setTimeout(async () => {
      try {
        const idx = Math.min(previewIndex, Math.max(0, state.recipients.length - 1));
        const res = await previewEmailAction(toPayload(), idx);
        if (res.ok && res.html) {
          setPreview({ subject: res.subject ?? "", preheader: res.preheader ?? "", html: res.html, missingVariables: res.missingVariables ?? [] });
        }
      } catch {
        /* best-effort */
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [toPayload, previewIndex, state.recipients.length, permissions.compose]);

  // ── Autosave (debounced) + unsaved-navigation guard ─────────────────────────
  const doSaveDraft = useCallback(
    async (silent = false) => {
      if (!permissions.compose) return;
      setDraftStatus("saving");
      if (!silent) setBusy(true);
      try {
        const res = await saveDraftAction(toPayload(), draftId);
        if (res.ok && res.draftId) {
          setDraftId(res.draftId);
          setDraftStatus("saved");
          setLastSaved(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
          if (!silent) showFlash("ok", "Brouillon enregistré.");
        } else {
          setDraftStatus("unsaved");
          if (!silent) showFlash("err", res.error ?? "Échec de l'enregistrement.");
        }
      } finally {
        if (!silent) setBusy(false);
      }
    },
    [permissions.compose, toPayload, draftId],
  );

  useEffect(() => {
    if (draftStatus !== "unsaved" || !permissions.compose) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void doSaveDraft(true), 2500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [draftStatus, permissions.compose, doSaveDraft]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (draftStatus !== "saved") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draftStatus]);

  const showFlash = (kind: "ok" | "err", msg: string) => {
    setFlash({ kind, msg });
    setTimeout(() => setFlash(null), 5000);
  };

  // ── Template / modules ──────────────────────────────────────────────────────
  const applyTemplate = useCallback(
    (key: string) => {
      const tpl = COMPOSER_TEMPLATES.find((t) => t.key === key);
      if (!tpl) return;
      const modules = tpl.modules.map((m) => ({ ...m, id: newId() }) as EmailModule);
      edit((s) => ({ ...s, templateKey: key, subject: tpl.subject, preheader: tpl.preheader, eyebrow: tpl.eyebrow, title: tpl.title, modules }));
      setOpenModules(Object.fromEntries(modules.map((m) => [m.id, false])));
    },
    [edit],
  );

  const addModule = useCallback(
    (type: EmailModule["type"]) => {
      const m = blankModule(type);
      edit((s) => ({ ...s, modules: [...s.modules, m] }));
      setOpenModules((o) => ({ ...o, [m.id]: true }));
    },
    [edit],
  );

  const updateModule = useCallback((id: string, m: EmailModule) => edit((s) => ({ ...s, modules: s.modules.map((x) => (x.id === id ? m : x)) })), [edit]);

  const duplicateModule = useCallback(
    (id: string) => {
      const copyId = newId();
      edit((s) => {
        const idx = s.modules.findIndex((x) => x.id === id);
        if (idx < 0) return s;
        const copy = { ...s.modules[idx], id: copyId } as EmailModule;
        return { ...s, modules: [...s.modules.slice(0, idx + 1), copy, ...s.modules.slice(idx + 1)] };
      });
      setOpenModules((o) => ({ ...o, [copyId]: true }));
    },
    [edit],
  );

  const commitUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
  }, []);

  const removeModule = useCallback(
    (id: string) => {
      commitUndo();
      const index = state.modules.findIndex((x) => x.id === id);
      if (index < 0) return;
      const module = state.modules[index];
      edit((s) => ({ ...s, modules: s.modules.filter((x) => x.id !== id) }));
      setUndo({ module, index });
      undoTimer.current = setTimeout(() => setUndo(null), 5000);
    },
    [edit, commitUndo, state.modules],
  );

  const restoreUndo = useCallback(() => {
    if (!undo) return;
    const { module, index } = undo;
    edit((s) => {
      const modules = [...s.modules];
      modules.splice(Math.min(index, modules.length), 0, module);
      return { ...s, modules };
    });
    commitUndo();
  }, [undo, edit, commitUndo]);

  const move = useCallback(
    (id: string, dir: -1 | 1) =>
      edit((s) => {
        const idx = s.modules.findIndex((x) => x.id === id);
        const next = idx + dir;
        if (idx < 0 || next < 0 || next >= s.modules.length) return s;
        const modules = [...s.modules];
        [modules[idx], modules[next]] = [modules[next], modules[idx]];
        return { ...s, modules };
      }),
    [edit],
  );

  const setAllModules = (open: boolean) => setOpenModules(Object.fromEntries(state.modules.map((m) => [m.id, open])));

  // ── Variable insertion (into last-focused field) ────────────────────────────
  const insertVariable = useCallback(
    (token: string) => {
      if (!focusField) return;
      edit((s) => ({ ...s, [focusField]: `${s[focusField]}${s[focusField] ? " " : ""}${token}` }));
    },
    [focusField, edit],
  );

  // ── Header actions ──────────────────────────────────────────────────────────
  const doReset = () => {
    if (draftStatus !== "saved" && !window.confirm("Réinitialiser le composeur ? Les modifications non enregistrées seront perdues.")) return;
    setState(BLANK);
    setDraftId(null);
    setDraftStatus("saved");
    setOpenModules({});
    setOverflowOpen(false);
    showFlash("ok", "Composeur réinitialisé.");
  };
  const doDuplicate = () => {
    setDraftId(null);
    setDraftStatus("unsaved");
    setOverflowOpen(false);
    showFlash("ok", "Copie créée — enregistrez pour la conserver.");
  };
  const doDeleteDraft = async () => {
    if (!draftId) {
      doReset();
      return;
    }
    if (!window.confirm("Supprimer définitivement ce brouillon ?")) return;
    setOverflowOpen(false);
    setBusy(true);
    try {
      const res = await deleteDraftAction(draftId);
      if (res.ok) {
        setState(BLANK);
        setDraftId(null);
        setDraftStatus("saved");
        setOpenModules({});
        showFlash("ok", "Brouillon supprimé.");
      } else {
        showFlash("err", res.error ?? "Échec de la suppression.");
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Send flows ──────────────────────────────────────────────────────────────
  const openReview = async () => {
    setBusy(true);
    try {
      const summary = await summarizeSendAction(toPayload());
      if (!summary.ok) {
        showFlash("err", summary.error ?? "Impossible d'envoyer.");
        return;
      }
      setReviewSummary(summary);
    } finally {
      setBusy(false);
    }
  };

  const doSend = useCallback(async () => {
    const res = await sendEmailAction(toPayload());
    return res;
  }, [toPayload]);

  const doTestSend = useCallback(
    async (address: string) => {
      const res = await sendTestEmailAction(toPayload(), address);
      return { ok: res.ok, error: res.error };
    },
    [toPayload],
  );

  // ── Section content pieces (reused across desktop & mobile layouts) ──────────
  const recipientSummary = `${state.recipients.length} destinataire(s) · ${state.recipients.filter((r) => r.customerId).length} client(s) · ${state.recipients.filter((r) => !r.customerId).length} manuelle(s)`;
  const previewName = state.recipients[previewIndex]?.name || state.recipients[previewIndex]?.email?.split("@")[0] || "Exemple";

  const recipientsSection = (
    <SectionShell index={1} title="Destinataires" summary={recipientSummary} open={isMobile || openSections[1]} onToggle={() => setOpenSections((o) => ({ ...o, 1: !o[1] }))}>
      <RecipientPicker mode={state.recipientMode} recipients={state.recipients} onModeChange={(m) => set("recipientMode", m)} onChange={(r: ClientRecipient[]) => set("recipients", r)} />
    </SectionShell>
  );

  const fieldClass = "input text-sm";
  const templateSection = (
    <SectionShell
      index={2}
      title="Modèle et objet"
      summary={`${templateLabel} · ${state.subject || "objet vide"}`}
      open={isMobile || openSections[2]}
      onToggle={() => setOpenSections((o) => ({ ...o, 2: !o[2] }))}
      actions={<VariablePicker disabled={!focusField} onInsert={insertVariable} />}
    >
      <div className="space-y-4">
        <TemplateGrid value={state.templateKey} onSelect={applyTemplate} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted">Objet</label>
            <input className={fieldClass} value={state.subject} onFocus={() => setFocusField("subject")} onChange={(e) => set("subject", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Pré-en-tête</label>
            <input className={fieldClass} value={state.preheader} onFocus={() => setFocusField("preheader")} onChange={(e) => set("preheader", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Surtitre</label>
            <input className={fieldClass} value={state.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted">Titre principal</label>
            <input className={fieldClass} value={state.title} onFocus={() => setFocusField("title")} onChange={(e) => set("title", e.target.value)} />
          </div>
        </div>
      </div>
    </SectionShell>
  );

  const contentSection = (
    <SectionShell
      index={3}
      title="Contenu"
      summary={`${state.modules.length} module(s)`}
      open={isMobile || openSections[3]}
      onToggle={() => setOpenSections((o) => ({ ...o, 3: !o[3] }))}
      actions={
        <div className="relative flex items-center gap-2">
          {state.modules.length > 0 && (
            <button type="button" onClick={() => setAllModules(!state.modules.every((m) => openModules[m.id]))} className="btn-ghost text-xs">
              {state.modules.every((m) => openModules[m.id]) ? "Tout réduire" : "Tout ouvrir"}
            </button>
          )}
          <button type="button" onClick={() => setLibraryOpen((o) => !o)} className="btn-primary text-xs">+ Ajouter un module</button>
          <ModuleLibrary open={libraryOpen} sheet={isMobile} onClose={() => setLibraryOpen(false)} onPick={addModule} />
        </div>
      }
    >
      <div className="space-y-2">
        {state.modules.map((m, i) => (
          <ModuleCard
            key={m.id}
            module={m}
            index={i}
            count={state.modules.length}
            open={!!openModules[m.id]}
            recipients={state.recipients}
            canGrantCredit={permissions.creditGrant}
            onToggle={() => setOpenModules((o) => ({ ...o, [m.id]: !o[m.id] }))}
            onChange={(next) => updateModule(m.id, next)}
            onMove={(dir) => move(m.id, dir)}
            onDuplicate={() => duplicateModule(m.id)}
            onDelete={() => removeModule(m.id)}
          />
        ))}
        {state.modules.length === 0 && (
          <button type="button" onClick={() => setLibraryOpen(true)} className="w-full rounded-xl border border-dashed border-border-strong py-6 text-sm text-muted hover:border-accent/60 hover:text-text">
            Aucun contenu. Cliquez pour ajouter un module.
          </button>
        )}
      </div>
    </SectionShell>
  );

  const settingsSection = (
    <SectionShell index={4} title="Paramètres d'envoi" summary="Envoi immédiat" open={isMobile || openSections[4]} onToggle={() => setOpenSections((o) => ({ ...o, 4: !o[4] }))}>
      <div className="space-y-2">
        <div className="rounded-xl border border-accent/50 bg-accent/10 p-3">
          <div className="flex items-center gap-2 text-sm text-text">
            <span className="h-2 w-2 rounded-full bg-accent" /> Envoi immédiat
          </div>
          <p className="mt-1 text-xs text-muted">L&apos;e-mail part dès la confirmation dans « Vérifier et envoyer ».</p>
        </div>
        <p className="text-xs text-faint">La programmation d&apos;un envoi différé sera ajoutée prochainement.</p>
      </div>
    </SectionShell>
  );

  const previewPanel = (
    <PreviewPanel
      preview={preview}
      loading={previewLoading}
      mode={previewMode}
      onModeChange={setPreviewMode}
      zoom={zoom}
      onZoom={setZoom}
      recipients={state.recipients}
      previewIndex={previewIndex}
      onPreviewIndex={setPreviewIndex}
      senderName="ghost.ma"
      senderEmail="support@ghost.ma"
      collapsible={!isMobile}
      collapsed={previewCollapsed}
      onCollapse={togglePreviewCollapsed}
    />
  );

  // ── Header ──────────────────────────────────────────────────────────────────
  const statusPill = {
    saved: { cls: "bg-emerald-400/15 text-emerald-300", label: "Brouillon enregistré" },
    unsaved: { cls: "bg-amber-400/15 text-amber-300", label: "Modifications non enregistrées" },
    saving: { cls: "bg-accent/15 text-sky-300", label: "Enregistrement…" },
  }[draftStatus];

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-white">Composer un e-mail</h1>
        <p className="text-sm text-muted">Créez et envoyez un e-mail transactionnel ou de service client.</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusPill.cls}`}>{statusPill.label}</span>
        <Link href="/admin/emails/drafts" className="btn-ghost text-sm">Brouillons</Link>
        <Link href="/admin/emails/history" className="btn-ghost text-sm">Historique</Link>
        <div ref={overflowRef} className="relative">
          <button type="button" onClick={() => setOverflowOpen((o) => !o)} aria-label="Plus d'actions" className="btn-ghost px-2.5 text-sm">⋮</button>
          {overflowOpen && (
            <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-border bg-[#15161b] p-1 shadow-2xl">
              <button type="button" onClick={doDuplicate} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-surface2">Dupliquer</button>
              <button type="button" onClick={doReset} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-surface2">Réinitialiser</button>
              <button type="button" onClick={doDeleteDraft} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10">Supprimer le brouillon</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── Mobile "Vérification" tab content ───────────────────────────────────────
  const checkTab = (
    <div className="space-y-3">
      <div className={`rounded-xl border px-3 py-2 text-sm ${validation.status === "blocked" ? "border-red-400/40 bg-red-400/10 text-red-200" : validation.status === "review" ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"}`}>
        {validation.status === "ready" ? "Prêt à envoyer." : `${validation.issues.length} élément(s) à vérifier.`}
      </div>
      <ul className="space-y-1.5">
        {validation.issues.length === 0 && <li className="text-xs text-emerald-300">Tout est prêt.</li>}
        {validation.issues.map((issue) => (
          <li key={issue.id} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${issue.blocking ? "bg-red-400" : "bg-amber-400"}`} />
            <span className={issue.blocking ? "text-red-200" : "text-amber-200"}>{issue.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const flashBar = flash && (
    <div className={`mb-4 rounded-xl px-4 py-2 text-sm ${flash.kind === "ok" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{flash.msg}</div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-w-0">
      {header}
      {flashBar}

      {isMobile ? (
        <div className="pb-28">
          <div className="mb-4 flex gap-1 rounded-xl border border-border bg-surface p-1">
            {([["recipients", "Destinataires"], ["message", "Message"], ["preview", "Aperçu"], ["check", "Vérification"]] as [MobileTab, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ${tab === id ? "bg-accent text-white" : "text-muted"}`}>{label}</button>
            ))}
          </div>
          {tab === "recipients" && recipientsSection}
          {tab === "message" && <div className="space-y-4">{templateSection}{contentSection}{settingsSection}</div>}
          {tab === "preview" && <div className="h-[70vh]">{previewPanel}</div>}
          {tab === "check" && checkTab}
        </div>
      ) : (
        <div className="flex gap-4 pb-24">
          <div className="min-w-0 flex-1 space-y-4" style={{ flexBasis: "62%" }}>
            {recipientsSection}
            {templateSection}
            {contentSection}
            {settingsSection}
          </div>
          <div className={previewCollapsed ? "shrink-0" : "shrink-0"} style={{ flexBasis: previewCollapsed ? "auto" : "38%", width: previewCollapsed ? 40 : undefined }}>
            <div className="sticky top-4 h-[calc(100vh-8rem)]">{previewPanel}</div>
          </div>
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-0">
        <ActionBar
          validation={validation}
          recipientCount={state.recipients.length}
          creditTotal={creditTotal}
          lastSaved={lastSaved}
          busy={busy}
          canCompose={permissions.compose}
          canSend={permissions.send}
          onSaveDraft={() => void doSaveDraft(false)}
          onTest={() => setTestOpen(true)}
          onReview={() => void openReview()}
        />
      </div>

      {/* Undo toast */}
      {undo && (
        <div className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-[#15161b] px-4 py-2.5 text-sm text-text shadow-2xl">
          <span>Module supprimé</span>
          <button type="button" onClick={restoreUndo} className="font-medium text-sky-300 hover:underline">Annuler</button>
        </div>
      )}

      <TestModal open={testOpen} sheet={isMobile} defaultAddress={adminTestEmail} previewName={previewName} onSend={doTestSend} onClose={() => setTestOpen(false)} />

      {reviewSummary && (
        <ReviewModal
          open
          sheet={isMobile}
          summary={reviewSummary}
          validation={validation}
          subject={state.subject}
          templateLabel={templateLabel}
          moduleCount={state.modules.length}
          onSend={doSend}
          onClose={() => setReviewSummary(null)}
          onGoToSend={(id) => router.push(`/admin/emails/history/${id}`)}
        />
      )}
    </div>
  );
}
