"use client";

import { useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

/**
 * "Ce guide vous a-t-il été utile ?" — a lightweight satisfaction signal. There
 * is no per-guide feedback endpoint, so this is intentionally client-only: it
 * records an aggregate GA event and shows a thank-you. A "Non" answer opens a
 * path to human support rather than leaving the customer stuck. We never display
 * a fabricated vote tally.
 */
export default function GuideHelpful({ slug }: { slug: string }) {
  const [answer, setAnswer] = useState<null | "yes" | "no">(null);

  function vote(value: "yes" | "no") {
    setAnswer(value);
    trackEvent("guide_helpful", { guide: slug, value });
  }

  return (
    <section className="mt-12 rounded-2xl border border-border bg-card p-6 text-center print:hidden">
      {answer === null ? (
        <>
          <h2 className="text-base font-semibold text-white">
            Ce guide vous a-t-il été utile&nbsp;?
          </h2>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => vote("yes")}
              className="btn-ghost inline-flex items-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />
                <path d="M7 11l4-7a2 2 0 0 1 2 1.5V9h5.5a2 2 0 0 1 2 2.4l-1.5 7a2 2 0 0 1-2 1.6H7" />
              </svg>
              Oui
            </button>
            <button
              type="button"
              onClick={() => vote("no")}
              className="btn-ghost inline-flex items-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1z" />
                <path d="M17 13l-4 7a2 2 0 0 1-2-1.5V15H5.5a2 2 0 0 1-2-2.4l1.5-7a2 2 0 0 1 2-1.6H17" />
              </svg>
              Non
            </button>
          </div>
        </>
      ) : (
        <div aria-live="polite">
          <p className="text-base font-semibold text-white">Merci pour votre retour&nbsp;!</p>
          {answer === "no" ? (
            <p className="mt-2 text-sm text-muted">
              Désolé que ce guide n&apos;ait pas répondu à votre question.{" "}
              <Link href="/support" className="font-medium text-accent hover:text-accent-hover">
                Contactez le support
              </Link>{" "}
              — nous vous aiderons directement.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Ravi que ce guide vous ait aidé à activer votre produit.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
