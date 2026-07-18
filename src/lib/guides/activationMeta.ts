/**
 * Per-platform article metadata for the activation guides.
 *
 * These are the values behind the hero meta chips (difficulté, durée, régions,
 * appareils), the "Ouvrir le site officiel" / "Copier le lien officiel" actions,
 * the vendor eyebrow, and the "Ce qu'il vous faut" checklist.
 *
 * Everything here is AUTHORED, not inferred. A guide with no entry simply
 * renders no chips — the article never guesses a difficulty or a device list.
 * `regions` is deliberately a label list ("Selon carte") rather than a parsed
 * region code, because the true region is a property of the CARD the customer
 * bought, not of the guide.
 *
 * Kept separate from activationLibrary.ts so the (long) guide prose and this
 * (tabular) metadata stay independently readable.
 */
import type { GuideDifficulty } from "@/lib/guide";

export interface ActivationGuideMeta {
  difficulty: GuideDifficulty;
  /** Authored activation time in minutes (overrides the derived estimate). */
  durationMinutes: number;
  /** Region labels for the chip. */
  regions: string[];
  /** Device/platform labels for the chip. */
  devices: string[];
  /** Official activation page — powers the CTA and the copy-link button. */
  officialUrl: string;
  /** Publisher, shown in the eyebrow as "PLATFORM · VENDOR". */
  vendor: string;
  /** "Ce qu'il vous faut" checklist. */
  requirements: string[];
}

const SELON_CARTE = ["Selon carte"];

