"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { adminCommandSearchAction } from "@/app/actions/admin";
import type {
  CommandSearchGroup,
  CommandSearchGroupKey,
  CommandSearchItem,
  CommandSearchTone,
} from "@/lib/db/adminSearch";

/* Tokens from the command-search handoff (design-tokens.json). Do not invent values. */
const T = {
  accent: "#3E7BFA",
  accentTextBright: "#7FA6FF",
  accentTextSoft: "#9FB8FF",
  paletteCard: "#101116",
  input: "#121319",
  rowChip: "#15161d",
  surface: "#0C0D11",
  text: "#F3F4F7",
  textBright: "#C6CCD8",
  text2: "#9A9FAB",
  muted: "#646A77",
  faint: "#4d525d",
  placeholder: "#5A606D",
  iconStroke: "#7B8291",
  borderHairline: "rgba(255,255,255,0.06)",
  borderSubtle: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.09)",
  borderStrong: "rgba(255,255,255,0.12)",
  borderControl: "rgba(255,255,255,0.10)",
  rowSelectedBg: "rgba(62,123,250,0.11)",
  rowSelectedRing: "inset 0 0 0 1px rgba(62,123,250,0.24)",
  backdrop: "rgba(4,5,7,0.72)",
  shadowCard: "0 30px 90px rgba(0,0,0,0.7)",
  mono: "var(--font-mono, 'Geist Mono', monospace)",
};

const TONE: Record<CommandSearchTone, { fg: string; bg: string }> = {
  amber: { fg: "#E8A838", bg: "rgba(232,168,56,0.14)" },
  green: { fg: "#5BC98C", bg: "rgba(46,160,103,0.14)" },
  red: { fg: "#E05C5C", bg: "rgba(224,92,92,0.14)" },
  blue: { fg: "#7FA6FF", bg: "rgba(62,123,250,0.14)" },
};

const TYPE_BADGE: Record<CommandSearchGroupKey, { label: string; fg: string; bg: string }> = {
  orders: { label: "ORD", fg: "#7FA6FF", bg: "rgba(62,123,250,0.16)" },
  customers: { label: "CUS", fg: "#5BC98C", bg: "rgba(46,160,103,0.16)" },
  products: { label: "PRD", fg: "#E8A838", bg: "rgba(232,168,56,0.14)" },
  variants: { label: "VAR", fg: "#C79BEA", bg: "rgba(160,110,220,0.18)" },
  pages: { label: "PG", fg: "#9AA3B2", bg: "rgba(255,255,255,0.08)" },
  settings: { label: "SET", fg: "#56C7C7", bg: "rgba(64,180,180,0.14)" },
};

const GROUP_LABEL: Record<CommandSearchGroupKey, string> = {
  orders: "Commandes",
  customers: "Clients",
  products: "Produits",
  variants: "Variantes",
  pages: "Pages",
  settings: "Paramètres",
};

const GROUP_HINT: Record<CommandSearchGroupKey, string> = {
  orders: "Ouvrir",
  customers: "Ouvrir",
  products: "Modifier",
  variants: "Modifier",
  pages: "Aller",
  settings: "Ouvrir",
};

const GROUP_OVERFLOW_HREF: Partial<Record<CommandSearchGroupKey, string>> = {
  orders: "/admin?tab=orders",
  customers: "/admin?tab=customers",
  products: "/admin?tab=products",
  variants: "/admin?tab=products",
};

/* Local index — pages & settings resolve instantly, no server round-trip. */
type LocalEntry = { title: string; subtitle: string; href: string; keywords: string };

