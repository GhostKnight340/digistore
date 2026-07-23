-- Product media → Vercel Blob: store the Blob URL, key and metadata alongside
-- the legacy `url`. All columns are nullable and additive so existing rows keep
-- working; `url` is retained for read-compat with un-migrated base64 rows and is
-- intentionally NOT dropped here (removed only after migration verification).
ALTER TABLE "ProductMedia" ADD COLUMN "blobUrl" TEXT;
ALTER TABLE "ProductMedia" ADD COLUMN "pathname" TEXT;
ALTER TABLE "ProductMedia" ADD COLUMN "width" INTEGER;
ALTER TABLE "ProductMedia" ADD COLUMN "height" INTEGER;
ALTER TABLE "ProductMedia" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "ProductMedia" ADD COLUMN "fileSize" INTEGER;

-- Speeds up the "is this Blob object still referenced?" guard before a delete,
-- and orphan detection in the migration script.
CREATE INDEX "ProductMedia_pathname_idx" ON "ProductMedia"("pathname");
