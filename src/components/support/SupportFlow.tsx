"use client";

/**
 * Guided support flow (/support) — progressive disclosure per the
 * "Ghost.ma Guided Support Experience" handoff: category → sub-issue →
 * (self-help) → (order) → contact → review → success. Single view with an
 * internal step machine + back-stack; no chatbot, no full-page reloads.
 * All copy in French. Chrome (Navbar/Footer) comes from the root layout.
 */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { submitSupportTicketAction } from "@/app/actions/support";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_HELP,
  findSupportCategory,
  findSupportSubIssue,
} from "@/lib/support/config";

export type SupportOrderOption = {
  id: string; // internal order id
  publicNumber: string; // "#000128"
  href: string; // customer order page
  product: string;
  date: string;
  status: string; // short French status label
  statusTone: "green" | "amber" | "blue" | "red" | "gray";
  amount: string;
  tag: string;
};

type Step = "category" | "subissue" | "selfhelp" | "order" | "contact" | "review" | "success";

type AttachedFile = { fileName: string; mimeType: string; dataBase64: string };

const EMAIL_RE = /.+@.+\..+/;
const MAX_FILES = 3;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const STATUS_TONE_CLASS: Record<SupportOrderOption["statusTone"], string> = {
  green: "text-[#4fe0a0] bg-[rgba(59,200,140,0.14)]",
  amber: "text-[#f0c04f] bg-[rgba(240,192,79,0.14)]",
  blue: "text-[#7db0ff] bg-[rgba(91,157,255,0.14)]",
  red: "text-red-300 bg-red-500/15",
  gray: "text-muted bg-surface2",
};

