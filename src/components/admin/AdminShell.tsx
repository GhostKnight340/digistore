"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import CommandSearch from "@/components/admin/CommandSearch";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { isInventoryEnabled } from "@/lib/storeSettings";

/** Literal design tokens from the admin handoff (docs/admin-handoff/05-Design-Tokens.md). */
const C = {
  sidebar: "#0C0D11",
  surfaceInput: "#121319",
  text: "#F3F4F7",
  muted: "#9A9FAB",
  faint: "#646A77",
  fainter: "#4d525d",
  accentSoft: "rgba(62,123,250,0.13)",
  accentText: "#EAF0FF",
  accentBlue: "#7FA6FF",
  warning: "#E8A838",
  success: "#2EA067",
  successText: "#5BC98C",
  accentTextSoft: "#9FB8FF",
  borderHairline: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.07)",
  borderInput: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.1)",
};

export type NavCounts = { activeOrders: number; paymentReview: number; supportOpen: number };

/**
 * Nav ids that are their own standalone route rather than an in-place ?tab=
 * panel. Both the dashboard and AdminShellRoute consult this so clicking the
 * item routes to the page instead of trying to render a (nonexistent) panel.
 */
export const ADMIN_STANDALONE_ROUTES: Record<string, string> = {
  "import-reloadly": "/admin/catalog/import-reloadly",
};

export type AdminIdentity = { name: string; roleLabel: string; initials: string };

type NavItem = {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: "activeOrders" | "paymentReview" | "supportOpen";
  badgeTone?: "accent" | "warning";
};

type NavGroup = { heading?: string; divider?: boolean; items: NavItem[] };

const icon = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    {children}
  </svg>
);

const NAV: NavGroup[] = [
  {
    items: [
      {
        id: "overview",
        label: "Vue d'ensemble",
        icon: icon(
          <>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </>,
        ),
      },
    ],
  },
  {
    heading: "Catalogue",
    items: [
      {
        id: "products",
        label: "Produits",
        icon: icon(
          <>
            <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <path d="M3.3 7L12 12l8.7-5M12 22V12" />
          </>,
        ),
      },
      {
        id: "categories",
        label: "Catégories",
        icon: icon(
          <>
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </>,
        ),
      },
      {
        id: "featured",
        label: "Produits populaires",
        icon: icon(
          <polygon points="12 2 15.1 8.6 22 9.3 17 14.1 18.2 21 12 17.6 5.8 21 7 14.1 2 9.3 8.9 8.6 12 2" />,
        ),
      },
      {
        id: "pricing",
        label: "Tarification",
        icon: icon(
          <>
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </>,
        ),
      },
      {
        id: "import-reloadly",
        label: "Importer Reloadly",
        icon: icon(
          <>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </>,
        ),
      },
    ],
  },
  {
    heading: "Commandes",
    items: [
      {
        id: "orders",
        label: "Toutes les commandes",
        badge: "activeOrders",
        badgeTone: "accent",
        icon: icon(
          <>
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </>,
        ),
      },
      {
        id: "payments",
        label: "Revue paiements",
        badge: "paymentReview",
        badgeTone: "warning",
        icon: icon(
          <>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </>,
        ),
      },
      {
        id: "fulfillment",
        label: "Traitement",
        icon: icon(<polyline points="20 6 9 17 4 12" />),
      },
      {
        id: "refunds",
        label: "Remboursements",
        icon: icon(
          <>
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" />
          </>,
        ),
      },
    ],
  },
  {
    divider: true,
    items: [
      {
        id: "inventory",
        label: "Stock",
        icon: icon(<path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />),
      },
      {
        id: "customers",
        label: "Clients",
        icon: icon(
          <>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
          </>,
        ),
      },
      {
        id: "support",
        label: "Support",
        badge: "supportOpen",
        badgeTone: "warning",
        icon: icon(
          <>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3.5" />
            <path d="M5.7 5.7l4 4M14.3 14.3l4 4M18.3 5.7l-4 4M9.7 14.3l-4 4" />
          </>,
        ),
      },
    ],
  },
  {
    heading: "Finance",
    items: [
      {
        id: "expenses",
        label: "Dépenses",
        icon: icon(
          <>
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </>,
        ),
      },
    ],
  },
  {
    heading: "Paramètres",
    items: [
      {
        id: "settings",
        label: "Boutique",
        icon: icon(
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 9.4l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 11 4.6V4.5a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 11h.1a2 2 0 0 1 0 4h-.1z" />
          </>,
        ),
      },
      {
        id: "payment-settings",
        label: "Paiements",
        icon: icon(
          <>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </>,
        ),
      },
      {
        id: "email-templates",
        label: "Templates email",
        icon: icon(
          <>
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-10 5L2 7" />
          </>,
        ),
      },
      {
        id: "suppliers",
        // Intentionally English — the Provider API page is kept in English by
        // owner request (rest of the admin is French). Do not translate back.
        label: "Provider API",
        icon: icon(
          <>
            <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
          </>,
        ),
      },
      {
        id: "developer",
        label: "Outils développeur",
        icon: icon(
          <>
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </>,
        ),
      },
    ],
  },
];

