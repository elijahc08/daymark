import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { defineConfig } from "drizzle-kit";

const databaseDirectory = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? join(process.cwd(), "data");
const databasePath = join(databaseDirectory, basename(process.env.DB_FILE_NAME ?? "planner.sqlite"));
mkdirSync(dirname(databasePath), { recursive: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databasePath,
  },
});
