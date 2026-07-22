"use client";

import { useCallback, useState } from "react";
import {
  listPaymentMethodsAction,
  listCouponsAction,
  searchProductsAction,
  resolveOrderModuleAction,
} from "@/app/actions/adminEmails";
import { MODULE_LABELS } from "@/lib/email/composerModules";
import type { EmailModule, ClientRecipient } from "./types";
import { newId } from "./types";

const FIELD = "input text-sm";
const LABEL = "block text-xs font-medium text-muted mb-1";

/** Blank module of a given type (client-side add). */
export function blankModule(type: EmailModule["type"]): EmailModule {
  const id = newId();
  switch (type) {
    case "text":
      return { type, id, body: "", align: "justify" };
    case "credit":
      return { type, id, amountMad: 5, title: "Crédit Ghost offert", description: "", behavior: "display", buttonLabel: "Voir mon solde" };
    case "button":
      return { type, id, label: "En savoir plus", url: "https://ghost.ma", style: "primary", align: "center" };
    case "order":
      return { type, id, orderId: "", customerId: "", orderNumber: "", status: "", productSummary: "", totalMad: 0, orderUrl: "" };
    case "payment":
      return { type, id, methodId: "", methodName: "", lines: [] };
    case "coupon":
      return { type, id, promoCodeId: "", code: "", valueLabel: "", expiresAt: null, conditions: "" };
    case "divider":
      return { type, id };
    case "notice":
      return { type, id, style: "info", body: "" };
    case "product":
      return { type, id, productId: "", name: "", region: "", priceMad: 0, imageUrl: null, productUrl: "" };
    case "signature":
      return { type, id, name: "L'équipe ghost.ma", title: "Service client", text: "" };
  }
}

