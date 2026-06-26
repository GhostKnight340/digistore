"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminPaymentConfigAction } from "@/app/actions/payments";
import {
  updateMethodConfigAction,
  updateSupportConfigAction,
  addBankAction,
  updateBankAction,
  deleteBankAction,
  addWalletAction,
  updateWalletAction,
  deleteWalletAction,
} from "@/app/actions/admin";
import type { BankDTO, CryptoWalletDTO, SupportConfigDTO, PaymentMethodConfigDTO } from "@/lib/dto";

interface AdminConfig {
  banks: BankDTO[];
  wallets: CryptoWalletDTO[];
  methods: Record<string, PaymentMethodConfigDTO>;
  support: SupportConfigDTO;
}

export default function PaymentSettingsPanel() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await getAdminPaymentConfigAction();
      setConfig(data as AdminConfig);
    } catch (error) {
      console.error("Failed to load payment settings", error);
      setFeedback({ general: "Payment settings could not be loaded." });
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setMsg(key: string, msg: string) {
    setFeedback((prev) => ({ ...prev, [key]: msg }));
    setTimeout(() => setFeedback((prev) => ({ ...prev, [key]: "" })), 3000);
  }

  async function toggleMethod(method: string, enabled: boolean) {
    setSaving(`method-${method}`);
    const res = await updateMethodConfigAction(method, { enabled });
    if (res.ok) { setMsg(`method-${method}`, "Sauvegardé"); await load(); }
    else setMsg(`method-${method}`, res.error ?? "Erreur");
    setSaving(null);
  }

  async function saveMethodField(method: string, data: Record<string, string | boolean>) {
    setSaving(`method-field-${method}`);
    const res = await updateMethodConfigAction(method, data);
    if (res.ok) { setMsg(`method-field-${method}`, "Sauvegardé"); await load(); }
    else setMsg(`method-field-${method}`, res.error ?? "Erreur");
    setSaving(null);
  }

  if (!loaded) {
    return <p className="text-sm text-muted">Chargement...</p>;
  }
  if (!config) {
    return <p className="text-sm text-red-400">{feedback.general ?? "Payment settings could not be loaded."}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white">Paramètres de paiement</h2>
        <p className="mt-1 text-sm text-muted">
          Configurez les méthodes de paiement, les coordonnées bancaires, et le support.
        </p>
      </div>

      {/* Support */}
      <SupportSection
        support={config.support}
        saving={saving === "support"}
        feedback={feedback["support"] ?? ""}
        onSave={async (data) => {
          setSaving("support");
          const res = await updateSupportConfigAction(data);
          if (res.ok) { setMsg("support", "Sauvegardé"); await load(); }
          else setMsg("support", res.error ?? "Erreur");
          setSaving(null);
        }}
      />

      {/* Bank Transfer */}
      <BankSection
        method={config.methods["bank"]}
        banks={config.banks}
        saving={saving}
        feedback={feedback}
        onToggle={(enabled) => toggleMethod("bank", enabled)}
        onToggleProof={(proofRequired) => saveMethodField("bank", { proofRequired })}
        onSaveInstructions={(instructions) => saveMethodField("bank", { instructions })}
        onAddBank={async (data) => {
          setSaving("bank-add");
          const res = await addBankAction(data);
          if (res.ok) { setMsg("bank-add", "Banque ajoutée"); await load(); }
          else setMsg("bank-add", res.error ?? "Erreur");
          setSaving(null);
        }}
        onUpdateBank={async (id, data) => {
          setSaving(`bank-${id}`);
          const res = await updateBankAction(id, data);
          if (res.ok) { setMsg(`bank-${id}`, "Sauvegardé"); await load(); }
          else setMsg(`bank-${id}`, res.error ?? "Erreur");
          setSaving(null);
        }}
        onDeleteBank={async (id) => {
          setSaving(`bank-del-${id}`);
          const res = await deleteBankAction(id);
          if (res.ok) { await load(); }
          else setMsg(`bank-${id}`, res.error ?? "Erreur");
          setSaving(null);
        }}
        onReload={load}
      />

      {/* USDT */}
      <WalletSection
        method={config.methods["usdt"]}
        wallets={config.wallets}
        saving={saving}
        feedback={feedback}
        onToggle={(enabled) => toggleMethod("usdt", enabled)}
        onToggleProof={(proofRequired) => saveMethodField("usdt", { proofRequired })}
        onAddWallet={async (data) => {
          setSaving("wallet-add");
          const res = await addWalletAction(data);
          if (res.ok) { setMsg("wallet-add", "Wallet ajouté"); await load(); }
          else setMsg("wallet-add", res.error ?? "Erreur");
          setSaving(null);
        }}
        onUpdateWallet={async (id, data) => {
          setSaving(`wallet-${id}`);
          const res = await updateWalletAction(id, data);
          if (res.ok) { setMsg(`wallet-${id}`, "Sauvegardé"); await load(); }
          else setMsg(`wallet-${id}`, res.error ?? "Erreur");
          setSaving(null);
        }}
        onDeleteWallet={async (id) => {
          setSaving(`wallet-del-${id}`);
          const res = await deleteWalletAction(id);
          if (res.ok) { await load(); }
          else setMsg(`wallet-${id}`, res.error ?? "Erreur");
          setSaving(null);
        }}
      />

      {/* PayPal */}
      <PaypalSection
        method={config.methods["paypal"]}
        saving={saving}
        feedback={feedback}
        onToggle={(enabled) => toggleMethod("paypal", enabled)}
        onToggleProof={(proofRequired) => saveMethodField("paypal", { proofRequired })}
        onSave={(data) => saveMethodField("paypal", data)}
      />

      {/* Card */}
      <CardSection
        method={config.methods["card"]}
        saving={saving}
        feedback={feedback}
        onToggle={(enabled) => toggleMethod("card", enabled)}
        onSave={(data) => saveMethodField("card", data)}
      />
    </div>
  );
}