function NavRow({
  item,
  active,
  count,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const showBadge = typeof count === "number" && count > 0;
  const badgeColor = item.badgeTone === "warning" ? C.warning : C.accentBlue;
  const badgeBg = item.badgeTone === "warning" ? "rgba(232,168,56,0.18)" : "rgba(62,123,250,0.18)";

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "11px",
        height: "36px",
        padding: "0 12px",
        width: "100%",
        borderRadius: "9px",
        fontSize: "13.5px",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontWeight: active ? 600 : 400,
        color: active ? C.accentText : hover ? C.text : C.muted,
        background: active ? C.accentSoft : hover ? "rgba(255,255,255,0.03)" : "transparent",
        boxShadow: active ? "inset 0 0 0 1px rgba(62,123,250,0.20)" : "none",
        transition: "background 120ms ease, color 120ms ease",
      }}
    >
      <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </span>
      {showBadge ? (
        <span
          style={{
            marginLeft: "auto",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            background: badgeBg,
            color: badgeColor,
            borderRadius: "6px",
            padding: "1px 7px",
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export default function AdminShell({
  active,
  onNavigate,
  counts,
  admin,
  children,
}: {
  active: string;
  onNavigate: (id: string) => void;
  counts: NavCounts | null;
  admin: AdminIdentity;
  children: ReactNode;
}) {
  const [searchFocus, setSearchFocus] = useState(false);
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { settings } = useStoreSettings();

  // Inventory OFF → hide the Stock section entirely (the inventory system
  // should look as if it doesn't exist).
  const nav = useMemo(() => {
    if (isInventoryEnabled(settings)) return NAV;
    return NAV.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.id !== "inventory"),
    })).filter((group) => group.items.length > 0);
  }, [settings]);

  // Close the drawer automatically if the viewport grows back to desktop width.
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  function handleNavigate(id: string) {
    onNavigate(id);
    setDrawerOpen(false);
  }

  const currentLabel =
    nav.flatMap((group) => group.items).find((item) => item.id === active)?.label ?? "ghost.ma";

  return (
    <div style={{ display: "flex", height: "100vh", background: "#070809", color: C.text }}>
      {/* ===== Mobile drawer backdrop ===== */}
      {isMobile && drawerOpen ? (
        <div
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 55 }}
        />
      ) : null}

      {/* ===== Sidebar ===== */}
      <aside
        style={{
          width: isMobile ? "min(82vw, 300px)" : "248px",
          flexShrink: 0,
          background: C.sidebar,
          borderRight: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          height: isMobile ? "100vh" : "100%",
          ...(isMobile
            ? {
                position: "fixed" as const,
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 60,
                transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 220ms ease",
                boxShadow: drawerOpen ? "0 0 40px rgba(0,0,0,0.55)" : "none",
              }
            : {}),
        }}
      >
        <div
          style={{
            height: "60px",
            display: "flex",
            alignItems: "center",
            gap: "11px",
            padding: "0 20px",
            borderBottom: `1px solid ${C.borderHairline}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "8px",
              background: "linear-gradient(145deg,#3E7BFA,#2B5FD9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(62,123,250,0.35)",
            }}
          >
            <div style={{ width: "11px", height: "11px", border: "2px solid #fff", borderRadius: "3px" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em" }}>ghost.ma</span>
            <span style={{ fontSize: "11px", color: C.faint, fontFamily: "var(--font-mono)" }}>admin</span>
          </div>
          {isMobile ? (
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Fermer le menu"
              style={{
                marginLeft: "auto",
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                border: `1px solid ${C.borderStrong}`,
                background: C.surfaceInput,
                color: C.muted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : null}
        </div>

        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: "3px",
          }}
        >
          {nav.map((group, gi) => (
            <div key={group.heading ?? `group-${gi}`} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {group.divider ? (
                <div style={{ height: "1px", background: C.borderHairline, margin: "14px 8px" }} />
              ) : null}
              {group.heading ? (
                <div
                  style={{
                    fontSize: "10.5px",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: C.fainter,
                    padding: "14px 12px 6px",
                    fontWeight: 500,
                  }}
                >
                  {group.heading}
                </div>
              ) : null}
              {group.items.map((item) => (
                <NavRow
                  key={item.id}
                  item={item}
                  active={active === item.id}
                  count={item.badge ? counts?.[item.badge] : undefined}
                  onClick={() => handleNavigate(item.id)}
                />
              ))}
            </div>
          ))}
        </nav>

        <div style={{ padding: "12px", borderTop: `1px solid ${C.borderHairline}`, flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px",
              borderRadius: "10px",
              background: C.surfaceInput,
              border: `1px solid ${C.borderHairline}`,
            }}
          >
            <div
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "8px",
                background: "linear-gradient(145deg,#2c3445,#171b26)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 600,
                color: C.accentTextSoft,
              }}
            >
              {admin.initials}
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <div
                style={{
                  fontSize: "12.5px",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {admin.name}
              </div>
              <div style={{ fontSize: "11px", color: C.faint }}>{admin.roleLabel}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </div>
        </div>
      </aside>

      {/* ===== Main ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        {/* Topbar */}
        <header
          style={{
            height: "60px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: isMobile ? "10px" : "16px",
            padding: isMobile ? "0 14px" : "0 22px",
            borderBottom: `1px solid ${C.border}`,
            background: "rgba(10,11,13,0.6)",
            backdropFilter: "blur(12px)",
          }}
        >
          {isMobile ? (
            <>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Ouvrir le menu"
                style={{
                  width: "38px",
                  height: "38px",
                  flexShrink: 0,
                  borderRadius: "9px",
                  border: `1px solid ${C.borderStrong}`,
                  background: C.surfaceInput,
                  color: C.text,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "15px",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {currentLabel}
              </span>
              <CommandSearch
                renderTrigger={(open) => (
                  <button
                    type="button"
                    onClick={open}
                    aria-label="Rechercher ou accéder à…"
                    style={{
                      width: "38px",
                      height: "38px",
                      flexShrink: 0,
                      borderRadius: "9px",
                      border: `1px solid ${C.borderStrong}`,
                      background: C.surfaceInput,
                      color: C.muted,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="7" />
                      <line x1="21" y1="21" x2="16.6" y2="16.6" />
                    </svg>
                  </button>
                )}
              />
            </>
          ) : (
            <CommandSearch
              renderTrigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  onFocus={() => setSearchFocus(true)}
                  onBlur={() => setSearchFocus(false)}
                  aria-label="Rechercher ou accéder à…"
                  style={{
                    flex: 1,
                    maxWidth: "420px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    height: "38px",
                    padding: "0 13px",
                    background: C.surfaceInput,
                    border: `1px solid ${searchFocus ? "rgba(62,123,250,0.35)" : C.borderInput}`,
                    borderRadius: "10px",
                    boxShadow: searchFocus ? "0 0 0 3px rgba(62,123,250,0.20)" : "none",
                    transition: "border-color 120ms ease, box-shadow 120ms ease",
                    cursor: "text",
                    textAlign: "left",
                    font: "inherit",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.6" y2="16.6" />
                  </svg>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: C.faint,
                      fontSize: "13px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Rechercher ou accéder à…  commandes, produits, clients
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      color: C.faint,
                      border: `1px solid ${C.borderStrong}`,
                      borderRadius: "5px",
                      padding: "1px 6px",
                    }}
                  >
                    ⌘K
                  </span>
                </button>
              )}
            />
          )}
          {!isMobile ? <div style={{ flex: 1 }} /> : null}
          <Link
            href="/"
            aria-label="Voir la boutique"
            style={{
              height: isMobile ? "38px" : "36px",
              width: isMobile ? "38px" : undefined,
              padding: isMobile ? 0 : "0 13px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              borderRadius: "9px",
              border: `1px solid ${C.borderStrong}`,
              background: C.surfaceInput,
              color: C.muted,
              fontSize: "13px",
              fontWeight: 500,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            {isMobile ? null : "Voir la boutique"}
          </Link>
          {!isMobile ? (
            <Link
              href="/admin/editor"
              style={{
                height: "36px",
                padding: "0 15px",
                display: "flex",
                alignItems: "center",
                gap: "7px",
                borderRadius: "9px",
                border: "1px solid rgba(62,123,250,0.35)",
                background: "rgba(62,123,250,0.14)",
                color: C.accentTextSoft,
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
              Éditeur d'accueil
            </Link>
          ) : null}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              height: "30px",
              padding: "0 11px",
              borderRadius: "8px",
              background: "rgba(46,160,103,0.12)",
              border: "1px solid rgba(46,160,103,0.28)",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: C.success,
                boxShadow: `0 0 8px ${C.success}`,
              }}
            />
            <span style={{ fontSize: "11.5px", fontWeight: 500, color: C.successText, fontFamily: "var(--font-mono)" }}>
              LIVE
            </span>
          </div>
        </header>

        {/* Content slot */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>{children}</div>
      </div>
    </div>
  );
}
