-- Drift repair + Customer.birthday.
--
-- Background: the staging and prod databases had migrations 20260715 (discovery)
-- and/or 20260716 (checkout email verification) RECORDED in _prisma_migrations
-- without their DDL actually applied, so `prisma migrate deploy` reported
-- "No pending migrations" while columns/tables were missing at runtime
-- (e.g. "The column Category.aliases does not exist"). Customer.birthday was
-- additionally added to the schema with no migration at all (applied to prod
-- via a manual `prisma db push` on 2026-07-17).
--
-- This migration re-applies ALL of that DDL idempotently (IF NOT EXISTS /
-- pg_constraint guards), so it:
--   * fixes any database where the DDL is missing (staging), and
--   * is a pure no-op where it already exists (prod).
-- Purely additive — no data touched, nothing dropped.

-- ── 20260715_add_discovery_engagement (repair) ──────────────────────────────

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "searchAliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "Guide" (
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

CREATE TABLE IF NOT EXISTS "WishlistItem" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecentlyViewedProduct" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentlyViewedProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Guide_slug_key" ON "Guide"("slug");
CREATE INDEX IF NOT EXISTS "Guide_published_sortOrder_idx" ON "Guide"("published", "sortOrder");
CREATE INDEX IF NOT EXISTS "Guide_published_featured_idx" ON "Guide"("published", "featured");
CREATE INDEX IF NOT EXISTS "Guide_categoryId_idx" ON "Guide"("categoryId");
CREATE INDEX IF NOT EXISTS "WishlistItem_customerId_idx" ON "WishlistItem"("customerId");
CREATE INDEX IF NOT EXISTS "WishlistItem_productId_idx" ON "WishlistItem"("productId");
CREATE UNIQUE INDEX IF NOT EXISTS "WishlistItem_customerId_productId_key" ON "WishlistItem"("customerId", "productId");
CREATE INDEX IF NOT EXISTS "RecentlyViewedProduct_customerId_viewedAt_idx" ON "RecentlyViewedProduct"("customerId", "viewedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RecentlyViewedProduct_customerId_productId_key" ON "RecentlyViewedProduct"("customerId", "productId");

-- Foreign keys: ADD CONSTRAINT has no IF NOT EXISTS — guard via pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Guide_categoryId_fkey') THEN
    ALTER TABLE "Guide" ADD CONSTRAINT "Guide_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WishlistItem_customerId_fkey') THEN
    ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WishlistItem_productId_fkey') THEN
    ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecentlyViewedProduct_customerId_fkey') THEN
    ALTER TABLE "RecentlyViewedProduct" ADD CONSTRAINT "RecentlyViewedProduct_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecentlyViewedProduct_productId_fkey') THEN
    ALTER TABLE "RecentlyViewedProduct" ADD CONSTRAINT "RecentlyViewedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 20260716_add_checkout_email_verification (repair) ───────────────────────

CREATE TABLE IF NOT EXISTS "CheckoutEmailVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutEmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CheckoutEmailVerification_email_sessionId_idx" ON "CheckoutEmailVerification"("email", "sessionId");
CREATE INDEX IF NOT EXISTS "CheckoutEmailVerification_expiresAt_idx" ON "CheckoutEmailVerification"("expiresAt");

-- ── Customer.birthday (new) ─────────────────────────────────────────────────
-- Optional date of birth, editable only from the account dashboard.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "birthday" DATE;