// ─── Support Section ──────────────────────────────────────────────────────────

function SupportSection({
  support,
  saving,
  feedback,
  onSave,
}: {
  support: SupportConfigDTO;
  saving: boolean;
  feedback: string;
  onSave: (data: { whatsappNumber: string; supportEmail: string; instructions: string }) => void;
}) {
  const [whatsapp, setWhatsapp] = useState(support.whatsappNumber);
  const [email, setEmail] = useState(support.supportEmail);
  const [instructions, setInstructions] = useState(support.instructions);

  useEffect(() => {
    setWhatsapp(support.whatsappNumber);
    setEmail(support.supportEmail);
    setInstructions(support.instructions);
  }, [support]);

  return (
    <SectionCard title="Support client" icon="💬">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Numéro WhatsApp" value={whatsapp} onChange={setWhatsapp} placeholder="+212 6 00 00 00 00" />
        <FormField label="Email de support" value={email} onChange={setEmail} placeholder="support@karta.ma" type="email" />
      </div>
      <div className="mt-4">
        <FormField label="Instructions" value={instructions} onChange={setInstructions} placeholder="Instructions pour le support..." textarea />
      </div>
      <SaveRow saving={saving} feedback={feedback} onSave={() => onSave({ whatsappNumber: whatsapp, supportEmail: email, instructions })} />
    </SectionCard>
  );
}

// ─── Bank Transfer Section ────────────────────────────────────────────────────