/* Category icons — stroke line icons per the handoff. */
function CategoryIcon({ cat }: { cat: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#7db0ff",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (cat) {
    case "paiement":
      return (<svg {...common}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19" /></svg>);
    case "livraison":
      return (<svg {...common}><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></svg>);
    case "code":
      return (<svg {...common}><circle cx="8" cy="8" r="4.2" /><path d="M11 11l8 8" /><path d="M16 16l2-2" /><path d="M19 19l1.5-1.5" /></svg>);
    case "commande":
      return (<svg {...common}><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>);
    case "remboursement":
      return (<svg {...common}><path d="M4 9a8 8 0 0 1 14-4l2 2" /><path d="M20 5v4h-4" /><path d="M20 15a8 8 0 0 1-14 4l-2-2" /><path d="M4 19v-4h4" /></svg>);
    case "compte":
      return (<svg {...common}><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></svg>);
    case "technique":
      return (<svg {...common}><path d="M14.7 6.3a3.7 3.7 0 0 0-4.9 4.9L4 17l3 3 5.8-5.8a3.7 3.7 0 0 0 4.9-4.9l-2.3 2.3-2-2 2.3-2.3z" /></svg>);
    default:
      return (<svg {...common}><path d="M4 5h16v11H8l-4 4V5z" /><path d="M9 10h.01M12 10h.01M15 10h.01" /></svg>);
  }
}

function stageOf(step: Step): number {
  if (step === "category" || step === "subissue" || step === "selfhelp") return 1;
  if (step === "order" || step === "contact") return 2;
  return 3;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function SupportFlow({
  orders,
  initialName,
  initialEmail,
}: {
  orders: SupportOrderOption[];
  initialName: string;
  initialEmail: string;
}) {
  const [step, setStep] = useState<Step>("category");
  const [hist, setHist] = useState<Step[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [order, setOrder] = useState<{ label: string; manual: boolean } | null>(null);
  const [manual, setManual] = useState("");
  const [form, setForm] = useState({ name: initialName, email: initialEmail, phone: "", message: "" });
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const category = cat ? findSupportCategory(cat) : undefined;
  const subIssue = cat && sub ? findSupportSubIssue(cat, sub) : undefined;
  const help = subIssue?.helpId ? SUPPORT_HELP[subIssue.helpId] : undefined;

  const emailOk = EMAIL_RE.test(form.email.trim());
  const canContinue = form.name.trim().length > 0 && emailOk;
  // Generic ("Autre…") issues keep the message non-optional to encourage detail.
  const messageOptional = Boolean(subIssue) && !subIssue?.isGeneric;

  const go = (next: Step) => {
    setHist((h) => [...h, step]);
    setStep(next);
  };
  const back = () => {
    setHist((h) => {
      const copy = [...h];
      const prev = copy.pop() ?? "category";
      setStep(prev);
      return copy;
    });
  };
  const reset = () => {
    setStep("category");
    setHist([]);
    setCat(null);
    setSub(null);
    setOrder(null);
    setManual("");
    setForm({ name: initialName, email: initialEmail, phone: "", message: "" });
    setFiles([]);
    setFileError(null);
    setSubmitError(null);
    setReference(null);
  };

  const pickCat = (key: string) => {
    setCat(key);
    setSub(null);
    setOrder(null);
    go("subissue");
  };
  const pickSub = (id: string) => {
    setSub(id);
    const picked = cat ? findSupportSubIssue(cat, id) : undefined;
    if (picked?.helpId && SUPPORT_HELP[picked.helpId]) go("selfhelp");
    else if (category?.needsOrder) go("order");
    else go("contact");
  };
  const helpPersist = () => go(category?.needsOrder ? "order" : "contact");
  const pickOrder = (label: string, isManual: boolean) => {
    setOrder({ label, manual: isManual });
    go("contact");
  };
  const useManual = () => {
    const v = manual.trim();
    if (!v) return;
    pickOrder(v.toUpperCase().startsWith("GH") || v.startsWith("#") ? v.toUpperCase() : `#${v}`, true);
  };

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    setFileError(null);
    const next: AttachedFile[] = [];
    for (const file of [...list].slice(0, MAX_FILES)) {
      if (file.size > MAX_FILE_BYTES) {
        setFileError(`« ${file.name} » dépasse 2 Mo.`);
        continue;
      }
      try {
        next.push({ fileName: file.name, mimeType: file.type, dataBase64: await fileToBase64(file) });
      } catch {
        setFileError(`Impossible de lire « ${file.name} ».`);
      }
    }
    setFiles(next);
  };

  const submit = async () => {
    if (!cat || !sub || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitSupportTicketAction({
        category: cat,
        subIssue: sub,
        orderRef: order?.label ?? null,
        name: form.name,
        email: form.email,
        phone: form.phone,
        message: form.message,
        attachments: files,
      });
      if (result.ok) {
        setReference(result.reference);
        setHist((h) => [...h, "review"]);
        setStep("success");
      } else {
        setSubmitError(result.error);
      }
    } catch {
      setSubmitError("Une erreur est survenue. Réessayez dans un instant.");
    } finally {
      setSubmitting(false);
    }
  };

  const stage = stageOf(step);
  const canBack = step !== "category" && step !== "success";
  const fileLabel =
    files.length === 0
      ? "Glissez un fichier ou cliquez pour ajouter"
      : files.length === 1
        ? files[0].fileName
        : `${files.length} fichiers sélectionnés`;

  const stepKey = useMemo(() => `${step}-${cat ?? ""}-${sub ?? ""}`, [step, cat, sub]);

  return (
    <div className="container-page pb-20 pt-12">
      <style>{`@keyframes gsStepIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* In-flow back + subtle progress (steps 2+, never on landing/success) */}
      {canBack && (
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] font-semibold text-[#aeb4c4] transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            <span className="-mt-px text-[15px] leading-none">‹</span> Retour
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-faint">Étape {stage} sur 3</span>
            <div className="flex gap-1">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={`h-[3px] w-5 rounded-sm transition-colors ${
                    stage >= n ? "bg-gradient-to-r from-[#3f83ff] to-[#5b9dff]" : "bg-white/10"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div key={stepKey} style={{ animation: "gsStepIn .3s ease both" }}>
        {/* ── Category landing ── */}
        {step === "category" && (
          <div>
            <div className="max-w-[680px]">
              <p className="mb-3 text-[12.5px] font-bold uppercase tracking-[0.14em] text-[#4d7fff]">GHOST.MA</p>
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-[38px]">
                Comment pouvons-nous vous aider&nbsp;?
              </h1>
              <p className="mt-3 text-[15.5px] leading-relaxed text-muted">
                Sélectionnez le sujet qui correspond à votre demande. Nous vous guiderons vers la solution la plus adaptée.
              </p>
            </div>
            <div className="mb-6 mt-5 h-px bg-white/[0.07]" />

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
              {SUPPORT_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => pickCat(c.key)}
                  className="flex items-start gap-3 rounded-[13px] border border-white/[0.075] bg-white/[0.02] p-3.5 text-left transition hover:border-[rgba(91,157,255,0.45)] hover:bg-[rgba(59,120,255,0.045)]"
                >
                  <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-[rgba(91,157,255,0.22)] bg-[rgba(59,120,255,0.11)]">
                    <CategoryIcon cat={c.key} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-bold text-white">{c.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-faint">{c.description}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* Quick actions — real routes only */}
            <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-white/[0.07] pt-5">
              <span className="mr-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-faint">Actions rapides</span>
              <Link
                href="/find-order"
                className="inline-flex items-center gap-2 rounded-[9px] border border-white/[0.07] bg-white/[0.03] px-3.5 py-2 text-[13px] font-semibold text-[#c1c7d6] transition hover:border-[rgba(91,157,255,0.42)] hover:bg-[rgba(59,120,255,0.09)] hover:text-white"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7db0ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h13l3 3v7h-3" /><path d="M3 7v10h3" /><circle cx="8" cy="17" r="1.8" /><circle cx="17" cy="17" r="1.8" /></svg>
                Suivre une commande
              </Link>
              <Link
                href="/account/orders"
                className="inline-flex items-center gap-2 rounded-[9px] border border-white/[0.07] bg-white/[0.03] px-3.5 py-2 text-[13px] font-semibold text-[#c1c7d6] transition hover:border-[rgba(91,157,255,0.42)] hover:bg-[rgba(59,120,255,0.09)] hover:text-white"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7db0ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2V4z" /><path d="M9 9h6M9 13h4" /></svg>
                Consulter mes commandes
              </Link>
            </div>
          </div>
        )}

        {/* ── Sub-issue ── */}
        {step === "subissue" && category && (
          <div className="max-w-[720px]">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#7db0ff]">{category.label}</p>
            <h2 className="mb-5 text-[25px] font-extrabold leading-tight tracking-tight text-white [text-wrap:balance]">
              {category.question}
            </h2>
            <div className="flex flex-col gap-2.5">
              {category.subs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSub(s.id)}
                  className="flex w-full items-center justify-between gap-3.5 rounded-[14px] border border-white/[0.075] bg-white/[0.02] py-4 pl-[18px] pr-4 text-left transition hover:border-[rgba(91,157,255,0.42)] hover:bg-[rgba(59,120,255,0.05)]"
                >
                  <span className="text-[14.5px] font-semibold leading-snug text-[#e9ebf2]">{s.label}</span>
                  <span className="shrink-0 text-xl leading-none text-[#5b9dff]">›</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Self-help ── */}
        {step === "selfhelp" && help && subIssue && (
          <div className="max-w-[720px]">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#7db0ff]">{subIssue.label}</p>
            <h2 className="mb-4 text-[25px] font-extrabold leading-tight tracking-tight text-white">{help.title}</h2>
            <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.02] px-5 py-2">
              {help.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-3 border-b border-white/[0.06] py-3.5 last:border-b-0">
                  <span className="mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-[rgba(91,157,255,0.3)] bg-[rgba(59,120,255,0.16)] text-[11px] font-extrabold text-[#7db0ff]">✓</span>
                  <span className="text-sm leading-relaxed text-[#c8cdda]">{tip}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={helpPersist}
                className="min-w-[190px] flex-1 rounded-[13px] border border-[rgba(120,170,255,0.6)] bg-gradient-to-b from-[#3f83ff] to-[#2f6cf0] px-5 py-3.5 text-[14.5px] font-bold text-white shadow-[0_6px_20px_rgba(47,108,240,0.35)] transition hover:-translate-y-px hover:brightness-105"
              >
                Le problème persiste
              </button>
              <button
                type="button"
                onClick={back}
                className="rounded-[13px] border border-white/[0.09] bg-white/[0.04] px-5 py-3.5 text-[14.5px] font-semibold text-[#aeb4c4] transition hover:bg-white/[0.07] hover:text-white"
              >
                Retour
              </button>
            </div>
          </div>
        )}

        {/* ── Order selection ── */}
        {step === "order" && category && (
          <div className="max-w-[720px]">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#7db0ff]">{category.label}</p>
            <h2 className="mb-1.5 text-[25px] font-extrabold leading-tight tracking-tight text-white">
              Quelle commande est concernée&nbsp;?
            </h2>
            <p className="mb-5 text-sm text-muted">Sélectionnez une commande récente ou saisissez un numéro.</p>

            {orders.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => pickOrder(o.publicNumber, false)}
                    className="flex w-full items-center gap-3.5 rounded-[15px] border border-white/[0.075] bg-white/[0.02] px-4 py-3.5 text-left transition hover:border-[rgba(91,157,255,0.42)] hover:bg-[rgba(59,120,255,0.05)]"
                  >
                    <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[11px] border border-[rgba(91,157,255,0.2)] bg-[rgba(59,120,255,0.1)] text-[11px] font-extrabold tracking-wide text-[#7db0ff]">
                      {o.tag}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-0.5 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white">{o.publicNumber}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE_CLASS[o.statusTone]}`}>
                          {o.status}
                        </span>
                      </span>
                      <span className="block truncate text-[13px] text-[#a4aabb]">{o.product}</span>
                      <span className="mt-0.5 block text-xs text-faint">{o.date}</span>
                    </span>
                    <span className="shrink-0 text-sm font-extrabold text-white">{o.amount}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-[15px] border border-white/[0.07] bg-white/[0.02] p-4">
              <label className="mb-2 block text-[13px] font-semibold text-[#a4aabb]">
                Entrer un numéro de commande manuellement
              </label>
              <div className="flex flex-wrap gap-2.5">
                <input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && useManual()}
                  placeholder="#000000"
                  className="input min-w-[150px] flex-1"
                />
                <button
                  type="button"
                  onClick={useManual}
                  className="rounded-[11px] border border-[rgba(91,157,255,0.35)] bg-[rgba(59,120,255,0.14)] px-4 py-3 text-sm font-bold text-[#9dc2ff] transition hover:bg-[rgba(59,120,255,0.22)]"
                >
                  Utiliser
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => go("contact")}
              className="mt-3.5 w-full p-1.5 text-[13.5px] font-semibold text-[#7b8298] transition hover:text-white"
            >
              Je ne connais pas ma commande — continuer sans
            </button>
          </div>
        )}

        {/* ── Contact ── */}
        {step === "contact" && category && (
          <div className="max-w-[720px]">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#7db0ff]">{category.label}</p>
            <h2 className="mb-1.5 text-[25px] font-extrabold leading-tight tracking-tight text-white">Vos coordonnées</h2>
            <p className="mb-5 text-sm text-muted">Pour que notre équipe puisse revenir vers vous.</p>

            <div className="flex flex-col gap-4 rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-5">
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-[#a4aabb]">Nom complet</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Votre nom" className="input" />
              </div>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                <div>
                  <label className="mb-1.5 block text-[12.5px] font-semibold text-[#a4aabb]">Adresse e-mail</label>
                  <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" placeholder="vous@exemple.com" className="input" />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12.5px] font-semibold text-[#a4aabb]">
                    Téléphone / WhatsApp <span className="font-medium text-[#5b6070]">· facultatif</span>
                  </label>
                  <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+212 6 00 00 00 00" className="input" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-[#a4aabb]">
                  Informations complémentaires{" "}
                  {messageOptional && <span className="font-medium text-[#5b6070]">· facultatif</span>}
                </label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  rows={3}
                  placeholder="Décrivez votre situation…"
                  className="input min-h-[78px] resize-y leading-relaxed"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-[#a4aabb]">
                  Pièce jointe <span className="font-medium text-[#5b6070]">· capture ou justificatif, facultatif</span>
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/[0.16] bg-black/20 px-4 py-[15px] text-left transition hover:border-[rgba(91,157,255,0.4)] hover:bg-[rgba(59,120,255,0.05)]"
                >
                  <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-[rgba(91,157,255,0.25)] bg-[rgba(59,120,255,0.12)]">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#7db0ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
                  </span>
                  <span className="text-[13.5px] text-[#9aa0b2]">{fileLabel}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                  onChange={(e) => onFiles(e.target.files)}
                  className="hidden"
                />
                {fileError && <p className="mt-1.5 text-xs text-red-400">{fileError}</p>}
              </div>
            </div>

            <button
              type="button"
              disabled={!canContinue}
              onClick={() => canContinue && go("review")}
              className={`mt-5 w-full rounded-[14px] border px-4 py-4 text-[15px] font-bold transition ${
                canContinue
                  ? "border-[rgba(120,170,255,0.6)] bg-gradient-to-b from-[#3f83ff] to-[#2f6cf0] text-white shadow-[0_8px_26px_rgba(47,108,240,0.4)] hover:-translate-y-px hover:brightness-105"
                  : "cursor-not-allowed border-white/[0.09] bg-white/[0.05] text-[#5b6070]"
              }`}
            >
              Continuer
            </button>
            <p className="mt-3 text-center text-xs text-[#5b6070]">
              {canContinue
                ? "Tout est prêt — vous pourrez vérifier avant l'envoi."
                : "Renseignez au moins votre nom et un e-mail valide."}
            </p>
          </div>
        )}

        {/* ── Review ── */}
        {step === "review" && category && subIssue && (
          <div className="max-w-[720px]">
            <h2 className="mb-1.5 text-[25px] font-extrabold leading-tight tracking-tight text-white">Votre demande</h2>
            <p className="mb-5 text-sm text-muted">Vérifiez les informations avant l'envoi. Vous pouvez tout modifier.</p>

            <div className="overflow-hidden rounded-[18px] border border-white/[0.07] bg-white/[0.02]">
              {(
                [
                  { label: "Sujet", value: category.label, edit: "category" as Step },
                  { label: "Problème", value: subIssue.label, edit: "subissue" as Step },
                  ...(order ? [{ label: "Commande", value: order.label, edit: "order" as Step }] : []),
                ] as { label: string; value: string; edit: Step }[]
              ).map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3.5 border-b border-white/[0.06] px-[18px] py-4">
                  <div>
                    <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-wide text-faint">{row.label}</span>
                    <span className="text-[14.5px] font-semibold leading-snug text-[#e9ebf2]">{row.value}</span>
                  </div>
                  <button type="button" onClick={() => go(row.edit)} className="shrink-0 text-[13px] font-bold text-[#5b9dff] hover:text-[#7db0ff]">
                    Modifier
                  </button>
                </div>
              ))}
              <div className="flex items-start justify-between gap-3.5 px-[18px] py-4">
                <div className="min-w-0">
                  <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-wide text-faint">Contact</span>
                  <span className="text-[14.5px] font-semibold text-[#e9ebf2]">
                    {[form.name, form.email].filter(Boolean).join(" · ")}
                  </span>
                  {form.message.trim() && (
                    <span className="mt-1.5 block text-[13px] leading-relaxed text-muted">{form.message}</span>
                  )}
                  {files.length > 0 && (
                    <span className="mt-1 block text-xs text-faint">
                      {files.length} pièce{files.length > 1 ? "s" : ""} jointe{files.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <button type="button" onClick={() => go("contact")} className="shrink-0 text-[13px] font-bold text-[#5b9dff] hover:text-[#7db0ff]">
                  Modifier
                </button>
              </div>
            </div>

            {submitError && <p className="mt-3 text-sm text-red-400">{submitError}</p>}
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="mt-5 w-full rounded-[14px] border border-[rgba(120,170,255,0.6)] bg-gradient-to-b from-[#3f83ff] to-[#2f6cf0] px-4 py-4 text-[15px] font-bold text-white shadow-[0_8px_26px_rgba(47,108,240,0.4)] transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
            </button>
          </div>
        )}

        {/* ── Success ── */}
        {step === "success" && category && (
          <div className="mx-auto mt-5 max-w-[500px] text-center">
            <div className="mx-auto mb-5 grid h-[74px] w-[74px] place-items-center rounded-full border border-[rgba(80,220,160,0.45)] shadow-[0_0_40px_rgba(59,200,140,0.25)] [background:radial-gradient(circle_at_50%_35%,rgba(59,200,140,0.28),rgba(59,200,140,0.08))]">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4fe0a0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 6.5" /></svg>
            </div>
            <h2 className="mb-3 text-[28px] font-extrabold leading-tight tracking-tight text-white">
              Votre demande a bien été envoyée
            </h2>
            <p className="mx-auto mb-6 max-w-[420px] text-[15px] leading-relaxed text-muted">
              Notre équipe a reçu votre demande. Vous recevrez une réponse à l'adresse indiquée.
            </p>

            <div className="mb-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] text-left">
              <div className="flex justify-between gap-3 border-b border-white/[0.06] px-[18px] py-3.5">
                <span className="text-[13px] text-muted">Référence</span>
                <span className="font-mono text-[13.5px] font-bold text-[#7db0ff]">{reference}</span>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/[0.06] px-[18px] py-3.5">
                <span className="text-[13px] text-muted">Catégorie</span>
                <span className="text-[13.5px] font-semibold text-[#e9ebf2]">{category.label}</span>
              </div>
              {order && (
                <div className="flex justify-between gap-3 border-b border-white/[0.06] px-[18px] py-3.5">
                  <span className="text-[13px] text-muted">Commande</span>
                  <span className="text-[13.5px] font-semibold text-[#e9ebf2]">{order.label}</span>
                </div>
              )}
              <div className="flex justify-between gap-3 px-[18px] py-3.5">
                <span className="text-[13px] text-muted">Prochaine étape</span>
                <span className="text-[13.5px] font-semibold text-[#e9ebf2]">Réponse sous 24 h</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="min-w-[170px] flex-1 rounded-[13px] border border-[rgba(120,170,255,0.6)] bg-gradient-to-b from-[#3f83ff] to-[#2f6cf0] px-4 py-3.5 text-[14.5px] font-bold text-white shadow-[0_6px_20px_rgba(47,108,240,0.35)] transition hover:-translate-y-px hover:brightness-105"
              >
                Retour à l'accueil
              </Link>
              <button
                type="button"
                onClick={reset}
                className="min-w-[170px] flex-1 rounded-[13px] border border-white/[0.09] bg-white/[0.04] px-4 py-3.5 text-[14.5px] font-semibold text-[#c8cdda] transition hover:bg-white/[0.07] hover:text-white"
              >
                Nouvelle demande
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
