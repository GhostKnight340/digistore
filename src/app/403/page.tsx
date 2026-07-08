import Link from "next/link";

export const metadata = { title: "Accès refusé - ghost.ma" };

export default function ForbiddenPage() {
  return (
    <main className="container-page py-20">
      <section className="card mx-auto max-w-xl p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">403</p>
        <h1 className="mt-3 text-2xl font-bold text-white">Accès refusé</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Votre compte ghost.ma n'a pas accès à cette section.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Retour à la boutique
        </Link>
      </section>
    </main>
  );
}