export default function ModuleEditor({
  module,
  recipients,
  canGrantCredit,
  onChange,
}: {
  module: EmailModule;
  recipients: ClientRecipient[];
  canGrantCredit: boolean;
  onChange: (m: EmailModule) => void;
}) {
  const patch = useCallback(
    (fields: Partial<EmailModule>) => onChange({ ...module, ...fields } as EmailModule),
    [module, onChange],
  );

  switch (module.type) {
    case "text":
      return (
        <div className="space-y-2">
          <div>
            <label className={LABEL}>Titre (optionnel)</label>
            <input className={FIELD} value={module.heading ?? ""} onChange={(e) => patch({ heading: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>Texte</label>
            <textarea className={`${FIELD} min-h-[90px]`} value={module.body} onChange={(e) => patch({ body: e.target.value })} />
          </div>
          <AlignSelect value={module.align ?? "justify"} includeJustify onChange={(align) => patch({ align })} />
        </div>
      );

    case "credit":
      return (
        <CreditEditor module={module} recipients={recipients} canGrantCredit={canGrantCredit} onChange={onChange} />
      );

    case "button":
      return (
        <div className="space-y-2">
          <div>
            <label className={LABEL}>Libellé</label>
            <input className={FIELD} value={module.label} onChange={(e) => patch({ label: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>URL</label>
            <input className={FIELD} value={module.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://…" />
            {!isSafeUrlClient(module.url) && (
              <p className="mt-1 text-xs text-red-500">URL non autorisée (schémas javascript:/data: interdits).</p>
            )}
          </div>
          <div className="flex gap-2">
            <select className={`${FIELD} flex-1`} value={module.style ?? "primary"} onChange={(e) => patch({ style: e.target.value as "primary" | "secondary" })}>
              <option value="primary">Style principal</option>
              <option value="secondary">Style secondaire</option>
            </select>
            <AlignSelect value={module.align ?? "center"} onChange={(align) => patch({ align })} />
          </div>
        </div>
      );

    case "order":
      return <OrderEditor module={module} recipients={recipients} onChange={onChange} />;

    case "payment":
      return <PaymentEditor module={module} onChange={onChange} />;

    case "coupon":
      return <CouponEditor module={module} onChange={onChange} />;

    case "divider":
      return <p className="text-xs text-muted">Séparateur visuel.</p>;

    case "notice":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {NOTICE_TONES.map((t) => {
              const active = module.style === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => patch({ style: t.value })}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                    active ? t.activeClass : "border-border bg-surface text-muted hover:border-border-strong"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div>
            <label className={LABEL}>Titre (optionnel)</label>
            <input className={FIELD} value={module.heading ?? ""} onChange={(e) => patch({ heading: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>Message</label>
            <textarea className={`${FIELD} min-h-[70px]`} value={module.body} onChange={(e) => patch({ body: e.target.value })} />
          </div>
        </div>
      );

    case "product":
      return <ProductEditor module={module} onChange={onChange} />;

    case "signature":
      return (
        <div className="space-y-2">
          <div>
            <label className={LABEL}>Nom</label>
            <input className={FIELD} value={module.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>Fonction (optionnel)</label>
            <input className={FIELD} value={module.title ?? ""} onChange={(e) => patch({ title: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>Texte (optionnel)</label>
            <textarea className={`${FIELD} min-h-[60px]`} value={module.text ?? ""} onChange={(e) => patch({ text: e.target.value })} />
          </div>
        </div>
      );
  }
}

const NOTICE_TONES: { value: "info" | "success" | "warning" | "error"; label: string; activeClass: string }[] = [
  { value: "info", label: "Information", activeClass: "border-accent/60 bg-accent/10 text-sky-300" },
  { value: "success", label: "Succès", activeClass: "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" },
  { value: "warning", label: "Attention", activeClass: "border-amber-400/50 bg-amber-400/10 text-amber-300" },
  { value: "error", label: "Erreur", activeClass: "border-red-400/50 bg-red-400/10 text-red-300" },
];

function AlignSelect({
  value,
  onChange,
  includeJustify,
}: {
  value: string;
  onChange: (v: "left" | "center" | "right" | "justify") => void;
  includeJustify?: boolean;
}) {
  return (
    <select className="input text-sm" value={value} onChange={(e) => onChange(e.target.value as "left" | "center" | "right" | "justify")}>
      <option value="left">Gauche</option>
      <option value="center">Centré</option>
      <option value="right">Droite</option>
      {includeJustify && <option value="justify">Justifié</option>}
    </select>
  );
}

function isSafeUrlClient(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  if (/^(javascript|data|vbscript|file):/i.test(t)) return false;
  return t.startsWith("/") || /^https?:\/\//i.test(t) || /^mailto:/i.test(t);
}

function CreditEditor({
  module,
  recipients,
  canGrantCredit,
  onChange,
}: {
  module: Extract<EmailModule, { type: "credit" }>;
  recipients: ClientRecipient[];
  canGrantCredit: boolean;
  onChange: (m: EmailModule) => void;
}) {
  const patch = (f: Partial<typeof module>) => onChange({ ...module, ...f });
  const eligibleCount = recipients.filter((r) => r.customerId).length;
  const ineligibleCount = recipients.filter((r) => !r.customerId).length;
  const total = module.amountMad * eligibleCount;
  const grant = module.behavior === "grant";
  return (
    <div className="space-y-3">
      {/* Two-card real/mention selector — never a checkbox (financial safety). */}
      <div>
        <label className={LABEL}>Comportement du crédit</label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={!canGrantCredit}
            onClick={() => patch({ behavior: "grant" })}
            className={`rounded-xl border p-3 text-left transition disabled:opacity-40 ${
              grant
                ? "border-amber-400/60 bg-amber-400/10 ring-1 ring-amber-400/30"
                : "border-border bg-surface hover:border-border-strong"
            }`}
            title={canGrantCredit ? "" : "Permission CREDIT_GRANT requise"}
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-amber-300">
              <span className={`h-2 w-2 rounded-full ${grant ? "bg-amber-400" : "bg-border-strong"}`} />
              Ajouter réellement le crédit
            </span>
            <span className="mt-1 block text-[11px] leading-snug text-muted">
              Le solde du compte de chaque client éligible est réellement augmenté.
            </span>
          </button>
          <button
            type="button"
            onClick={() => patch({ behavior: "display" })}
            className={`rounded-xl border p-3 text-left transition ${
              !grant
                ? "border-accent/60 bg-accent/10 ring-1 ring-accent/30"
                : "border-border bg-surface hover:border-border-strong"
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-sky-300">
              <span className={`h-2 w-2 rounded-full ${!grant ? "bg-accent" : "bg-border-strong"}`} />
              Mentionner uniquement
            </span>
            <span className="mt-1 block text-[11px] leading-snug text-muted">
              Le message parle du crédit mais aucun solde n&apos;est modifié.
            </span>
          </button>
        </div>
        {!canGrantCredit && (
          <p className="mt-1 text-[11px] text-muted">Vous n&apos;avez pas la permission d&apos;accorder un crédit réel.</p>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className={LABEL}>Montant (MAD)</label>
          <input type="number" min={1} className={FIELD} value={module.amountMad} onChange={(e) => patch({ amountMad: Number(e.target.value) })} />
        </div>
        <div className="flex-1">
          <label className={LABEL}>Expiration (optionnel)</label>
          <input type="date" className={FIELD} value={module.expiresAt?.slice(0, 10) ?? ""} onChange={(e) => patch({ expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </div>
      </div>

      {/* Live financial summary — only when the credit is actually granted. */}
      {grant && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3">
          <p className="text-xs text-amber-200">
            <strong>{module.amountMad} DH</strong> seront ajoutés au compte de chaque client Ghost.ma sélectionné.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-amber-100/80">
            <span>Clients éligibles : <strong className="text-amber-100">{eligibleCount}</strong></span>
            <span>Adresses sans compte : <strong className="text-amber-100">{ineligibleCount}</strong></span>
            <span>Total : <strong className="text-amber-100">{total} DH</strong></span>
          </div>
          {ineligibleCount > 0 && (
            <p className="mt-1.5 text-[11px] text-amber-200/70">
              {ineligibleCount} adresse(s) manuelle(s) ne peuvent pas recevoir de crédit réel.
            </p>
          )}
        </div>
      )}

      <div>
        <label className={LABEL}>Titre (visible par le client)</label>
        <input className={FIELD} value={module.title} onChange={(e) => patch({ title: e.target.value })} />
      </div>
      <div>
        <label className={LABEL}>Explication (visible par le client)</label>
        <textarea className={`${FIELD} min-h-[60px]`} value={module.description} onChange={(e) => patch({ description: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={LABEL}>Libellé du bouton</label>
          <input className={FIELD} value={module.buttonLabel ?? ""} onChange={(e) => patch({ buttonLabel: e.target.value })} />
        </div>
        <div className="flex-1">
          <label className={LABEL}>
            Motif interne <span className="text-amber-300/80">— non visible par le client</span>
          </label>
          <input className={FIELD} value={module.reason ?? ""} onChange={(e) => patch({ reason: e.target.value })} placeholder="Audit uniquement" />
        </div>
      </div>
    </div>
  );
}

function OrderEditor({
  module,
  recipients,
  onChange,
}: {
  module: Extract<EmailModule, { type: "order" }>;
  recipients: ClientRecipient[];
  onChange: (m: EmailModule) => void;
}) {
  const [orderId, setOrderId] = useState(module.orderId);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const customer = recipients.find((r) => r.customerId);

  const attach = async () => {
    if (!customer?.customerId) {
      setError("Sélectionnez d'abord un client existant.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const resolved = await resolveOrderModuleAction(customer.customerId, orderId.trim());
      if (!resolved) {
        setError("Commande introuvable ou n'appartenant pas à ce client.");
        return;
      }
      onChange({ ...resolved, id: module.id });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Seule une commande du client sélectionné peut être attachée.
      </p>
      <div className="flex gap-2">
        <input className={FIELD} placeholder="ID de commande" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
        <button type="button" onClick={attach} disabled={loading} className="btn-ghost text-xs">
          {loading ? "…" : "Attacher"}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {module.orderNumber && (
        <div className="rounded-xl border border-border bg-surface p-2 text-xs text-text">
          <div className="font-medium">Commande {module.orderNumber}</div>
          <div className="text-muted">{module.status} · {module.productSummary} · {module.totalMad} DH</div>
        </div>
      )}
    </div>
  );
}

function PaymentEditor({
  module,
  onChange,
}: {
  module: Extract<EmailModule, { type: "payment" }>;
  onChange: (m: EmailModule) => void;
}) {
  const [methods, setMethods] = useState<{ id: string; name: string; lines: string[] }[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded) return;
    const list = await listPaymentMethodsAction();
    setMethods(list);
    setLoaded(true);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Utilise les modes de paiement configurés (jamais de coordonnées codées en dur).</p>
      <select
        className={FIELD}
        value={module.methodId}
        onFocus={load}
        onClick={load}
        onChange={(e) => {
          const m = methods.find((x) => x.id === e.target.value);
          if (m) onChange({ ...module, methodId: m.id, methodName: m.name, lines: m.lines });
        }}
      >
        <option value="">— Choisir un mode de paiement —</option>
        {methods.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      {module.lines.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-2 text-xs text-muted">
          {module.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function CouponEditor({
  module,
  onChange,
}: {
  module: Extract<EmailModule, { type: "coupon" }>;
  onChange: (m: EmailModule) => void;
}) {
  const [coupons, setCoupons] = useState<
    { id: string; code: string; valueLabel: string; expiresAt: string | null; conditions: string }[]
  >([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded) return;
    const list = await listCouponsAction();
    setCoupons(list);
    setLoaded(true);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Uniquement des codes promo existants et valides.</p>
      <select
        className={FIELD}
        value={module.promoCodeId}
        onClick={load}
        onChange={(e) => {
          const c = coupons.find((x) => x.id === e.target.value);
          if (c) onChange({ ...module, promoCodeId: c.id, code: c.code, valueLabel: c.valueLabel, expiresAt: c.expiresAt, conditions: c.conditions });
        }}
      >
        <option value="">— Choisir un code promo —</option>
        {coupons.map((c) => (
          <option key={c.id} value={c.id}>{c.code} · {c.valueLabel}</option>
        ))}
      </select>
      {module.code && (
        <div className="rounded-xl border border-border bg-surface p-2 text-xs text-text">
          <span className="font-mono font-semibold">{module.code}</span> — {module.valueLabel}
        </div>
      )}
    </div>
  );
}

function ProductEditor({
  module,
  onChange,
}: {
  module: Extract<EmailModule, { type: "product" }>;
  onChange: (m: EmailModule) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; region: string; priceMad: number; imageUrl: string | null; productUrl: string }[]
  >([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    try {
      const list = await searchProductsAction(query);
      setResults(list);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={FIELD}
          placeholder="Rechercher un produit (nom, ex. PSN, Steam…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" onClick={search} disabled={loading} className="btn-ghost text-xs">
          {loading ? "…" : "Chercher"}
        </button>
      </div>
      {searched && results.length === 0 && !loading && (
        <p className="text-xs text-muted">Aucun produit trouvé.</p>
      )}
      {results.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-xl border border-border">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...module, productId: p.id, name: p.name, region: p.region, priceMad: p.priceMad, imageUrl: p.imageUrl, productUrl: p.productUrl })
                }
                className="flex w-full justify-between border-b border-border px-2 py-1.5 text-left text-xs last:border-0 hover:bg-surface2"
              >
                <span className="truncate">{p.name}</span>
                <span className="text-muted">{p.priceMad} DH</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {module.name && (
        <div className="rounded-xl border border-border bg-surface p-2 text-xs text-text">
          {module.name} · {module.region} · {module.priceMad} DH
        </div>
      )}
    </div>
  );
}

export { MODULE_LABELS };
