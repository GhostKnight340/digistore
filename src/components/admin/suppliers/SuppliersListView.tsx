"use client";

import { useState } from "react";
import Link from "next/link";
import {
  refreshSupplierBalanceAction,
  testSupplierConnectionAction,
} from "@/app/actions/supplierManagement";
import { revalidateAllMappingsAction } from "@/app/actions/variantMappings";
import type { SupplierCardDTO } from "@/lib/dto";
import {
  EnvironmentBadge,
  SupplierHealthBadge,
  SupplierLogoTile,
  formatSupplierDate,
} from "./shared";

/**
 * /admin/suppliers — operational dashboard listing every registered supplier.
 * Data comes server-rendered (no skeleton on first paint); per-card quick
 * actions (test / refresh balance) show inline pending states and patch the
 * card in place.
 */
export default function SuppliersListView({ initial }: { initial: SupplierCardDTO[] }) {
  const [cards, setCards] = useState(initial);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function patchCard(slug: string, patch: Partial<SupplierCardDTO>) {
    setCards((current) =>
      current.map((card) => (card.slug === slug ? { ...card, ...patch } : card)),
    );
  }

  async function revalidateAll() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await revalidateAllMappingsAction();
      setSyncMessage({
        ok: result.failed === 0,
        text:
          result.total === 0
            ? "Aucun mapping à revalider."
            : `${result.total} mapping(s) revalidé(s) — ${result.ok} OK, ${result.failed} en échec.`,
      });
    } catch {
      setSyncMessage({ ok: false, text: "Revalidation impossible." });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-w-0">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Fournisseurs</h1>
          <p className="text-sm text-muted">
            Santé, soldes et journaux des fournisseurs d’approvisionnement.
          </p>
        </div>
        <button
          type="button"
          onClick={revalidateAll}
          disabled={syncing}
          className="btn-ghost h-9 px-4 text-sm disabled:opacity-60"
          title="Revérifie tous les mappings produit↔fournisseur via les catalogues (aucune commande)"
        >
          {syncing ? "Revalidation…" : "Revalider tous les mappings"}
        </button>
      </header>

      {syncMessage && (
        <p
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            syncMessage.ok ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {syncMessage.text}
        </p>
      )}

      {cards.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          Aucun fournisseur enregistré. Les fournisseurs sont déclarés dans le
          registre applicatif (src/lib/suppliers/registry.ts).
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map((card) => (
            <SupplierCard key={card.slug} card={card} onPatch={patchCard} />
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierCard({
  card,
  onPatch,
}: {
  card: SupplierCardDTO;
  onPatch: (slug: string, patch: Partial<SupplierCardDTO>) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  async function runTest() {
    setTesting(true);
    setFlash(null);
    try {
      const result = await testSupplierConnectionAction(card.slug);
      setFlash({ ok: result.ok, text: `${result.message} (${result.responseTimeMs} ms)` });
      onPatch(card.slug, {
        lastCheckedAt: result.checkedAt,
        ...(result.ok
          ? { lastSuccessAt: result.checkedAt, health: card.enabled ? "healthy" : "disabled" }
          : {
              lastFailureAt: result.checkedAt,
              lastFailureMessage: result.message,
              health: card.enabled ? "offline" : "disabled",
            }),
      });
    } finally {
      setTesting(false);
    }
  }

  async function refreshBalance() {
    setRefreshing(true);
    setFlash(null);
    try {
      const result = await refreshSupplierBalanceAction(card.slug);
      if (result.ok && result.balance) {
        onPatch(card.slug, { balance: result.balance });
      } else {
        setFlash({ ok: false, text: result.message ?? "Solde indisponible." });
      }
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SupplierLogoTile initials={card.initials} accentColor={card.accentColor} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/suppliers/${card.slug}`}
                className="truncate text-[15px] font-semibold text-white hover:underline"
              >
                {card.name}
              </Link>
              <EnvironmentBadge environment={card.environment} />
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{card.description}</p>
          </div>
        </div>
        <SupplierHealthBadge health={card.health} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <MetaCell label="Solde">
          {card.balance ? (
            <span className="font-semibold text-white">
              {card.balance.amount} {card.balance.currency}
            </span>
          ) : card.supportsBalance ? (
            <span className="text-faint">non chargé</span>
          ) : (
            <span className="text-faint">non supporté</span>
          )}
        </MetaCell>
        <MetaCell label="Dernier succès">{formatSupplierDate(card.lastSuccessAt)}</MetaCell>
        <MetaCell label="Dernier échec">
          {card.lastFailureAt ? (
            <span className="text-red-400">{formatSupplierDate(card.lastFailureAt)}</span>
          ) : (
            "—"
          )}
        </MetaCell>
        <MetaCell label="Dernier test">{formatSupplierDate(card.lastCheckedAt)}</MetaCell>
        <MetaCell label="Dernière synchro">{formatSupplierDate(card.lastSyncAt)}</MetaCell>
        <MetaCell label="Achats 7 j">
          <span className="text-white">{card.recentPurchases.ok} ok</span>
          {card.recentPurchases.failed > 0 && (
            <span className="ml-1.5 text-red-400">{card.recentPurchases.failed} échec(s)</span>
          )}
        </MetaCell>
      </dl>

      {flash && (
        <p
          className={`rounded-lg px-3 py-2 text-xs ${
            flash.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}
        >
          {flash.text}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="btn-ghost h-8 px-3 text-xs disabled:opacity-60"
        >
          {testing ? "Test en cours…" : "Tester la connexion"}
        </button>
        {card.supportsBalance && (
          <button
            type="button"
            onClick={refreshBalance}
            disabled={refreshing}
            className="btn-ghost h-8 px-3 text-xs disabled:opacity-60"
          >
            {refreshing ? "Actualisation…" : "Actualiser le solde"}
          </button>
        )}
        <span className="flex-1" />
        <Link href={`/admin/suppliers/${card.slug}/logs`} className="btn-ghost h-8 px-3 text-xs">
          Journaux
        </Link>
        <Link href={`/admin/suppliers/${card.slug}`} className="btn-primary h-8 px-3 text-xs">
          Gérer
        </Link>
      </div>
    </div>
  );
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-medium uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-muted">{children}</dd>
    </div>
  );
}
