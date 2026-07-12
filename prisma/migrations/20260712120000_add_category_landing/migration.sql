-- Rich category landing-page content, stored as a single nullable JSON blob.
-- Additive and reversible: NULL means the category renders as a plain product
-- grid (no landing sections), so all existing categories are unaffected.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "landing" JSONB;
