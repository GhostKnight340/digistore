"use client";

import { useEffect, useRef, useState } from "react";
import { uploadImageFile } from "@/lib/clientUpload";
import {
  getGtaPreorderSettingsAction,
  saveGtaPreorderHeroImageAction,
} from "@/app/actions/admin";

/**
 * Admin control for the GTA VI pre-order landing hero image. The site owner
 * uploads whatever image they want; it is stored (via the standard upload API +
 * a StoreSetting row) and shown full-bleed behind the hero. Removing it reverts
 * to the built-in generated hero. This panel is intentionally minimal — it only
 * manages that one image.
 */
export default function GtaPreorderPanel() {
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getGtaPreorderSettingsAction()
      .then((settings) => {
        if (!cancelled) setHeroImageUrl(settings.heroImageUrl);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function persist(url: string, successMessage: string) {
    setBusy(true);
    setStatus("");
    setError("");
    try {
      const result = await saveGtaPreorderHeroImageAction(url);
      if (result.ok) {
        setHeroImageUrl(url);
        setStatus(successMessage);
      } else {
        setError(result.error ?? "Enregistrement impossible.");
      }
    } catch {
      setError("Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setStatus("");
    setError("");
    try {
      const url = await uploadImageFile(file);
      await persist(url, "Image enregistrée. Elle apparaît sur la page de précommande.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible.");
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-canvas/95 p-4 backdrop-blur">
        <div>
          <h2 className="text-xl font-bold text-white">Précommande GTA VI</h2>
          <p className="text-sm text-muted">
            Image du hero de la page <code className="text-faint">/precommande-gta-6</code>.
          </p>
        </div>
        <a href="/precommande-gta-6" target="_blank" rel="noreferrer" className="btn-ghost h-10 px-4 text-xs">
          Voir la page ↗
        </a>
      </div>

      <section className="card p-5">
        <p className="text-xs uppercase tracking-wide text-muted">Image du hero</p>

        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
          {heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroImageUrl} alt="Aperçu du hero" className="max-h-64 w-full object-cover" />
          ) : (
            <div className="grid h-40 place-items-center px-6 text-center">
              <p className="text-sm text-muted">
                Aucune image — la page affiche le hero graphique généré par défaut.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || loading}
            className="btn-primary h-10 px-4 text-xs disabled:opacity-50"
          >
            {busy ? "Traitement…" : heroImageUrl ? "Remplacer l'image" : "Importer une image"}
          </button>
          {heroImageUrl ? (
            <button
              type="button"
              onClick={() => persist("", "Image retirée. Le hero par défaut est de nouveau affiché.")}
              disabled={busy}
              className="btn-ghost h-10 px-4 text-xs disabled:opacity-50"
            >
              Retirer l'image
            </button>
          ) : null}
        </div>

        {status ? <p className="mt-3 text-xs text-emerald-400">{status}</p> : null}
        {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}

        <p className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-[#d9c7a3]">
          PNG, JPG ou WebP, 5 Mo max. N&apos;importez que des visuels dont vous
          détenez les droits d&apos;utilisation. Ghost.ma n&apos;est pas affilié à
          Rockstar Games : n&apos;utilisez pas d&apos;artwork officiel GTA sans
          autorisation.
        </p>
      </section>
    </section>
  );
}
