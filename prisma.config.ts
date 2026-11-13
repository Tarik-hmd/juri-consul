import "dotenv/config";

import { defineConfig, env } from "prisma/config";

// Prisma 7: connection URLs for Migrate/CLI live here, not in the schema.
// The runtime client is configured separately in src/lib/db/client.ts via
// a driver adapter (validated DATABASE_URL, no fallback secrets).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx scripts/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
