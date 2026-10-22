import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` needs no database, so a fresh clone and the Docker deps stage
// can install without DATABASE_URL. Migrate and seed commands still need the real value.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://unset@localhost:5432/unset" },
});
