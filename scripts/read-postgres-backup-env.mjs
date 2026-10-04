import { createRequire } from "node:module";

process.env.NODE_ENV = "production";

const allowedNames = new Set([
  "POSTGRES_BACKUP_DIR",
  "POSTGRES_BACKUP_RETENTION_DAYS",
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGDATABASE",
  "PGPASSFILE"
]);
const name = process.argv[2];

if (!allowedNames.has(name)) {
  process.exit(2);
}

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), false);
process.stdout.write(process.env[name] ?? "");