const PAGES_INDEX: LocalEntry[] = [
  { title: "Vue d'ensemble", subtitle: "Tableau de bord", href: "/admin", keywords: "overview dashboard accueil vue" },
  { title: "Produits", subtitle: "Catalogue", href: "/admin?tab=products", keywords: "products produits catalogue" },
  { title: "Catégories", subtitle: "Catalogue", href: "/admin?tab=categories", keywords: "categories catégories" },
  { title: "Produits populaires", subtitle: "Catalogue", href: "/admin?tab=featured", keywords: "featured populaires vedette" },
  { title: "Toutes les commandes", subtitle: "Commandes", href: "/admin?tab=orders", keywords: "orders commandes" },
  { title: "Revue paiements", subtitle: "Commandes", href: "/admin?tab=payments", keywords: "payments paiements revue review" },
  { title: "Traitement", subtitle: "Commandes", href: "/admin?tab=fulfillment", keywords: "fulfillment traitement livraison" },
  { title: "Remboursements", subtitle: "Commandes", href: "/admin?tab=refunds", keywords: "refunds remboursements" },
  { title: "Stock", subtitle: "Inventaire & codes", href: "/admin?tab=inventory", keywords: "stock inventory inventaire codes" },
  { title: "Clients", subtitle: "Comptes clients", href: "/admin?tab=customers", keywords: "customers clients comptes" },
  { title: "Éditeur d'accueil", subtitle: "Page d'accueil", href: "/admin/editor", keywords: "editor éditeur accueil homepage" },
  { title: "Pages légales", subtitle: "Contenu", href: "/admin?tab=legal-pages", keywords: "legal légales cgv confidentialité" },
];

const SETTINGS_INDEX: LocalEntry[] = [
  { title: "Boutique", subtitle: "Branding · accueil · thème", href: "/admin?tab=settings", keywords: "settings boutique branding thème theme store" },
  { title: "Paiements", subtitle: "Banques · USDT · PayPal", href: "/admin?tab=payment-settings", keywords: "payment methods paiements banque bank usdt paypal carte" },
  { title: "Templates email", subtitle: "Emails transactionnels", href: "/admin?tab=email-templates", keywords: "email templates mails" },
  { title: "Mode maintenance", subtitle: "Boutique hors ligne", href: "/admin?tab=maintenance", keywords: "maintenance mode offline" },
  { title: "API fournisseur", subtitle: "Intégrations", href: "/admin?tab=suppliers", keywords: "api fournisseur supplier" },
  { title: "Outils développeur", subtitle: "Debug & données", href: "/admin?tab=developer", keywords: "developer développeur debug outils" },
];

function searchLocal(query: string): CommandSearchGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const match = (entry: LocalEntry) =>
    entry.title.toLowerCase().includes(q) || entry.keywords.includes(q);
  const build = (group: CommandSearchGroupKey, index: LocalEntry[]): CommandSearchGroup | null => {
    const hits = index.filter(match);
    if (hits.length === 0) return null;
    return {
      group,
      hasMore: false,
      items: hits.slice(0, 5).map((entry) => ({
        id: entry.href + entry.title,
        title: entry.title,
        subtitle: entry.subtitle,
        href: entry.href,
      })),
    };
  };
  return [build("pages", PAGES_INDEX), build("settings", SETTINGS_INDEX)].filter(
    (group): group is CommandSearchGroup => group !== null,
  );
}

/* Recents — last 5 opened, de-duped, persisted per browser. */
type RecentEntry = { group: CommandSearchGroupKey; title: string; subtitle: string; href: string };
const RECENTS_KEY = "ghostAdminSearchRecents";

function loadRecents(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: RecentEntry) {
  try {
    const next = [entry, ...loadRecents().filter((r) => r.href !== entry.href || r.title !== entry.title)].slice(0, 5);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — recents are best-effort */
  }
}

type QuickAction = { title: string; kbd: string; href: string; newTab?: boolean };
const QUICK_ACTIONS: QuickAction[] = [
  { title: "Nouvelle commande", kbd: "O", href: "/admin?tab=orders" },
  { title: "Ajouter un produit", kbd: "P", href: "/admin?tab=products" },
  { title: "Voir la boutique", kbd: "⇧S", href: "/", newTab: true },
];

/* A flat, keyboard-navigable row. */
type Row =
  | { kind: "item"; group: CommandSearchGroupKey; item: CommandSearchItem }
  | { kind: "more"; group: CommandSearchGroupKey; href: string }
  | { kind: "recent"; entry: RecentEntry }
  | { kind: "action"; action: QuickAction };

function rowHref(row: Row): string {
  switch (row.kind) {
    case "item":
      return row.item.href;
    case "more":
      return row.href;
    case "recent":
      return row.entry.href;
    case "action":
      return row.action.href;
  }
}

