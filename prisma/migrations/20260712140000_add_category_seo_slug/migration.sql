-- Keyword-rich localized URL slug for category landing pages
-- (/categorie/<seoSlug>). Additive + nullable; Postgres allows multiple NULLs
-- under a unique index, so existing categories are unaffected.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "seoSlug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Category_seoSlug_key" ON "Category"("seoSlug");
