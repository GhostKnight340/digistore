"use client";

import { useEffect, useState } from "react";

import { improveCaptionAction } from "@/app/actions/instagramAi";
import { C } from "./tokens";
import { Icon } from "./Icon";

const AI_ACTIONS: [string, string][] = [
  ["correct", "Corriger"],
  ["engaging", "Rendre plus engageant"],
  ["shorten", "Raccourcir"],
  ["expand", "Développer légèrement"],
  ["cta", "Ajouter un appel à l’action"],
  ["natural", "Rendre plus naturel"],
  ["brand", "Adapter au ton Ghost.ma"],
  ["translate", "Traduire"],
  ["add_emoji", "Ajouter quelques emojis"],
  ["remove_emoji", "Retirer les emojis"],
];
const TONES = ["Neutre", "Amical", "Professionnel", "Enthousiaste"];
const LANGS = ["Français", "Arabe", "Anglais"];

type Step = "form" | "loading" | "compare";

/**
 * Right-side AI caption drawer. Text-only: the model receives caption + options,
 * never media. The caption is never auto-replaced — only "Utiliser cette version"
 * commits it (the parent stores the prior text for one-shot undo).
 */
export function AiDrawer({
  open,
  currentCaption,
  onClose,
  onApply,
  onToast,
}: {
  open: boolean;
  currentCaption: string;
  onClose: () => void;
  onApply: (proposal: string) => void;
  onToast: (text: string, tone: "ok" | "err" | "info") => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [action, setAction] = useState("engaging");
  const [tone, setTone] = useState(TONES[0]);
  const [language, setLanguage] = useState(LANGS[0]);
  const [productName, setProductName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState("");

  useEffect(() => {
    if (open) setStep("form");
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function generate() {
    setStep("loading");
    const res = await improveCaptionAction({ caption: currentCaption, action, tone, language, productName, instruction });
    if (res.ok && res.data) {
      setProposal(res.data.proposal);
      setStep("compare");
    } else {
      onToast(res.error ?? "Génération impossible.", "err");
      setStep("form");
    }
  }

  if (!open) return null;

  const selectStyle = {
    width: "100%",
    height: 36,
    padding: "0 10px",
    background: C.inset,
    border: `1px solid ${C.borderInput}`,
    borderRadius: 9,
    color: C.text,
    fontSize: 13,
    outline: "none",
  };
  const fieldLabel = { fontSize: 12, color: C.dim, display: "block" as const, marginBottom: 6 };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: "absolute", inset: 0, background: "rgba(4,5,6,0.55)", zIndex: 100 }}
    >
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "92%", background: "#0C0D11", borderLeft: `1px solid ${C.borderInput}`, boxShadow: "-30px 0 60px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column" }}>
        <div style={{ flexShrink: 0, padding: "18px 20px", borderBottom: `1px solid ${C.borderCard}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Améliorer la légende avec l’IA</div>
          <button type="button" aria-label="Fermer" onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.borderInput}`, background: C.surface, color: C.dim, cursor: "pointer" }}>
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          {step === "loading" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: C.aiText }}>
              <Icon name="sparkle" size={26} color={C.aiText} strokeWidth={0} style={{ fill: C.aiText }} />
              <span style={{ fontSize: 13 }}>Génération en cours…</span>
            </div>
          ) : step === "compare" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>Texte actuel</div>
                <div style={{ padding: "12px 13px", background: C.inset, border: `1px solid ${C.borderSubtle}`, borderRadius: 11, fontSize: 13, color: C.dim, lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto" }}>
                  {currentCaption || "(vide)"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: C.aiText, marginBottom: 6 }}>Proposition de l’IA</div>
                <div style={{ padding: "12px 13px", background: "rgba(124,92,252,0.08)", border: `1px solid rgba(124,92,252,0.3)`, borderRadius: 11, fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto" }}>
                  {proposal}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => onApply(proposal)} style={{ height: 36, padding: "0 15px", borderRadius: 9, border: "none", background: C.ai, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Utiliser cette version
                </button>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(proposal); onToast("Texte copié.", "ok"); }} style={ghostBtn}>
                  Copier
                </button>
                <button type="button" onClick={generate} style={ghostBtn}>
                  Réessayer
                </button>
                <button type="button" onClick={() => setStep("form")} style={ghostBtn}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ ...fieldLabel, marginBottom: 8 }}>Transformation</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {AI_ACTIONS.map(([key, label]) => {
                    const on = action === key;
                    return (
                      <button key={key} type="button" onClick={() => setAction(key)} style={{ height: 30, padding: "0 11px", borderRadius: 999, border: `1px solid ${on ? "rgba(124,92,252,0.5)" : C.borderInput}`, background: on ? "rgba(124,92,252,0.14)" : "transparent", color: on ? C.aiText : C.dim, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabel}>Ton</span>
                  <select value={tone} onChange={(e) => setTone(e.target.value)} style={selectStyle}>
                    {TONES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label>
                  <span style={fieldLabel}>Langue</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} style={selectStyle}>
                    {LANGS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </label>
              </div>
              <label>
                <span style={fieldLabel}>Produit / campagne (optionnel)</span>
                <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="ex. Steam Wallet" style={selectStyle} />
              </label>
              <label>
                <span style={fieldLabel}>Instruction libre (optionnel)</span>
                <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="ex. mentionner la livraison instantanée" style={{ ...selectStyle, height: 64, padding: "10px 11px", resize: "none" }} />
              </label>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                <Icon name="alert" size={13} color={C.muted} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                Seul le texte est envoyé à l’IA — jamais vos médias.
              </div>
              <button type="button" onClick={generate} style={{ height: 40, borderRadius: 10, border: "none", background: C.ai, color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
                Générer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ghostBtn = {
  height: 36,
  padding: "0 13px",
  borderRadius: 9,
  border: `1px solid ${C.borderInput}`,
  background: C.surface,
  color: C.dim,
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
} as const;
