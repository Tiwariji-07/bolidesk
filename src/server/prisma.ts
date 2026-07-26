import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for BoliDesk persistence.");
  return value;
}

/** Reused per process; the adapter keeps Prisma 7 on the PostgreSQL driver path. */
export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl() }),
    });
  }
  return globalForPrisma.prisma;
}
