-- Storefront discovery & customer-engagement upgrade.
--
-- Purely ADDITIVE and safe to deploy against production:
--   * New columns are nullable or carry a safe default (empty text[] / false / 0),
--     so no existing Product/Category row is rewritten with a blocking backfill.
--   * New tables (Guide, WishlistItem, RecentlyViewedProduct) start empty.
--   * Unique constraints (WishlistItem/RecentlyViewedProduct customer+product,
--     Guide.slug) apply only to the new tables — nothing existing can violate them.
-- No data is dropped or reset. No product price, stock, provider mapping, order,
-- payment, promo, or Ghost Credit column is touched.
--
-- Indexes added (documented per PART 1 "Document any database indexes added"):
--   Guide_slug_key                          unique slug lookup for /guides/<slug>
--   Guide_published_sortOrder_idx           public index ordering (published guides)
--   Guide_published_featured_idx            featured-guide selection
--   Guide_categoryId_idx                    FK / category filtering
--   WishlistItem_customerId_idx             list a customer's wishlist
--   WishlistItem_productId_idx              "most wishlisted" aggregate
--   WishlistItem_customerId_productId_key   UNIQUE: one row per customer+parent product
--   RecentlyViewedProduct_customerId_viewedAt_idx  newest-first history read
--   RecentlyViewedProduct_customerId_productId_key UNIQUE: one row per customer+product
-- The new text[] alias columns (Product.searchAliases, Category.aliases) mirror the
-- existing Collection.aliases column and are ranked in JS over a bounded row set,
-- so no GIN/trigram index is required at the current catalogue size.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "searchAliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Guide" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT,
    "heroImageUrl" TEXT,
    "icon" TEXT NOT NULL DEFAULT '',
    "content" JSONB,
    "faq" JSONB,
    "navigatorTip" JSONB,
    "relatedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedGuideIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "socialImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecentlyViewedProduct" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentlyViewedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guide_slug_key" ON "Guide"("slug");

-- CreateIndex
CREATE INDEX "Guide_published_sortOrder_idx" ON "Guide"("published", "sortOrder");

-- CreateIndex
CREATE INDEX "Guide_published_featured_idx" ON "Guide"("published", "featured");

-- CreateIndex
CREATE INDEX "Guide_categoryId_idx" ON "Guide"("categoryId");

-- CreateIndex
CREATE INDEX "WishlistItem_customerId_idx" ON "WishlistItem"("customerId");

-- CreateIndex
CREATE INDEX "WishlistItem_productId_idx" ON "WishlistItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_customerId_productId_key" ON "WishlistItem"("customerId", "productId");

-- CreateIndex
CREATE INDEX "RecentlyViewedProduct_customerId_viewedAt_idx" ON "RecentlyViewedProduct"("customerId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecentlyViewedProduct_customerId_productId_key" ON "RecentlyViewedProduct"("customerId", "productId");

-- AddForeignKey
ALTER TABLE "Guide" ADD CONSTRAINT "Guide_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentlyViewedProduct" ADD CONSTRAINT "RecentlyViewedProduct_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentlyViewedProduct" ADD CONSTRAINT "RecentlyViewedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
