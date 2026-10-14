import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyJanuary2026, buildJanuary2026DryRun, JANUARY_2026_APPLY_CONFIRMATION, JANUARY_2026_SHA256, parseJanuary2026Package } from "@/lib/import/january-2026";
import { prisma } from "@/lib/prisma";
import { runProductionCli } from "@/scripts/cli-runtime";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");
if (dryRun === apply) throw new Error("Informe exatamente --dry-run ou --apply");
const source = option("--source");
if (!source) throw new Error("Informe --source <pacote.zip>");
const confirmedSha256 = option("--confirm-sha256");
const applyConfirmation = option("--confirm-apply");
if (apply && applyConfirmation !== JANUARY_2026_APPLY_CONFIRMATION) throw new Error(`Para aplicar, informe --confirm-apply ${JANUARY_2026_APPLY_CONFIRMATION}`);
if (apply && confirmedSha256 !== JANUARY_2026_SHA256) throw new Error("Para aplicar, confirme explicitamente o SHA-256 canônico com --confirm-sha256");
const reportDir = path.resolve(option("--report-dir") ?? "data/import-january-2026-dry-run");

void runProductionCli(apply ? "apply-january-2026" : "dry-run-january-2026", async () => {
  const pkg = parseJanuary2026Package(path.resolve(source), confirmedSha256);
  const result = apply
    ? await applyJanuary2026(prisma, pkg, applyConfirmation ?? "")
    : await buildJanuary2026DryRun(prisma, pkg);
  await mkdir(reportDir, { recursive: true, mode: 0o700 });
  const report = path.join(reportDir, apply ? "apply.json" : "dry-run.json");
  await writeFile(report, JSON.stringify({ sourceSha256: pkg.sha256, ...result }, null, 2) + "\n", { mode: 0o600 });
  await chmod(report, 0o600);
  return { sourceSha256: pkg.sha256, ...result, report };
});
