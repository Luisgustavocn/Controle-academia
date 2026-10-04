import path from "node:path";
import { readdir, stat, unlink } from "node:fs/promises";
import { getDefaultBackupDirectory } from "@/lib/storage";
import { runProductionCli } from "@/scripts/cli-runtime";

const JSON_BACKUP_PATTERN = /^backup-academia-.+\.json(?:\.sha256)?$/;

function retentionDays() {
  const value = Number(process.env.JSON_BACKUP_RETENTION_DAYS ?? "14");
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error("JSON_BACKUP_RETENTION_DAYS deve ser um inteiro entre 1 e 3650");
  }
  return value;
}

function validatedBackupDirectory() {
  const directory = path.resolve(process.env.BACKUP_EXPORT_DIR?.trim() || getDefaultBackupDirectory());
  if (!path.isAbsolute(directory) || directory === path.parse(directory).root) {
    throw new Error("Diretorio de backup JSON inseguro para retencao");
  }
  return directory;
}

void runProductionCli("backup-json-retention", async () => {
  const directory = validatedBackupDirectory();
  const days = retentionDays();
  const dryRun = process.argv.includes("--dry-run");
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const entries = await readdir(directory, { withFileTypes: true });
  const expired: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !JSON_BACKUP_PATTERN.test(entry.name)) continue;

    const filePath = path.join(directory, entry.name);
    const metadata = await stat(filePath);
    if (metadata.mtimeMs >= cutoff) continue;

    expired.push(entry.name);
    if (!dryRun) {
      await unlink(filePath);
    }
  }

  return {
    directory,
    retentionDays: days,
    dryRun,
    expiredFiles: expired.length,
    removedFiles: dryRun ? 0 : expired.length
  };
});
