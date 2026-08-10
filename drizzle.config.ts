import { defineConfig } from "drizzle-kit";

// DATABASE_URL is injected by the platform (per-app PostgreSQL credential).
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
