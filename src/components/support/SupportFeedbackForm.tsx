"use client";

/**
 * Post-close support feedback: star rating (1-5, required) + optional comment.
 * Reached from the close email / account page via an unguessable token, which
 * is the only credential. One submission per ticket.
 */
import { useState } from "react";
import Link from "next/link";
import { submitSupportFeedbackAction } from "@/app/actions/support";
import { StarIcon } from "@/components/account/icons";

export default function SupportFeedbackForm({
  token,
  reference,
}: {
  token: string;
  reference: string;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (rating < 1) {
      setError("Choisissez une note entre 1 et 5 étoiles.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await submitSupportFeedbackAction(token, rating, comment.trim() || null);
      if (res.ok) {
        setDone(true);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Une erreur est survenue. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md card p-8 text-center">
        <h1 className="text-2xl font-bold text-white">Merci pour votre retour</h1>
        <p className="mt-2 text-sm text-muted">
          Votre avis sur la demande {reference} a bien été enregistré. Il nous aide à améliorer notre support.
        </p>
        <Link href="/account/support" className="btn-primary mt-6">
          Mes demandes
        </Link>
      </div>
    );
  }

  const active = hover || rating;

  return (
    <div className="mx-auto max-w-md card p-8">
      <h1 className="text-2xl font-bold text-white">Votre avis compte</h1>
      <p className="mt-2 text-sm text-muted">
        Comment s&apos;est passée votre expérience avec notre support pour la demande{" "}
        <span className="font-mono text-accent">{reference}</span> ?
      </p>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-wide text-faint">Votre note</p>
        <div className="mt-2 flex items-center gap-1.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              className={`transition ${n <= active ? "text-[#F7B14A]" : "text-faint hover:text-muted"}`}
            >
              <StarIcon className="h-8 w-8" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <label className="text-xs uppercase tracking-wide text-faint">Commentaire (facultatif)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Dites-nous ce qui s'est bien passé ou ce que nous pourrions améliorer."
          className="mt-1.5 w-full resize-y rounded-lg border border-border bg-base px-3 py-2.5 text-sm text-white placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        type="button"
        disabled={busy || rating < 1}
        onClick={submit}
        className="btn-primary mt-6 w-full disabled:opacity-50"
      >
        {busy ? "Envoi…" : "Envoyer mon avis"}
      </button>
    </div>
  );
}