const GROUP_ORDER: CommandSearchGroupKey[] = [
  "orders",
  "customers",
  "products",
  "variants",
  "pages",
  "settings",
];

function sortAndFloatExact(groups: CommandSearchGroup[]): CommandSearchGroup[] {
  const ordered = [...groups].sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
  );
  // Exact matches float to the very top of the whole list.
  const exactIndex = ordered.findIndex((group) => group.items.some((item) => item.exact));
  if (exactIndex > 0) {
    const [exactGroup] = ordered.splice(exactIndex, 1);
    exactGroup.items = [
      ...exactGroup.items.filter((item) => item.exact),
      ...exactGroup.items.filter((item) => !item.exact),
    ];
    ordered.unshift(exactGroup);
  } else if (exactIndex === 0) {
    ordered[0] = {
      ...ordered[0],
      items: [
        ...ordered[0].items.filter((item) => item.exact),
        ...ordered[0].items.filter((item) => !item.exact),
      ],
    };
  }
  return ordered;
}

const SearchIcon = ({ size = 17, stroke = T.iconStroke }: { size?: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.6" y2="16.6" />
  </svg>
);

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: T.mono,
        fontSize: "10.5px",
        color: T.text2,
        border: `1px solid ${T.borderStrong}`,
        borderRadius: "5px",
        padding: "1px 6px",
      }}
    >
      {children}
    </span>
  );
}

function GroupHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px 6px" }}>
      <span
        style={{
          fontSize: "10.5px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: T.faint,
          fontFamily: T.mono,
        }}
      >
        {label}
      </span>
      {typeof count === "number" ? (
        <span style={{ fontFamily: T.mono, fontSize: "10px", color: T.muted }}>{count}</span>
      ) : null}
    </div>
  );
}

const CACHE_TTL_MS = 30_000;
const DEBOUNCE_MS = 120;
const SKELETON_DELAY_MS = 150;
const TIMEOUT_MS = 4_000;

