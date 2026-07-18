"use client";

import { useState } from "react";
import { uploadImageFile } from "@/lib/clientUpload";
import {
  GUIDE_DIFFICULTIES,
  GUIDE_DIFFICULTY_LABELS,
  type GuideStep,
  type GuideTroubleshootingItem,
} from "@/lib/guide";

/**
 * Authoring UI for the article-template fields from the design handoff:
 * the hero meta (difficulté / durée / régions / appareils / lien officiel /
 * éditeur / vérification), the "Ce qu'il vous faut" checklist, the numbered
 * step cards, and the troubleshooting accordion.
 *
 * Everything here is optional. Leaving a field empty means the public article
 * simply doesn't render that chip or section — the front end never invents a
 * difficulty or device list, so an unfinished guide degrades cleanly.
 */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

/** Reusable "add / remove" list of short text labels. */
function LabelListEditor({
  label,
  hint,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  }

  return (
    <Field label={label} hint={hint}>
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted"
            >
              {v}
              <button
                type="button"
                aria-label={`Retirer ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-faint transition hover:text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <button type="button" className="btn-ghost" onClick={add}>
          Ajouter
        </button>
      </div>
    </Field>
  );
}

let stepCounter = 0;
function newStepId() {
  stepCounter += 1;
  return `step-new-${stepCounter}-${stepCounter * 13}`;
}

export default function GuideArticleEditor({
  difficulty,
  durationMinutes,
  supportedRegions,
  supportedDevices,
  officialUrl,
  vendor,
  verifiedAt,
  verifiedBy,
  requirements,
  steps,
  troubleshooting,
  onUpdate,
}: {
  difficulty: string;
  durationMinutes: number | null;
  supportedRegions: string[];
  supportedDevices: string[];
  officialUrl: string;
  vendor: string;
  verifiedAt: string | null;
  verifiedBy: string;
  requirements: string[];
  steps: GuideStep[];
  troubleshooting: GuideTroubleshootingItem[];
  /** Generic setter so the parent keeps owning the draft. */
  onUpdate: (key: string, value: unknown) => void;
}) {
  const [uploadingStep, setUploadingStep] = useState<string | null>(null);

  function updateStep(index: number, next: GuideStep) {
    const copy = [...steps];
    copy[index] = next;
    onUpdate("steps", copy);
  }
  function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const copy = [...steps];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onUpdate("steps", copy);
  }

  async function uploadStepShot(index: number, file: File) {
    const step = steps[index];
    setUploadingStep(step.id);
    try {
      const url = await uploadImageFile(file);
      updateStep(index, { ...step, screenshotUrl: url });
    } catch {
      /* upload helper surfaces its own failure state */
    } finally {
      setUploadingStep(null);
    }
  }

  // Local ISO ↔ datetime-local conversion for the verification stamp.
  const verifiedLocal = verifiedAt
    ? new Date(new Date(verifiedAt).getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10)
    : "";

  return (
    <div className="card space-y-5 p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Article (en-tête et contenu)</h3>
        <p className="mt-1 text-xs text-muted">
          Ces champs alimentent l&apos;en-tête du guide public. Un champ vide masque
          simplement sa puce — rien n&apos;est deviné automatiquement.
        </p>
      </div>

      {/* Hero meta */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Difficulté" hint="Vide = aucune puce difficulté.">
          <select
            className="input"
            value={difficulty}
            onChange={(e) => onUpdate("difficulty", e.target.value)}
          >
            <option value="">— Non définie —</option>
            {GUIDE_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {GUIDE_DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Durée (minutes)"
          hint="Vide = estimation automatique affichée avec « ≈ »."
        >
          <input
            type="number"
            min={1}
            max={120}
            className="input"
            value={durationMinutes ?? ""}
            onChange={(e) =>
              onUpdate("durationMinutes", e.target.value ? Number(e.target.value) : null)
            }
            placeholder="ex. 3"
          />
        </Field>
        <Field label="Lien officiel" hint="Bouton « Ouvrir le site officiel » + copie.">
          <input
            className="input"
            value={officialUrl}
            onChange={(e) => onUpdate("officialUrl", e.target.value)}
            placeholder="https://store.steampowered.com/…"
          />
        </Field>
        <Field label="Éditeur" hint="Affiché en sur-titre : « STEAM · VALVE ».">
          <input
            className="input"
            value={vendor}
            onChange={(e) => onUpdate("vendor", e.target.value)}
            placeholder="ex. Valve"
          />
        </Field>
        <Field label="Vérifié le" hint="Avec « Vérifié par » : affiche la ligne de contrôle.">
          <input
            type="date"
            className="input"
            value={verifiedLocal}
            onChange={(e) =>
              onUpdate("verifiedAt", e.target.value ? new Date(e.target.value).toISOString() : null)
            }
          />
        </Field>
        <Field label="Vérifié par">
          <input
            className="input"
            value={verifiedBy}
            onChange={(e) => onUpdate("verifiedBy", e.target.value)}
            placeholder="ex. l'équipe Ghost.ma"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LabelListEditor
          label="Régions supportées"
          hint="Ex. « Selon carte », « Europe »."
          placeholder="ex. Selon carte"
          values={supportedRegions}
          onChange={(v) => onUpdate("supportedRegions", v)}
        />
        <LabelListEditor
          label="Appareils supportés"
          hint="Ex. PC, Mac, Mobile."
          placeholder="ex. PC"
          values={supportedDevices}
          onChange={(v) => onUpdate("supportedDevices", v)}
        />
      </div>

      <LabelListEditor
        label="Ce qu'il vous faut"
        hint="Liste à cocher affichée dans « Avant de commencer »."
        placeholder="ex. Un compte Steam actif"
        values={requirements}
        onChange={(v) => onUpdate("requirements", v)}
      />

      {/* Steps */}
      <div className="border-t border-border pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-white">Étapes ({steps.length})</h4>
          <button
            type="button"
            className="btn-ghost h-8 px-3 text-xs"
            onClick={() =>
              onUpdate("steps", [
                ...steps,
                {
                  id: newStepId(),
                  title: "",
                  description: "",
                  tip: "",
                  warning: "",
                  screenshotUrl: "",
                },
              ])
            }
          >
            + Ajouter une étape
          </button>
        </div>
        {steps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
            Aucune étape structurée. Le guide affichera son contenu libre à la place.
          </p>
        ) : (
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-faint">Étape {index + 1}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn-ghost h-7 px-2 text-xs"
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      aria-label="Monter l'étape"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-ghost h-7 px-2 text-xs"
                      onClick={() => moveStep(index, 1)}
                      disabled={index === steps.length - 1}
                      aria-label="Descendre l'étape"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-ghost h-7 px-2 text-xs text-red-400"
                      onClick={() => onUpdate("steps", steps.filter((_, i) => i !== index))}
                      aria-label="Supprimer l'étape"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <input
                    className="input"
                    value={step.title}
                    onChange={(e) => updateStep(index, { ...step, title: e.target.value })}
                    placeholder="Titre de l'étape"
                  />
                  <textarea
                    className="input min-h-[60px]"
                    value={step.description}
                    onChange={(e) => updateStep(index, { ...step, description: e.target.value })}
                    placeholder="Description (facultatif)"
                  />
                  <textarea
                    className="input min-h-[46px]"
                    value={step.tip}
                    onChange={(e) => updateStep(index, { ...step, tip: e.target.value })}
                    placeholder="Astuce verte (facultatif)"
                  />
                  <textarea
                    className="input min-h-[46px]"
                    value={step.warning}
                    onChange={(e) => updateStep(index, { ...step, warning: e.target.value })}
                    placeholder="Avertissement rouge (facultatif)"
                  />
                  {/* Screenshot — the public article renders the block only once
                      a real image exists, so this stays empty until uploaded. */}
                  <div className="flex items-center gap-3">
                    {step.screenshotUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={step.screenshotUrl}
                        alt=""
                        className="h-12 w-20 rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <span className="grid h-12 w-20 place-items-center rounded-lg border border-dashed border-border text-[10px] text-faint">
                        capture
                      </span>
                    )}
                    <label className="btn-ghost cursor-pointer text-xs">
                      {uploadingStep === step.id ? "Envoi…" : "Importer une capture"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadStepShot(index, file);
                        }}
                      />
                    </label>
                    {step.screenshotUrl && (
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => updateStep(index, { ...step, screenshotUrl: "" })}
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Troubleshooting */}
      <div className="border-t border-border pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-white">
            Dépannage ({troubleshooting.length})
          </h4>
          <button
            type="button"
            className="btn-ghost h-8 px-3 text-xs"
            onClick={() =>
              onUpdate("troubleshooting", [
                ...troubleshooting,
                { id: newStepId(), question: "", answer: "" },
              ])
            }
          >
            + Ajouter un cas
          </button>
        </div>
        {troubleshooting.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
            Aucun cas de dépannage.
          </p>
        ) : (
          <ul className="space-y-2">
            {troubleshooting.map((item, index) => (
              <li key={item.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-faint">Cas {index + 1}</span>
                  <button
                    type="button"
                    className="btn-ghost h-7 px-2 text-xs text-red-400"
                    onClick={() =>
                      onUpdate(
                        "troubleshooting",
                        troubleshooting.filter((_, i) => i !== index),
                      )
                    }
                    aria-label="Supprimer le cas"
                  >
                    ×
                  </button>
                </div>
                <input
                  className="input mb-2"
                  value={item.question}
                  onChange={(e) => {
                    const copy = [...troubleshooting];
                    copy[index] = { ...item, question: e.target.value };
                    onUpdate("troubleshooting", copy);
                  }}
                  placeholder="Symptôme, ex. « Le code est refusé »"
                />
                <textarea
                  className="input min-h-[60px]"
                  value={item.answer}
                  onChange={(e) => {
                    const copy = [...troubleshooting];
                    copy[index] = { ...item, answer: e.target.value };
                    onUpdate("troubleshooting", copy);
                  }}
                  placeholder="Que faire"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
