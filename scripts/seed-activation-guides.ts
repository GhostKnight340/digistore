/**
 * Content seed: publishes the activation guides for the platforms ghost.ma
 * currently sells (Steam, PlayStation, Xbox, Nintendo, Valorant). The copy is
 * original (written for ghost.ma, not copied from any third-party source) and
 * covers the standard, accurate redemption flow for each platform.
 *
 * SAFE BY DESIGN:
 *   - Touches ONLY the `Guide` table. No product/pricing/inventory data.
 *   - Upserts by slug, so it is safe to re-run — re-running restores the seeded
 *     content (it is authoritative for these five guides).
 *   - Each guide links to its matching product + brand category and cross-links
 *     the sibling guides, all resolved to ids that exist at run time.
 *   - Goes through the shared production write-guard: writing to prod requires
 *     CONFIRM_PRODUCTION_DB=true.
 *
 * Run:
 *   npm run seed:activation-guides                      # local/dev DB
 *   CONFIRM_PRODUCTION_DB=true npm run seed:activation-guides   # prod (deliberate)
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

type SeedGuide = {
  slug: string;
  title: string;
  summary: string;
  platform: string;
  categoryId: string;
  productSlug: string;
  featured: boolean;
  sortOrder: number;
  seoTitle: string;
  seoDescription: string;
  aliases: string[];
  content: unknown[];
  faq: { id: string; question: string; answer: string }[];
  navigatorTip: {
    enabled: boolean;
    title: string;
    message: string;
    type: string;
    ctaLabel: string;
    ctaUrl: string;
  };
  /** slugs of sibling guides to cross-link under "Guides associés". */
  relatedSlugs: string[];
};

