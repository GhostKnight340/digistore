"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import {
  getInventoryAction,
  addCodeAction,
  addCodesBulkAction,
  disableCodeAction,
  resetCodeAction,
  setStockControlAction,
} from "@/app/actions/admin";
import type { InventoryGroupDTO } from "@/lib/dto";

const STATUS_STYLES: Record<string, string> = {
  unused: "bg-green-500/15 text-green-400",
  reserved: "bg-amber-500/15 text-amber-400",
  used: "bg-muted/15 text-muted",
  disabled: "bg-red-500/15 text-red-400",
};

export default function InventoryPanel({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const [groups, setGroups] = useState<InventoryGroupDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDbError(false);
    try {
      const data = await getInventoryAction();
      setGroups(data);
    } catch {
      setDbError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Inventory</h2>
        <p className="mt-1 text-sm text-muted">
          Database-backed digital codes. Used codes are never offered for new
          orders.
        </p>
      </div>

      {!loaded ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : dbError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Connexion à la base de données impossible. Vérifiez DATABASE_URL.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <ProductInventory
              key={group.productId}
              group={group}
              open={openSlug === group.productId}
              onToggle={() =>
                setOpenSlug((s) =>
                  s === group.productId ? null : group.productId,
                )
              }
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductInventory({
  group,
  open,
  onToggle,
  onChanged,
}: {
  group: InventoryGroupDTO;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleStockControl(mode: "auto" | "manual") {
    setBusy(true);
    await setStockControlAction(group.productId, mode);
    await onChanged();
    setBusy(false);
  }

  async function handleAddSingle() {
    if (!single.trim()) return;
    setBusy(true);
    setMsg("");
    const res = await addCodeAction(group.productId, single);
    setMsg(res.ok ? "Code added." : res.error ?? "Failed.");
    if (res.ok) setSingle("");
    await onChanged();
    setBusy(false);
  }

  async function handleAddBulk() {
    if (!bulk.trim()) return;
    setBusy(true);
    setMsg("");
    const res = await addCodesBulkAction(group.productId, bulk);
    setMsg(
      res.ok
        ? `Added ${res.added ?? 0}, skipped ${res.skipped ?? 0} duplicate(s).`
        : res.error ?? "Failed.",
    );
    if (res.ok) setBulk("");
    await onChanged();
    setBusy(false);
  }

  async function handleDisable(codeId: string) {
    setBusy(true);
    setMsg("");
    const res = await disableCodeAction(codeId);
    if (!res.ok) setMsg(res.error ?? "Failed.");
    await onChanged();
    setBusy(false);
  }

  async function handleReset(codeId: string) {
    if (!confirm("Reset this code to unused? It can be assigned to a new order.")) return;
    setBusy(true);
    setMsg("");
    const res = await resetCodeAction(codeId);
    setMsg(res.ok ? "Code reset to unused." : res.error ?? "Failed.");
    await onChanged();
    setBusy(false);
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="font-mono text-sm text-white">{group.productId}</span>
          <span className="flex items-center gap-3 text-xs">
            <Count label="unused" value={group.unused} tone="text-green-400" />
            <Count label="reserved" value={group.reserved} tone="text-amber-400" />
            <Count label="used" value={group.used} tone="text-muted" />
            {group.disabled > 0 && (
              <Count label="disabled" value={group.disabled} tone="text-red-400" />
            )}
            <span className="text-faint">{open ? "▲" : "▼"}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-base p-0.5 text-[11px] font-medium">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleStockControl("manual")}
            className={`rounded-md px-2.5 py-1 transition ${group.stockControl === "manual" ? "bg-surface2 text-white" : "text-faint hover:text-muted"}`}
          >
            Manual
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleStockControl("auto")}
            className={`rounded-md px-2.5 py-1 transition ${group.stockControl === "auto" ? "bg-surface2 text-white" : "text-faint hover:text-muted"}`}
          >
            Auto
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-5 border-t border-border px-5 py-5">
          {/* Add controls */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white">
                Add a single code
              </label>
              <div className="flex gap-2">
                <input
                  value={single}
                  onChange={(e) => setSingle(e.target.value)}
                  placeholder="STEAM-XXXX-XXXX"
                  className="input h-10 py-0 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddSingle}
                  disabled={busy}
                  className="btn-primary h-10 shrink-0 px-4 text-xs disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white">
                Bulk paste (one code per line)
              </label>
              <textarea
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                rows={3}
                placeholder={"CODE-1\nCODE-2\nCODE-3"}
                className="input min-h-[72px] py-2 font-mono text-sm"
              />
              <button
                type="button"
                onClick={handleAddBulk}
                disabled={busy}
                className="btn-ghost mt-2 h-9 px-4 text-xs disabled:opacity-50"
              >
                Add all
              </button>
            </div>
          </div>

          {msg && <p className="text-xs text-muted">{msg}</p>}

          {/* Code list */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Used by order</th>
                  <th className="py-2 pr-4 font-medium">Used at</th>
                  <th className="py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {group.codes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-muted">
                      No codes yet for this product.
                    </td>
                  </tr>
                ) : (
                  group.codes.map((c) => (
                    <tr key={c.id} className="border-b border-border/60">
                      <td className="py-2 pr-4 font-mono text-xs text-white">
                        {c.code}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            STATUS_STYLES[c.status] ?? "bg-muted/15 text-muted"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono text-[11px] text-muted">
                        {c.assignedOrderId ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-[11px] text-muted">
                        {c.usedAt ? formatDate(c.usedAt) : "—"}
                      </td>
                      <td className="py-2">
                        {c.status === "used" ? (
                          <button
                            type="button"
                            onClick={() => handleReset(c.id)}
                            disabled={busy}
                            className="text-[11px] font-medium text-amber-400 hover:text-amber-300 disabled:opacity-50"
                          >
                            Unassign
                          </button>
                        ) : c.status === "disabled" ? (
                          <span className="text-[11px] text-faint">
                            disabled
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDisable(c.id)}
                            disabled={busy}
                            className="text-[11px] font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                          >
                            Disable
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <span className="text-faint">
      <span className={`font-semibold ${tone}`}>{value}</span> {label}
    </span>
  );
}
