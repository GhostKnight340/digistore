"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/StoreContext";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import { formatMAD } from "@/lib/format";
import { createOrderAction } from "@/app/actions/orders";
import { getPaymentConfigAction } from "@/app/actions/payments";
import type { PaymentMethod } from "@/lib/types";
import type { BankDTO, CryptoWalletDTO, PaymentConfigDTO } from "@/lib/dto";

const METHOD_META: Record<string, { label: string; hint: string; icon: string }> = {
  bank: { label: "Virement bancaire", hint: "RIB / IBAN disponible", icon: "BK" },
  usdt: { label: "Crypto", hint: "Paiement crypto instantane", icon: "US" },
  paypal: { label: "PayPal", hint: "PayPal ou envoi manuel", icon: "PP" },
  card: { label: "Carte bancaire", hint: "Disponible prochainement", icon: "CB" },
};

type PaymentCardOption =
  | { id: string; method: "bank"; title: string; subtitle: string; icon: string; bank: BankDTO }
  | { id: string; method: Exclude<PaymentMethod, "bank">; title: string; subtitle: string; icon: string };

function isMethodUsable(config: PaymentConfigDTO, method: PaymentMethod): boolean {
  if (!config.methods[method]?.enabled) return false;
  if (method === "bank") return config.banks.length > 0;
  if (method === "usdt") return config.wallets.length > 0;
  return true;
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Clipboard copy failed");
}

