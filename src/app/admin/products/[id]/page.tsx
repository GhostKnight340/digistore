"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { products as baseProducts, categories, getCategory } from "@/lib/products";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import { diffProduct } from "@/lib/productCatalog";
import { formatFaceValue, formatMAD } from "@/lib/format";
import ProductArt from "@/components/ProductArt";
import type { CategoryId, Product } from "@/lib/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function parseSteps(instructions: string | undefined): string[] {
  if (!instructions) return [];
  return instructions
    .split("\n")
    .filter(Boolean)
    .map((l) => l.replace(/^\d+\.\s*/, "").trim());
}

function encodeSteps(steps: string[]): string {
  return steps
    .filter((s) => s.trim())
    .map((s, i) => `${i + 1}. ${s.trim()}`)
    .join("\n");
}

// ── field primitives ─────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-faint">
      {children}
    </p>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  className = "",
  type = "text",
  min,
  step,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  min?: number;
  step?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      step={step}
      className={`input w-full text-sm ${className}`}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`input w-full resize-y text-sm leading-relaxed ${className}`}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-surface2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="text-sm text-muted">{label}</span>
    </label>
  );
}

// ── Instructions editor ──────────────────────────────────────────────────────

function StepsEditor({
  steps,
  onChange,
}: {
  steps: string[];
  onChange: (steps: string[]) => void;
}) {
  function update(i: number, val: string) {
    const next = [...steps];
    next[i] = val;
    onChange(next);
  }
  function remove(i: number) {
    onChange(steps.filter((_, idx) => idx !== i));
  }
  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...steps];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  }
  function moveDown(i: number) {
    if (i === steps.length - 1) return;
    const next = [...steps];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-[14px] border border-border bg-surface p-3"
        >
          <span className="mt-1 w-6 shrink-0 font-mono text-[13px] text-accent">
            {String(i + 1).padStart(2, "0")}
          </span>
          <textarea
            value={step}
            onChange={(e) => update(i, e.target.value)}
            rows={2}
            placeholder={`Étape ${i + 1}…`}
            className="flex-1 resize-none bg-transparent text-[13.5px] text-text outline-none placeholder:text-faint"
          />
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={() => moveUp(i)}
              disabled={i === 0}
              className="rounded p-1 text-faint transition hover:text-white disabled:opacity-20"
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveDown(i)}
              disabled={i === steps.length - 1}
              className="rounded p-1 text-faint transition hover:text-white disabled:opacity-20"
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded p-1 text-faint transition hover:text-red-400"
              aria-label="Delete step"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...steps, ""])}
        className="flex items-center gap-2 rounded-[14px] border border-dashed border-border px-4 py-2.5 text-[13px] text-muted transition hover:border-accent/50 hover:text-accent"
      >
        <span className="text-lg leading-none">+</span> Add step
      </button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProductEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const { products, ready, saveProduct, resetProduct } = useProductCatalog();

  const base = baseProducts.find((p) => p.id === id);
  const current = products.find((p) => p.id === id);

  const [draft, setDraft] = useState<Product | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [lastSaved, setLastSaved] = useState<string>("");
  const [thumbInput, setThumbInput] = useState("");
  const [thumbPreview, setThumbPreview] = useState(false);

  // Initialise draft once context is ready
  useEffect(() => {
    if (!ready || !current) return;
    setDraft(current);
    setSteps(parseSteps(current.instructions));
    setLastSaved(JSON.stringify(current) + "|" + parseSteps(current.instructions).join("\n"));
    setThumbInput(current.thumbnail ?? "");
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = useCallback(
    (partial: Partial<Product>) => setDraft((d) => (d ? { ...d, ...partial } : d)),
    [],
  );

  if (!base) {
    return (
      <div className="container-page py-20 text-center text-muted">
        Product not found.{" "}
        <Link href="/admin" className="text-accent hover:underline">
          Back to admin
        </Link>
      </div>
    );
  }

  if (!ready || !draft) {
    return (
      <div className="container-page py-20 text-center text-muted text-sm">
        Loading…
      </div>
    );
  }

  const currentSerial =
    JSON.stringify(draft) + "|" + steps.join("\n");
  const isDirty = currentSerial !== lastSaved;

  function handleSave() {
    if (!draft) return;
    const withInstructions = { ...draft, instructions: encodeSteps(steps) };
    const diffPatch = diffProduct(base!, withInstructions);
    saveProduct(id, diffPatch);
    setDraft(withInstructions);
    setLastSaved(
      JSON.stringify(withInstructions) + "|" + steps.join("\n"),
    );
  }

  function handleUndo() {
    if (!current) return;
    setDraft(current);
    setSteps(parseSteps(current.instructions));
    setLastSaved(JSON.stringify(current) + "|" + parseSteps(current.instructions).join("\n"));
    setThumbInput(current.thumbnail ?? "");
  }

  function handleReset() {
    if (!confirm(`Reset all overrides for "${base!.name}" back to defaults?`)) return;
    resetProduct(id);
    setDraft(base!);
    setSteps(parseSteps(base!.instructions));
    setLastSaved(JSON.stringify(base!) + "|" + parseSteps(base!.instructions).join("\n"));
    setThumbInput(base!.thumbnail ?? "");
  }

  const cat = getCategory(draft.category);
  const hasForeignFaceValue =
    draft.faceValue !== undefined &&
    draft.faceCurrency !== undefined &&
    draft.faceCurrency !== "MAD";

  return (
    <div className="container-page pb-32 pt-6">
      {/* Breadcrumb */}
      <nav className="mb-8 flex flex-wrap items-center gap-2 text-[13px] text-faint">
        <Link href="/admin" className="text-muted transition hover:text-white">
          Admin
        </Link>
        <span>/</span>
        <button
          type="button"
          className="text-muted transition hover:text-white"
          onClick={() => {
            router.push("/admin");
          }}
        >
          Products
        </button>
        <span>/</span>
        <span className="text-text">{draft.name}</span>
        {isDirty && (
          <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-400">
            Unsaved changes
          </span>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
        {/* ── LEFT COLUMN ── */}
        <div className="space-y-8">
          {/* Thumbnail / Art */}
          <div>
            {draft.thumbnail && thumbPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.thumbnail}
                alt={draft.name}
                className="aspect-[1.4] w-full rounded-[18px] border border-border object-cover"
                onError={() => setThumbPreview(false)}
              />
            ) : (
              <ProductArt
                category={draft.category}
                label={cat?.name}
                className="aspect-[1.4] w-full rounded-[18px] border border-border"
              />
            )}

            {/* Thumbnail URL */}
            <div className="mt-4">
              <FieldLabel>Thumbnail URL</FieldLabel>
              <div className="flex gap-2">
                <TextInput
                  value={thumbInput}
                  onChange={(v) => {
                    setThumbInput(v);
                    patch({ thumbnail: v || undefined });
                  }}
                  placeholder="https://…"
                  className="flex-1"
                />
                {thumbInput && (
                  <button
                    type="button"
                    onClick={() => setThumbPreview((p) => !p)}
                    className="btn-ghost h-9 whitespace-nowrap px-3 text-xs"
                  >
                    {thumbPreview ? "Hide" : "Preview"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Long description */}
          <div>
            <FieldLabel>Long description</FieldLabel>
            <TextArea
              value={draft.longDescription ?? ""}
              onChange={(v) => patch({ longDescription: v || undefined })}
              placeholder="Detailed product description…"
              rows={5}
            />
          </div>

          {/* Instructions editor */}
          <div>
            <FieldLabel>Instructions ("Comment utiliser")</FieldLabel>
            <StepsEditor steps={steps} onChange={setSteps} />
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {/* Delivery type chip */}
          <div>
            <FieldLabel>Delivery type (shown as badge)</FieldLabel>
            <TextInput
              value={draft.deliveryType}
              onChange={(v) => patch({ deliveryType: v })}
              placeholder="Livraison instantanée"
            />
          </div>

          {/* Product name */}
          <div>
            <FieldLabel>Product name</FieldLabel>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Product name"
              className="input w-full text-2xl font-semibold tracking-tight"
            />
          </div>

          {/* Short description */}
          <div>
            <FieldLabel>Short description</FieldLabel>
            <TextArea
              value={draft.shortDescription ?? draft.description}
              onChange={(v) => patch({ shortDescription: v, description: v })}
              placeholder="Short product description…"
              rows={3}
            />
          </div>

          {/* Face value + price */}
          <div>
            <FieldLabel>Pricing</FieldLabel>
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-[11px] text-faint">Face value</p>
                  <TextInput
                    type="number"
                    value={draft.faceValue ?? ""}
                    onChange={(v) =>
                      patch({ faceValue: v ? parseFloat(v) : undefined })
                    }
                    placeholder="50"
                    min={0}
                    step={0.01}
                  />
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-faint">Face currency</p>
                  <TextInput
                    value={draft.faceCurrency ?? ""}
                    onChange={(v) =>
                      patch({ faceCurrency: v || undefined })
                    }
                    placeholder="EUR / USD / VP…"
                  />
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11px] text-faint">Selling price (MAD) — what customers pay</p>
                <TextInput
                  type="number"
                  value={draft.price}
                  onChange={(v) => patch({ price: parseFloat(v) || 0 })}
                  placeholder="0"
                  min={0}
                  step={0.01}
                />
              </div>
              {hasForeignFaceValue && (
                <div className="rounded-lg bg-accent/5 border border-accent/20 px-3 py-2 text-[12px] text-muted">
                  Preview:{" "}
                  <span className="text-white">
                    {formatFaceValue(draft.faceValue!, draft.faceCurrency!)}
                  </span>
                  {" → "}
                  <span className="font-semibold text-accent">
                    {formatMAD(draft.price)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Chips: brand, region */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Brand</FieldLabel>
              <TextInput
                value={draft.brand ?? ""}
                onChange={(v) => patch({ brand: v || undefined })}
                placeholder="Valve, Sony…"
              />
            </div>
            <div>
              <FieldLabel>Region</FieldLabel>
              <TextInput
                value={draft.region}
                onChange={(v) => patch({ region: v })}
                placeholder="Global, EU, TR…"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <FieldLabel>Category</FieldLabel>
            <select
              value={draft.category}
              onChange={(e) => patch({ category: e.target.value as CategoryId })}
              className="input w-full text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Slug (read-only) */}
          <div>
            <FieldLabel>Slug / ID (read-only)</FieldLabel>
            <div className="rounded-lg border border-border bg-base px-3 py-2 font-mono text-xs text-faint">
              {draft.id}
            </div>
          </div>

          {/* Visibility toggles */}
          <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-faint mb-2">
              Visibility
            </p>
            <Toggle
              checked={draft.active !== false}
              onChange={(v) => patch({ active: v })}
              label="Active (visible on storefront)"
            />
            <Toggle
              checked={draft.featured === true}
              onChange={(v) => patch({ featured: v })}
              label="Featured (shown in homepage section)"
            />
          </div>

          {/* Supplier cost (admin-only) */}
          <div className="rounded-xl border border-border bg-base p-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-faint">
              Supplier cost (admin only — never shown publicly)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-faint">Cost</p>
                <TextInput
                  type="number"
                  value={draft.supplierCost ?? ""}
                  onChange={(v) =>
                    patch({ supplierCost: v ? parseFloat(v) : undefined })
                  }
                  placeholder="0"
                  min={0}
                  step={0.01}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-faint">Currency</p>
                <TextInput
                  value={draft.supplierCurrency ?? ""}
                  onChange={(v) =>
                    patch({ supplierCurrency: v || undefined })
                  }
                  placeholder="EUR / USD…"
                />
              </div>
            </div>
            {draft.supplierCost !== undefined && draft.price > 0 && draft.supplierCost > 0 && (
              <p className="mt-2 text-[11px] text-faint">
                Margin:{" "}
                <span className="text-green-400">
                  {((1 - draft.supplierCost / draft.price) * 100).toFixed(1)}%
                </span>
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* ── STICKY FOOTER TOOLBAR ── */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-base/95 backdrop-blur">
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="btn-ghost h-9 px-4 text-sm"
            >
              ← Back to admin
            </Link>
            {isDirty ? (
              <span className="text-[12px] font-medium text-amber-400">
                Unsaved changes
              </span>
            ) : (
              <span className="text-[12px] text-faint">No unsaved changes</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="btn-ghost h-9 px-4 text-sm text-red-400 hover:text-red-300"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={handleUndo}
              disabled={!isDirty}
              className="btn-ghost h-9 px-4 text-sm disabled:opacity-40"
            >
              Undo
            </button>
            <Link
              href={`/products/${id}`}
              target="_blank"
              className="btn-ghost h-9 px-4 text-sm"
            >
              Preview ↗
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty}
              className="btn-primary h-9 px-5 text-sm disabled:opacity-40"
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
