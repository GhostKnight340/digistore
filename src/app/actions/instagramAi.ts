"use server";

/**
 * Text-only AI assistance for the Instagram Content Studio: caption refinement
 * and hashtag suggestions. Per the handoff, the model NEVER receives media —
 * only text (caption, tone, language, product name, instruction). Backed by the
 * shared ai-ops provider (Anthropic direct, degrading to a mock when no key is
 * configured — in which case we return a clear "not configured" message rather
 * than surfacing placeholder output).
 */

import { requireAdminCustomer } from "@/lib/auth";
import { resolveProvider } from "@/lib/ai-ops/provider";
import type { InstagramActionResult } from "@/lib/composio/instagram/types";

const MODEL = "claude-haiku-4-5";
const MAX_CAPTION = 2200;

/** Transformation code → French instruction fragment (mirrors the prototype). */
const ACTION_INSTRUCTION: Record<string, string> = {
  correct: "Corrige l’orthographe, la grammaire et la ponctuation sans changer le sens.",
  engaging: "Rends la légende plus engageante et accrocheuse.",
  shorten: "Raccourcis la légende en gardant l’essentiel.",
  expand: "Développe légèrement la légende avec un peu plus de détail.",
  cta: "Ajoute un appel à l’action clair et naturel à la fin.",
  natural: "Rends le ton plus naturel et humain.",
  brand: "Adapte la légende au ton de Ghost.ma : chaleureux, fiable, orienté client marocain.",
  translate: "Traduis la légende dans la langue demandée.",
  add_emoji: "Ajoute quelques emojis pertinents, sans excès.",
  remove_emoji: "Retire tous les emojis.",
};

const SYSTEM =
  "Tu es un expert en rédaction de légendes Instagram pour Ghost.ma, une boutique " +
  "marocaine de produits numériques (cartes cadeaux, recharges, gaming). Tu écris des " +
  "légendes concises, authentiques et adaptées à Instagram. Réponds UNIQUEMENT avec le " +
  "texte final, sans guillemets, sans préambule ni commentaire.";

function notConfigured(): InstagramActionResult<never> {
  return { ok: false, error: "L’assistance IA n’est pas configurée sur ce serveur." };
}

interface ImproveCaptionInput {
  caption: string;
  action: string;
  tone: string;
  language: string;
  productName?: string;
  instruction?: string;
}

export async function improveCaptionAction(
  input: ImproveCaptionInput,
): Promise<InstagramActionResult<{ proposal: string }>> {
  await requireAdminCustomer();
  const caption = (input?.caption ?? "").slice(0, MAX_CAPTION);
  const transform = ACTION_INSTRUCTION[input?.action] ?? ACTION_INSTRUCTION.engaging;

  const parts = [
    `Transformation demandée : ${transform}`,
    `Ton souhaité : ${input?.tone || "Neutre"}.`,
    `Langue de sortie : ${input?.language || "Français"}.`,
    input?.productName ? `Produit / campagne : ${input.productName}.` : "",
    input?.instruction ? `Instruction supplémentaire : ${input.instruction}.` : "",
    "",
    "Légende actuelle :",
    caption || "(vide — propose une légende adaptée)",
  ].filter(Boolean);

  try {
    const client = resolveProvider("anthropic");
    const res = await client.complete({ model: MODEL, system: SYSTEM, input: parts.join("\n"), maxTokens: 600 });
    if (res.provider === "mock") return notConfigured();
    const proposal = res.text.trim();
    if (!proposal) return { ok: false, error: "L’IA n’a rien renvoyé. Réessayez." };
    return { ok: true, data: { proposal: proposal.slice(0, MAX_CAPTION) } };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[instagram-ai] improveCaption", error);
    return { ok: false, error: "L’assistance IA est momentanément indisponible." };
  }
}

interface SuggestHashtagsInput {
  caption: string;
  hashtags: string[];
  language: string;
}

export async function suggestHashtagsAction(
  input: SuggestHashtagsInput,
): Promise<InstagramActionResult<{ suggestions: string[] }>> {
  await requireAdminCustomer();
  const caption = (input?.caption ?? "").slice(0, MAX_CAPTION);
  const existing = Array.isArray(input?.hashtags) ? input.hashtags : [];

  const prompt = [
    "À partir du texte suivant, propose 6 à 10 hashtags Instagram pertinents pour une boutique",
    "marocaine de produits numériques. Mélange des hashtags de marque, de niche et locaux.",
    `Langue : ${input?.language || "Français"}.`,
    existing.length ? `Évite ces hashtags déjà utilisés : ${existing.join(" ")}.` : "",
    "Réponds UNIQUEMENT avec les hashtags séparés par des espaces, chacun commençant par #.",
    "",
    "Texte :",
    caption || "(pas de légende — base-toi sur le contexte Ghost.ma)",
  ].filter(Boolean);

  try {
    const client = resolveProvider("anthropic");
    const res = await client.complete({ model: MODEL, system: SYSTEM, input: prompt.join("\n"), maxTokens: 200 });
    if (res.provider === "mock") return notConfigured();
    const found = res.text.match(/#[\p{L}0-9_]+/gu) ?? [];
    const suggestions = [...new Set(found)].filter((h) => !existing.includes(h)).slice(0, 10);
    if (!suggestions.length) return { ok: false, error: "Aucune suggestion. Réessayez." };
    return { ok: true, data: { suggestions } };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[instagram-ai] suggestHashtags", error);
    return { ok: false, error: "L’assistance IA est momentanément indisponible." };
  }
}
