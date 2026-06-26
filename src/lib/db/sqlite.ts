import "server-only";
import path from "path";
import { randomUUID } from "crypto";

const DB_PATH = path.join(process.cwd(), "prisma", "dev.db");

export type Row = Record<string, unknown>;

export interface StatementSync {
  get: (...params: unknown[]) => Row | undefined;
  all: (...params: unknown[]) => Row[];
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
}

export interface Db {
  prepare: (sql: string) => StatementSync;
  exec: (sql: string) => void;
}

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (p: string) => Db;
    };
    _db = new DatabaseSync(DB_PATH);
    _db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    ensureRuntimeSchema(_db);
  }
  return _db;
}

export const newId = (): string => randomUUID();
export const nowIso = (): string => new Date().toISOString();
export const toBool = (v: unknown): boolean => v === 1 || v === true;
export const fromBool = (b: boolean): number => (b ? 1 : 0);

function ensureRuntimeSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "PaymentProof" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "data" TEXT NOT NULL,
      "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PaymentProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "PaymentProof_orderId_key" ON "PaymentProof"("orderId");

    CREATE TABLE IF NOT EXISTS "PaymentEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "fromStatus" TEXT,
      "toStatus" TEXT,
      "note" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "PaymentEvent_orderId_idx" ON "PaymentEvent"("orderId");

    CREATE TABLE IF NOT EXISTS "Bank" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "accountHolder" TEXT NOT NULL,
      "accountNumber" TEXT NOT NULL DEFAULT '',
      "rib" TEXT NOT NULL DEFAULT '',
      "iban" TEXT NOT NULL DEFAULT '',
      "swift" TEXT NOT NULL DEFAULT '',
      "instructions" TEXT NOT NULL DEFAULT '',
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "CryptoWallet" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "coin" TEXT NOT NULL DEFAULT 'USDT',
      "network" TEXT NOT NULL,
      "address" TEXT NOT NULL,
      "label" TEXT NOT NULL DEFAULT '',
      "instructions" TEXT NOT NULL DEFAULT '',
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "PaymentMethodConfig" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "method" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "proofRequired" BOOLEAN NOT NULL DEFAULT true,
      "paypalEmail" TEXT NOT NULL DEFAULT '',
      "cardMessage" TEXT NOT NULL DEFAULT 'Paiement par carte bientot disponible.',
      "instructions" TEXT NOT NULL DEFAULT '',
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMethodConfig_method_key" ON "PaymentMethodConfig"("method");

    CREATE TABLE IF NOT EXISTS "SupportConfig" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "whatsappNumber" TEXT NOT NULL DEFAULT '+212 600 000 000',
      "supportEmail" TEXT NOT NULL DEFAULT 'support@karta.ma',
      "instructions" TEXT NOT NULL DEFAULT '',
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
