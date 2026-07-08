"use client";

import { useEffect, useMemo, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import SegmentedControl from "@/components/ui/SegmentedControl";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import PreviewCard from "./PreviewCard";
import { uploadImageFile } from "@/lib/clientUpload";
import { paymentMethodDisplay } from "@/lib/paymentDisplay";
import { PAYMENT_METHOD_TYPES, validatePaymentMethod } from "@/lib/paymentMethod";
import type {
  PaymentMethodDTO,
  PaymentMethodDetails,
  PaymentMethodLogoType,
  PaymentMethodStatus,
  PaymentMethodType,
  SaveMethodInput,
} from "@/lib/dto";

type Tab = "overview" | "details" | "branding" | "advanced" | "preview";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Payment details" },
  { id: "branding", label: "Branding" },
  { id: "advanced", label: "Advanced" },
  { id: "preview", label: "Checkout preview" },
];

type FormState = {
  type: PaymentMethodType;
  name: string;
  subtitle: string;
  customerNote: string;
  status: PaymentMethodStatus;
  visible: boolean;
  logoUrl: string | null;
  initials: string;
  accentColor: string;
  logoType: PaymentMethodLogoType;
  details: PaymentMethodDetails;
  proofRequired: boolean;
  internalNote: string;
  minAmount: number | null;
  maxAmount: number | null;
  regions: string[];
};

function toForm(method: PaymentMethodDTO): FormState {
  return {
    type: method.type,
    name: method.name,
    subtitle: method.subtitle,
    customerNote: method.customerNote,
    status: method.status,
    visible: method.visible,
    logoUrl: method.logoUrl,
    initials: method.initials,
    accentColor: method.accentColor,
    logoType: method.logoType,
    details: method.details,
    proofRequired: method.proofRequired,
    internalNote: method.internalNote,
    minAmount: method.minAmount,
    maxAmount: method.maxAmount,
    regions: method.regions,
  };
}

