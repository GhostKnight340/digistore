export const BACKGROUND_PRESETS = [
  { id: "default-dark",      label: "Default Dark" },
  { id: "steam-blue",        label: "Steam Blue" },
  { id: "playstation-blue",  label: "PlayStation Blue" },
  { id: "xbox-green",        label: "Xbox Green" },
  { id: "nintendo-red",      label: "Nintendo Red" },
  { id: "roblox",            label: "Roblox" },
  { id: "valorant",          label: "Valorant" },
] as const;

export type PresetId = (typeof BACKGROUND_PRESETS)[number]["id"];

const CATEGORY_PRESET: Record<string, PresetId> = {
  steam:       "steam-blue",
  playstation: "playstation-blue",
  xbox:        "xbox-green",
  nintendo:    "nintendo-red",
  roblox:      "roblox",
  valorant:    "valorant",
};

/** Returns the resolved preset id for a product, falling back by category then to default-dark. */
export function resolvePreset(backgroundPreset: string, category: string): PresetId {
  if (backgroundPreset) return backgroundPreset as PresetId;
  return CATEGORY_PRESET[category] ?? "default-dark";
}
