"use client";

import { useEffect, useMemo, useState } from "react";
import { C } from "./tokens";

/** Two-digit helpers so date/time strings match the <input> value format. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Scheduling modal. Timezone is fixed to Africa/Casablanca (GMT+1) per the
 * handoff; the picked wall-clock is anchored to that offset server-side. The
 * live summary and suggested-time chips are cosmetic conveniences.
 */
export function ScheduleModal({
  open,
  busy,
  initialDate,
  initialTime,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  initialDate?: string | null;
  initialTime?: string | null;
  onCancel: () => void;
  onConfirm: (date: string, time: string) => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  useEffect(() => {
    if (!open) return;
    const tomorrow = new Date(Date.now() + 86_400_000);
    setDate(initialDate || dateStr(tomorrow));
    setTime(initialTime || "19:00");
  }, [open, initialDate, initialTime]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const suggestions = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(Date.now() + 86_400_000);
    return [
      { label: "Aujourd’hui 19:00", date: dateStr(now), time: "19:00" },
      { label: "Demain 09:00", date: dateStr(tomorrow), time: "09:00" },
      { label: "Demain 19:00", date: dateStr(tomorrow), time: "19:00" },
    ];
  }, []);

  const summary = useMemo(() => {
    if (!date || !time) return "Choisissez une date et une heure.";
    const d = new Date(`${date}T${time}`);
    if (Number.isNaN(d.getTime())) return "Date invalide.";
    return `Sera publié le ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })} à ${time} (GMT+1).`;
  }, [date, time]);

  if (!open) return null;

  const label = { fontSize: 12, color: C.dim, display: "block" as const, marginBottom: 6 };
  const input = {
    width: "100%",
    height: 38,
    padding: "0 11px",
    background: C.inset,
    border: `1px solid ${C.borderInput}`,
    borderRadius: 9,
    color: C.text,
    fontSize: 13,
    outline: "none",
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{ position: "absolute", inset: 0, background: "rgba(4,5,6,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ width: 420, maxWidth: "92%", background: C.card, border: `1px solid ${C.borderInput}`, borderRadius: 16, boxShadow: "0 30px 70px rgba(0,0,0,0.55)" }}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.borderCard}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Programmer la publication</span>
          <button type="button" aria-label="Fermer" onClick={onCancel} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.borderInput}`, background: C.surface, color: C.dim, cursor: "pointer" }}>
            ✕
          </button>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <span style={label}>Date</span>
              <input type="date" value={date} min={dateStr(new Date())} onChange={(e) => setDate(e.target.value)} style={input} />
            </label>
            <label>
              <span style={label}>Heure</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={input} />
            </label>
          </div>
          <div>
            <span style={label}>Fuseau horaire</span>
            <div style={{ height: 38, display: "flex", alignItems: "center", padding: "0 11px", background: C.inset, border: `1px solid ${C.borderSubtle}`, borderRadius: 9, color: C.muted, fontSize: 13 }}>
              Africa/Casablanca (GMT+1)
            </div>
          </div>
          <div>
            <span style={{ ...label, marginBottom: 8 }}>Heures suggérées</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setDate(s.date);
                    setTime(s.time);
                  }}
                  style={{ height: 30, padding: "0 12px", borderRadius: 8, border: `1px solid rgba(255,255,255,0.1)`, background: C.surface, color: C.text2, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: C.accentText, background: "rgba(62,123,250,0.08)", border: `1px solid rgba(62,123,250,0.2)`, borderRadius: 10, padding: "10px 12px" }}>
            {summary}
          </div>
        </div>
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.borderCard}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ height: 36, padding: "0 15px", borderRadius: 9, border: `1px solid rgba(255,255,255,0.12)`, background: "transparent", color: C.text2, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            Annuler
          </button>
          <button type="button" disabled={busy} onClick={() => onConfirm(date, time)} style={{ height: 36, padding: "0 17px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "…" : "Programmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
