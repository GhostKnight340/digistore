"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  useStoreSettings,
} from "@/context/StoreSettingsContext";
import {
  defaultStoreSettings,
  type StoreSettings,
  type TrustItemSetting,
  type HowItWorksStep,
} from "@/lib/storeSettings";

type Section = "hero" | "steps" | "trust";

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export default function EditorPage() {
  const { settings, ready, saveSettings } = useStoreSettings();

  const [draft, setDraft] = useState<StoreSettings>(defaultStoreSettings);
  const [undoSnapshot, setUndoSnapshot] = useState<StoreSettings | null>(null);
  const [section, setSection] = useState<Section>("hero");

  useEffect(() => {
    if (ready) setDraft(deepClone(settings));
  }, [ready]);

  const dirty = ready && JSON.stringify(draft) !== JSON.stringify(settings);

  function handleSave() {
    setUndoSnapshot(deepClone(settings));
    saveSettings(draft);
  }

  function handleUndo() {
    if (!undoSnapshot) return;
    saveSettings(undoSnapshot);
    setDraft(deepClone(undoSnapshot));
    setUndoSnapshot(null);
  }

  function handleCancel() {
    setDraft(deepClone(settings));
  }

  function handleReset() {
    if (!confirm("Reset all homepage copy to defaults? This cannot be undone.")) return;
    setDraft(deepClone(defaultStoreSettings));
  }

  const patchDraft = useCallback(
    (updater: (prev: StoreSettings) => StoreSettings) => {
      setDraft(updater);
    },
    [],
  );

  return (
    <div className="min-h-screen bg-base">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 border-b border-border bg-base/95 backdrop-blur">
        <div className="container-page flex flex-wrap items-center gap-3 py-3">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-sm text-muted hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Admin
          </Link>

          <span className="mx-1 text-border">|</span>
          <span className="text-sm font-medium text-white">Homepage editor</span>

          {dirty && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Unsaved changes
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                onClick={handleCancel}
                className="btn-ghost h-8 px-3 text-xs"
              >
                Cancel
              </button>
            )}
            {undoSnapshot && (
              <button
                type="button"
                onClick={handleUndo}
                className="btn-ghost h-8 px-3 text-xs"
              >
                Undo save
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="btn-ghost h-8 px-3 text-xs text-muted"
            >
              Reset defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty}
              className="btn-primary h-8 px-4 text-xs disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {!ready ? (
        <div className="container-page py-16 text-sm text-muted">Loading…</div>
      ) : (
        <div className="container-page py-8">
          {/* Section tabs */}
          <div className="mb-6 flex gap-1 rounded-xl border border-border bg-surface p-1 w-fit">
            {(
              [
                { id: "hero", label: "Hero" },
                { id: "steps", label: "Comment ça marche" },
                { id: "trust", label: "Pourquoi Karta" },
              ] as { id: Section; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  section === tab.id
                    ? "bg-surface2 text-white shadow-sm"
                    : "text-muted hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Split layout */}
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            {/* Form */}
            <div className="space-y-4">
              {section === "hero" && (
                <HeroForm draft={draft} patch={patchDraft} />
              )}
              {section === "steps" && (
                <StepsForm draft={draft} patch={patchDraft} />
              )}
              {section === "trust" && (
                <TrustForm draft={draft} patch={patchDraft} />
              )}
            </div>

            {/* Preview */}
            <div className="lg:sticky lg:top-[57px] lg:max-h-[calc(100vh-73px)] lg:overflow-y-auto">
              {section === "hero" && <HeroPreview draft={draft} />}
              {section === "steps" && <StepsPreview draft={draft} />}
              {section === "trust" && <TrustPreview draft={draft} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── HERO ─────────────────────────────────────────────────────────────── */

type PatchFn = (updater: (prev: StoreSettings) => StoreSettings) => void;

function HeroForm({ draft, patch }: { draft: StoreSettings; patch: PatchFn }) {
  const b = draft.branding;
  const set = (p: Partial<StoreSettings["branding"]>) =>
    patch((prev) => ({ ...prev, branding: { ...prev.branding, ...p } }));
  return (
    <section className="card p-6 space-y-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Hero section</h2>
      <Field label="Title" value={b.heroTitle} onChange={(v) => set({ heroTitle: v })} multiline />
      <Field label="Subtitle" value={b.heroSubtitle} onChange={(v) => set({ heroSubtitle: v })} multiline />
      <Field label="Primary CTA label" value={b.primaryCtaLabel} onChange={(v) => set({ primaryCtaLabel: v })} />
      <Field label="Secondary CTA label" value={b.secondaryCtaLabel} onChange={(v) => set({ secondaryCtaLabel: v })} />
    </section>
  );
}

function HeroPreview({ draft }: { draft: StoreSettings }) {
  const b = draft.branding;
  return (
    <div className="rounded-[20px] border border-border bg-surface p-8 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Preview — Hero</p>
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface2 px-3 py-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Cartes &amp; codes numériques
        </span>
      </div>
      <h1 className="text-3xl font-semibold leading-tight text-white">{b.heroTitle || <em className="text-muted">—</em>}</h1>
      <p className="text-sm leading-relaxed text-muted">{b.heroSubtitle || <em className="text-faint">—</em>}</p>
      <div className="flex flex-wrap gap-3 pt-1">
        <span className="inline-flex h-9 items-center rounded-xl bg-accent px-4 text-sm font-medium text-white">
          {b.primaryCtaLabel || "—"}
        </span>
        <span className="inline-flex h-9 items-center rounded-xl border border-border px-4 text-sm text-muted">
          {b.secondaryCtaLabel || "—"}
        </span>
      </div>
    </div>
  );
}

/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */

function StepsForm({ draft, patch }: { draft: StoreSettings; patch: PatchFn }) {
  const hiw = draft.howItWorks;
  function patchHiw(p: Partial<StoreSettings["howItWorks"]>) {
    patch((prev) => ({ ...prev, howItWorks: { ...prev.howItWorks, ...p } }));
  }
  function patchStep(index: number, p: Partial<HowItWorksStep>) {
    const next = hiw.steps.map((s, i) => (i === index ? { ...s, ...p } : s));
    patchHiw({ steps: next });
  }

  return (
    <section className="space-y-4">
      <div className="card p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Section header</h2>
        <Field label="Title" value={hiw.title} onChange={(v) => patchHiw({ title: v })} />
        <Field label="Subtitle" value={hiw.subtitle} onChange={(v) => patchHiw({ subtitle: v })} />
      </div>
      {hiw.steps.map((step, i) => (
        <div key={i} className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Step {i + 1}</h2>
          <Field label="Title" value={step.title} onChange={(v) => patchStep(i, { title: v })} />
          <Field label="Description" value={step.description} onChange={(v) => patchStep(i, { description: v })} multiline />
        </div>
      ))}
    </section>
  );
}

function StepsPreview({ draft }: { draft: StoreSettings }) {
  const { title, subtitle, steps } = draft.howItWorks;
  return (
    <div className="rounded-[20px] border border-border bg-surface p-8 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Preview — Comment ça marche</p>
      <h2 className="text-xl font-semibold text-white">{title || <em className="text-muted">—</em>}</h2>
      <p className="text-sm text-muted">{subtitle || <em className="text-faint">—</em>}</p>
      <div className="grid gap-3 sm:grid-cols-3 mt-4">
        {steps.map((step, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface2 p-4">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-sm font-bold text-accent">
              {i + 1}
            </span>
            <p className="mt-3 text-sm font-semibold text-white">{step.title || "—"}</p>
            <p className="mt-1 text-xs text-muted">{step.description || "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── TRUST STRIP ─────────────────────────────────────────────────────── */

function TrustForm({ draft, patch }: { draft: StoreSettings; patch: PatchFn }) {
  function patchItem(index: number, p: Partial<TrustItemSetting>) {
    patch((prev) => ({
      ...prev,
      trustItems: prev.trustItems.map((item, i) => (i === index ? { ...item, ...p } : item)),
    }));
  }

  return (
    <section className="space-y-4">
      <div className="card p-4 flex items-center gap-2 text-xs text-muted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0 text-accent" aria-hidden>
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Toggle each card on/off and edit its copy. Section title is "Pourquoi choisir Karta ?" (not editable here).
      </div>
      {draft.trustItems.map((item, i) => (
        <div key={item.id} className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Card {i + 1}</h2>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted select-none">
              <span>{item.enabled ? "Enabled" : "Disabled"}</span>
              <button
                type="button"
                onClick={() => patchItem(i, { enabled: !item.enabled })}
                className={`relative h-5 w-9 rounded-full transition ${item.enabled ? "bg-accent" : "bg-surface2"}`}
                role="switch"
                aria-checked={item.enabled}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    item.enabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          </div>
          <Field label="Title" value={item.title} onChange={(v) => patchItem(i, { title: v })} />
          <Field label="Description" value={item.description} onChange={(v) => patchItem(i, { description: v })} multiline />
        </div>
      ))}
    </section>
  );
}

function TrustPreview({ draft }: { draft: StoreSettings }) {
  const items = draft.trustItems.filter((item) => item.enabled);
  return (
    <div className="rounded-[20px] border border-border bg-surface p-8 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Preview — Pourquoi choisir Karta</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">All cards are disabled — section will be hidden.</p>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-white">Pourquoi choisir Karta&nbsp;?</h2>
          <p className="text-sm text-muted">Une boutique pensée pour les clients marocains.</p>
          <div className="grid gap-3 sm:grid-cols-2 mt-4">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-surface2 p-4">
                <div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-white">{item.title || "—"}</p>
                <p className="mt-1 text-xs text-muted">{item.description || "—"}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Shared field component ───────────────────────────────────────────── */

function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-white">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="input min-h-[72px] py-2 text-sm leading-relaxed"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input h-10 py-0 text-sm"
        />
      )}
    </div>
  );
}