const GUIDES: SeedGuide[] = [
  {
    slug: "activer-carte-steam",
    title: "Activer une carte Steam Wallet",
    summary:
      "Créditez votre portefeuille Steam avec votre code ghost.ma, en quelques secondes.",
    platform: "Steam",
    categoryId: "steam",
    productSlug: "steam-wallet",
    featured: true,
    sortOrder: 1,
    seoTitle: "Comment activer une carte Steam Wallet - Guide ghost.ma",
    seoDescription:
      "Guide pas à pas pour ajouter des fonds à votre portefeuille Steam avec un code Steam Wallet acheté sur ghost.ma.",
    aliases: ["steam", "carte steam", "steam wallet", "portefeuille steam", "code steam"],
    content: [
      { id: "steam-avant", type: "heading", text: "Avant de commencer" },
      {
        id: "steam-avant-p",
        type: "paragraph",
        text: "Vous avez besoin d'un compte Steam et de votre code Steam Wallet, livré instantanément après paiement dans votre email de confirmation et votre espace commande. Nos cartes Steam sont valables pour la région France.",
      },
      { id: "steam-etapes", type: "heading", text: "Activer votre code" },
      {
        id: "steam-etapes-s",
        type: "steps",
        items: [
          "Connectez-vous à Steam (application ou steampowered.com).",
          "Cliquez sur le nom de votre compte en haut à droite, puis sur « Détails du compte ».",
          "Dans « Solde du portefeuille », cliquez sur « Ajouter des fonds… » puis « Utiliser un code du portefeuille Steam ».",
          "Saisissez le code à 15 caractères tel qu'il apparaît, sans espaces.",
          "Validez : le montant est crédité immédiatement sur votre portefeuille Steam.",
        ],
      },
      {
        id: "steam-warn",
        type: "warning",
        text: "Un code Steam Wallet ne peut être utilisé qu'une seule fois et doit correspondre à la région de votre compte (France). Vérifiez la région avant d'activer.",
      },
      {
        id: "steam-tip",
        type: "tip",
        title: "Astuce région",
        message:
          "Si Steam refuse le code pour cause de région, votre compte n'est pas configuré en France. La région du compte se choisit à la première recharge et ne se change pas librement ensuite.",
        tipType: "compatibility",
      },
      { id: "steam-depannage", type: "heading", text: "Dépannage" },
      {
        id: "steam-depannage-l",
        type: "list",
        items: [
          "« Code invalide » : vérifiez les caractères souvent confondus (0 et O, 1 et I) et l'absence d'espaces.",
          "« Ce code n'est pas valable dans votre pays » : la région de votre compte ne correspond pas à celle de la carte.",
          "Le solde n'apparaît pas : rafraîchissez la page ou reconnectez-vous à Steam.",
        ],
      },
    ],
    faq: [
      {
        id: "steam-faq-1",
        question: "Où se trouve mon code Steam Wallet ?",
        answer:
          "Il vous est livré instantanément après le paiement : dans votre email de confirmation et dans votre espace commande sur ghost.ma.",
      },
      {
        id: "steam-faq-2",
        question: "Puis-je utiliser une carte d'une autre région ?",
        answer:
          "Non. Le code doit correspondre à la région de votre compte Steam. Nos cartes Steam sont pour la région France.",
      },
      {
        id: "steam-faq-3",
        question: "Le crédit expire-t-il ?",
        answer:
          "Non. Une fois ajouté, le solde de votre portefeuille Steam n'expire pas.",
      },
    ],
    navigatorTip: {
      enabled: true,
      title: "Compte Steam en France",
      message:
        "Cette carte s'active sur un compte Steam configuré en France. En cas de doute, contactez-nous avant d'acheter.",
      type: "compatibility",
      ctaLabel: "Voir la carte Steam Wallet",
      ctaUrl: "/products/steam-wallet",
    },
    relatedSlugs: ["activer-carte-playstation", "activer-carte-xbox", "activer-carte-valorant"],
  },
  {
    slug: "activer-carte-playstation",
    title: "Activer une carte PlayStation Store",
    summary:
      "Ajoutez des fonds à votre portefeuille PlayStation avec votre code, sur console ou en ligne.",
    platform: "PlayStation",
    categoryId: "playstation",
    productSlug: "playstation-store-gift-card",
    featured: true,
    sortOrder: 2,
    seoTitle: "Comment activer une carte PlayStation Store - Guide ghost.ma",
    seoDescription:
      "Guide pas à pas pour utiliser un code PlayStation Store (PSN) sur PS5, PS4 ou en ligne, avec une carte achetée sur ghost.ma.",
    aliases: ["playstation", "psn", "carte psn", "playstation store", "code psn", "ps5", "ps4"],
    content: [
      { id: "ps-avant", type: "heading", text: "Avant de commencer" },
      {
        id: "ps-avant-p",
        type: "paragraph",
        text: "Munissez-vous de votre compte PlayStation Network et de votre code à 12 chiffres, livré instantanément après paiement. Nos cartes PlayStation sont valables pour la région France.",
      },
      { id: "ps-etapes", type: "heading", text: "Activer sur votre console" },
      {
        id: "ps-etapes-s",
        type: "steps",
        items: [
          "Connectez-vous à votre compte sur votre PS5 ou PS4.",
          "Ouvrez le PlayStation Store.",
          "Sur PS5 : sélectionnez l'icône de votre profil, puis « Utiliser des codes ». Sur PS4 : faites défiler le menu du Store jusqu'à « Utiliser un code ».",
          "Saisissez le code à 12 chiffres.",
          "Confirmez : les fonds sont ajoutés à votre portefeuille PlayStation.",
        ],
      },
      {
        id: "ps-web",
        type: "paragraph",
        text: "Vous pouvez aussi utiliser votre code depuis un navigateur, sur la page de gestion de compte PlayStation, section « Utiliser un code ».",
      },
      {
        id: "ps-warn",
        type: "warning",
        text: "Un code PlayStation ne s'utilise qu'une seule fois et doit correspondre à la région de votre compte (France). Vérifiez la région avant d'activer.",
      },
      { id: "ps-depannage", type: "heading", text: "Dépannage" },
      {
        id: "ps-depannage-l",
        type: "list",
        items: [
          "« Code non valide » : revérifiez chaque chiffre et l'absence d'espaces.",
          "« Ce code ne peut pas être utilisé » : la région de votre compte ne correspond pas à celle de la carte.",
          "Le portefeuille n'est pas crédité : reconnectez-vous ou redémarrez la console.",
        ],
      },
    ],
    faq: [
      {
        id: "ps-faq-1",
        question: "Sur quel appareil activer mon code ?",
        answer:
          "Sur PS5, PS4, ou depuis un navigateur via la gestion de compte PlayStation. Le crédit est lié à votre compte, pas à la console.",
      },
      {
        id: "ps-faq-2",
        question: "La carte fonctionne-t-elle sur tous les comptes ?",
        answer:
          "Uniquement sur un compte PlayStation configuré pour la région France, qui correspond à celle de la carte.",
      },
    ],
    navigatorTip: {
      enabled: true,
      title: "Compte PlayStation en France",
      message:
        "Cette carte s'active sur un compte PSN configuré en France. En cas de doute, contactez-nous avant d'acheter.",
      type: "compatibility",
      ctaLabel: "Voir la carte PlayStation Store",
      ctaUrl: "/products/playstation-store-gift-card",
    },
    relatedSlugs: ["activer-carte-steam", "activer-carte-xbox", "activer-carte-nintendo"],
  },
  {
    slug: "activer-carte-xbox",
    title: "Activer une carte cadeau Xbox",
    summary:
      "Créditez votre compte Microsoft avec votre code Xbox, sur console ou en ligne.",
    platform: "Xbox",
    categoryId: "xbox",
    productSlug: "xbox-gift-card",
    featured: true,
    sortOrder: 3,
    seoTitle: "Comment activer une carte cadeau Xbox - Guide ghost.ma",
    seoDescription:
      "Guide pas à pas pour utiliser un code Xbox / Microsoft sur console ou sur redeem.microsoft.com, avec une carte achetée sur ghost.ma.",
    aliases: ["xbox", "carte xbox", "microsoft", "code xbox", "xbox gift card"],
    content: [
      { id: "xbox-avant", type: "heading", text: "Avant de commencer" },
      {
        id: "xbox-avant-p",
        type: "paragraph",
        text: "Il vous faut un compte Microsoft et votre code à 25 caractères, livré instantanément après paiement. Nos cartes Xbox sont valables pour la région Europe.",
      },
      { id: "xbox-etapes", type: "heading", text: "Activer sur votre console" },
      {
        id: "xbox-etapes-s",
        type: "steps",
        items: [
          "Connectez-vous à votre compte Microsoft sur votre console Xbox.",
          "Appuyez sur la touche Xbox pour ouvrir le guide, puis allez dans « Store ».",
          "Sélectionnez « Utiliser un code » (icône en forme de code).",
          "Saisissez le code à 25 caractères.",
          "Confirmez : le montant est crédité sur votre compte Microsoft.",
        ],
      },
      {
        id: "xbox-web",
        type: "paragraph",
        text: "Vous pouvez aussi activer le code en ligne sur redeem.microsoft.com, connecté au même compte Microsoft.",
      },
      {
        id: "xbox-warn",
        type: "warning",
        text: "Un code Xbox ne s'utilise qu'une seule fois et doit correspondre à la région de votre compte (Europe). Vérifiez la région avant d'activer.",
      },
      { id: "xbox-depannage", type: "heading", text: "Dépannage" },
      {
        id: "xbox-depannage-l",
        type: "list",
        items: [
          "« Code non valide » : vérifiez les caractères et l'absence d'espaces.",
          "« Ce code ne peut pas être échangé dans votre région » : la région du compte ne correspond pas à la carte.",
          "Le solde n'apparaît pas : reconnectez-vous ou réessayez depuis redeem.microsoft.com.",
        ],
      },
    ],
    faq: [
      {
        id: "xbox-faq-1",
        question: "Le crédit est-il sur la console ou sur le compte ?",
        answer:
          "Sur votre compte Microsoft. Vous le retrouvez sur toute console ou appareil connecté au même compte.",
      },
      {
        id: "xbox-faq-2",
        question: "Puis-je l'utiliser pour un abonnement Game Pass ?",
        answer:
          "Oui, le solde Microsoft peut servir à régler des achats et abonnements éligibles du Store, selon votre région.",
      },
    ],
    navigatorTip: {
      enabled: true,
      title: "Compte Microsoft en Europe",
      message:
        "Cette carte s'active sur un compte Microsoft configuré en Europe. En cas de doute, contactez-nous avant d'acheter.",
      type: "compatibility",
      ctaLabel: "Voir la carte Xbox",
      ctaUrl: "/products/xbox-gift-card",
    },
    relatedSlugs: ["activer-carte-steam", "activer-carte-playstation", "activer-carte-nintendo"],
  },
  {
    slug: "activer-carte-nintendo",
    title: "Activer une carte Nintendo eShop",
    summary:
      "Ajoutez des fonds à votre compte Nintendo avec votre code, directement sur la Switch.",
    platform: "Nintendo",
    categoryId: "nintendo",
    productSlug: "nintendo-eshop-gift-card",
    featured: false,
    sortOrder: 4,
    seoTitle: "Comment activer une carte Nintendo eShop - Guide ghost.ma",
    seoDescription:
      "Guide pas à pas pour utiliser un code Nintendo eShop sur Nintendo Switch, avec une carte achetée sur ghost.ma.",
    aliases: ["nintendo", "eshop", "nintendo switch", "carte nintendo", "code eshop"],
    content: [
      { id: "nin-avant", type: "heading", text: "Avant de commencer" },
      {
        id: "nin-avant-p",
        type: "paragraph",
        text: "Vous avez besoin d'un compte Nintendo et de votre code à 16 caractères, livré instantanément après paiement. Nos cartes Nintendo eShop sont valables pour la région Europe.",
      },
      { id: "nin-etapes", type: "heading", text: "Activer sur votre Switch" },
      {
        id: "nin-etapes-s",
        type: "steps",
        items: [
          "Sur l'écran d'accueil de votre Switch, sélectionnez l'icône Nintendo eShop.",
          "Choisissez le compte utilisateur à créditer.",
          "Dans le menu de gauche, sélectionnez « Entrer un code ».",
          "Saisissez le code à 16 caractères.",
          "Confirmez : le montant est ajouté à votre solde Nintendo eShop.",
        ],
      },
      {
        id: "nin-warn",
        type: "warning",
        text: "Un code Nintendo eShop ne s'utilise qu'une seule fois et doit correspondre à la région de votre compte (Europe). Vérifiez la région avant d'activer.",
      },
      { id: "nin-depannage", type: "heading", text: "Dépannage" },
      {
        id: "nin-depannage-l",
        type: "list",
        items: [
          "« Code incorrect » : vérifiez chaque caractère et l'absence d'espaces.",
          "« Ce code n'est pas valable dans votre région » : le pays de votre compte Nintendo ne correspond pas à la carte.",
          "Le solde n'apparaît pas : quittez et rouvrez l'eShop, ou reconnectez le compte.",
        ],
      },
    ],
    faq: [
      {
        id: "nin-faq-1",
        question: "Mon compte Nintendo doit-il être en Europe ?",
        answer:
          "Oui. Le pays enregistré sur votre compte Nintendo doit correspondre à la région de la carte (Europe).",
      },
      {
        id: "nin-faq-2",
        question: "Le crédit fonctionne-t-il sur plusieurs Switch ?",
        answer:
          "Le solde est lié à votre compte Nintendo : vous le retrouvez sur toute console connectée à ce compte.",
      },
    ],
    navigatorTip: {
      enabled: true,
      title: "Compte Nintendo en Europe",
      message:
        "Cette carte s'active sur un compte Nintendo configuré en Europe. En cas de doute, contactez-nous avant d'acheter.",
      type: "compatibility",
      ctaLabel: "Voir la carte Nintendo eShop",
      ctaUrl: "/products/nintendo-eshop-gift-card",
    },
    relatedSlugs: ["activer-carte-steam", "activer-carte-playstation", "activer-carte-xbox"],
  },
  {
    slug: "activer-carte-valorant",
    title: "Activer une carte Valorant Points",
    summary:
      "Ajoutez des Valorant Points à votre compte Riot avec votre code prépayé, en jeu.",
    platform: "Valorant",
    categoryId: "valorant",
    productSlug: "valorant-points",
    featured: false,
    sortOrder: 5,
    seoTitle: "Comment activer une carte Valorant Points - Guide ghost.ma",
    seoDescription:
      "Guide pas à pas pour utiliser un code prépayé Valorant Points sur votre compte Riot, avec une carte achetée sur ghost.ma.",
    aliases: ["valorant", "valorant points", "vp", "riot", "carte valorant"],
    content: [
      { id: "val-avant", type: "heading", text: "Avant de commencer" },
      {
        id: "val-avant-p",
        type: "paragraph",
        text: "Munissez-vous de votre compte Riot et de votre code PIN, livré instantanément après paiement. Nos cartes Valorant sont valables pour la région Europe.",
      },
      { id: "val-etapes", type: "heading", text: "Activer vos Valorant Points" },
      {
        id: "val-etapes-s",
        type: "steps",
        items: [
          "Lancez VALORANT et connectez-vous avec votre compte Riot.",
          "En haut de l'écran, cliquez sur l'icône « + » à côté de votre solde de Valorant Points.",
          "Sélectionnez « Cartes prépayées et codes ».",
          "Saisissez le code PIN de votre carte.",
          "Confirmez : les Valorant Points sont ajoutés à votre compte.",
        ],
      },
      {
        id: "val-warn",
        type: "warning",
        text: "Un code Valorant ne s'utilise qu'une seule fois et doit correspondre à la région de votre compte Riot (Europe). Vérifiez la région avant d'activer.",
      },
      { id: "val-depannage", type: "heading", text: "Dépannage" },
      {
        id: "val-depannage-l",
        type: "list",
        items: [
          "« Code invalide » : vérifiez le PIN, sans espaces, et les caractères confondus.",
          "« Code non valable dans votre région » : la région de votre compte Riot ne correspond pas à la carte.",
          "Les points n'apparaissent pas : redémarrez le jeu et reconnectez-vous.",
        ],
      },
    ],
    faq: [
      {
        id: "val-faq-1",
        question: "Où saisir le code exactement ?",
        answer:
          "Dans VALORANT, via l'icône « + » à côté de votre solde de Valorant Points, puis « Cartes prépayées et codes ».",
      },
      {
        id: "val-faq-2",
        question: "Les Valorant Points marchent-ils sur d'autres jeux Riot ?",
        answer:
          "Non. Les Valorant Points sont propres à VALORANT et ne se convertissent pas vers d'autres jeux Riot.",
      },
    ],
    navigatorTip: {
      enabled: true,
      title: "Compte Riot en Europe",
      message:
        "Cette carte s'active sur un compte Riot configuré en Europe. En cas de doute, contactez-nous avant d'acheter.",
      type: "compatibility",
      ctaLabel: "Voir la carte Valorant Points",
      ctaUrl: "/products/valorant-points",
    },
    relatedSlugs: ["activer-carte-steam", "activer-carte-playstation", "activer-carte-xbox"],
  },
];

