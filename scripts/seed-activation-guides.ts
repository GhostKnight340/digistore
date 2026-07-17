/**
 * Content seed: publishes ghost.ma's activation-guide library — the platforms
 * currently sold (Steam, PlayStation, Xbox, Nintendo, Valorant) plus the popular
 * platforms Moroccan customers commonly buy elsewhere (Netflix, Spotify, Roblox,
 * Fortnite, Google Play, Apple, Amazon, Discord, Razer Gold, Twitch, PUBG Mobile,
 * Free Fire, League of Legends, Minecraft).
 *
 * The copy is ORIGINAL (written for ghost.ma, not copied from any third-party
 * source) and conveys each platform's standard, factual redemption flow.
 *
 * SAFE BY DESIGN:
 *   - Touches ONLY the `Guide` table. No product/pricing/inventory data.
 *   - Upserts by slug, so it is safe to re-run (authoritative for these guides).
 *   - Links a matching product + brand category only when they exist at run time,
 *     and cross-links sibling guides by family (shared icon).
 *   - Goes through the shared production write-guard: prod requires
 *     CONFIRM_PRODUCTION_DB=true.
 *
 * Run:
 *   npm run seed:activation-guides                             # local/dev DB
 *   CONFIRM_PRODUCTION_DB=true npm run seed:activation-guides  # prod (deliberate)
 *   npm run seed:activation-guides -- --dry-run
 *
 * Safe to re-run.
 */
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertWriteAllowed } from "./lib/db-guard.mjs";
import {
  normalizeGuideBlocks,
  normalizeGuideFaq,
  normalizeGuideNavigatorTip,
} from "../src/lib/guide";

const prisma = new PrismaClient();

type TipType = "information" | "compatibility" | "warning" | "security";

interface Spec {
  slug: string;
  title: string;
  summary: string;
  platform: string;
  /** Approved guide icon key; also the cross-link "family". */
  icon: "gaming" | "subscription" | "gift" | "card";
  featured?: boolean;
  /** Brand Category id to link, when it exists. */
  categoryId?: string;
  /** Product slug to link as a related product, when it exists. */
  productSlug?: string;
  seoTitle: string;
  seoDescription: string;
  aliases: string[];
  intro: string;
  stepsTitle?: string;
  steps: string[];
  /** Optional extra paragraph after the steps (e.g. a web-based alternative). */
  webNote?: string;
  warning?: string;
  troubleshooting: string[];
  faq: [string, string][];
  tip: { title: string; message: string; type: TipType; ctaLabel: string; ctaUrl: string };
}

// ── The guide library ────────────────────────────────────────────────────────

