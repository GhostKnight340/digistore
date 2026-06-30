"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-md">
        <div className="card p-8">
          <div className="mb-6 grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
            {(["login", "register"] as const).map((item) => (
              <button
                key={item}
                onClick={() => setMode(item)}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  mode === item
                    ? "bg-accent text-white"
                    : "text-muted hover:text-white"
                }`}
              >
                {item === "login" ? "Connexion" : "Inscription"}
              </button>
            ))}
          </div>

          <h1 className="text-2xl font-bold text-white">
            {mode === "login" ? "Bon retour parmi nous" : "Créer un compte"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login"
              ? "Connectez-vous pour retrouver vos commandes et vos codes."
              : "Créez un compte pour suivre vos commandes et retrouver vos codes."}
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => e.preventDefault()}
          >
            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">
                  Nom complet
                </label>
                <input className="input" placeholder="Votre nom" />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white">
                E-mail
              </label>
              <input
                className="input"
                type="email"
                placeholder="vous@example.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white">
                Mot de passe
              </label>
              <input className="input" type="password" placeholder="••••••••" />
            </div>

            <button className="btn-primary w-full" type="submit">
              {mode === "login" ? "Se connecter" : "Créer le compte"}
            </button>
          </form>

          <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-center text-xs text-muted">
            Interface de démonstration: l'authentification n'est pas encore
            connectée en phase 1.
          </p>
        </div>

        <p className="mt-4 text-center text-sm text-muted">
          Vous voulez simplement acheter un produit ?{" "}
          <Link href="/products" className="text-accent hover:text-accent-hover">
            Parcourir le catalogue
          </Link>
        </p>
      </div>
    </div>
  );
}
