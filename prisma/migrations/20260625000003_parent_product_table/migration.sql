CREATE TABLE "ParentProduct" (
  "slug"             TEXT NOT NULL PRIMARY KEY,
  "name"             TEXT NOT NULL,
  "category"         TEXT NOT NULL,
  "brand"            TEXT,
  "region"           TEXT NOT NULL DEFAULT '',
  "deliveryType"     TEXT NOT NULL DEFAULT 'Code numérique instantané',
  "description"      TEXT NOT NULL DEFAULT '',
  "shortDescription" TEXT,
  "longDescription"  TEXT,
  "instructions"     TEXT,
  "thumbnail"        TEXT,
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Product" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;