export default function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [serverGroups, setServerGroups] = useState<CommandSearchGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(0);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [retryTick, setRetryTick] = useState(0);
  const [isPhone, setIsPhone] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const requestToken = useRef(0);
  const cache = useRef(new Map<string, { at: number; groups: CommandSearchGroup[] }>());
  /* Keyboard intent wins over hover until the mouse moves again. */
  const keyboardIntent = useRef(false);

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 640px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPhone = () => setIsPhone(phone.matches);
    const syncMotion = () => setReducedMotion(motion.matches);
    syncPhone();
    syncMotion();
    phone.addEventListener("change", syncPhone);
    motion.addEventListener("change", syncMotion);
    return () => {
      phone.removeEventListener("change", syncPhone);
      motion.removeEventListener("change", syncMotion);
    };
  }, []);

  const openPalette = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setRecents(loadRecents());
    setQuery("");
    setServerGroups(null);
    setError(false);
    setSelected(0);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setLoading(false);
    setShowSkeleton(false);
    (previousFocusRef.current ?? triggerRef.current)?.focus?.();
  }, []);

  /* ⌘K / Ctrl+K from anywhere in the admin. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openPalette, closePalette]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /* Debounced server search with stale-token guard, 4s timeout and 30s cache. */
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setServerGroups(null);
      setLoading(false);
      setShowSkeleton(false);
      setError(false);
      return;
    }

    const cached = cache.current.get(trimmed);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setServerGroups(cached.groups);
      setLoading(false);
      setShowSkeleton(false);
      setError(false);
      return;
    }

    const token = ++requestToken.current;
    setLoading(true);
    setError(false);
    const skeletonTimer = window.setTimeout(() => {
      if (requestToken.current === token) setShowSkeleton(true);
    }, SKELETON_DELAY_MS);

    const debounceTimer = window.setTimeout(() => {
      const timeout = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
      );
      Promise.race([adminCommandSearchAction(trimmed), timeout])
        .then((result) => {
          if (requestToken.current !== token) return;
          window.clearTimeout(skeletonTimer);
          cache.current.set(trimmed, { at: Date.now(), groups: result.groups });
          setServerGroups(result.groups);
          setLoading(false);
          setShowSkeleton(false);
        })
        .catch(() => {
          if (requestToken.current !== token) return;
          window.clearTimeout(skeletonTimer);
          setLoading(false);
          setShowSkeleton(false);
          setError(true);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounceTimer);
      window.clearTimeout(skeletonTimer);
    };
  }, [open, query, retryTick]);

  const hasQuery = query.trim().length > 0;
  const localGroups = useMemo(() => searchLocal(query), [query]);
  const groups = useMemo(
    () => sortAndFloatExact([...(serverGroups ?? []), ...localGroups]),
    [serverGroups, localGroups],
  );

  /* Flat row list + the group boundaries, for rendering and keyboard nav. */
  const { rows, sections } = useMemo(() => {
    const rows: Row[] = [];
    const sections: { header: { label: string; count?: number } | null; start: number; end: number }[] = [];

    if (!hasQuery) {
      if (recents.length > 0) {
        const start = rows.length;
        recents.forEach((entry) => rows.push({ kind: "recent", entry }));
        sections.push({ header: { label: "Récent" }, start, end: rows.length });
      }
      const start = rows.length;
      QUICK_ACTIONS.forEach((action) => rows.push({ kind: "action", action }));
      sections.push({ header: { label: "Actions rapides" }, start, end: rows.length });
      return { rows, sections };
    }

    for (const group of groups) {
      const start = rows.length;
      group.items.forEach((item) => rows.push({ kind: "item", group: group.group, item }));
      const overflowHref = GROUP_OVERFLOW_HREF[group.group];
      if (group.hasMore && overflowHref) rows.push({ kind: "more", group: group.group, href: overflowHref });
      sections.push({
        header: { label: GROUP_LABEL[group.group], count: group.items.length },
        start,
        end: rows.length,
      });
    }
    return { rows, sections };
  }, [hasQuery, recents, groups]);

  /* The best result is pre-selected whenever the row list changes. */
  useEffect(() => {
    setSelected(0);
  }, [rows, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`#gh-cmd-opt-${selected}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selected, open]);

  const openRow = useCallback(
    (row: Row, newTab: boolean) => {
      const href = rowHref(row);
      if (row.kind === "item") {
        pushRecent({ group: row.group, title: row.item.title, subtitle: row.item.subtitle, href });
      } else if (row.kind === "recent") {
        pushRecent(row.entry);
      }
      const external = newTab || (row.kind === "action" && row.action.newTab);
      if (external) window.open(href, "_blank", "noopener");
      else router.push(href);
      closePalette();
    },
    [router, closePalette],
  );

  const onInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        keyboardIntent.current = true;
        if (rows.length === 0) return;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setSelected((current) => (current + delta + rows.length) % rows.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const row = rows[selected];
        if (row) openRow(row, event.metaKey || event.ctrlKey);
      } else if (event.key === "Tab") {
        // Tab jumps to the next group header instead of leaving the dialog.
        event.preventDefault();
        keyboardIntent.current = true;
        if (sections.length === 0) return;
        const currentSection = sections.findIndex(
          (section) => selected >= section.start && selected < section.end,
        );
        const next = sections[(currentSection + 1) % sections.length];
        setSelected(next.start);
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (query) {
          setQuery("");
          setServerGroups(null);
          setError(false);
        } else {
          closePalette();
        }
      }
    },
    [rows, sections, selected, query, openRow, closePalette],
  );

  const retry = useCallback(() => {
    cache.current.delete(query.trim());
    setError(false);
    setRetryTick((tick) => tick + 1);
  }, [query]);

  const showError = hasQuery && error;
  const showSkeletonBody = hasQuery && !showError && showSkeleton && rows.length === 0;
  const showNoResults = hasQuery && !showError && !loading && rows.length === 0;
  const resultCount = rows.filter((row) => row.kind === "item").length;

  let globalIndex = -1;

  const renderRow = (row: Row) => {
    globalIndex += 1;
    const index = globalIndex;
    const active = index === selected;
    const base: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "9px 12px",
      borderRadius: isPhone ? "11px" : "10px",
      cursor: "pointer",
      minHeight: isPhone ? "44px" : undefined,
      background: active ? T.rowSelectedBg : isPhone ? T.rowChip : "transparent",
      boxShadow: active ? T.rowSelectedRing : "none",
      marginBottom: isPhone ? "6px" : 0,
    };
    const common = {
      id: `gh-cmd-opt-${index}`,
      role: "option" as const,
      "aria-selected": active,
      onClick: () => openRow(row, false),
      onMouseEnter: () => {
        if (keyboardIntent.current) return;
        setSelected(index);
      },
      onMouseMove: () => {
        keyboardIntent.current = false;
        setSelected(index);
      },
      style: base,
    };

    if (row.kind === "action") {
      return (
        <div key={`action-${row.action.title}`} {...common}>
          <span
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "7px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(62,123,250,0.14)",
              color: T.accentTextSoft,
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {row.action.newTab ? (
                <>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </>
              ) : (
                <>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </>
              )}
            </svg>
          </span>
          <div style={{ flex: 1, fontSize: "13.5px", fontWeight: 500 }}>{row.action.title}</div>
          {!isPhone ? (
            <span
              style={{
                fontFamily: T.mono,
                fontSize: "10.5px",
                color: T.muted,
                border: `1px solid ${T.borderControl}`,
                borderRadius: "5px",
                padding: "2px 6px",
              }}
            >
              {row.action.kbd}
            </span>
          ) : null}
        </div>
      );
    }

    if (row.kind === "more") {
      return (
        <div key={`more-${row.group}`} {...common}>
          <span style={{ width: "36px", flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: "12.5px", color: T.accentTextBright }}>
            Tout afficher — {GROUP_LABEL[row.group]} →
          </div>
          {active ? (
            <span style={{ fontFamily: T.mono, fontSize: "10.5px", color: T.accentTextBright }}>↵</span>
          ) : null}
        </div>
      );
    }

    const group = row.kind === "recent" ? row.entry.group : row.group;
    const badge = TYPE_BADGE[group] ?? TYPE_BADGE.pages;
    const title = row.kind === "recent" ? row.entry.title : row.item.title;
    const subtitle = row.kind === "recent" ? row.entry.subtitle : row.item.subtitle;
    const status = row.kind === "item" ? row.item.status : undefined;
    const mono = row.kind === "item" ? row.item.mono : false;
    const tone = status ? TONE[status.tone] : null;
    // Phone: shrink the badge to a single value — the count for stock
    // badges ("8 en stock" → "8"), the meaningful word otherwise.
    const words = status?.text.split(" ") ?? [];
    const statusText =
      status && isPhone && words.length > 1
        ? /^\d/.test(words[0])
          ? words[0]
          : words[words.length - 1]
        : status?.text;

    return (
      <div key={`${row.kind}-${group}-${title}-${index}`} {...common}>
        <span
          style={{
            fontFamily: T.mono,
            fontSize: "10px",
            fontWeight: 500,
            width: "36px",
            textAlign: "center",
            borderRadius: "6px",
            padding: "3px 0",
            flexShrink: 0,
            color: badge.fg,
            background: badge.bg,
          }}
        >
          {badge.label}
        </span>
        {row.kind === "recent" ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke={T.placeholder}
            strokeWidth="2"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "13.5px",
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: "11.5px",
              color: T.muted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontFamily: mono ? T.mono : undefined,
            }}
          >
            {subtitle}
          </div>
        </div>
        {status && tone ? (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              fontFamily: T.mono,
              borderRadius: "6px",
              padding: "2px 8px",
              whiteSpace: "nowrap",
              color: tone.fg,
              background: tone.bg,
            }}
          >
            {statusText}
          </span>
        ) : null}
        {active ? (
          <span
            style={{
              fontSize: "10.5px",
              color: T.accentTextBright,
              fontFamily: T.mono,
              whiteSpace: "nowrap",
            }}
          >
            {row.kind === "recent" ? "↵" : `${GROUP_HINT[group]} ↵`}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <style>{`
        @keyframes ghspin { to { transform: rotate(360deg); } }
        @keyframes ghpulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.9; } }
        @keyframes ghfade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* Closed trigger — an affordance, not a live input. Never navigates on its own. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openPalette}
        aria-label="Rechercher ou accéder à…"
        style={{
          flex: 1,
          maxWidth: "440px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          height: "38px",
          padding: "0 13px",
          background: T.input,
          border: `1px solid ${T.border}`,
          borderRadius: "10px",
          cursor: "text",
          textAlign: "left",
          color: "inherit",
          font: "inherit",
        }}
      >
        <SearchIcon size={15} stroke={T.muted} />
        <span style={{ flex: 1, color: T.placeholder, fontSize: "13px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Rechercher ou accéder à…
        </span>
        <span
          style={{
            fontFamily: T.mono,
            fontSize: "11px",
            color: T.muted,
            border: `1px solid ${T.borderStrong}`,
            borderRadius: "5px",
            padding: "1px 6px",
          }}
        >
          ⌘K
        </span>
      </button>

      {/* Portal to <body>: the topbar's backdrop-filter would otherwise become
          the containing block for this fixed overlay and trap it in the header. */}
      {open && typeof document !== "undefined" ? (
        createPortal(
        <div
          onClick={closePalette}
          style={{
            position: "fixed",
            inset: 0,
            background: T.backdrop,
            backdropFilter: "blur(3px)",
            display: "flex",
            justifyContent: "center",
            paddingTop: isPhone ? 0 : "64px",
            zIndex: 80,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Recherche admin"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: isPhone ? "100%" : "600px",
              maxWidth: isPhone ? "100%" : "calc(100vw - 32px)",
              height: isPhone ? "100%" : undefined,
              maxHeight: isPhone ? "100%" : "calc(100vh - 130px)",
              display: "flex",
              flexDirection: "column",
              background: T.paletteCard,
              border: isPhone ? "none" : `1px solid ${T.borderStrong}`,
              borderRadius: isPhone ? 0 : "15px",
              overflow: "hidden",
              boxShadow: T.shadowCard,
              animation: reducedMotion ? undefined : "ghfade 0.14s ease-out",
            }}
          >
            {/* Input row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "15px 17px",
                borderBottom: `1px solid ${T.borderSubtle}`,
                flexShrink: 0,
              }}
            >
              {loading && showSkeleton && !reducedMotion ? (
                <div
                  style={{
                    width: "17px",
                    height: "17px",
                    border: "2px solid rgba(127,166,255,0.3)",
                    borderTopColor: T.accentTextBright,
                    borderRadius: "50%",
                    animation: "ghspin 0.7s linear infinite",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <SearchIcon />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Rechercher commandes, clients, produits, paramètres…"
                role="combobox"
                aria-expanded="true"
                aria-controls="gh-cmd-listbox"
                aria-activedescendant={rows.length > 0 ? `gh-cmd-opt-${selected}` : undefined}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: T.text,
                  fontSize: "15.5px",
                  minWidth: 0,
                }}
              />
              {hasQuery && !isPhone ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  style={{
                    border: "none",
                    background: "rgba(255,255,255,0.06)",
                    color: T.text2,
                    fontSize: "11px",
                    fontFamily: T.mono,
                    borderRadius: "6px",
                    padding: "3px 7px",
                    cursor: "pointer",
                  }}
                >
                  clear
                </button>
              ) : null}
              {hasQuery && !loading && !showError ? (
                <span style={{ fontFamily: T.mono, fontSize: "10.5px", color: T.muted, whiteSpace: "nowrap" }}>
                  {resultCount} résultat{resultCount > 1 ? "s" : ""}
                </span>
              ) : null}
              {isPhone ? (
                <button
                  type="button"
                  onClick={closePalette}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: T.accentTextBright,
                    fontSize: "13.5px",
                    fontWeight: 500,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Annuler
                </button>
              ) : (
                <Kbd>esc</Kbd>
              )}
            </div>

            {/* Body */}
            <div
              ref={listRef}
              id="gh-cmd-listbox"
              role="listbox"
              style={{ flex: 1, overflowY: "auto", padding: "8px 8px 6px", minHeight: isPhone ? 0 : "180px" }}
            >
              {showError ? (
                <div
                  style={{
                    padding: "34px 24px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "rgba(224,92,92,0.12)",
                      border: "1px solid rgba(224,92,92,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#E05C5C" strokeWidth="2">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>
                      Recherche indisponible
                    </div>
                    <div style={{ fontSize: "13px", color: T.text2, maxWidth: "340px" }}>
                      Impossible de joindre le service de recherche. Vérifiez votre connexion.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={retry}
                    style={{
                      height: "34px",
                      padding: "0 16px",
                      borderRadius: "9px",
                      border: "1px solid rgba(62,123,250,0.35)",
                      background: "rgba(62,123,250,0.14)",
                      color: T.accentTextSoft,
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Réessayer
                  </button>
                </div>
              ) : showSkeletonBody ? (
                <div style={{ padding: "6px 6px 12px" }}>
                  <GroupHeader label="Recherche…" />
                  {[0, 1].map((index) => (
                    <div
                      key={index}
                      style={{ display: "flex", alignItems: "center", gap: "12px", padding: "9px 12px" }}
                    >
                      <div
                        style={{
                          width: "26px",
                          height: "26px",
                          borderRadius: "7px",
                          background: "rgba(255,255,255,0.05)",
                          animation: reducedMotion ? undefined : `ghpulse 1.2s infinite ${index * 0.2}s`,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            height: "12px",
                            width: index === 0 ? "52%" : "44%",
                            borderRadius: "5px",
                            background: "rgba(255,255,255,0.06)",
                            animation: reducedMotion ? undefined : `ghpulse 1.2s infinite ${index * 0.2}s`,
                          }}
                        />
                        <div
                          style={{
                            height: "9px",
                            width: index === 0 ? "34%" : "28%",
                            borderRadius: "5px",
                            background: "rgba(255,255,255,0.04)",
                            marginTop: "7px",
                            animation: reducedMotion ? undefined : `ghpulse 1.2s infinite ${index * 0.2 + 0.15}s`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : showNoResults ? (
                <div
                  style={{
                    padding: "34px 24px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${T.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <SearchIcon size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>
                      Aucun résultat pour «&nbsp;<span style={{ color: T.textBright }}>{query.trim()}</span>&nbsp;»
                    </div>
                    <div style={{ fontSize: "13px", color: T.text2 }}>
                      Essayez un numéro de commande, un email client ou un nom de produit.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                    <button
                      type="button"
                      onClick={() => {
                        router.push("/admin?tab=orders");
                        closePalette();
                      }}
                      style={{
                        height: "30px",
                        padding: "0 12px",
                        borderRadius: "8px",
                        border: `1px solid ${T.borderControl}`,
                        background: T.rowChip,
                        color: T.text2,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      Nouvelle commande
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        router.push("/admin?tab=products");
                        closePalette();
                      }}
                      style={{
                        height: "30px",
                        padding: "0 12px",
                        borderRadius: "8px",
                        border: `1px solid ${T.borderControl}`,
                        background: T.rowChip,
                        color: T.text2,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      Ajouter un produit
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {sections.map((section, sectionIndex) => (
                    <div key={sectionIndex} style={{ paddingBottom: "4px" }}>
                      {sectionIndex > 0 && !hasQuery ? (
                        <div style={{ height: "1px", background: T.borderHairline, margin: "8px 10px" }} />
                      ) : null}
                      {section.header ? (
                        <GroupHeader label={section.header.label} count={section.header.count} />
                      ) : null}
                      {rows.slice(section.start, section.end).map((row) => renderRow(row))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {!isPhone ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "10px 16px",
                  borderTop: `1px solid ${T.borderSubtle}`,
                  background: T.surface,
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Kbd>↑↓</Kbd>
                  <span style={{ fontSize: "11.5px", color: T.muted }}>naviguer</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Kbd>↵</Kbd>
                  <span style={{ fontSize: "11.5px", color: T.muted }}>ouvrir</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Kbd>esc</Kbd>
                  <span style={{ fontSize: "11.5px", color: T.muted }}>fermer</span>
                </div>
                <div style={{ flex: 1 }} />
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
        )
      ) : null}
    </>
  );
}
