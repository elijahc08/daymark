import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { defineConfig } from "drizzle-kit";

const databasePath = join(process.cwd(), "data", basename(process.env.DB_FILE_NAME ?? "planner.sqlite"));
mkdirSync(dirname(databasePath), { recursive: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databasePath,
  },
});