export default function MethodEditorDrawer({
  method,
  sortPosition,
  sortTotal,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: {
  method: PaymentMethodDTO;
  sortPosition: number;
  sortTotal: number;
  onClose: () => void;
  onSave: (id: string, data: Partial<SaveMethodInput>) => Promise<boolean>;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(method));
  const [tab, setTab] = useState<Tab>("overview");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(toForm(method));
    setTab("overview");
  }, [method]);

  const dirty = useMemo(() => JSON.stringify(toForm(method)) !== JSON.stringify(form), [method, form]);
  const validation = validatePaymentMethod(form);
  const detailsHasError = Object.keys(validation.fieldErrors).some((k) => k.startsWith("details."));
  const preview: PaymentMethodDTO = { ...method, ...form };
  const display = paymentMethodDisplay(preview);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function setDetail<K extends keyof PaymentMethodDetails>(key: K, value: PaymentMethodDetails[K]) {
    setForm((prev) => ({ ...prev, details: { ...prev.details, [key]: value } }));
  }

  function changeType(type: PaymentMethodType) {
    const meta = PAYMENT_METHOD_TYPES.find((t) => t.type === type)!;
    setForm((prev) => ({
      ...prev,
      type,
      details: {},
      accentColor: prev.accentColor === PAYMENT_METHOD_TYPES.find((t) => t.type === prev.type)?.defaultAccent
        ? meta.defaultAccent
        : prev.accentColor,
      initials: prev.initials === PAYMENT_METHOD_TYPES.find((t) => t.type === prev.type)?.defaultInitials
        ? meta.defaultInitials
        : prev.initials,
    }));
  }

  async function handleClose() {
    if (dirty && !window.confirm("Des modifications non enregistrées seront perdues. Fermer quand même ?")) {
      return;
    }
    onClose();
  }

  async function handleSave() {
    if (form.status === "active" && form.visible && !validation.complete) {
      setError("Complétez les champs requis avant d'activer cette méthode.");
      return;
    }
    setSaving(true);
    setError("");
    const ok = await onSave(method.id, form);
    setSaving(false);
    if (ok) onClose();
    else setError("Erreur lors de l'enregistrement.");
  }

  async function handleLogoUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      set("logoUrl", url);
      set("logoType", "image");
    } catch (err) {
      console.error("Payment method logo upload failed", err);
      setError("Import du logo impossible.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Drawer open onClose={handleClose}>
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <PaymentBrandMark display={display} active className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-faint">
              <span>Payment methods</span>
              <span>/</span>
              <span className="truncate text-muted">{form.name || "Sans nom"}</span>
              {!validation.complete && (
                <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
                  incomplet
                </span>
              )}
            </div>
            <h2 className="truncate text-base font-semibold text-white">{form.name || "Nouvelle méthode"}</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={handleClose} className="btn-ghost h-9 px-4 text-xs">
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary h-9 px-4 text-xs disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border px-6 py-3">
        {PAYMENT_METHOD_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => changeType(t.type)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              form.type === t.type ? "bg-accent/15 text-accent" : "text-muted hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 border-b border-border px-6">
        {TABS.map((t) => {
          const showDot = t.id === "details" && detailsHasError;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative border-b-2 px-3 py-3 text-[13px] font-medium transition ${
                tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-white"
              }`}
            >
              {t.label}
              {showDot && (
                <span className="absolute right-0.5 top-2.5 h-1.5 w-1.5 rounded-full bg-red-400" />
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6 p-6">
          {tab === "overview" && <OverviewTab form={form} set={set} />}
          {tab === "details" && (
            <DetailsTab type={form.type} details={form.details} setDetail={setDetail} fieldErrors={validation.fieldErrors} />
          )}
          {tab === "branding" && (
            <BrandingTab form={form} set={set} uploading={uploading} onUpload={handleLogoUpload} />
          )}
          {tab === "advanced" && (
            <AdvancedTab form={form} set={set} onArchive={() => onArchive(method.id)} onDelete={() => onDelete(method.id)} />
          )}
          {tab === "preview" && <CheckoutPreviewTab preview={preview} />}
        </div>

        <aside className="border-t border-border p-5 lg:border-l lg:border-t-0">
          <p className="mb-3 text-[11px] uppercase tracking-wide text-faint">Aperçu checkout</p>
          <PreviewCard method={preview} selected />
          <p className="mt-2 text-[11px] text-faint">
            Position {sortPosition + 1} / {sortTotal}
          </p>

          <p className="mb-2 mt-5 text-[11px] uppercase tracking-wide text-faint">Checklist</p>
          <ChecklistRow ok={form.name.trim().length > 0} label="Nom affiché renseigné" />
          <ChecklistRow ok={validation.complete} label="Champs de paiement requis complets" />
          <ChecklistRow ok={form.visible} label="Visible au checkout" />
          <ChecklistRow ok={form.status === "active"} label="Statut actif" />
        </aside>
      </div>
    </Drawer>
  );
}

function ChecklistRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${ok ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
        {ok ? "✓" : "✕"}
      </span>
      <span className={ok ? "text-muted" : "text-red-300"}>{label}</span>
    </div>
  );
}

function OverviewTab({
  form,
  set,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-[11px] uppercase tracking-wide text-faint">Customer-facing</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nom de la méthode" value={form.name} onChange={(v) => set("name", v)} />
          <TextField label="Sous-titre" value={form.subtitle} onChange={(v) => set("subtitle", v)} />
        </div>
        <div className="mt-4">
          <TextField
            label="Note visible par le client"
            value={form.customerNote}
            onChange={(v) => set("customerNote", v)}
            textarea
          />
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <p className="mb-3 text-[11px] uppercase tracking-wide text-faint">Availability</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Statut</label>
            <SegmentedControl
              value={form.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "active", label: "Actif" },
                { value: "inactive", label: "Inactif" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Visibilité</label>
            <ToggleSwitch
              checked={form.visible}
              onChange={(v) => set("visible", v)}
              checkedLabel="Visible"
              uncheckedLabel="Masqué"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-muted">Justificatif de paiement requis</label>
          <ToggleSwitch
            checked={form.proofRequired}
            onChange={(v) => set("proofRequired", v)}
            checkedLabel="Requis"
            uncheckedLabel="Optionnel"
          />
        </div>
      </div>
    </div>
  );
}

function DetailsTab({
  type,
  details,
  setDetail,
  fieldErrors,
}: {
  type: PaymentMethodType;
  details: PaymentMethodDetails;
  setDetail: <K extends keyof PaymentMethodDetails>(key: K, value: PaymentMethodDetails[K]) => void;
  fieldErrors: Record<string, string>;
}) {
  if (type === "bank") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nom de la banque" value={details.bankName ?? ""} onChange={(v) => setDetail("bankName", v)} />
        <TextField label="Titulaire du compte" value={details.accountHolder ?? ""} onChange={(v) => setDetail("accountHolder", v)} />
        <TextField
          label="RIB"
          value={details.rib ?? ""}
          onChange={(v) => setDetail("rib", v)}
          error={fieldErrors["details.rib"]}
        />
        <TextField label="Numéro de compte" value={details.accountNumber ?? ""} onChange={(v) => setDetail("accountNumber", v)} />
        <TextField label="IBAN" value={details.iban ?? ""} onChange={(v) => setDetail("iban", v)} />
        <TextField label="SWIFT / BIC" value={details.swift ?? ""} onChange={(v) => setDetail("swift", v)} />
        <div className="sm:col-span-2">
          <TextField label="Instructions" value={details.instructions ?? ""} onChange={(v) => setDetail("instructions", v)} textarea />
        </div>
      </div>
    );
  }
  if (type === "paypal") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="E-mail PayPal"
          value={details.email ?? ""}
          onChange={(v) => setDetail("email", v)}
          error={fieldErrors["details.email"]}
        />
        <TextField label="Lien PayPal.Me" value={details.meLink ?? ""} onChange={(v) => setDetail("meLink", v)} />
        <TextField label="Libellé du bouton" value={details.buttonLabel ?? ""} onChange={(v) => setDetail("buttonLabel", v)} />
        <TextField
          label="Devise PayPal (ex: USD)"
          value={details.paypalCurrency ?? ""}
          onChange={(v) => setDetail("paypalCurrency", v.toUpperCase())}
          placeholder="USD"
        />
        <TextField
          label="Taux de change (MAD pour 1 unité)"
          value={details.paypalExchangeRate != null ? String(details.paypalExchangeRate) : ""}
          onChange={(v) => {
            const parsed = Number(v);
            setDetail("paypalExchangeRate", Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
          }}
          placeholder="10"
        />
        <div className="sm:col-span-2">
          <TextField label="Instructions" value={details.instructions ?? ""} onChange={(v) => setDetail("instructions", v)} textarea />
        </div>
      </div>
    );
  }
  if (type === "crypto") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Adresse du portefeuille"
          value={details.walletAddress ?? ""}
          onChange={(v) => setDetail("walletAddress", v)}
          error={fieldErrors["details.walletAddress"]}
        />
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Réseau</label>
          <select
            value={details.network ?? "TRC20"}
            onChange={(e) => setDetail("network", e.target.value)}
            className="input h-10 py-0 text-sm"
          >
            <option value="TRC20">TRC20 (TRON)</option>
            <option value="ERC20">ERC20 (Ethereum)</option>
            <option value="BEP20">BEP20 (BSC)</option>
            <option value="Solana">Solana</option>
          </select>
        </div>
        <TextField label="Note montant minimum" value={details.minAmountNote ?? ""} onChange={(v) => setDetail("minAmountNote", v)} />
        <div className="sm:col-span-2">
          <TextField label="Instructions de confirmation" value={details.instructions ?? ""} onChange={(v) => setDetail("instructions", v)} textarea />
        </div>
      </div>
    );
  }
  if (type === "card") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Fournisseur" value={details.providerName ?? ""} onChange={(v) => setDetail("providerName", v)} />
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Bientôt disponible</label>
          <ToggleSwitch
            checked={details.comingSoon ?? true}
            onChange={(v) => setDetail("comingSoon", v)}
            checkedLabel="Oui"
            uncheckedLabel="Non"
          />
        </div>
        <div className="sm:col-span-2">
          <TextField label="Message affiché au client" value={details.statusNote ?? ""} onChange={(v) => setDetail("statusNote", v)} textarea />
        </div>
      </div>
    );
  }
  // cash / custom
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="Libellé personnalisé" value={details.customLabel ?? ""} onChange={(v) => setDetail("customLabel", v)} />
      <div className="sm:col-span-2">
        <TextField label="Instructions" value={details.instructions ?? ""} onChange={(v) => setDetail("instructions", v)} textarea />
      </div>
    </div>
  );
}

function BrandingTab({
  form,
  set,
  uploading,
  onUpload,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  uploading: boolean;
  onUpload: (file: File | null) => void;
}) {
  const swatches = ["#3e7bfa", "#26a17b", "#0a3d91", "#8b5cf6", "#1f6f47", "#e05c5c", "#e8a838", "#2c3445"];
  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Type de logo</label>
        <SegmentedControl
          value={form.logoType}
          onChange={(v) => set("logoType", v)}
          options={[
            { value: "initials", label: "Initiales" },
            { value: "image", label: "Image" },
            { value: "icon", label: "Icône" },
          ]}
        />
      </div>

      {form.logoType === "initials" ? (
        <TextField
          label="Initiales (max 3 caractères)"
          value={form.initials}
          onChange={(v) => set("initials", v.slice(0, 3).toUpperCase())}
        />
      ) : (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Logo</label>
          <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-border text-xs text-muted hover:border-accent/50">
            {uploading ? "Envoi..." : form.logoUrl ? (
              <img src={form.logoUrl} alt="Logo" className="h-full w-full rounded-xl object-contain p-2" />
            ) : (
              "Importer"
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Couleur accent</label>
        <div className="flex flex-wrap gap-2">
          {swatches.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => set("accentColor", color)}
              className="h-8 w-8 rounded-full border-2"
              style={{
                background: color,
                borderColor: form.accentColor === color ? "#fff" : "transparent",
              }}
              aria-label={color}
            />
          ))}
          <input
            type="color"
            value={form.accentColor}
            onChange={(e) => set("accentColor", e.target.value)}
            className="h-8 w-8 cursor-pointer rounded-full border border-border bg-transparent p-0"
          />
        </div>
      </div>
    </div>
  );
}

function AdvancedTab({
  form,
  set,
  onArchive,
  onDelete,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-6">
      <TextField label="Note interne (admin uniquement)" value={form.internalNote} onChange={(v) => set("internalNote", v)} textarea />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Montant minimum (DH)"
          value={form.minAmount?.toString() ?? ""}
          onChange={(v) => set("minAmount", v.trim() ? Number(v) : null)}
          type="number"
        />
        <TextField
          label="Montant maximum (DH)"
          value={form.maxAmount?.toString() ?? ""}
          onChange={(v) => set("maxAmount", v.trim() ? Number(v) : null)}
          type="number"
        />
      </div>

      <TextField
        label="Régions disponibles (séparées par une virgule, vide = toutes)"
        value={form.regions.join(", ")}
        onChange={(v) => set("regions", v.split(",").map((r) => r.trim()).filter(Boolean))}
      />

      <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
        <p className="text-sm font-semibold text-red-300">Archiver cette méthode</p>
        <p className="mt-1 text-xs text-muted">
          La méthode disparaît du checkout mais reste consultable pour les commandes existantes.
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onArchive} className="h-8 rounded-lg border border-red-500/30 px-3 text-xs font-medium text-red-300 hover:bg-red-500/10">
            Archiver
          </button>
          <button type="button" onClick={onDelete} className="h-8 rounded-lg px-3 text-xs font-medium text-red-400/70 hover:bg-red-500/10 hover:text-red-300">
            Supprimer définitivement
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckoutPreviewTab({ preview }: { preview: PaymentMethodDTO }) {
  const display = paymentMethodDisplay(preview);
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">Liste au checkout</p>
        <div className="space-y-2">
          <PreviewCard method={preview} />
          <PreviewCard method={preview} selected />
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">Après commande</p>
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <PaymentBrandMark display={display} active className="mx-auto h-12 w-12" />
          <p className="mt-3 text-sm font-semibold text-white">{display.displayName}</p>
          <p className="mt-1 text-xs text-muted">{preview.customerNote || "Instructions affichées après la commande."}</p>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  type,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  type?: string;
  error?: string;
}) {
  const errorClass = error ? "border-red-500/50 shadow-[0_0_0_3px_rgba(224,92,92,0.07)]" : "";
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`input w-full py-2 text-sm ${errorClass}`}
        />
      ) : (
        <input
          type={type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`input h-10 py-0 text-sm ${errorClass}`}
        />
      )}
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
