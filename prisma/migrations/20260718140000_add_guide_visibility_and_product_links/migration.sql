-- Guides: independent public-visibility switch, admin-authored "expected
-- products" labels, and a real many-to-many relation to catalog products.
--
-- SAFE BY DESIGN: purely additive. No column or table is dropped and no row is
-- rewritten. `Guide.relatedProductIds` is intentionally LEFT IN PLACE as a
-- mirror for one release so this migration stays trivially reversible.
--
-- Backfill notes:
--   * `publiclyVisible` defaults to true. This cannot expose drafts, because
--     public reads still additionally require `published = true` and
--     `archivedAt IS NULL` — so existing drafts/archived guides stay hidden.
--   * GuideProduct is backfilled from `relatedProductIds`, skipping ids that no
--     longer resolve to a real Product (the FK would reject them) and
--     de-duplicating repeated ids per guide.

-- AlterTable
ALTER TABLE "Guide" ADD COLUMN     "expectedProducts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "publiclyVisible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "GuideProduct" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuideProduct_guideId_idx" ON "GuideProduct"("guideId");

-- CreateIndex
CREATE INDEX "GuideProduct_productId_idx" ON "GuideProduct"("productId");

-- CreateIndex
CREATE INDEX "GuideProduct_variantId_idx" ON "GuideProduct"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "GuideProduct_guideId_productId_variantId_key" ON "GuideProduct"("guideId", "productId", "variantId");

-- CreateIndex
CREATE INDEX "Guide_published_publiclyVisible_idx" ON "Guide"("published", "publiclyVisible");

-- AddForeignKey
ALTER TABLE "GuideProduct" ADD CONSTRAINT "GuideProduct_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "Guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideProduct" ADD CONSTRAINT "GuideProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideProduct" ADD CONSTRAINT "GuideProduct_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate the legacy relatedProductIds array into the new relation.
-- Family-level links (variantId NULL); order preserved via array ordinality.
INSERT INTO "GuideProduct" ("id", "guideId", "productId", "variantId", "sortOrder", "createdAt")
SELECT
    gen_random_uuid()::text,
    src."guideId",
    src."productId",
    NULL,
    src."sortOrder",
    CURRENT_TIMESTAMP
FROM (
    SELECT
        g."id" AS "guideId",
        p."id" AS "productId",
        (MIN(rp.ord)::int - 1) AS "sortOrder"
    FROM "Guide" g
    CROSS JOIN LATERAL unnest(g."relatedProductIds") WITH ORDINALITY AS rp(product_id, ord)
    JOIN "Product" p ON p."id" = rp.product_id
    GROUP BY g."id", p."id"
) src;