function BankSection({
  method,
  banks,
  saving,
  feedback,
  onToggle,
  onToggleProof,
  onSaveInstructions,
  onAddBank,
  onUpdateBank,
  onDeleteBank,
  onReload,
}: {
  method: PaymentMethodConfigDTO | undefined;
  banks: BankDTO[];
  saving: string | null;
  feedback: Record<string, string>;
  onToggle: (v: boolean) => void;
  onToggleProof: (v: boolean) => void;
  onSaveInstructions: (v: string) => void;
  onAddBank: (data: { name: string; accountHolder: string; accountNumber: string; rib: string; iban: string; swift: string; instructions: string }) => void;
  onUpdateBank: (id: string, data: Partial<BankDTO>) => void;
  onDeleteBank: (id: string) => void;
  onReload: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState(method?.instructions ?? "");

  useEffect(() => {
    setInstructions(method?.instructions ?? "");
  }, [method?.instructions]);

  return (
    <SectionCard title="Virement bancaire" icon="🏦">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Activé</p>
          <p className="text-xs text-muted">Afficher le virement bancaire au checkout</p>
        </div>
        <Toggle
          checked={method?.enabled ?? false}
          onChange={onToggle}
          disabled={saving === "method-bank"}
        />
      </div>
      {feedback["method-bank"] && <p className="text-xs text-accent">{feedback["method-bank"]}</p>}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium text-white">Preuve requise</p>
          <p className="text-xs text-muted">Le client doit uploader une preuve</p>
        </div>
        <Toggle
          checked={method?.proofRequired ?? true}
          onChange={onToggleProof}
          disabled={saving === "method-field-bank"}
        />
      </div>

      <div className="border-t border-border pt-4">
        <FormField
          label="Instructions globales (affichées en bas)"
          value={instructions}
          onChange={setInstructions}
          placeholder="Instructions de virement..."
          textarea
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            disabled={saving === "method-field-bank"}
            onClick={() => onSaveInstructions(instructions)}
            className="btn-primary h-8 px-4 text-xs disabled:opacity-50"
          >
            Sauvegarder les instructions
          </button>
          {feedback["method-field-bank"] && (
            <span className="text-xs text-accent">{feedback["method-field-bank"]}</span>
          )}
        </div>
      </div>

      {/* Banks list */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Comptes bancaires ({banks.length})</h4>
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="btn-ghost h-8 px-3 text-xs"
          >
            + Ajouter
          </button>
        </div>

        {showAdd && (
          <AddBankForm
            saving={saving === "bank-add"}
            feedback={feedback["bank-add"] ?? ""}
            onSave={(data) => { onAddBank(data); setShowAdd(false); }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        <div className="mt-3 space-y-3">
          {banks.map((bank) =>
            editingId === bank.id ? (
              <EditBankForm
                key={bank.id}
                bank={bank}
                saving={saving === `bank-${bank.id}`}
                feedback={feedback[`bank-${bank.id}`] ?? ""}
                onSave={(data) => { onUpdateBank(bank.id, data); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <BankRow
                key={bank.id}
                bank={bank}
                saving={saving === `bank-del-${bank.id}`}
                onEdit={() => setEditingId(bank.id)}
                onDelete={() => onDeleteBank(bank.id)}
                onToggle={(enabled) => onUpdateBank(bank.id, { enabled })}
              />
            ),
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function BankRow({
  bank,
  saving,
  onEdit,
  onDelete,
  onToggle,
}: {
  bank: BankDTO;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-base p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-white">{bank.name}</p>
          <p className="mt-0.5 text-xs text-muted">{bank.accountHolder}</p>
          {bank.rib && <p className="mt-1 font-mono text-xs text-faint">RIB: {bank.rib}</p>}
          {bank.iban && <p className="font-mono text-xs text-faint">IBAN: {bank.iban}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Toggle checked={bank.enabled} onChange={onToggle} small />
          <button type="button" onClick={onEdit} className="text-xs text-accent hover:text-accent-hover">
            Modifier
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onDelete}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

type BankFormData = {
  name: string;
  accountHolder: string;
  accountNumber: string;
  rib: string;
  iban: string;
  swift: string;
  instructions: string;
};

function AddBankForm({
  saving,
  feedback,
  onSave,
  onCancel,
}: {
  saving: boolean;
  feedback: string;
  onSave: (data: BankFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<BankFormData>({
    name: "", accountHolder: "", accountNumber: "", rib: "", iban: "", swift: "", instructions: "",
  });
  const set = (k: keyof BankFormData) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <p className="text-sm font-semibold text-white">Nouvelle banque</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nom de la banque" value={form.name} onChange={set("name")} placeholder="CIH Bank" />
        <FormField label="Titulaire du compte" value={form.accountHolder} onChange={set("accountHolder")} placeholder="Nom complet" />
        <FormField label="Numéro de compte" value={form.accountNumber} onChange={set("accountNumber")} placeholder="00000 0000000 00" />
        <FormField label="RIB" value={form.rib} onChange={set("rib")} placeholder="00000 0000000 000000000 00" />
        <FormField label="IBAN" value={form.iban} onChange={set("iban")} placeholder="MA64 0000 0000 0000 0000 0000" />
        <FormField label="SWIFT / BIC" value={form.swift} onChange={set("swift")} placeholder="CIHGMAMC" />
      </div>
      <FormField label="Instructions spécifiques" value={form.instructions} onChange={set("instructions")} placeholder="Instructions..." textarea />
      {feedback && <p className="text-xs text-red-400">{feedback}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !form.name.trim()}
          onClick={() => onSave(form)}
          className="btn-primary h-8 px-4 text-xs disabled:opacity-50"
        >
          {saving ? "Sauvegarde..." : "Ajouter"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost h-8 px-3 text-xs">
          Annuler
        </button>
      </div>
    </div>
  );
}

function EditBankForm({
  bank,
  saving,
  feedback,
  onSave,
  onCancel,
}: {
  bank: BankDTO;
  saving: boolean;
  feedback: string;
  onSave: (data: Partial<BankDTO>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: bank.name,
    accountHolder: bank.accountHolder,
    accountNumber: bank.accountNumber,
    rib: bank.rib,
    iban: bank.iban,
    swift: bank.swift,
    instructions: bank.instructions,
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <p className="text-sm font-semibold text-white">Modifier la banque</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nom de la banque" value={form.name} onChange={set("name")} />
        <FormField label="Titulaire du compte" value={form.accountHolder} onChange={set("accountHolder")} />
        <FormField label="Numéro de compte" value={form.accountNumber} onChange={set("accountNumber")} />
        <FormField label="RIB" value={form.rib} onChange={set("rib")} />
        <FormField label="IBAN" value={form.iban} onChange={set("iban")} />
        <FormField label="SWIFT / BIC" value={form.swift} onChange={set("swift")} />
      </div>
      <FormField label="Instructions spécifiques" value={form.instructions} onChange={set("instructions")} textarea />
      {feedback && <p className="text-xs text-red-400">{feedback}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(form)}
          className="btn-primary h-8 px-4 text-xs disabled:opacity-50"
        >
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost h-8 px-3 text-xs">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ─── USDT Wallet Section ──────────────────────────────────────────────────────

function WalletSection({
  method,
  wallets,
  saving,
  feedback,
  onToggle,
  onToggleProof,
  onAddWallet,
  onUpdateWallet,
  onDeleteWallet,
}: {
  method: PaymentMethodConfigDTO | undefined;
  wallets: CryptoWalletDTO[];
  saving: string | null;
  feedback: Record<string, string>;
  onToggle: (v: boolean) => void;
  onToggleProof: (v: boolean) => void;
  onAddWallet: (data: { network: string; address: string; label: string; instructions: string }) => void;
  onUpdateWallet: (id: string, data: Partial<CryptoWalletDTO>) => void;
  onDeleteWallet: (id: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <SectionCard title="USDT Crypto" icon="💎">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Activé</p>
          <p className="text-xs text-muted">TRC20 / BEP20 uniquement</p>
        </div>
        <Toggle checked={method?.enabled ?? false} onChange={onToggle} disabled={saving === "method-usdt"} />
      </div>
      {feedback["method-usdt"] && <p className="text-xs text-accent">{feedback["method-usdt"]}</p>}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium text-white">Preuve requise</p>
          <p className="text-xs text-muted">Le client doit uploader un screenshot de transaction</p>
        </div>
        <Toggle checked={method?.proofRequired ?? true} onChange={onToggleProof} disabled={saving === "method-field-usdt"} />
      </div>
      {feedback["method-field-usdt"] && <p className="text-xs text-accent">{feedback["method-field-usdt"]}</p>}

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Wallets ({wallets.length})</h4>
          <button type="button" onClick={() => setShowAdd(!showAdd)} className="btn-ghost h-8 px-3 text-xs">
            + Ajouter
          </button>
        </div>

        {showAdd && (
          <AddWalletForm
            saving={saving === "wallet-add"}
            feedback={feedback["wallet-add"] ?? ""}
            onSave={(data) => { onAddWallet(data); setShowAdd(false); }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        <div className="mt-3 space-y-3">
          {wallets.map((wallet) =>
            editingId === wallet.id ? (
              <EditWalletForm
                key={wallet.id}
                wallet={wallet}
                saving={saving === `wallet-${wallet.id}`}
                feedback={feedback[`wallet-${wallet.id}`] ?? ""}
                onSave={(data) => { onUpdateWallet(wallet.id, data); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <WalletRow
                key={wallet.id}
                wallet={wallet}
                saving={saving === `wallet-del-${wallet.id}`}
                onEdit={() => setEditingId(wallet.id)}
                onDelete={() => onDeleteWallet(wallet.id)}
                onToggle={(enabled) => onUpdateWallet(wallet.id, { enabled })}
              />
            ),
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function WalletRow({
  wallet,
  saving,
  onEdit,
  onDelete,
  onToggle,
}: {
  wallet: CryptoWalletDTO;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-base p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
              {wallet.network}
            </span>
            {wallet.label && <span className="text-sm text-white">{wallet.label}</span>}
          </div>
          <p className="mt-1 break-all font-mono text-xs text-muted">{wallet.address}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Toggle checked={wallet.enabled} onChange={onToggle} small />
          <button type="button" onClick={onEdit} className="text-xs text-accent hover:text-accent-hover">
            Modifier
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onDelete}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function AddWalletForm({
  saving,
  feedback,
  onSave,
  onCancel,
}: {
  saving: boolean;
  feedback: string;
  onSave: (data: { network: string; address: string; label: string; instructions: string }) => void;
  onCancel: () => void;
}) {
  const [network, setNetwork] = useState("TRC20");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [instructions, setInstructions] = useState("");

  return (
    <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <p className="text-sm font-semibold text-white">Nouveau wallet</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Réseau</label>
          <select value={network} onChange={(e) => setNetwork(e.target.value)} className="input h-10 py-0 text-sm">
            <option value="TRC20">TRC20 (TRON)</option>
            <option value="BEP20">BEP20 (BSC)</option>
          </select>
        </div>
        <FormField label="Label (ex: Wallet principal)" value={label} onChange={setLabel} placeholder="Wallet principal" />
      </div>
      <FormField label="Adresse du wallet" value={address} onChange={setAddress} placeholder="T..." />
      <FormField label="Instructions spécifiques" value={instructions} onChange={setInstructions} placeholder="Instructions..." textarea />
      {feedback && <p className="text-xs text-red-400">{feedback}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !address.trim()}
          onClick={() => onSave({ network, address, label, instructions })}
          className="btn-primary h-8 px-4 text-xs disabled:opacity-50"
        >
          {saving ? "Sauvegarde..." : "Ajouter"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost h-8 px-3 text-xs">
          Annuler
        </button>
      </div>
    </div>
  );
}

function EditWalletForm({
  wallet,
  saving,
  feedback,
  onSave,
  onCancel,
}: {
  wallet: CryptoWalletDTO;
  saving: boolean;
  feedback: string;
  onSave: (data: Partial<CryptoWalletDTO>) => void;
  onCancel: () => void;
}) {
  const [network, setNetwork] = useState(wallet.network);
  const [address, setAddress] = useState(wallet.address);
  const [label, setLabel] = useState(wallet.label);
  const [instructions, setInstructions] = useState(wallet.instructions);

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <p className="text-sm font-semibold text-white">Modifier le wallet</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Réseau</label>
          <select value={network} onChange={(e) => setNetwork(e.target.value)} className="input h-10 py-0 text-sm">
            <option value="TRC20">TRC20 (TRON)</option>
            <option value="BEP20">BEP20 (BSC)</option>
          </select>
        </div>
        <FormField label="Label" value={label} onChange={setLabel} />
      </div>
      <FormField label="Adresse du wallet" value={address} onChange={setAddress} />
      <FormField label="Instructions" value={instructions} onChange={setInstructions} textarea />
      {feedback && <p className="text-xs text-red-400">{feedback}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave({ network, address, label, instructions })}
          className="btn-primary h-8 px-4 text-xs disabled:opacity-50"
        >
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost h-8 px-3 text-xs">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ─── PayPal Section ───────────────────────────────────────────────────────────

function PaypalSection({
  method,
  saving,
  feedback,
  onToggle,
  onToggleProof,
  onSave,
}: {
  method: PaymentMethodConfigDTO | undefined;
  saving: string | null;
  feedback: Record<string, string>;
  onToggle: (v: boolean) => void;
  onToggleProof: (v: boolean) => void;
  onSave: (data: Record<string, string>) => void;
}) {
  const [paypalEmail, setPaypalEmail] = useState(method?.paypalEmail ?? "");
  const [instructions, setInstructions] = useState(method?.instructions ?? "");

  useEffect(() => {
    setPaypalEmail(method?.paypalEmail ?? "");
    setInstructions(method?.instructions ?? "");
  }, [method?.paypalEmail, method?.instructions]);

  return (
    <SectionCard title="PayPal" icon="🅿️">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Activé</p>
        </div>
        <Toggle checked={method?.enabled ?? false} onChange={onToggle} disabled={saving === "method-paypal"} />
      </div>
      {feedback["method-paypal"] && <p className="text-xs text-accent">{feedback["method-paypal"]}</p>}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium text-white">Preuve requise</p>
        </div>
        <Toggle checked={method?.proofRequired ?? false} onChange={onToggleProof} disabled={saving === "method-field-paypal"} />
      </div>

      <div className="grid gap-4 border-t border-border pt-4">
        <FormField label="Email PayPal" value={paypalEmail} onChange={setPaypalEmail} placeholder="paypal@karta.ma" type="email" />
        <FormField label="Instructions" value={instructions} onChange={setInstructions} placeholder="Instructions PayPal..." textarea />
      </div>
      <SaveRow
        saving={saving === "method-field-paypal"}
        feedback={feedback["method-field-paypal"] ?? ""}
        onSave={() => onSave({ paypalEmail, instructions })}
      />
    </SectionCard>
  );
}

// ─── Card Section ─────────────────────────────────────────────────────────────

function CardSection({
  method,
  saving,
  feedback,
  onToggle,
  onSave,
}: {
  method: PaymentMethodConfigDTO | undefined;
  saving: string | null;
  feedback: Record<string, string>;
  onToggle: (v: boolean) => void;
  onSave: (data: Record<string, string>) => void;
}) {
  const [cardMessage, setCardMessage] = useState(method?.cardMessage ?? "");

  useEffect(() => {
    setCardMessage(method?.cardMessage ?? "");
  }, [method?.cardMessage]);

  return (
    <SectionCard title="Carte bancaire" icon="💳">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Activé</p>
          <p className="text-xs text-muted">Affiche la carte comme option au checkout</p>
        </div>
        <Toggle checked={method?.enabled ?? false} onChange={onToggle} disabled={saving === "method-card"} />
      </div>
      {feedback["method-card"] && <p className="text-xs text-accent">{feedback["method-card"]}</p>}

      <div className="border-t border-border pt-4">
        <FormField
          label="Message affiché au client"
          value={cardMessage}
          onChange={setCardMessage}
          placeholder="Paiement par carte bientôt disponible."
          textarea
        />
      </div>
      <SaveRow
        saving={saving === "method-field-card"}
        feedback={feedback["method-field-card"] ?? ""}
        onSave={() => onSave({ cardMessage })}
      />
    </SectionCard>
  );
}

// ─── Reusable primitives ──────────────────────────────────────────────────────

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <span className="text-xl">{icon}</span>
        <h3 className="font-bold text-white">{title}</h3>
      </div>
      <div className="space-y-4 px-6 py-5">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  small,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-full transition disabled:opacity-50 ${
        small ? "h-5 w-9" : "h-6 w-11"
      } ${checked ? "bg-accent" : "bg-surface2 border border-border"}`}
    >
      <span
        className={`absolute top-0.5 rounded-full bg-white shadow transition-transform ${
          small ? "h-4 w-4" : "h-5 w-5"
        } ${checked ? (small ? "translate-x-4" : "translate-x-5") : "translate-x-0.5"}`}
      />
    </button>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="input w-full py-2 text-sm"
        />
      ) : (
        <input
          type={type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input h-10 py-0 text-sm"
        />
      )}
    </div>
  );
}

function SaveRow({
  saving,
  feedback,
  onSave,
}: {
  saving: boolean;
  feedback: string;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border pt-4">
      <button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="btn-primary h-8 px-4 text-xs disabled:opacity-50"
      >
        {saving ? "Sauvegarde..." : "Sauvegarder"}
      </button>
      {feedback && (
        <span className={`text-xs ${feedback === "Sauvegardé" ? "text-green-400" : "text-red-400"}`}>
          {feedback}
        </span>
      )}
    </div>
  );
}