const SPECS: Spec[] = [
  // ── Platforms we sell (rich region-aware guides) ──────────────────────────
  {
    slug: "activer-carte-steam",
    title: "Activer une carte Steam Wallet",
    summary: "Créditez votre portefeuille Steam avec votre code ghost.ma, en quelques secondes.",
    platform: "Steam",
    icon: "gaming",
    featured: true,
    categoryId: "steam",
    productSlug: "steam-wallet",
    seoTitle: "Comment activer une carte Steam Wallet - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour ajouter des fonds à votre portefeuille Steam avec un code Steam Wallet acheté sur ghost.ma.",
    aliases: ["steam", "carte steam", "steam wallet", "portefeuille steam", "code steam"],
    intro: "Vous avez besoin d'un compte Steam et de votre code Steam Wallet, livré instantanément après paiement. Nos cartes Steam sont valables pour la région France.",
    stepsTitle: "Activer votre code",
    steps: [
      "Connectez-vous à Steam (application ou steampowered.com).",
      "Cliquez sur le nom de votre compte en haut à droite, puis sur « Détails du compte ».",
      "Dans « Solde du portefeuille », cliquez sur « Ajouter des fonds… » puis « Utiliser un code du portefeuille Steam ».",
      "Saisissez le code à 15 caractères tel qu'il apparaît, sans espaces.",
      "Validez : le montant est crédité immédiatement sur votre portefeuille Steam.",
    ],
    warning: "Un code Steam Wallet ne peut être utilisé qu'une seule fois et doit correspondre à la région de votre compte (France). Vérifiez la région avant d'activer.",
    troubleshooting: [
      "« Code invalide » : vérifiez les caractères souvent confondus (0 et O, 1 et I) et l'absence d'espaces.",
      "« Ce code n'est pas valable dans votre pays » : la région de votre compte ne correspond pas à celle de la carte.",
      "Le solde n'apparaît pas : rafraîchissez la page ou reconnectez-vous à Steam.",
    ],
    faq: [
      ["Où se trouve mon code Steam Wallet ?", "Il vous est livré instantanément après le paiement : dans votre email de confirmation et dans votre espace commande sur ghost.ma."],
      ["Puis-je utiliser une carte d'une autre région ?", "Non. Le code doit correspondre à la région de votre compte Steam. Nos cartes Steam sont pour la région France."],
      ["Le crédit expire-t-il ?", "Non. Une fois ajouté, le solde de votre portefeuille Steam n'expire pas."],
    ],
    tip: { title: "Compte Steam en France", message: "Cette carte s'active sur un compte Steam configuré en France. En cas de doute, contactez-nous avant d'acheter.", type: "compatibility", ctaLabel: "Voir la carte Steam Wallet", ctaUrl: "/products/steam-wallet" },
  },
  {
    slug: "activer-carte-playstation",
    title: "Activer une carte PlayStation Store",
    summary: "Ajoutez des fonds à votre portefeuille PlayStation avec votre code, sur console ou en ligne.",
    platform: "PlayStation",
    icon: "gaming",
    featured: true,
    categoryId: "playstation",
    productSlug: "playstation-store-gift-card",
    seoTitle: "Comment activer une carte PlayStation Store - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour utiliser un code PlayStation Store (PSN) sur PS5, PS4 ou en ligne, avec une carte achetée sur ghost.ma.",
    aliases: ["playstation", "psn", "carte psn", "playstation store", "code psn", "ps5", "ps4"],
    intro: "Munissez-vous de votre compte PlayStation Network et de votre code à 12 chiffres, livré instantanément après paiement. Nos cartes PlayStation sont valables pour la région France.",
    stepsTitle: "Activer sur votre console",
    steps: [
      "Connectez-vous à votre compte sur votre PS5 ou PS4.",
      "Ouvrez le PlayStation Store.",
      "Sur PS5 : sélectionnez l'icône de votre profil, puis « Utiliser des codes ». Sur PS4 : faites défiler le menu du Store jusqu'à « Utiliser un code ».",
      "Saisissez le code à 12 chiffres.",
      "Confirmez : les fonds sont ajoutés à votre portefeuille PlayStation.",
    ],
    webNote: "Vous pouvez aussi utiliser votre code depuis un navigateur, sur la page de gestion de compte PlayStation, section « Utiliser un code ».",
    warning: "Un code PlayStation ne s'utilise qu'une seule fois et doit correspondre à la région de votre compte (France). Vérifiez la région avant d'activer.",
    troubleshooting: [
      "« Code non valide » : revérifiez chaque chiffre et l'absence d'espaces.",
      "« Ce code ne peut pas être utilisé » : la région de votre compte ne correspond pas à celle de la carte.",
      "Le portefeuille n'est pas crédité : reconnectez-vous ou redémarrez la console.",
    ],
    faq: [
      ["Sur quel appareil activer mon code ?", "Sur PS5, PS4, ou depuis un navigateur via la gestion de compte PlayStation. Le crédit est lié à votre compte, pas à la console."],
      ["La carte fonctionne-t-elle sur tous les comptes ?", "Uniquement sur un compte PlayStation configuré pour la région France, qui correspond à celle de la carte."],
    ],
    tip: { title: "Compte PlayStation en France", message: "Cette carte s'active sur un compte PSN configuré en France. En cas de doute, contactez-nous avant d'acheter.", type: "compatibility", ctaLabel: "Voir la carte PlayStation Store", ctaUrl: "/products/playstation-store-gift-card" },
  },
  {
    slug: "activer-carte-xbox",
    title: "Activer une carte cadeau Xbox",
    summary: "Créditez votre compte Microsoft avec votre code Xbox, sur console ou en ligne.",
    platform: "Xbox",
    icon: "gaming",
    featured: true,
    categoryId: "xbox",
    productSlug: "xbox-gift-card",
    seoTitle: "Comment activer une carte cadeau Xbox - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour utiliser un code Xbox / Microsoft sur console ou sur redeem.microsoft.com, avec une carte achetée sur ghost.ma.",
    aliases: ["xbox", "carte xbox", "microsoft", "code xbox", "xbox gift card"],
    intro: "Il vous faut un compte Microsoft et votre code à 25 caractères, livré instantanément après paiement. Nos cartes Xbox sont valables pour la région Europe.",
    stepsTitle: "Activer sur votre console",
    steps: [
      "Connectez-vous à votre compte Microsoft sur votre console Xbox.",
      "Appuyez sur la touche Xbox pour ouvrir le guide, puis allez dans « Store ».",
      "Sélectionnez « Utiliser un code ».",
      "Saisissez le code à 25 caractères.",
      "Confirmez : le montant est crédité sur votre compte Microsoft.",
    ],
    webNote: "Vous pouvez aussi activer le code en ligne sur redeem.microsoft.com, connecté au même compte Microsoft.",
    warning: "Un code Xbox ne s'utilise qu'une seule fois et doit correspondre à la région de votre compte (Europe). Vérifiez la région avant d'activer.",
    troubleshooting: [
      "« Code non valide » : vérifiez les caractères et l'absence d'espaces.",
      "« Ce code ne peut pas être échangé dans votre région » : la région du compte ne correspond pas à la carte.",
      "Le solde n'apparaît pas : reconnectez-vous ou réessayez depuis redeem.microsoft.com.",
    ],
    faq: [
      ["Le crédit est-il sur la console ou sur le compte ?", "Sur votre compte Microsoft. Vous le retrouvez sur toute console ou appareil connecté au même compte."],
      ["Puis-je l'utiliser pour un abonnement Game Pass ?", "Oui, le solde Microsoft peut servir à régler des achats et abonnements éligibles du Store, selon votre région."],
    ],
    tip: { title: "Compte Microsoft en Europe", message: "Cette carte s'active sur un compte Microsoft configuré en Europe. En cas de doute, contactez-nous avant d'acheter.", type: "compatibility", ctaLabel: "Voir la carte Xbox", ctaUrl: "/products/xbox-gift-card" },
  },
  {
    slug: "activer-carte-nintendo",
    title: "Activer une carte Nintendo eShop",
    summary: "Ajoutez des fonds à votre compte Nintendo avec votre code, directement sur la Switch.",
    platform: "Nintendo",
    icon: "gaming",
    categoryId: "nintendo",
    productSlug: "nintendo-eshop-gift-card",
    seoTitle: "Comment activer une carte Nintendo eShop - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour utiliser un code Nintendo eShop sur Nintendo Switch, avec une carte achetée sur ghost.ma.",
    aliases: ["nintendo", "eshop", "nintendo switch", "carte nintendo", "code eshop"],
    intro: "Vous avez besoin d'un compte Nintendo et de votre code à 16 caractères, livré instantanément après paiement. Nos cartes Nintendo eShop sont valables pour la région Europe.",
    stepsTitle: "Activer sur votre Switch",
    steps: [
      "Sur l'écran d'accueil de votre Switch, sélectionnez l'icône Nintendo eShop.",
      "Choisissez le compte utilisateur à créditer.",
      "Dans le menu de gauche, sélectionnez « Entrer un code ».",
      "Saisissez le code à 16 caractères.",
      "Confirmez : le montant est ajouté à votre solde Nintendo eShop.",
    ],
    warning: "Un code Nintendo eShop ne s'utilise qu'une seule fois et doit correspondre à la région de votre compte (Europe). Vérifiez la région avant d'activer.",
    troubleshooting: [
      "« Code incorrect » : vérifiez chaque caractère et l'absence d'espaces.",
      "« Ce code n'est pas valable dans votre région » : le pays de votre compte Nintendo ne correspond pas à la carte.",
      "Le solde n'apparaît pas : quittez et rouvrez l'eShop, ou reconnectez le compte.",
    ],
    faq: [
      ["Mon compte Nintendo doit-il être en Europe ?", "Oui. Le pays enregistré sur votre compte Nintendo doit correspondre à la région de la carte (Europe)."],
      ["Le crédit fonctionne-t-il sur plusieurs Switch ?", "Le solde est lié à votre compte Nintendo : vous le retrouvez sur toute console connectée à ce compte."],
    ],
    tip: { title: "Compte Nintendo en Europe", message: "Cette carte s'active sur un compte Nintendo configuré en Europe. En cas de doute, contactez-nous avant d'acheter.", type: "compatibility", ctaLabel: "Voir la carte Nintendo eShop", ctaUrl: "/products/nintendo-eshop-gift-card" },
  },
  {
    slug: "activer-carte-valorant",
    title: "Activer une carte Valorant Points",
    summary: "Ajoutez des Valorant Points à votre compte Riot avec votre code prépayé, en jeu.",
    platform: "Valorant",
    icon: "gaming",
    categoryId: "valorant",
    productSlug: "valorant-points",
    seoTitle: "Comment activer une carte Valorant Points - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour utiliser un code prépayé Valorant Points sur votre compte Riot, avec une carte achetée sur ghost.ma.",
    aliases: ["valorant", "valorant points", "vp", "riot", "carte valorant"],
    intro: "Munissez-vous de votre compte Riot et de votre code PIN, livré instantanément après paiement. Nos cartes Valorant sont valables pour la région Europe.",
    stepsTitle: "Activer vos Valorant Points",
    steps: [
      "Lancez VALORANT et connectez-vous avec votre compte Riot.",
      "En haut de l'écran, cliquez sur l'icône « + » à côté de votre solde de Valorant Points.",
      "Sélectionnez « Cartes prépayées et codes ».",
      "Saisissez le code PIN de votre carte.",
      "Confirmez : les Valorant Points sont ajoutés à votre compte.",
    ],
    warning: "Un code Valorant ne s'utilise qu'une seule fois et doit correspondre à la région de votre compte Riot (Europe). Vérifiez la région avant d'activer.",
    troubleshooting: [
      "« Code invalide » : vérifiez le PIN, sans espaces, et les caractères confondus.",
      "« Code non valable dans votre région » : la région de votre compte Riot ne correspond pas à la carte.",
      "Les points n'apparaissent pas : redémarrez le jeu et reconnectez-vous.",
    ],
    faq: [
      ["Où saisir le code exactement ?", "Dans VALORANT, via l'icône « + » à côté de votre solde de Valorant Points, puis « Cartes prépayées et codes »."],
      ["Les Valorant Points marchent-ils sur d'autres jeux Riot ?", "Non. Les Valorant Points sont propres à VALORANT et ne se convertissent pas vers d'autres jeux Riot."],
    ],
    tip: { title: "Compte Riot en Europe", message: "Cette carte s'active sur un compte Riot configuré en Europe. En cas de doute, contactez-nous avant d'acheter.", type: "compatibility", ctaLabel: "Voir la carte Valorant Points", ctaUrl: "/products/valorant-points" },
  },

  // ── Popular platforms (help-center coverage) ──────────────────────────────
  {
    slug: "activer-carte-netflix",
    title: "Activer une carte cadeau Netflix",
    summary: "Créditez votre compte Netflix avec le code de votre carte cadeau.",
    platform: "Netflix",
    icon: "subscription",
    featured: true,
    seoTitle: "Comment activer une carte cadeau Netflix - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour utiliser un code carte cadeau Netflix sur netflix.com/redeem.",
    aliases: ["netflix", "carte netflix", "code netflix"],
    intro: "Munissez-vous du code de votre carte cadeau Netflix et d'un compte Netflix (existant ou à créer).",
    stepsTitle: "Utiliser votre carte cadeau",
    steps: [
      "Rendez-vous sur netflix.com/redeem depuis un navigateur.",
      "Connectez-vous à votre compte Netflix, ou créez-en un.",
      "Saisissez le code PIN de votre carte cadeau.",
      "Validez : le montant est ajouté à votre compte et se déduit de vos prochaines factures.",
    ],
    warning: "Une carte cadeau Netflix s'utilise une seule fois. Elle doit correspondre au pays d'émission et ne finance qu'un abonnement Netflix.",
    troubleshooting: [
      "« Code invalide » : vérifiez le PIN, sans espaces.",
      "Le crédit n'apparaît pas comme un solde : il s'applique automatiquement à votre prochaine facture (voir « Détails du paiement »).",
    ],
    faq: [
      ["Faut-il déjà un abonnement actif ?", "Non. Vous pouvez créer un compte puis appliquer la carte ; elle couvrira vos prochaines factures."],
      ["La carte marche-t-elle partout ?", "Non, elle est liée à son pays d'émission ; utilisez-la sur un compte du même pays."],
    ],
    tip: { title: "Bon à savoir", message: "Une carte Netflix crédite votre compte et se déduit automatiquement de vos factures.", type: "information", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-spotify",
    title: "Activer une carte cadeau Spotify",
    summary: "Ajoutez du temps Premium à votre compte Spotify avec votre code.",
    platform: "Spotify",
    icon: "subscription",
    featured: true,
    seoTitle: "Comment activer une carte cadeau Spotify - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour utiliser un code Spotify Premium sur spotify.com/redeem.",
    aliases: ["spotify", "carte spotify", "spotify premium", "code spotify"],
    intro: "Munissez-vous du code PIN de votre carte Spotify et d'un compte Spotify.",
    stepsTitle: "Utiliser votre carte",
    steps: [
      "Rendez-vous sur spotify.com/redeem.",
      "Connectez-vous à votre compte Spotify.",
      "Saisissez le code PIN de votre carte.",
      "Validez : le temps Premium est appliqué à votre compte.",
    ],
    warning: "La carte doit correspondre au pays de votre compte Spotify. Elle ne fonctionne pas si votre abonnement est déjà facturé via l'App Store d'Apple.",
    troubleshooting: [
      "« Code non valide » : vérifiez le PIN et le pays du compte.",
      "Impossible d'appliquer : résiliez d'abord un abonnement facturé via un tiers (Apple, opérateur)."
    ],
    faq: [
      ["Puis-je cumuler plusieurs cartes ?", "Oui, le temps Premium s'additionne tant que les cartes correspondent au pays de votre compte."],
      ["Sur un compte gratuit ?", "Oui, la carte fait passer un compte gratuit en Premium pour la durée créditée."],
    ],
    tip: { title: "Bon à savoir", message: "Le crédit Spotify correspond à une durée Premium, pas à un solde dépensable.", type: "information", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-roblox",
    title: "Activer une carte cadeau Roblox",
    summary: "Obtenez des Robux ou un abonnement Premium avec votre carte Roblox.",
    platform: "Roblox",
    icon: "gaming",
    featured: true,
    categoryId: "roblox",
    seoTitle: "Comment activer une carte cadeau Roblox - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour utiliser un code carte cadeau Roblox et obtenir des Robux.",
    aliases: ["roblox", "robux", "carte roblox", "code roblox"],
    intro: "Munissez-vous du code PIN de votre carte Roblox et d'un compte Roblox.",
    stepsTitle: "Utiliser votre carte",
    steps: [
      "Rendez-vous sur roblox.com/redeem.",
      "Connectez-vous à votre compte Roblox.",
      "Saisissez le code PIN de votre carte, puis cliquez sur « Utiliser ».",
      "Le crédit apparaît : échangez-le contre des Robux ou un abonnement Premium.",
    ],
    warning: "Une carte Roblox s'utilise une seule fois. Le crédit est lié au compte sur lequel vous l'activez.",
    troubleshooting: [
      "« Code invalide » : vérifiez le PIN et l'absence d'espaces.",
      "Le crédit n'est pas converti : rendez-vous dans « Solde » pour l'échanger contre des Robux.",
    ],
    faq: [
      ["Reçois-je directement des Robux ?", "Vous recevez un crédit à échanger contre des Robux ou un abonnement Premium depuis votre solde Roblox."],
      ["La carte fonctionne-t-elle sur mobile et PC ?", "Oui, le crédit est lié à votre compte Roblox, quel que soit l'appareil."],
    ],
    tip: { title: "Astuce Robux", message: "Activer via un abonnement Premium offre un bonus de Robux par rapport à un achat simple.", type: "information", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-fortnite",
    title: "Activer une carte V-Bucks (Fortnite)",
    summary: "Ajoutez des V-Bucks à votre compte Epic avec votre code Fortnite.",
    platform: "Fortnite",
    icon: "gaming",
    featured: true,
    seoTitle: "Comment activer une carte V-Bucks Fortnite - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour utiliser un code V-Bucks / Fortnite sur votre compte Epic Games.",
    aliases: ["fortnite", "v-bucks", "vbucks", "carte fortnite", "epic"],
    intro: "Munissez-vous du code PIN de votre carte et de votre compte Epic Games.",
    stepsTitle: "Utiliser votre carte",
    steps: [
      "Rendez-vous sur fortnite.com/vbuckscard (ou epicgames.com, section « Utiliser un code »).",
      "Connectez-vous à votre compte Epic Games.",
      "Saisissez le code PIN et choisissez la plateforme sur laquelle vous jouez.",
      "Validez : les V-Bucks sont ajoutés à votre compte Fortnite.",
    ],
    warning: "Une carte V-Bucks s'utilise une seule fois. Les V-Bucks sont liés au compte Epic et partagés entre vos plateformes.",
    troubleshooting: [
      "« Code invalide » : vérifiez le PIN, sans espaces.",
      "Les V-Bucks n'apparaissent pas : relancez Fortnite et vérifiez que vous êtes sur le bon compte Epic.",
    ],
    faq: [
      ["Sur quelle plateforme les V-Bucks arrivent-ils ?", "Sur votre compte Epic : ils sont utilisables sur toutes les plateformes liées à ce compte."],
      ["Faut-il activer avant de jouer ?", "Oui, activez le code sur votre compte Epic, puis les V-Bucks sont disponibles en jeu."],
    ],
    tip: { title: "Bon à savoir", message: "Les V-Bucks obtenus par carte sont partagés entre PC, console et mobile d'un même compte Epic.", type: "information", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-google-play",
    title: "Activer une carte cadeau Google Play",
    summary: "Créditez votre solde Google Play avec le code de votre carte.",
    platform: "Google Play",
    icon: "gift",
    seoTitle: "Comment activer une carte cadeau Google Play - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour ajouter un code Google Play à votre solde depuis l'application Play Store.",
    aliases: ["google play", "play store", "carte google play", "google"],
    intro: "Munissez-vous du code de votre carte Google Play et de votre compte Google.",
    stepsTitle: "Utiliser votre carte",
    steps: [
      "Ouvrez l'application Google Play sur votre téléphone Android.",
      "Touchez votre photo de profil, puis « Paiements et abonnements » > « Utiliser un code ».",
      "Saisissez le code de la carte.",
      "Validez : le montant est ajouté à votre solde Google Play.",
    ],
    warning: "Une carte Google Play s'utilise une seule fois et doit correspondre au pays de votre compte Google.",
    troubleshooting: [
      "« Ce code ne peut pas être utilisé » : le pays de votre compte Google ne correspond pas à la carte.",
      "« Code déjà utilisé » : le solde a peut-être déjà été crédité, vérifiez votre solde.",
    ],
    faq: [
      ["Où trouver mon solde ?", "Dans l'application Play Store, menu profil > « Paiements et abonnements » > « Solde Google Play »."],
      ["Puis-je payer des applis et des jeux ?", "Oui, le solde règle applis, jeux, abonnements et achats intégrés sur Google Play."],
    ],
    tip: { title: "Astuce région", message: "Le pays de votre compte Google doit correspondre à la région de la carte.", type: "compatibility", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-apple",
    title: "Activer une carte cadeau Apple",
    summary: "Créditez votre solde Apple pour l'App Store, iTunes et les abonnements.",
    platform: "Apple",
    icon: "gift",
    seoTitle: "Comment activer une carte cadeau Apple (App Store / iTunes) - ghost.ma",
    seoDescription: "Guide pas à pas pour ajouter une carte cadeau Apple à votre solde depuis l'App Store.",
    aliases: ["apple", "itunes", "app store", "carte apple", "carte itunes"],
    intro: "Munissez-vous du code de votre carte Apple et de votre identifiant Apple.",
    stepsTitle: "Utiliser votre carte",
    steps: [
      "Ouvrez l'App Store sur votre iPhone ou iPad.",
      "Touchez votre photo de profil en haut à droite.",
      "Sélectionnez « Utiliser une carte cadeau ou un code ».",
      "Saisissez le code (ou scannez-le avec l'appareil photo) : le montant est ajouté à votre solde Apple.",
    ],
    warning: "Une carte Apple s'utilise une seule fois et doit correspondre au pays de votre identifiant Apple.",
    troubleshooting: [
      "« Ce code n'est pas valide » : vérifiez le pays de votre compte Apple.",
      "Le solde n'apparaît pas : consultez « Réglages » > votre nom > « Média et achats » > « Afficher le compte ».",
    ],
    faq: [
      ["À quoi sert le solde Apple ?", "Aux achats sur l'App Store, iTunes, Apple Music, iCloud et aux abonnements du même pays."],
      ["Peut-on l'utiliser sur Mac ?", "Oui, le solde est lié à votre identifiant Apple, utilisable sur iPhone, iPad et Mac."],
    ],
    tip: { title: "Astuce région", message: "Le pays de votre identifiant Apple doit correspondre à la région de la carte.", type: "compatibility", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-amazon",
    title: "Activer une carte cadeau Amazon",
    summary: "Ajoutez le montant de votre carte à votre solde Amazon.",
    platform: "Amazon",
    icon: "gift",
    seoTitle: "Comment activer une carte cadeau Amazon - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour ajouter une carte cadeau Amazon à votre solde depuis votre compte.",
    aliases: ["amazon", "carte amazon", "code amazon"],
    intro: "Munissez-vous du code de votre carte Amazon et de votre compte Amazon.",
    stepsTitle: "Utiliser votre carte",
    steps: [
      "Connectez-vous à votre compte Amazon (site ou application).",
      "Allez dans « Cartes cadeaux » puis « Utiliser une carte cadeau ».",
      "Saisissez le code de la carte, puis « Ajouter à mon solde ».",
      "Le montant est crédité et s'appliquera à vos prochaines commandes éligibles.",
    ],
    warning: "Une carte Amazon est liée à un site précis (amazon.fr, amazon.com, etc.). Utilisez-la sur le compte du même pays.",
    troubleshooting: [
      "« Code non valide » : vérifiez que vous êtes sur le bon site Amazon (pays).",
      "Le solde ne s'applique pas : il ne couvre que les articles vendus/expédiés éligibles."
    ],
    faq: [
      ["Où voir mon solde ?", "Dans « Cartes cadeaux » > « Votre solde de carte cadeau » sur votre compte Amazon."],
      ["Le solde expire-t-il ?", "Le solde Amazon reste sur votre compte et s'applique automatiquement à vos achats."],
    ],
    tip: { title: "Astuce région", message: "Utilisez la carte sur le site Amazon du pays correspondant (ex. amazon.fr).", type: "compatibility", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-discord",
    title: "Activer un code Discord Nitro",
    summary: "Activez un abonnement Discord Nitro avec votre code cadeau.",
    platform: "Discord",
    icon: "subscription",
    seoTitle: "Comment activer un code Discord Nitro - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour utiliser un code cadeau Discord Nitro sur votre compte.",
    aliases: ["discord", "nitro", "discord nitro", "code discord"],
    intro: "Munissez-vous de votre code cadeau Discord Nitro et de votre compte Discord.",
    stepsTitle: "Utiliser votre code",
    steps: [
      "Ouvrez Discord et connectez-vous à votre compte.",
      "Allez dans « Paramètres utilisateur » > « Nitro ».",
      "Cliquez sur « Utiliser un code » et saisissez votre code cadeau.",
      "Validez : l'abonnement Nitro est activé sur votre compte.",
    ],
    warning: "Un code Discord Nitro s'utilise une seule fois. S'il vous a été envoyé sous forme de lien cadeau, ouvrez-le directement pour l'accepter.",
    troubleshooting: [
      "« Code invalide ou expiré » : vérifiez le code et qu'il n'a pas déjà été utilisé.",
      "Nitro déjà actif : la durée s'ajoute à votre abonnement en cours.",
    ],
    faq: [
      ["Nitro classique ou Basic ?", "La durée activée dépend du type de code ; elle s'applique au niveau correspondant de Nitro."],
      ["Le crédit est-il lié à mon compte ?", "Oui, l'abonnement est activé sur le compte Discord connecté au moment de l'activation."],
    ],
    tip: { title: "Bon à savoir", message: "Un code Nitro peut arriver comme un lien discord.com/gifts : ouvrez-le pour l'accepter directement.", type: "information", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-razer-gold",
    title: "Activer une carte Razer Gold",
    summary: "Rechargez votre solde Razer Gold avec le PIN de votre carte.",
    platform: "Razer Gold",
    icon: "gift",
    seoTitle: "Comment activer une carte Razer Gold - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour recharger votre solde Razer Gold avec un PIN sur gold.razer.com.",
    aliases: ["razer", "razer gold", "carte razer", "razer gold pin"],
    intro: "Munissez-vous du numéro de série et du code PIN de votre carte Razer Gold, et d'un compte Razer.",
    stepsTitle: "Recharger votre solde",
    steps: [
      "Rendez-vous sur gold.razer.com et connectez-vous à votre compte Razer.",
      "Cliquez sur « Recharger » puis choisissez « Razer Gold PIN ».",
      "Sélectionnez la région correspondant à votre carte.",
      "Saisissez le numéro de série et le code PIN, puis validez : votre solde Razer Gold est crédité.",
    ],
    warning: "Choisissez bien la région de la carte lors de la recharge : une mauvaise région empêche l'activation.",
    troubleshooting: [
      "« PIN invalide » : vérifiez le numéro de série et le PIN, sans espaces.",
      "« Région incorrecte » : recommencez en sélectionnant la région exacte de la carte.",
    ],
    faq: [
      ["À quoi sert Razer Gold ?", "À acheter des jeux et du contenu (diamants, UC, etc.) chez des centaines d'éditeurs partenaires."],
      ["Le solde expire-t-il ?", "Consultez les conditions Razer ; conservez votre solde actif en l'utilisant régulièrement."],
    ],
    tip: { title: "Astuce région", message: "Sélectionnez la région exacte de votre carte Razer Gold avant de saisir le PIN.", type: "compatibility", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-twitch",
    title: "Activer une carte cadeau Twitch",
    summary: "Créditez votre solde Twitch pour les abonnements et les Bits.",
    platform: "Twitch",
    icon: "subscription",
    seoTitle: "Comment activer une carte cadeau Twitch - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour ajouter un code carte cadeau Twitch à votre solde.",
    aliases: ["twitch", "carte twitch", "code twitch", "bits"],
    intro: "Munissez-vous du code de votre carte cadeau Twitch et de votre compte Twitch.",
    stepsTitle: "Utiliser votre carte",
    steps: [
      "Rendez-vous sur twitch.tv et connectez-vous à votre compte.",
      "Ouvrez le menu de votre profil puis « Utiliser un code » (Redeem).",
      "Saisissez le code de la carte cadeau.",
      "Validez : le crédit est ajouté à votre solde Twitch.",
    ],
    warning: "Une carte Twitch s'utilise une seule fois. Le solde sert aux abonnements et aux Bits, selon votre région.",
    troubleshooting: [
      "« Code invalide » : vérifiez le code et l'absence d'espaces.",
      "Le solde ne s'applique pas à un achat : certains paiements passent par les stores mobiles, préférez le site web.",
    ],
    faq: [
      ["À quoi sert le solde Twitch ?", "À vous abonner à vos chaînes préférées et à acheter des Bits pour les soutenir."],
      ["Le solde est-il lié à mon compte ?", "Oui, il reste sur le compte Twitch où vous avez activé la carte."],
    ],
    tip: { title: "Bon à savoir", message: "Activez et dépensez votre solde Twitch depuis le site web pour éviter les frais des stores mobiles.", type: "information", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-pubg-mobile",
    title: "Activer une recharge PUBG Mobile (UC)",
    summary: "Créditez des UC sur votre compte PUBG Mobile via Midasbuy.",
    platform: "PUBG Mobile",
    icon: "gaming",
    seoTitle: "Comment activer une recharge PUBG Mobile (UC) - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour créditer des UC PUBG Mobile avec un code via Midasbuy.",
    aliases: ["pubg", "pubg mobile", "uc", "unknown cash", "recharge pubg"],
    intro: "Munissez-vous du code de votre carte UC et de votre identifiant de joueur PUBG Mobile (Character ID).",
    stepsTitle: "Créditer vos UC",
    steps: [
      "Rendez-vous sur midasbuy.com et sélectionnez PUBG Mobile.",
      "Saisissez votre identifiant de joueur PUBG Mobile et vérifiez le pseudo affiché.",
      "Choisissez « Utiliser un code » (Redeem) et saisissez le code de votre carte.",
      "Validez : les UC sont crédités sur votre compte PUBG Mobile.",
    ],
    warning: "Vérifiez soigneusement votre identifiant de joueur : un crédit envoyé au mauvais ID n'est pas récupérable. Un code s'utilise une seule fois.",
    troubleshooting: [
      "« Identifiant introuvable » : vérifiez votre Character ID dans votre profil en jeu.",
      "Les UC n'apparaissent pas : redémarrez PUBG Mobile après quelques minutes.",
    ],
    faq: [
      ["Où trouver mon identifiant ?", "Dans PUBG Mobile, ouvrez votre profil : le Character ID s'affiche sous votre pseudo."],
      ["Dois-je être connecté en jeu ?", "Non, la recharge se fait avec votre identifiant ; connectez-vous ensuite pour voir vos UC."],
    ],
    tip: { title: "Vérifiez votre ID", message: "Contrôlez le pseudo affiché après avoir saisi votre identifiant, avant de valider la recharge.", type: "warning", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-free-fire",
    title: "Activer une recharge Free Fire",
    summary: "Créditez des diamants sur votre compte Free Fire via le centre de recharge Garena.",
    platform: "Free Fire",
    icon: "gaming",
    seoTitle: "Comment activer une recharge Free Fire - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour créditer des diamants Free Fire avec un code via le centre de recharge Garena.",
    aliases: ["free fire", "garena", "diamants free fire", "recharge free fire"],
    intro: "Munissez-vous du numéro de série et du code PIN de votre carte, et de votre identifiant Free Fire.",
    stepsTitle: "Créditer vos diamants",
    steps: [
      "Rendez-vous sur le centre de recharge Garena (shop.garena) et connectez-vous.",
      "Sélectionnez Free Fire, puis saisissez votre identifiant de joueur.",
      "Choisissez « Carte de recharge Garena » et saisissez le numéro de série et le code PIN.",
      "Validez : les diamants sont crédités sur votre compte Free Fire.",
    ],
    warning: "Vérifiez votre identifiant de joueur avant de valider. Un code s'utilise une seule fois.",
    troubleshooting: [
      "« PIN invalide » : vérifiez le numéro de série et le PIN, sans espaces.",
      "Les diamants n'apparaissent pas : reconnectez-vous à Free Fire après quelques minutes.",
    ],
    faq: [
      ["Où trouver mon identifiant Free Fire ?", "Ouvrez votre profil en jeu : l'ID s'affiche sous votre pseudo."],
      ["Puis-je recharger sans passer par le jeu ?", "Oui, la recharge se fait avec votre identifiant sur le centre Garena, hors du jeu."],
    ],
    tip: { title: "Vérifiez votre ID", message: "Contrôlez le pseudo associé à votre identifiant avant de valider la recharge.", type: "warning", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-league-of-legends",
    title: "Activer une carte League of Legends (RP)",
    summary: "Ajoutez des Riot Points à votre compte pour League of Legends.",
    platform: "League of Legends",
    icon: "gaming",
    seoTitle: "Comment activer une carte League of Legends (RP) - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour créditer des Riot Points sur votre compte via un code prépayé.",
    aliases: ["league of legends", "lol", "riot points", "rp", "carte lol"],
    intro: "Munissez-vous du code PIN de votre carte et de votre compte Riot.",
    stepsTitle: "Créditer vos Riot Points",
    steps: [
      "Lancez League of Legends et connectez-vous avec votre compte Riot.",
      "Ouvrez la boutique en jeu, puis « Utiliser une carte prépayée / un code ».",
      "Saisissez le code PIN de votre carte.",
      "Validez : les Riot Points (RP) sont ajoutés à votre compte.",
    ],
    warning: "La carte doit correspondre à la région de votre compte Riot. Un code s'utilise une seule fois.",
    troubleshooting: [
      "« Code non valide dans votre région » : la région de votre compte ne correspond pas à la carte.",
      "Les RP n'apparaissent pas : redémarrez le client et reconnectez-vous.",
    ],
    faq: [
      ["Les RP servent-ils à d'autres jeux Riot ?", "Non, les Riot Points achetés pour League of Legends sont propres à ce jeu."],
      ["Où saisir le code ?", "Dans la boutique en jeu de League of Legends, via l'option « carte prépayée / code »."],
    ],
    tip: { title: "Astuce région", message: "La région de votre compte Riot doit correspondre à celle de la carte RP.", type: "compatibility", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
  {
    slug: "activer-carte-minecraft",
    title: "Activer une clé Minecraft",
    summary: "Ajoutez Minecraft à votre compte Microsoft avec votre clé.",
    platform: "Minecraft",
    icon: "gaming",
    seoTitle: "Comment activer une clé Minecraft - Guide ghost.ma",
    seoDescription: "Guide pas à pas pour utiliser un code Minecraft sur minecraft.net avec un compte Microsoft.",
    aliases: ["minecraft", "cle minecraft", "code minecraft", "minecoins"],
    intro: "Munissez-vous de votre code Minecraft et d'un compte Microsoft.",
    stepsTitle: "Utiliser votre clé",
    steps: [
      "Rendez-vous sur minecraft.net et connectez-vous avec votre compte Microsoft.",
      "Ouvrez la page « Utiliser un code » (redeem).",
      "Saisissez le code de votre carte ou clé Minecraft.",
      "Validez : le jeu (ou le crédit Minecoins) est ajouté à votre compte Microsoft.",
    ],
    warning: "Une clé Minecraft s'utilise une seule fois. Vérifiez l'édition (Java ou Bedrock) correspondant à votre code.",
    troubleshooting: [
      "« Code déjà utilisé » : la clé a peut-être déjà été appliquée à un compte.",
      "« Code non valide » : vérifiez les caractères et l'édition concernée.",
    ],
    faq: [
      ["Java ou Bedrock ?", "Vérifiez l'édition indiquée sur votre code : elle détermine la version débloquée sur votre compte."],
      ["Où retrouver le jeu ?", "Dans votre compte Microsoft/Minecraft, prêt à télécharger sur les plateformes compatibles."],
    ],
    tip: { title: "Bon à savoir", message: "Minecraft se rattache à votre compte Microsoft : gardez ce compte pour réinstaller le jeu partout.", type: "information", ctaLabel: "Contacter le support", ctaUrl: "/support" },
  },
];

// ── Content builder ──────────────────────────────────────────────────────────

function buildBlocks(s: Spec): unknown[] {
  const blocks: unknown[] = [
    { id: `${s.slug}-avant`, type: "heading", text: "Avant de commencer" },
    { id: `${s.slug}-avant-p`, type: "paragraph", text: s.intro },
    { id: `${s.slug}-etapes`, type: "heading", text: s.stepsTitle ?? "Activer votre code" },
    { id: `${s.slug}-etapes-s`, type: "steps", items: s.steps },
  ];
  if (s.webNote) blocks.push({ id: `${s.slug}-web`, type: "paragraph", text: s.webNote });
  if (s.warning) blocks.push({ id: `${s.slug}-warn`, type: "warning", text: s.warning });
  blocks.push({ id: `${s.slug}-depannage`, type: "heading", text: "Dépannage" });
  blocks.push({ id: `${s.slug}-depannage-l`, type: "list", items: s.troubleshooting });
  return blocks;
}

async function main() {
  assertWriteAllowed("seed:activation-guides");
  const dryRun = process.argv.includes("--dry-run");

  const products = await prisma.product.findMany({
    where: { slug: { in: SPECS.map((s) => s.productSlug).filter(Boolean) as string[] } },
    select: { id: true, slug: true },
  });
  const productIdBySlug = new Map(products.map((p) => [p.slug, p.id]));
  const categoryIds = new Set((await prisma.category.findMany({ select: { id: true } })).map((c) => c.id));
  const now = new Date();

  for (const [index, s] of SPECS.entries()) {
    const content = normalizeGuideBlocks(buildBlocks(s));
    const faq = normalizeGuideFaq(s.faq.map(([question, answer], i) => ({ id: `${s.slug}-faq-${i + 1}`, question, answer })));
    const navigatorTip = normalizeGuideNavigatorTip({ enabled: true, ...s.tip });
    const relatedProductIds =
      s.productSlug && productIdBySlug.has(s.productSlug) ? [productIdBySlug.get(s.productSlug) as string] : [];
    const categoryId = s.categoryId && categoryIds.has(s.categoryId) ? s.categoryId : null;

    const data = {
      title: s.title,
      summary: s.summary,
      platform: s.platform,
      categoryId,
      icon: s.icon,
      content: content as unknown as object,
      faq: faq as unknown as object,
      navigatorTip: navigatorTip as unknown as object,
      relatedProductIds,
      aliases: s.aliases,
      published: true,
      featured: Boolean(s.featured),
      sortOrder: index + 1,
      publishedAt: now,
      scheduledAt: null,
      archivedAt: null,
      seoTitle: s.seoTitle,
      seoDescription: s.seoDescription,
    };

    if (dryRun) {
      console.log(`↳ [dry-run] ${s.slug} — ${content.length} blocs, ${faq.length} FAQ, ${s.platform} (${s.icon})`);
      continue;
    }
    await prisma.guide.upsert({ where: { slug: s.slug }, create: { slug: s.slug, ...data }, update: data });
    console.log(`✔ ${s.slug} publié`);
  }

  if (dryRun) {
    console.log(`\nDry-run terminé — ${SPECS.length} guides, aucune écriture.`);
    return;
  }

  // Cross-link siblings that share a family (icon), up to 4 each.
  const rows = await prisma.guide.findMany({
    where: { slug: { in: SPECS.map((s) => s.slug) } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
  const familyBySlug = new Map(SPECS.map((s) => [s.slug, s.icon]));
  for (const s of SPECS) {
    const relatedGuideIds = SPECS.filter((o) => o.slug !== s.slug && familyBySlug.get(o.slug) === s.icon)
      .slice(0, 4)
      .map((o) => idBySlug.get(o.slug))
      .filter((id): id is string => Boolean(id));
    await prisma.guide.update({ where: { slug: s.slug }, data: { relatedGuideIds } });
  }
  console.log(`\n${SPECS.length} guides d'activation publiés et cross-liés.`);
}

const isEntrypoint = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
