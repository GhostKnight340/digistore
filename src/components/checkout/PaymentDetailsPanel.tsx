"use client";

import { useEffect, useState } from "react";
import { formatMAD } from "@/lib/format";
import type { BankDTO, CryptoWalletDTO, PaymentMethodConfigDTO } from "@/lib/dto";

/** MAD ↔ USDT rate used by the existing checkout logic (totalMad / 10). */
const USDT_RATE = 10;

export default function PaymentDetailsPanel({
  paymentMethod,
  methodConfig,
  banks,
  wallets,
  totalMad,
  orderRef,
}: {
  paymentMethod: string;
  methodConfig: PaymentMethodConfigDTO | null;
  banks: BankDTO[];
  wallets: CryptoWalletDTO[];
  totalMad: number;
  orderRef: string;
}) {
  const reference = `CMD-${orderRef}`;

  return (
    <section>
      <p className="mb-3.5 text-xs uppercase tracking-[0.12em] text-faint">
        Détails du paiement
      </p>

      {paymentMethod === "bank" && (
        <BankDetails banks={banks} totalMad={totalMad} reference={reference} />
      )}

      {paymentMethod === "usdt" && (
        <CryptoDetails wallets={wallets} totalMad={totalMad} reference={reference} />
      )}

      {paymentMethod === "paypal" && (
        <PaypalDetails
          paypalEmail={methodConfig?.paypalEmail ?? ""}
          totalMad={totalMad}
          reference={reference}
        />
      )}

      {paymentMethod === "card" && (
        <CardDetails message={methodConfig?.cardMessage ?? ""} />
      )}
    </section>
  );
}

// ─── Bank transfer ────────────────────────────────────────────────────────────

