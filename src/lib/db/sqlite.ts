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
  }
  return _db;
}

export const newId = (): string => randomUUID();
export const nowIso = (): string => new Date().toISOString();
export const toBool = (v: unknown): boolean => v === 1 || v === true;
export const fromBool = (b: boolean): number => (b ? 1 : 0);