async function main() {
  assertWriteAllowed("seed:activation-guides");
  const dryRun = process.argv.includes("--dry-run");

  // Resolve product ids for the "related products" links (skip any that no
  // longer exist so a missing product never blocks the seed).
  const productSlugs = GUIDES.map((g) => g.productSlug);
  const products = await prisma.product.findMany({
    where: { slug: { in: productSlugs } },
    select: { id: true, slug: true },
  });
  const productIdBySlug = new Map(products.map((p) => [p.slug, p.id]));

  // Only link a brand category that actually exists.
  const categories = await prisma.category.findMany({ select: { id: true } });
  const categoryIds = new Set(categories.map((c) => c.id));

  const now = new Date();

  for (const g of GUIDES) {
    const content = normalizeGuideBlocks(g.content);
    const faq = normalizeGuideFaq(g.faq);
    const navigatorTip = normalizeGuideNavigatorTip(g.navigatorTip);
    const relatedProductIds = productIdBySlug.has(g.productSlug)
      ? [productIdBySlug.get(g.productSlug) as string]
      : [];
    const categoryId = categoryIds.has(g.categoryId) ? g.categoryId : null;

    const data = {
      title: g.title,
      summary: g.summary,
      platform: g.platform,
      categoryId,
      icon: "gaming",
      content: content as unknown as object,
      faq: faq as unknown as object,
      navigatorTip: navigatorTip as unknown as object,
      relatedProductIds,
      aliases: g.aliases,
      published: true,
      featured: g.featured,
      sortOrder: g.sortOrder,
      publishedAt: now,
      scheduledAt: null,
      archivedAt: null,
      seoTitle: g.seoTitle,
      seoDescription: g.seoDescription,
    };

    if (dryRun) {
      console.log(
        `↳ [dry-run] ${g.slug} — ${content.length} blocs, ${faq.length} FAQ, ` +
          `produit ${relatedProductIds.length ? "lié" : "absent"}, catégorie ${categoryId ?? "—"}`,
      );
      continue;
    }

    await prisma.guide.upsert({
      where: { slug: g.slug },
      create: { slug: g.slug, ...data },
      update: data,
    });
    console.log(`✔ ${g.slug} publié`);
  }

  if (dryRun) {
    console.log("\nDry-run terminé — aucune écriture.");
    return;
  }

  // Second pass: cross-link sibling guides now that every row exists.
  const rows = await prisma.guide.findMany({
    where: { slug: { in: GUIDES.map((g) => g.slug) } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
  for (const g of GUIDES) {
    const relatedGuideIds = g.relatedSlugs
      .map((s) => idBySlug.get(s))
      .filter((id): id is string => Boolean(id));
    await prisma.guide.update({
      where: { slug: g.slug },
      data: { relatedGuideIds },
    });
  }
  console.log(`\n${GUIDES.length} guides d'activation publiés et cross-liés.`);
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

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
