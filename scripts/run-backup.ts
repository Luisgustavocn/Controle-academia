import { createBackupFile } from "@/lib/services/backup";

async function main() {
  const targetDir = process.argv[2];
  const result = await createBackupFile(targetDir);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
