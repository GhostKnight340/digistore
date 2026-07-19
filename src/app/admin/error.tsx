"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Admin error boundary. Terser than the customer one and it names the failing
 * path, but it still keeps the message and the stack out of the DOM — the
 * admin UI is behind auth, not behind a trust boundary we control end to end.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const path =
    typeof window === "undefined" ? "" : window.location.pathname;

  useEffect(() => {
    console.error("[admin/error]", {
      digest: error.digest,
      message: error.message,
      stack: error.stack,
      path,
    });
  }, [error, path]);

  return (
    <main className="container-page py-16">
      <section className="card mx-auto max-w-xl p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          Admin
        </p>
        <h1 className="mt-2 text-xl font-bold text-white">
          Cette section n&apos;a pas pu être chargée
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Le rendu a échoué. Les détails complets sont dans les logs serveur.
          Relancez le chargement, et si l&apos;erreur persiste, vérifiez
          l&apos;état des services dans Operations.
        </p>
        <dl className="mt-4 space-y-1 font-mono text-xs text-faint">
          {path && (
            <div className="flex gap-2">
              <dt>Route</dt>
              <dd className="text-muted">{path}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt>Référence</dt>
            <dd className="text-muted">{error.digest ?? "non disponible"}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Réessayer
          </button>
          <Link href="/admin" className="btn-ghost">
            Tableau de bord
          </Link>
          <Link href="/admin/operations" className="btn-ghost">
            Operations
          </Link>
        </div>
      </section>
    </main>
  );
}
