CREATE TABLE IF NOT EXISTS "ParentProduct" (
  "slug"             TEXT NOT NULL PRIMARY KEY,
  "name"             TEXT NOT NULL,
  "category"         TEXT NOT NULL,
  "brand"            TEXT,
  "region"           TEXT NOT NULL DEFAULT '',
  "deliveryType"     TEXT NOT NULL DEFAULT '',
  "description"      TEXT NOT NULL DEFAULT '',
  "shortDescription" TEXT,
  "longDescription"  TEXT,
  "instructions"     TEXT,
  "thumbnail"        TEXT,
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false;
