import { runProductionCli } from "@/scripts/cli-runtime";

void runProductionCli("backup-json", async () => {
  const { createBackupFile } = await import("@/lib/services/backup");
  const targetDir = process.argv[2];
  const result = await createBackupFile(targetDir);

  return {
    fileName: result.fileName,
    directories: result.directories,
    checksum: result.checksum,
    generatedAt: result.generatedAt
  };
});
