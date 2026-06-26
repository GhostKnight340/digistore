"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import { updateProductCatalogItemAction } from "@/app/actions/catalog";
import { formatMAD } from "@/lib/format";
import type { Product } from "@/lib/types";

type DraftProduct = {
  name: string;
  category: string;
  price: number;
  region: string;
  deliveryType: string;
  description: string;
  featured: boolean;
};

export default function ProductsPanel() {
  const router = useRouter();
  const { categories, products } = useProductCatalog();
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? "");
  const selected = products.find((product) => product.id === selectedId) ?? products[0];
  const [drafts, setDrafts] = useState<Record<string, DraftProduct>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const draft = useMemo(() => {
    if (!selected) return null;
    return drafts[selected.id] ?? toDraft(selected);
  }, [drafts, selected]);

  function patchDraft(patch: Partial<DraftProduct>) {
    if (!selected || !draft) return;
    setDrafts((current) => ({
      ...current,
      [selected.id]: { ...draft, ...patch },
    }));
  }

  async function save() {
    if (!selected || !draft) return;
    setSaving(true);
    const result = await updateProductCatalogItemAction(selected.id, draft);
    setSaving(false);
    if (result.ok) {
      setMessage("Product saved.");
      router.refresh();
    } else {
      setMessage(result.error ?? "Save failed.");
    }
  }

  if (products.length === 0) {
    return <p className="card p-6 text-sm text-muted">No products found in Supabase.</p>;
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[300px_1fr]">
      <aside className="card h-fit overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-bold text-white">Products</h2>
          <p className="mt-1 text-xs text-muted">Catalog records from Supabase</p>
        </div>
        <div className="max-h-[640px] overflow-y-auto p-2">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => setSelectedId(product.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                selected?.id === product.id
                  ? "bg-accent/10 text-white"
                  : "text-muted hover:bg-surface"
              }`}
            >
              <span className="block font-medium">{product.name}</span>
              <span className="text-xs">{formatMAD(product.price)} · {product.id}</span>
            </button>
          ))}
        </div>
      </aside>

      {selected && draft ? (
        <div className="space-y-6">
          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">Product editor</h2>
                <p className="mt-1 text-sm text-muted">
                  Editing {selected.id}
                </p>
              </div>
              <button type="button" onClick={save} className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save product"}
              </button>
            </div>
            {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
          </section>

          <Panel title="Product details">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Name" value={draft.name} onChange={(value) => patchDraft({ name: value })} />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-white">Category</span>
                <select
                  className="input"
                  value={draft.category}
                  onChange={(event) => patchDraft({ category: event.target.value })}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <TextField label="Region" value={draft.region} onChange={(value) => patchDraft({ region: value })} />
              <TextField label="Delivery type" value={draft.deliveryType} onChange={(value) => patchDraft({ deliveryType: value })} />
            </div>
          </Panel>

          <Panel title="Variants and price">
            <div className="grid gap-4 md:grid-cols-[1fr_160px]">
              <TextField label="Primary variant" value={draft.name} onChange={(value) => patchDraft({ name: value })} />
              <NumberField label="Price MAD" value={draft.price} onChange={(value) => patchDraft({ price: value })} />
            </div>
            <p className="mt-3 text-xs text-muted">
              Variant rows are represented by the current product record until separate variant UI is expanded.
            </p>
          </Panel>

          <Panel title="Media / background preset">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Background preset" value={draft.category} onChange={(value) => patchDraft({ category: value })} />
              <label className="flex items-center gap-3 rounded-xl border border-border bg-base px-3 py-3 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={draft.featured}
                  onChange={(event) => patchDraft({ featured: event.target.checked })}
                />
                Featured product
              </label>
            </div>
          </Panel>

          <Panel title="Description and instructions">
            <textarea
              className="input min-h-40"
              value={draft.description}
              onChange={(event) => patchDraft({ description: event.target.value })}
            />
          </Panel>
        </div>
      ) : null}
    </section>
  );
}

function toDraft(product: Product): DraftProduct {
  return {
    name: product.name,
    category: product.category,
    price: product.price,
    region: product.region,
    deliveryType: product.deliveryType,
    description: product.description,
    featured: Boolean(product.featured),
  };
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h3 className="mb-4 text-lg font-semibold text-white">{title}</h3>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white">{label}</span>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white">{label}</span>
      <input
        className="input"
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