export default function CheckoutClient({
  initialConfig = null,
}: {
  initialConfig?: PaymentConfigDTO | null;
}) {
  const { cart, ready, cartTotal, clearCart } = useStore();
  const { getProduct } = useProductCatalog();
  const router = useRouter();

  const [config, setConfig] = useState<PaymentConfigDTO | null>(initialConfig);
  const [configError, setConfigError] = useState(false);
  const enabledMethods = config
    ? (["bank", "usdt", "paypal", "card"] as PaymentMethod[]).filter((m) =>
        isMethodUsable(config, m),
      )
    : [];

  const [method, setMethod] = useState<PaymentMethod | "">(
    () => enabledMethods[0] ?? "",
  );
  const [selectedBankId, setSelectedBankId] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialConfig) return;
    getPaymentConfigAction()
      .then((cfg) => {
        setConfig(cfg);
        const first = (["bank", "usdt", "paypal", "card"] as PaymentMethod[]).find(
          (m) => isMethodUsable(cfg, m),
        );
        if (first) setMethod(first);
        if (cfg.banks[0]) setSelectedBankId(cfg.banks[0].id);
      })
      .catch((err: unknown) => {
        console.error("[checkout] Failed to load payment config:", err);
        setConfigError(true);
      });
  }, [initialConfig]);

  useEffect(() => {
    if (!initialConfig) return;
    const first = (["bank", "usdt", "paypal", "card"] as PaymentMethod[]).find(
      (m) => isMethodUsable(initialConfig, m),
    );
    if (first) setMethod((current) => current || first);
    if (initialConfig.banks[0]) {
      setSelectedBankId((current) => current || initialConfig.banks[0].id);
    }
  }, [initialConfig]);

  const paymentOptions = useMemo<PaymentCardOption[]>(() => {
    if (!config) return [];
    const options: PaymentCardOption[] = [];
    if (config.methods.bank?.enabled) {
      options.push(
        ...config.banks.map((bank) => ({
          id: `bank:${bank.id}`,
          method: "bank" as const,
          title: bank.name,
          subtitle: "Virement bancaire",
          icon: bank.name.slice(0, 2).toUpperCase(),
          bank,
        })),
      );
    }
    for (const optionMethod of ["usdt", "paypal", "card"] as const) {
      if (!isMethodUsable(config, optionMethod)) continue;
      const meta = METHOD_META[optionMethod];
      options.push({
        id: optionMethod,
        method: optionMethod,
        title: meta.label,
        subtitle: meta.hint,
        icon: meta.icon,
      });
    }
    return options;
  }, [config]);

  const selectedBank = useMemo(() => {
    if (!config) return null;
    return config.banks.find((bank) => bank.id === selectedBankId) ?? config.banks[0] ?? null;
  }, [config, selectedBankId]);

  const selectedWallet =
    config?.wallets.find((wallet) => wallet.network === "TRC20") ?? config?.wallets[0] ?? null;

  async function copyText(key: string, value: string) {
    try {
      await copyToClipboard(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1600);
    } catch {
      setCopiedKey("");
    }
  }

  if (ready && cart.length === 0) {
    return (
      <div className="container-page py-10">
        <div className="card grid place-items-center px-6 py-20 text-center">
          <p className="text-lg font-semibold text-white">
            Il n&apos;y a rien a payer pour le moment
          </p>
          <Link href="/products" className="btn-primary mt-6">
            Parcourir le catalogue
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !fullName.trim()) {
      setError("Veuillez entrer votre nom et votre email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Veuillez entrer une adresse email valide.");
      return;
    }
    if (!method) {
      setError("Veuillez choisir une methode de paiement.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrderAction({
        customerName: fullName.trim(),
        customerEmail: email.trim(),
        paymentMethod: method,
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
      });

      if (!order) {
        setSubmitting(false);
        setError("Une erreur est survenue. Veuillez reessayer.");
        return;
      }

      clearCart();
      router.push(`/payment/${order.id}`);
    } catch {
      setSubmitting(false);
      setError("Une erreur est survenue. Veuillez reessayer.");
    }
  }

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold text-white">Paiement</h1>
      <p className="mt-1 text-sm text-muted">
        Choisissez votre methode de paiement et completez votre commande.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Step done label="Panier" />
        <span className="h-px w-9 bg-border-strong" />
        <Step active label="Paiement" />
        <span className="h-px w-9 bg-border-strong" />
        <Step label="Livraison" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="space-y-8">
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white">Vos informations</h2>
            <p className="mt-1 text-sm text-muted">
              Nous vous tiendrons informe du statut de votre commande a cette adresse email.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Nom complet">
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Youssef El Amrani"
                  autoComplete="name"
                />
              </Field>
              <Field label="Email">
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@example.com"
                  autoComplete="email"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Methode de paiement</h2>
              <p className="mt-1 text-sm text-muted">
                Selectionnez une option, puis verifiez les details avant de continuer.
              </p>
            </div>

            {configError ? (
              <p className="card p-5 text-sm text-red-400">
                Impossible de charger les methodes de paiement.
              </p>
            ) : !config ? (
              <p className="card p-5 text-sm text-muted">Chargement...</p>
            ) : enabledMethods.length === 0 ? (
              <p className="card p-5 text-sm text-muted">
                Aucune methode de paiement disponible pour le moment.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {paymentOptions.map((option) => {
                    const active =
                      option.method === "bank"
                        ? method === "bank" && selectedBankId === option.bank.id
                        : method === option.method;
                    return (
                      <button
                        type="button"
                        key={option.id}
                        onClick={() => {
                          setMethod(option.method);
                          if (option.method === "bank") setSelectedBankId(option.bank.id);
                        }}
                        className={`group relative flex min-h-28 items-center gap-4 rounded-2xl border p-4 text-left transition ${
                          active
                            ? "border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(62,123,250,0.18),0_18px_40px_rgba(62,123,250,0.12)]"
                            : "border-border bg-surface/80 hover:border-accent/45 hover:bg-surface2/70"
                        }`}
                      >
                        <span
                          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-sm font-black ${
                            active
                              ? "border-accent/50 bg-accent text-white"
                              : "border-border bg-base text-accent"
                          }`}
                        >
                          {option.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold text-white">
                            {option.title}
                          </span>
                          <span className="mt-1 block text-sm text-muted">{option.subtitle}</span>
                        </span>
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${
                            active
                              ? "border-accent bg-accent text-white"
                              : "border-border text-transparent group-hover:border-accent/60"
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>

                <PaymentDetailsCard
                  method={method}
                  bank={selectedBank}
                  wallet={selectedWallet}
                  totalMad={cartTotal}
                  copiedKey={copiedKey}
                  onCopy={copyText}
                />
              </>
            )}
          </section>
        </div>

        <aside className="h-fit lg:sticky lg:top-24">
          <div className="card p-6">
            <h2 className="text-lg font-bold text-white">Recapitulatif</h2>
            <ul className="mt-4 space-y-3">
              {cart.map((item) => {
                const product = getProduct(item.productId);
                if (!product) return null;
                return (
                  <li key={item.productId} className="flex justify-between gap-4 text-sm">
                    <span className="text-muted">
                      {product.name} <span className="text-muted/70">x{item.quantity}</span>
                    </span>
                    <span className="shrink-0 text-white">
                      {formatMAD(product.price * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="my-4 border-t border-border" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted">
                <span>Sous-total</span>
                <span className="text-white">{formatMAD(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Frais de livraison</span>
                <span className="text-green-400">Gratuit</span>
              </div>
            </div>
            <div className="my-4 border-t border-border" />
            <div className="flex justify-between text-base font-bold text-white">
              <span>Total</span>
              <span>{formatMAD(cartTotal)}</span>
            </div>

            {error && (
              <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || configError || !config || enabledMethods.length === 0}
              className="btn-primary mt-6 w-full disabled:opacity-50"
            >
              {submitting ? "Commande en cours..." : "Passer la commande"}
            </button>
            <p className="mt-3 text-center text-xs text-muted">
              Instructions completes affichees apres creation de la commande
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

function Step({ label, active = false, done = false }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
          active
            ? "bg-accent text-white shadow-[0_0_0_4px_rgba(62,123,250,0.16)]"
            : done
              ? "border border-accent bg-accent-soft text-accent"
              : "border border-border-strong text-faint"
        }`}
      >
        {done ? "✓" : active ? "2" : "3"}
      </span>
      <span className={active ? "text-sm font-semibold text-text" : "text-sm text-muted"}>
        {label}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-white">{label}</label>
      {children}
    </div>
  );
}

function PaymentDetailsCard({
  method,
  bank,
  wallet,
  totalMad,
  copiedKey,
  onCopy,
}: {
  method: PaymentMethod | "";
  bank: BankDTO | null;
  wallet: CryptoWalletDTO | null;
  totalMad: number;
  copiedKey: string;
  onCopy: (key: string, value: string) => void;
}) {
  if (!method) return null;
  const meta = METHOD_META[method] ?? METHOD_META.bank;

  if (method === "bank") {
    if (!bank) return null;
    const rows = [
      ["Banque", bank.name],
      ["Titulaire", bank.accountHolder],
      ["RIB", bank.rib],
      ["Compte", bank.accountNumber],
      ["Motif", "E-commerce"],
      ["Montant", formatMAD(totalMad)],
    ].filter(([, value]) => Boolean(value));
    const allDetails = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

    return (
      <PremiumDetailsCard icon={bank.name.slice(0, 2).toUpperCase()} title={bank.name} subtitle="Virement bancaire">
        <div className="space-y-2">
          {rows.map(([label, value]) => (
            <DetailRow
              key={label}
              label={label}
              value={value}
              copyKey={`bank-${label}`}
              copiedKey={copiedKey}
              onCopy={onCopy}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => onCopy("bank-all", allDetails)}
          className="btn-primary mt-4 w-full justify-center"
        >
          {copiedKey === "bank-all" ? "Details copies" : "Copier les details du paiement"}
        </button>
      </PremiumDetailsCard>
    );
  }

  if (method === "usdt") {
    if (!wallet) return null;
    return (
      <PremiumDetailsCard icon={meta.icon} title="Crypto" subtitle={wallet.network}>
        <DetailRow
          label="Reseau"
          value={wallet.network}
          copyKey="wallet-network"
          copiedKey={copiedKey}
          onCopy={onCopy}
          copyable={false}
        />
        <DetailRow
          label="Adresse"
          value={wallet.address}
          copyKey="wallet-address"
          copiedKey={copiedKey}
          onCopy={onCopy}
        />
        <DetailRow
          label="Montant"
          value={`${(totalMad / 10).toFixed(2)} USDT`}
          copyKey="wallet-amount"
          copiedKey={copiedKey}
          onCopy={onCopy}
          copyable={false}
        />
      </PremiumDetailsCard>
    );
  }

  return (
    <PremiumDetailsCard icon={meta.icon} title={meta.label} subtitle={meta.hint}>
      <p className="text-sm leading-relaxed text-muted">
        Les instructions finales seront affichees apres creation de la commande.
      </p>
    </PremiumDetailsCard>
  );
}

function PremiumDetailsCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border-strong bg-gradient-to-b from-surface2/90 to-surface/70 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.32)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-accent/40 bg-accent/15 text-sm font-black text-accent">
          {icon}
        </span>
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
  copyable = true,
}: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string;
  onCopy: (key: string, value: string) => void;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-base/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
        <p className="mt-0.5 break-all font-mono text-sm text-white">{value}</p>
      </div>
      {copyable ? (
        <button
          type="button"
          onClick={() => onCopy(copyKey, value)}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-white"
        >
          {copiedKey === copyKey ? "Copie" : "Copier"}
        </button>
      ) : null}
    </div>
  );
}