export const ACTIVATION_GUIDE_META: Record<string, ActivationGuideMeta> = {
  "activer-carte-steam": {
    difficulty: "facile",
    durationMinutes: 3,
    regions: SELON_CARTE,
    devices: ["PC", "Mac", "Mobile"],
    officialUrl: "https://store.steampowered.com/account/redeemwalletcode",
    vendor: "Valve",
    requirements: [
      "Un compte Steam actif, avec adresse e-mail vérifiée",
      "Le client Steam installé — ou un navigateur vers store.steampowered.com",
      "Une connexion internet stable",
      "Le code de la carte, non endommagé",
      "Une carte de la même région que votre compte Steam",
    ],
  },
  "activer-carte-playstation": {
    difficulty: "facile",
    durationMinutes: 3,
    regions: SELON_CARTE,
    devices: ["PS5", "PS4", "Web"],
    officialUrl: "https://www.playstation.com/redeem/",
    vendor: "Sony",
    requirements: [
      "Un compte PlayStation Network actif",
      "Une PS5, une PS4 ou un navigateur web",
      "Le code à 12 chiffres de votre carte",
      "Un compte configuré sur la même région que la carte",
    ],
  },
  "activer-carte-xbox": {
    difficulty: "facile",
    durationMinutes: 3,
    regions: SELON_CARTE,
    devices: ["Xbox", "PC", "Web"],
    officialUrl: "https://redeem.microsoft.com/",
    vendor: "Microsoft",
    requirements: [
      "Un compte Microsoft actif",
      "Une console Xbox, un PC ou un navigateur web",
      "Le code à 25 caractères de votre carte",
      "Un compte configuré sur la même région que la carte",
    ],
  },
  "activer-carte-nintendo": {
    difficulty: "facile",
    durationMinutes: 3,
    regions: SELON_CARTE,
    devices: ["Switch", "Web"],
    officialUrl: "https://ec.nintendo.com/redeem/",
    vendor: "Nintendo",
    requirements: [
      "Un compte Nintendo actif",
      "Une console Nintendo Switch ou un navigateur web",
      "Le code à 16 caractères de votre carte",
      "Un compte enregistré dans la même région que la carte",
    ],
  },
  "activer-carte-valorant": {
    difficulty: "facile",
    durationMinutes: 3,
    regions: SELON_CARTE,
    devices: ["PC"],
    officialUrl: "https://playvalorant.com/",
    vendor: "Riot Games",
    requirements: [
      "Un compte Riot actif",
      "VALORANT installé sur PC",
      "Le code PIN de votre carte prépayée",
      "Un compte Riot de la même région que la carte",
    ],
  },
  "activer-carte-netflix": {
    difficulty: "facile",
    durationMinutes: 2,
    regions: SELON_CARTE,
    devices: ["Web", "Mobile", "TV"],
    officialUrl: "https://www.netflix.com/redeem",
    vendor: "Netflix",
    requirements: [
      "Un compte Netflix (existant ou à créer)",
      "Un navigateur web",
      "Le code PIN de votre carte cadeau",
      "Un compte du même pays que la carte",
    ],
  },
  "activer-carte-spotify": {
    difficulty: "facile",
    durationMinutes: 2,
    regions: SELON_CARTE,
    devices: ["Web", "Mobile"],
    officialUrl: "https://www.spotify.com/redeem",
    vendor: "Spotify",
    requirements: [
      "Un compte Spotify actif",
      "Un navigateur web",
      "Le code PIN de votre carte",
      "Aucun abonnement facturé via l'App Store d'Apple",
    ],
  },
  "activer-carte-roblox": {
    difficulty: "facile",
    durationMinutes: 3,
    regions: SELON_CARTE,
    devices: ["Web", "Mobile", "Console"],
    officialUrl: "https://www.roblox.com/redeem",
    vendor: "Roblox",
    requirements: [
      "Un compte Roblox actif",
      "Un navigateur web",
      "Le code PIN de votre carte",
    ],
  },
  "activer-carte-fortnite": {
    difficulty: "facile",
    durationMinutes: 3,
    regions: SELON_CARTE,
    devices: ["PC", "Console", "Mobile"],
    officialUrl: "https://www.fortnite.com/vbuckscard",
    vendor: "Epic Games",
    requirements: [
      "Un compte Epic Games actif",
      "Un navigateur web",
      "Le code PIN de votre carte",
      "Connaître la plateforme sur laquelle vous jouez",
    ],
  },
  "activer-carte-google-play": {
    difficulty: "facile",
    durationMinutes: 2,
    regions: SELON_CARTE,
    devices: ["Android", "Web"],
    officialUrl: "https://play.google.com/redeem",
    vendor: "Google",
    requirements: [
      "Un compte Google actif",
      "L'application Google Play ou un navigateur",
      "Le code de votre carte",
      "Un compte Google du même pays que la carte",
    ],
  },
  "activer-carte-apple": {
    difficulty: "facile",
    durationMinutes: 2,
    regions: SELON_CARTE,
    devices: ["iPhone", "iPad", "Mac"],
    officialUrl: "https://apps.apple.com/redeem",
    vendor: "Apple",
    requirements: [
      "Un identifiant Apple actif",
      "Un iPhone, iPad ou Mac",
      "Le code de votre carte",
      "Un identifiant Apple du même pays que la carte",
    ],
  },
  "activer-carte-amazon": {
    difficulty: "facile",
    durationMinutes: 2,
    regions: SELON_CARTE,
    devices: ["Web", "Mobile"],
    officialUrl: "https://www.amazon.fr/gc/redeem",
    vendor: "Amazon",
    requirements: [
      "Un compte Amazon actif",
      "Un navigateur ou l'application Amazon",
      "Le code de votre carte",
      "Être sur le site Amazon du pays correspondant",
    ],
  },
  "activer-carte-discord": {
    difficulty: "facile",
    durationMinutes: 2,
    regions: SELON_CARTE,
    devices: ["Web", "Desktop", "Mobile"],
    officialUrl: "https://discord.com/billing/promotions",
    vendor: "Discord",
    requirements: [
      "Un compte Discord actif",
      "L'application Discord ou un navigateur",
      "Votre code cadeau Nitro",
    ],
  },
  "activer-carte-razer-gold": {
    difficulty: "moyen",
    durationMinutes: 4,
    regions: SELON_CARTE,
    devices: ["Web"],
    officialUrl: "https://gold.razer.com/",
    vendor: "Razer",
    requirements: [
      "Un compte Razer actif",
      "Un navigateur web",
      "Le numéro de série ET le code PIN de la carte",
      "Connaître la région exacte de votre carte",
    ],
  },
  "activer-carte-twitch": {
    difficulty: "facile",
    durationMinutes: 2,
    regions: SELON_CARTE,
    devices: ["Web"],
    officialUrl: "https://www.twitch.tv/",
    vendor: "Twitch",
    requirements: [
      "Un compte Twitch actif",
      "Un navigateur web",
      "Le code de votre carte cadeau",
    ],
  },
  "activer-carte-pubg-mobile": {
    difficulty: "moyen",
    durationMinutes: 4,
    regions: SELON_CARTE,
    devices: ["Mobile", "Web"],
    officialUrl: "https://www.midasbuy.com/",
    vendor: "Krafton",
    requirements: [
      "Un compte PUBG Mobile",
      "Votre identifiant de joueur (Character ID)",
      "Le code de votre carte UC",
      "Un navigateur web",
    ],
  },
  "activer-carte-free-fire": {
    difficulty: "moyen",
    durationMinutes: 4,
    regions: SELON_CARTE,
    devices: ["Mobile", "Web"],
    officialUrl: "https://shop.garena.com/",
    vendor: "Garena",
    requirements: [
      "Un compte Free Fire",
      "Votre identifiant de joueur",
      "Le numéro de série ET le code PIN de la carte",
      "Un navigateur web",
    ],
  },
  "activer-carte-league-of-legends": {
    difficulty: "facile",
    durationMinutes: 3,
    regions: SELON_CARTE,
    devices: ["PC"],
    officialUrl: "https://www.leagueoflegends.com/",
    vendor: "Riot Games",
    requirements: [
      "Un compte Riot actif",
      "League of Legends installé sur PC",
      "Le code PIN de votre carte",
      "Un compte Riot de la même région que la carte",
    ],
  },
  "activer-carte-minecraft": {
    difficulty: "facile",
    durationMinutes: 3,
    regions: SELON_CARTE,
    devices: ["PC", "Console", "Mobile"],
    officialUrl: "https://www.minecraft.net/redeem",
    vendor: "Mojang",
    requirements: [
      "Un compte Microsoft actif",
      "Un navigateur web",
      "Votre code Minecraft",
      "Connaître l'édition concernée (Java ou Bedrock)",
    ],
  },
};