function BankDetails({
  banks,
  totalMad,
  reference,
}: {
  banks: BankDTO[];
  totalMad: number;
  reference: string;
}) {
  const [selectedBank, setSelectedBank] = useState<BankDTO | null>(banks[0] ?? null);

  useEffect(() => {
    setSelectedBank((current) =>
      current && banks.some((b) => b.id === current.id) ? current : banks[0] ?? null,
    );
  }, [banks]);

  if (banks.length === 0) {
    return (
      <div className="rounded-[18px] border border-border-strong bg-surface px-5 py-6 text-sm text-muted">
        Les coordonnées bancaires sont en cours de configuration. Veuillez réessayer
        ultérieurement.
      </div>
    );
  }

  const short = (selectedBank?.name ?? "BANK").slice(0, 4).toUpperCase();

  return (
    <div className="animate-fade-up overflow-hidden rounded-[18px] border border-border-strong bg-gradient-to-b from-surface2/90 to-surface/60">
      {/* Bank selector (only when multiple banks exist) */}
      {banks.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-border px-6 py-4">
          {banks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBank(b)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                selectedBank?.id === b.id
                  ? "border-accent bg-accent/15 text-white"
                  : "border-border text-muted hover:border-border-strong"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Header: logo + bank name */}
      <div className="flex items-center gap-4 border-b border-border px-6 py-5">
        <span
          className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-[14px] text-[17px] font-bold tracking-[0.03em] text-white shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
          style={{ background: "linear-gradient(145deg,#3E7BFA,#1D4ED8)" }}
        >
          {short}
        </span>
        <div className="min-w-0">
          <div className="text-[11.5px] uppercase tracking-[0.12em] text-faint">
            Virement bancaire
          </div>
          <div className="mt-0.5 text-lg font-semibold text-white">
            {selectedBank?.name ?? "Banque"}
          </div>
        </div>
      </div>

      {/* Detail rows */}
      <div className="px-6">
        {selectedBank?.accountHolder && (
          <DetailRow label="Titulaire du compte" value={selectedBank.accountHolder} />
        )}
        {selectedBank?.rib && (
          <DetailRow label="RIB" value={selectedBank.rib} mono copyable accent="#5E92FF" />
        )}
        {selectedBank?.iban && (
          <DetailRow label="IBAN" value={selectedBank.iban} mono copyable accent="#5E92FF" />
        )}
        {selectedBank?.accountNumber && (
          <DetailRow label="Numéro de compte" value={selectedBank.accountNumber} mono copyable accent="#5E92FF" />
        )}
        {selectedBank?.swift && <DetailRow label="SWIFT / BIC" value={selectedBank.swift} mono />}
        <DetailRow
          label="Référence"
          value={reference}
          mono
          copyable
          accent="#5E92FF"
          valueClassName="text-accent-strong"
        />
        <DetailRow label="Montant" value={formatMAD(totalMad)} emphasize />
        <DetailRow label="Motif du virement" value="Ecommerce" last />
      </div>

      {selectedBank?.instructions ? (
        <NoteBox tone="neutral">{selectedBank.instructions}</NoteBox>
      ) : (
        <NoteBox tone="warning">
          Utilisez la référence de commande exactement telle qu&apos;indiquée afin que nous
          puissions identifier votre paiement.
        </NoteBox>
      )}
    </div>
  );
}

// ─── Crypto (USDT) ────────────────────────────────────────────────────────────

function CryptoDetails({
  wallets,
  totalMad,
  reference,
}: {
  wallets: CryptoWalletDTO[];
  totalMad: number;
  reference: string;
}) {
  const networks = ["TRC20", "BEP20"].filter((n) => wallets.some((w) => w.network === n));
  const [selectedNetwork, setSelectedNetwork] = useState<string>(
    wallets.find((w) => w.network === "TRC20") ? "TRC20" : wallets[0]?.network ?? "TRC20",
  );

  useEffect(() => {
    setSelectedNetwork((current) =>
      wallets.some((w) => w.network === current)
        ? current
        : wallets.find((w) => w.network === "TRC20")?.network ?? wallets[0]?.network ?? "TRC20",
    );
  }, [wallets]);

  if (wallets.length === 0) {
    return (
      <div className="rounded-[18px] border border-border-strong bg-surface px-5 py-6 text-sm text-muted">
        Les adresses USDT sont en cours de configuration. Veuillez réessayer ultérieurement.
      </div>
    );
  }

  const selectedWallet = wallets.find((w) => w.network === selectedNetwork);
  const usdtAmount = (totalMad / USDT_RATE).toFixed(2);

  return (
    <div
      className="animate-fade-up overflow-hidden rounded-[18px] border"
      style={{
        borderColor: "rgba(247,147,26,0.28)",
        background:
          "radial-gradient(120% 80% at 50% -10%,rgba(247,147,26,0.10),transparent 60%),linear-gradient(180deg,rgba(23,25,34,0.9),rgba(18,19,25,0.6))",
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-[30px] w-[30px] place-items-center rounded-[9px] text-[15px] font-bold leading-none text-white"
            style={{ background: "linear-gradient(145deg,#F7C04A,#F7931A)" }}
          >
            ₮
          </span>
          <span className="text-sm font-semibold text-white">Paiement crypto</span>
        </div>
        {networks.length > 1 ? (
          <div className="flex gap-2">
            {networks.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSelectedNetwork(n)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  selectedNetwork === n
                    ? "border-[#F7931A]/60 bg-[#F7931A]/15 text-[#F7B14A]"
                    : "border-border text-muted hover:border-border-strong"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        ) : (
          <span className="rounded-full border border-[#F7931A]/30 bg-[#F7931A]/12 px-3 py-1 font-mono text-xs font-medium text-[#F7B14A]">
            {selectedNetwork}
          </span>
        )}
      </div>

      {/* QR area */}
      <div className="flex flex-col items-center px-5 pb-5 pt-7">
        <div className="rounded-2xl bg-white p-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <QrPlaceholder value={selectedWallet?.address ?? ""} />
        </div>
        <p className="mt-3.5 text-[13px] text-muted">Scannez avec votre portefeuille</p>
      </div>

      {selectedWallet ? (
        <div className="border-t border-border px-5">
          <DetailRow
            label="Réseau"
            value={`USDT (${selectedWallet.network})`}
            valueRight={
              <span className="rounded-md border border-[#F7931A]/30 px-1.5 py-0.5 font-mono text-[10.5px] tracking-[0.08em] text-[#F7B14A]">
                {selectedWallet.network === "TRC20" ? "TRON" : selectedWallet.network}
              </span>
            }
          />
          <DetailRow
            label="Adresse du portefeuille"
            value={selectedWallet.address}
            mono
            copyable
            accent="#F7B14A"
            valueClassName="text-[13.5px]"
          />
          <DetailRow
            label="Montant"
            value={`${usdtAmount} USDT`}
            emphasize
            sub={formatMAD(totalMad)}
          />
          <DetailRow label="Référence" value={reference} mono copyable accent="#F7B14A" />
          <DetailRow
            label="Taux de change"
            value={`1 USDT = ${USDT_RATE} MAD`}
            mono
            valueClassName="text-muted"
            last
          />
        </div>
      ) : (
        <p className="px-5 pb-5 text-sm text-muted">
          Aucun portefeuille disponible pour le réseau {selectedNetwork}.
        </p>
      )}

      {selectedWallet?.instructions ? (
        <NoteBox tone="neutral">{selectedWallet.instructions}</NoteBox>
      ) : (
        <NoteBox tone="danger">
          L&apos;envoi via un autre réseau que {selectedNetwork} peut entraîner la perte
          définitive de vos fonds.
        </NoteBox>
      )}
    </div>
  );
}

// ─── PayPal ───────────────────────────────────────────────────────────────────

function PaypalDetails({
  paypalEmail,
  totalMad,
  reference,
}: {
  paypalEmail: string;
  totalMad: number;
  reference: string;
}) {
  const payHref = paypalEmail
    ? `https://www.paypal.com/myaccount/transfer/homepage/pay?recipient=${encodeURIComponent(
        paypalEmail,
      )}`
    : undefined;

  return (
    <div
      className="animate-fade-up overflow-hidden rounded-[18px] border"
      style={{
        borderColor: "rgba(0,112,224,0.28)",
        background:
          "radial-gradient(120% 80% at 50% -10%,rgba(0,112,224,0.12),transparent 60%),linear-gradient(180deg,rgba(23,25,34,0.9),rgba(18,19,25,0.6))",
      }}
    >
      <div className="flex flex-col items-center border-b border-border px-6 py-7 text-center">
        <div className="text-[30px] font-extrabold italic leading-none tracking-[-0.02em]">
          <span style={{ color: "#009CDE" }}>Pay</span>
          <span style={{ color: "#003087" }}>Pal</span>
        </div>

        <a
          href={payHref ?? "#"}
          target={payHref ? "_blank" : undefined}
          rel={payHref ? "noopener noreferrer" : undefined}
          aria-disabled={!payHref}
          className={`mt-5 inline-flex h-[52px] w-full max-w-[340px] items-center justify-center gap-2 rounded-full text-base font-semibold text-white transition ${
            payHref
              ? "hover:-translate-y-px"
              : "pointer-events-none opacity-60"
          }`}
          style={{
            background: "linear-gradient(180deg,#0096E0,#0070BA)",
            boxShadow: "0 8px 22px rgba(0,112,186,0.4)",
          }}
        >
          <span className="font-extrabold italic">Payer avec PayPal</span>
        </a>

        <div className="mt-5 flex w-full max-w-[340px] items-center gap-3.5">
          <span className="h-px flex-1 bg-border-strong" />
          <span className="text-xs text-faint">ou envoi manuel</span>
          <span className="h-px flex-1 bg-border-strong" />
        </div>
        <p className="mt-4 max-w-[360px] text-[13px] leading-relaxed text-muted">
          Envoyez manuellement depuis votre compte PayPal vers l&apos;adresse ci-dessous.
        </p>
      </div>

      <div className="px-6">
        <DetailRow
          label="Email du destinataire"
          value={paypalEmail || "Bientôt disponible"}
          mono
          copyable={Boolean(paypalEmail)}
          accent="#4DA8F5"
        />
        <DetailRow
          label="Référence"
          value={reference}
          mono
          copyable
          accent="#4DA8F5"
          valueClassName="text-[#4DA8F5]"
        />
        <DetailRow label="Montant" value={formatMAD(totalMad)} emphasize last />
      </div>

      <NoteBox tone="info">
        Veuillez inclure la référence dans la note de paiement afin que nous puissions
        identifier votre commande.
      </NoteBox>
    </div>
  );
}

// ─── Card (coming soon) ───────────────────────────────────────────────────────

function CardDetails({ message }: { message: string }) {
  return (
    <div className="animate-fade-up rounded-[18px] border border-border-strong bg-gradient-to-b from-surface2/90 to-surface/60 px-6 py-9 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-border bg-surface">
        <svg viewBox="0 0 24 24" fill="none" stroke="#9a9fab" strokeWidth={2} className="h-6 w-6" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
        </svg>
      </span>
      <h3 className="mt-4 text-base font-semibold text-white">
        {message || "Paiement par carte bientôt disponible."}
      </h3>
      <p className="mt-2 text-sm text-muted">Veuillez choisir une autre méthode de paiement.</p>
    </div>
  );
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  valueRight,
  sub,
  mono,
  copyable,
  emphasize,
  accent = "#5E92FF",
  valueClassName = "",
  last,
}: {
  label: string;
  value: string;
  valueRight?: React.ReactNode;
  sub?: string;
  mono?: boolean;
  copyable?: boolean;
  emphasize?: boolean;
  accent?: string;
  valueClassName?: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-end justify-between gap-4 py-[17px] ${
        last ? "" : "border-b border-border"
      }`}
    >
      <div className="min-w-0">
        <div className="mb-1.5 text-xs text-faint">{label}</div>
        {valueRight ? (
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium text-text ${valueClassName}`}>{value}</span>
            {valueRight}
          </div>
        ) : (
          <div
            className={`${mono ? "font-mono" : ""} ${
              emphasize ? "text-lg font-semibold tracking-[-0.01em]" : "text-[15px]"
            } break-all text-text ${valueClassName}`}
          >
            {value}
          </div>
        )}
        {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
      </div>
      {copyable && <CopyButton text={value} accent={accent} />}
    </div>
  );
}

function CopyButton({ text, accent }: { text: string; accent: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleCopy() {
    try {
      await copyToClipboard(text);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setFailed(true);
      setTimeout(() => setFailed(false), 1800);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium transition"
      style={{
        borderColor: `${accent}59`,
        background: `${accent}14`,
        color: accent,
      }}
    >
      {copied ? (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} className="h-3.5 w-3.5" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copié
        </>
      ) : failed ? (
        "Erreur"
      ) : (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          Copier
        </>
      )}
    </button>
  );
}

function NoteBox({
  tone,
  children,
}: {
  tone: "neutral" | "warning" | "danger" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: { bg: "rgba(255,255,255,0.03)", border: "var(--border)", text: "#9a9fab", icon: "#9a9fab" },
    warning: { bg: "rgba(247,147,26,0.08)", border: "rgba(247,147,26,0.22)", text: "#D9C2A0", icon: "#F7B14A" },
    danger: { bg: "rgba(229,72,77,0.08)", border: "rgba(229,72,77,0.24)", text: "#E8B4B7", icon: "#FF6B73" },
    info: { bg: "rgba(0,112,224,0.08)", border: "rgba(0,112,224,0.22)", text: "#A9C9EC", icon: "#4DA8F5" },
  }[tone];

  return (
    <div
      className="m-4 flex items-start gap-2.5 rounded-[13px] border px-4 py-3.5"
      style={{ background: tones.bg, borderColor: tones.border }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke={tones.icon} strokeWidth={2} className="mt-px h-[17px] w-[17px] shrink-0" aria-hidden>
        {tone === "info" ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M11 12h1v4h1" />
          </>
        ) : (
          <>
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </>
        )}
      </svg>
      <span className="text-[13px] leading-relaxed" style={{ color: tones.text }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Decorative QR-style block rendered from the wallet address.
 *
 * This is a visual placeholder (matching the design reference) so the layout is
 * complete without pulling in a QR dependency. To show a real scannable code,
 * swap this for an <img> / SVG produced by a QR encoder keyed on `value`.
 */
function QrPlaceholder({ value }: { value: string }) {
  const n = 25;
  const ms = 7;
  const dark = "#0A0B0D";

  const matrix: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  const finder = (r: number, c: number) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const edge = i === 0 || i === 6 || j === 0 || j === 6;
        const inner = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        matrix[r + i][c + j] = edge || inner;
      }
    }
  };
  finder(0, 0);
  finder(0, n - 7);
  finder(n - 7, 0);

  // Deterministic fill seeded from the address so it stays stable per wallet.
  let seed = 1973311;
  for (let i = 0; i < value.length; i++) seed = (seed + value.charCodeAt(i) * (i + 1)) & 0x7fffffff;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 8) / 0x7fffff;
  };
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const inFinder =
        (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);
      if (inFinder) continue;
      matrix[r][c] = rnd() > 0.52;
    }
  }

  const rects: React.ReactNode[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        rects.push(<rect key={`${r}-${c}`} x={c * ms} y={r * ms} width={ms} height={ms} fill={dark} />);
      }
    }
  }

  return (
    <svg
      width={154}
      height={154}
      viewBox={`0 0 ${n * ms} ${n * ms}`}
      role="img"
      aria-label="QR code de paiement"
      style={{ display: "block", borderRadius: 4 }}
    >
      <rect x={0} y={0} width={n * ms} height={n * ms} fill="#fff" />
      {rects}
    </svg>
  );
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Clipboard copy failed");
}
