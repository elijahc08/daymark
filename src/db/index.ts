import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const databaseFile = basename(process.env.DB_FILE_NAME ?? "planner.sqlite");
const databaseDirectory = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? join(process.cwd(), "data");
const fileName = join(databaseDirectory, databaseFile);
mkdirSync(dirname(fileName), { recursive: true });

const sqlite = new Database(fileName);
sqlite.exec("PRAGMA busy_timeout = 5000;");
// Next's build workers may open this file concurrently; switch to WAL at runtime only.
if (process.env.DAYMARK_SKIP_SQLITE_WAL !== "1") sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle({ client: sqlite, schema });
