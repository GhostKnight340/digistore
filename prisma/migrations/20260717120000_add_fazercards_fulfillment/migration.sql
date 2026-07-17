-- FazerCards supplier integration (Phase 1 scaffolding). Purely additive:
-- nullable columns only, no data touched, no-op for existing rows.
-- See docs/fazercards-integration.md.
--
--   ProductVariant.fazercardsKind        "gift_card" | "topup" | "game_key"
--   ProductVariant.fazercardsCategoryId  provider category/game id
--   ProductVariant.fazercardsOfferId     provider card/offer/key id
--   DeliveredCode.fazercardsOrderId      provider order id ("ord-…") audit trail

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "fazercardsKind" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "fazercardsCategoryId" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "fazercardsOfferId" TEXT;

-- AlterTable
ALTER TABLE "DeliveredCode" ADD COLUMN IF NOT EXISTS "fazercardsOrderId" TEXT;
