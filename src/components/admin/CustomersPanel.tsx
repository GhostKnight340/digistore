"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { getAdminCustomersAction } from "@/app/actions/admin";
import type { CustomerDTO } from "@/lib/dto";

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="font-bold text-white">Clients</h2>
          <p className="mt-0.5 text-xs text-muted">
            Comptes clients et acheteurs invites suivis par commande.
          </p>
        </div>
        <button type="button" onClick={load} className="btn-ghost py-1 text-xs">
          Actualiser
        </button>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-sm text-muted">Chargement...</p>
      ) : error ? (
        <p className="px-5 py-8 text-sm text-red-400">{error}</p>
      ) : customers.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted">
          Aucun client pour le moment.
        </p>
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
                <th className="px-5 py-3 font-medium">Creation</th>
                <th className="px-5 py-3 font-medium">Dernière commande</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={`${customer.kind}:${customer.email}`} className="border-b border-border/60">
                  <td className="px-5 py-3">
                    <p className="font-medium text-white">{customer.name}</p>
                    <p className="text-xs text-muted">{customer.email}</p>
                    {customer.phone ? <p className="text-xs text-muted">{customer.phone}</p> : null}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {customer.kind === "registered" ? "Compte" : "Invite"}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {customer.emailVerified ? "Oui" : "Non"}
                  </td>
                  <td className="px-5 py-3 text-muted">{customer.orderCount}</td>
                  <td className="px-5 py-3 font-semibold text-white">
                    {formatMAD(customer.totalSpent)}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {customer.lastLoginAt ? formatDate(customer.lastLoginAt) : "-"}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {customer.createdAt ? formatDate(customer.createdAt) : "-"}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {customer.orderCount > 0 ? formatDate(customer.lastOrderAt) : "-"}
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