/**
 * Flagship step content for the Steam guide, taken from the design handoff
 * (final-intent copy). Other guides fall back to their library step sentences,
 * which become the step card title with no invented description.
 */
export const ACTIVATION_GUIDE_RICH_STEPS: Record<
  string,
  { title: string; description: string; tip?: string; warning?: string }[]
> = {
  "activer-carte-steam": [
    {
      title: "Connectez-vous à votre compte Steam",
      description:
        "Ouvrez le client Steam ou store.steampowered.com et connectez-vous avec le compte qui recevra le solde.",
      tip: "Vérifiez que c'est le bon compte — le solde ajouté n'est pas transférable entre comptes.",
    },
    {
      title: "Ouvrez la page d'activation officielle",
      description:
        "Depuis votre compte, rendez-vous sur la page « Utiliser une carte-cadeau Steam ».",
    },
    {
      title: "Récupérez le code de la carte",
      description:
        "Relevez le code à 15 caractères fourni avec votre commande ghost.ma.",
      warning:
        "Un code endommagé ou déjà utilisé peut sembler invalide — contactez le support avant de le saisir plusieurs fois de suite.",
    },
    {
      title: "Entrez le code",
      description:
        "Saisissez le code exactement tel qu'il apparaît (majuscules, sans espace) dans le champ prévu.",
    },
    {
      title: "Confirmez l'activation",
      description:
        "Cliquez sur « Continuer ». Le solde est crédité instantanément sur votre portefeuille Steam.",
      tip: "Vérifiez votre solde dans Steam → Portefeuille pour confirmer l'ajout.",
    },
  ],
};
