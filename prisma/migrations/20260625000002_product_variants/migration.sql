-- Add variant-grouping fields to Product
-- parentSlug groups variant rows under a logical parent (e.g. "steam-wallet")
-- faceValue and faceCurrency describe the card's original denomination

ALTER TABLE "Product" ADD COLUMN "parentSlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "faceValue" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "faceCurrency" TEXT NOT NULL DEFAULT 'MAD';

-- Backfill parentSlug for rows created before this migration
UPDATE "Product" SET "parentSlug" = 'steam-wallet'      WHERE slug LIKE 'steam-%';
UPDATE "Product" SET "parentSlug" = 'playstation-store'  WHERE slug LIKE 'psn-%';
UPDATE "Product" SET "parentSlug" = 'xbox-gift-card'     WHERE slug LIKE 'xbox-%';
UPDATE "Product" SET "parentSlug" = 'nintendo-eshop'     WHERE slug LIKE 'nintendo-%';
UPDATE "Product" SET "parentSlug" = 'roblox'             WHERE slug LIKE 'roblox-%';
UPDATE "Product" SET "parentSlug" = 'valorant-points'    WHERE slug LIKE 'valorant-%';
-- Any unrecognised slug falls back to itself (keeps constraint satisfied)
UPDATE "Product" SET "parentSlug" = slug WHERE "parentSlug" = '';
