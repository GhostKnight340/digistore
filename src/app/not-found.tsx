import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-24">
      <div className="mx-auto max-w-md text-center">
        <p className="text-6xl font-extrabold text-accent">404</p>
        <h1 className="mt-4 text-2xl font-bold text-white">
          Page introuvable
        </h1>
        <p className="mt-2 text-sm text-muted">
          La page que vous cherchez n&apos;existe pas ou a été déplacée.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Retour à la boutique
        </Link>
      </div>
    </div>
  );
}
