import { adminSectionId } from "./adminSections";

/**
 * Curated index of concrete admin SETTINGS & CONTROLS — the things an admin
 * changes, not just the pages. This powers the "Réglages" group in the command
 * palette so a search like "changer couleur du thème", "fermer la boutique", or
 * "wallet USDT" jumps straight to the right control.
 *
 * `section` (when present) deep-links to a specific card inside the Boutique
 * settings panel via `?section=` — the id matches that card's title through
 * adminSectionId(), so the two can never drift (see SettingsPanel `Panel`).
 *
 * Keep this in sync when adding a notable admin setting. Keywords should include
 * the visible French label AND the words an admin might type (FR + EN).
 */
export type AdminCapability = {
  title: string;
  /** Where it lives — shown as the row subtitle. */
  subtitle: string;
  /** Admin tab id (see AdminShell NAV). */
  tab: string;
  /** Optional Boutique-settings sub-section title to deep-link into. */
  section?: string;
  /** Space-separated search terms (FR + EN). */
  keywords: string;
};

function href(tab: string, section?: string): string {
  const base = tab === "overview" ? "/admin" : `/admin?tab=${tab}`;
  return section ? `${base}&section=${adminSectionId(section)}` : base;
}

const CAPABILITIES: AdminCapability[] = [
  // ── Boutique settings (deep-linked sub-sections) ──────────────────────────
  {
    title: "Accepter les commandes",
    subtitle: "Boutique · Commandes clients",
    tab: "settings",
    section: "Commandes clients",
    keywords: "ouvrir fermer boutique accepter commandes ventes ordering open close store pre-launch pré-lancement désactiver achats",
  },
  {
    title: "Système d'inventaire",
    subtitle: "Boutique · Inventaire",
    tab: "settings",
    section: "Système d'inventaire",
    keywords: "inventaire stock codes activer désactiver inventory system enable disable",
  },
  {
    title: "Identité de la boutique",
    subtitle: "Boutique · Identité",
    tab: "settings",
    section: "Identité",
    keywords: "nom boutique titre logo marque branding identity name tagline slogan store name",
  },
  {
    title: "Sections de la page d'accueil",
    subtitle: "Boutique · Accueil",
    tab: "settings",
    section: "Sections de la page d'accueil",
    keywords: "afficher masquer sections accueil homepage hero catégories collections populaires livraison show hide",
  },
  {
    title: "Images des catégories",
    subtitle: "Boutique · Accueil",
    tab: "settings",
    section: "Images des catégories",
    keywords: "images catégories vignettes covers category images artwork",
  },
  {
    title: "Arguments de confiance",
    subtitle: "Boutique · Réassurance",
    tab: "settings",
    section: "Arguments de confiance",
    keywords: "confiance réassurance avis garanties badges trust arguments reviews reassurance",
  },
  {
    title: "Produits populaires",
    subtitle: "Boutique · Accueil",
    tab: "settings",
    section: "Produits populaires",
    keywords: "produits populaires vedette featured mis en avant sélection",
  },
  {
    title: "Affichage des produits en rupture",
    subtitle: "Boutique · Produits populaires",
    tab: "settings",
    section: "Affichage des produits populaires",
    keywords: "rupture stock épuisé masquer afficher out of stock display sold out",
  },
  {
    title: "Stock des catégories",
    subtitle: "Boutique · Accueil",
    tab: "settings",
    section: "Stock des catégories",
    keywords: "stock catégories affichage category stock",
  },
  {
    title: "Pied de page",
    subtitle: "Boutique · Pied de page",
    tab: "settings",
    section: "Pied de page",
    keywords: "pied de page footer liens réseaux sociaux contact bas de page social links",
  },
  {
    title: "Thème & couleurs",
    subtitle: "Boutique · Thème",
    tab: "settings",
    section: "Thème",
    keywords: "thème theme couleur couleurs accent apparence dark mode palette color colours look",
  },

  // ── Paiements ─────────────────────────────────────────────────────────────
  {
    title: "Virement bancaire (RIB)",
    subtitle: "Paiements",
    tab: "payment-settings",
    keywords: "banque bank rib iban virement compte bancaire account transfer coordonnées",
  },
  {
    title: "Portefeuille USDT / crypto",
    subtitle: "Paiements",
    tab: "payment-settings",
    keywords: "usdt crypto wallet portefeuille adresse réseau trc20 erc20 network address",
  },
  {
    title: "PayPal",
    subtitle: "Paiements",
    tab: "payment-settings",
    keywords: "paypal devise taux change currency exchange rate email",
  },
  {
    title: "Ajouter un mode de paiement",
    subtitle: "Paiements",
    tab: "payment-settings",
    keywords: "ajouter mode paiement méthode nouveau add payment method card carte cash espèces",
  },

  // ── Autres réglages ───────────────────────────────────────────────────────
  {
    title: "Templates d'e-mails",
    subtitle: "Emails transactionnels",
    tab: "email-templates",
    keywords: "email templates mails modèles confirmation livraison texte objet sujet subject body",
  },
  {
    title: "Mode maintenance",
    subtitle: "Boutique hors ligne",
    tab: "maintenance",
    keywords: "maintenance hors ligne offline fermer site couper store down",
  },
  {
    title: "Taux de change & marges",
    subtitle: "Tarification",
    tab: "pricing",
    keywords: "taux change fx devise marge marges pricing exchange rate margin prix suggéré",
  },
  {
    title: "Clés API fournisseur (Reloadly)",
    subtitle: "Provider API",
    tab: "suppliers",
    keywords: "reloadly api clé key fournisseur supplier intégration credentials sandbox live",
  },
  {
    title: "Précommande GTA VI",
    subtitle: "Campagne",
    tab: "gta-preorder",
    keywords: "gta precommande preorder campagne countdown compte à rebours hero",
  },
  {
    title: "Support & contact",
    subtitle: "Coordonnées support",
    tab: "settings",
    section: "Pied de page",
    keywords: "support whatsapp email contact coordonnées numéro téléphone phone",
  },
];

/** Command-palette-ready entries (title/subtitle/href/keywords). */
export const ADMIN_CAPABILITY_INDEX = CAPABILITIES.map((c) => ({
  title: c.title,
  subtitle: c.subtitle,
  href: href(c.tab, c.section),
  keywords: c.keywords,
}));
