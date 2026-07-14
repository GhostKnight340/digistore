-- Compact homepage collection cards: give each Collection an optional visual
-- identity (approved icon key + optional accent color). Purely additive with
-- safe defaults, so every existing collection keeps its id, slug, memberships,
-- schedule, and homepage settings untouched. `icon` defaults to '' (derive /
-- fallback at render time); `accentColor` is nullable (falls back to Ghost blue).
ALTER TABLE "Collection" ADD COLUMN "icon" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Collection" ADD COLUMN "accentColor" TEXT;
