"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { getAdminCustomersAction, deleteCustomerAccountAction } from "@/app/actions/admin";
import type { CustomerDTO } from "@/lib/dto";

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCustomers(await getAdminCustomersAction());
    } catch (err) {
      console.error("Failed to load customers", err);
      setError("Impossible de charger les clients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    setDeletingId(id);
    setActionError("");
    try {
      const res = await deleteCustomerAccountAction(id);
      if (!res.ok) {
        setActionError(res.error ?? "Suppression impossible.");
        return;
      }
      setConfirmId(null);
      await load();
    } catch (err) {
      console.error("Failed to delete customer", err);
      setActionError("Suppression impossible.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="font-bold text-white">Clients</h2>
          <p className="mt-0.5 text-xs text-muted">
            Comptes clients et acheteurs invités suivis par commande.
          </p>
        </div>
        <button type="button" onClick={load} className="btn-ghost py-1 text-xs">
          Actualiser
        </button>
      </div>

      {actionError ? (
        <p className="border-b border-border bg-red-500/10 px-5 py-2 text-sm text-red-400">
          {actionError}
        </p>
      ) : null}

      {loading ? (
        <p className="px-5 py-8 text-sm text-muted">Chargement...</p>
      ) : error ? (
        <p className="px-5 py-8 text-sm text-red-400">{error}</p>
      ) : customers.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted">Aucun client pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Vérifié</th>
                <th className="px-5 py-3 font-medium">Commandes</th>
                <th className="px-5 py-3 font-medium">LTV</th>
                <th className="px-5 py-3 font-medium">Dernière connexion</th>
                <th className="px-5 py-3 font-medium">Création</th>
                <th className="px-5 py-3 font-medium">Dernière commande</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={`${customer.kind}:${customer.email}`} className="border-b border-border/60">
                  <td className="px-5 py-3">
                    <p className="font-medium text-white">{customer.name}</p>
                    {customer.profileIncomplete ? (
                      <p className="text-xs text-amber-400">
                        Profil à compléter
                        {customer.discordUsername ? ` — @${customer.discordUsername}` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted">{customer.email}</p>
                    )}
                    {!customer.profileIncomplete && customer.discordUsername ? (
                      <p className="text-xs text-[#9FB8FF]">Discord @{customer.discordUsername}</p>
                    ) : null}
                    {customer.phone ? <p className="text-xs text-muted">{customer.phone}</p> : null}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {customer.kind === "registered" ? "Compte" : "Invite"}
                  </td>
                  <td className="px-5 py-3 text-muted">{customer.emailVerified ? "Oui" : "Non"}</td>
                  <td className="px-5 py-3 text-muted">{customer.orderCount}</td>
                  <td className="px-5 py-3 font-semibold text-white">{formatMAD(customer.totalSpent)}</td>
                  <td className="px-5 py-3 text-muted">
                    {customer.lastLoginAt ? formatDate(customer.lastLoginAt) : "-"}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {customer.createdAt ? formatDate(customer.createdAt) : "-"}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {customer.orderCount > 0 ? formatDate(customer.lastOrderAt) : "-"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {customer.id ? (
                      confirmId === customer.id ? (
                        <span className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => remove(customer.id!)}
                            disabled={deletingId === customer.id}
                            className="rounded-md bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/25 disabled:opacity-60"
                          >
                            {deletingId === customer.id ? "..." : "Confirmer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            disabled={deletingId === customer.id}
                            className="text-xs text-muted hover:text-white disabled:opacity-60"
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActionError("");
                            setConfirmId(customer.id);
                          }}
                          className="text-xs text-muted hover:text-red-400"
                        >
                          Supprimer
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
