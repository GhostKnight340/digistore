"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Customer-facing error boundary. Renders for any uncaught error in a route
 * segment below the root layout. We surface the Next.js digest as a short
 * reference id (safe, opaque) but never the message or the stack.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Full detail stays in the server/browser logs, not in the DOM.
    console.error("[app/error]", {
      digest: error.digest,
      message: error.message,
      stack: error.stack,
      path: typeof window === "undefined" ? undefined : window.location.pathname,
    });
  }, [error]);

  return (
    <main className="container-page py-20">
      <section className="card mx-auto max-w-xl p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">
          Erreur
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white">
          Une erreur est survenue
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Nous n&apos;avons pas pu afficher cette page. Le problème vient de
          notre côté — réessayez dans un instant, vos données sont intactes.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Réessayer
          </button>
          <Link href="/" className="btn-ghost">
            Retour à la boutique
          </Link>
        </div>
        <p className="mt-6 text-xs text-faint">
          Le problème persiste ?{" "}
          <Link href="/support" className="text-accent hover:underline">
            Contactez le support
          </Link>
          .
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-faint">
            Référence : {error.digest}
          </p>
        )}
      </section>
    </main>
  );
}
