import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  console.error(
    "[prisma] DATABASE_URL is not set. " +
      "Set it in .env for local dev (SQLite: file:./prisma/dev.db) or " +
      "in your Vercel environment variables (PostgreSQL: postgresql://...).",
  );
}

// Reuse a single PrismaClient across hot-reloads in development to avoid
// exhausting database connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
