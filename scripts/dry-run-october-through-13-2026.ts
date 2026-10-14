import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyOctoberThrough13, buildOctoberThrough13DryRun, OCTOBER_THROUGH_13_2026_APPLY_CONFIRMATION, OCTOBER_THROUGH_13_2026_SHA256, parseOctoberThrough13Package } from "@/lib/import/october-through-13-2026";
import { prisma } from "@/lib/prisma";
import { runProductionCli } from "@/scripts/cli-runtime";

function option(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
const dryRun = process.argv.includes("--dry-run"); const apply = process.argv.includes("--apply");
if (dryRun === apply) throw new Error("Informe exatamente --dry-run ou --apply");
const source = option("--source"); if (!source) throw new Error("Informe --source <pacote.zip>");
const confirmed = option("--confirm-sha256"); if (confirmed !== OCTOBER_THROUGH_13_2026_SHA256) throw new Error("Confirme o SHA-256 canônico com --confirm-sha256");
const applyConfirmation = option("--confirm-apply"); if (apply && applyConfirmation !== OCTOBER_THROUGH_13_2026_APPLY_CONFIRMATION) throw new Error(`Para aplicar, informe --confirm-apply ${OCTOBER_THROUGH_13_2026_APPLY_CONFIRMATION}`);
const reportDir = path.resolve(option("--report-dir") ?? "data/import-october-through-13-2026-dry-run");

void runProductionCli(apply ? "apply-october-through-13-2026" : "dry-run-october-through-13-2026", async () => {
  const pkg = parseOctoberThrough13Package(path.resolve(source), confirmed);
  const result = apply ? await applyOctoberThrough13(prisma, pkg, applyConfirmation ?? "") : await buildOctoberThrough13DryRun(prisma, pkg);
  await mkdir(reportDir, { recursive: true, mode: 0o700 }); const report = path.join(reportDir, apply ? "apply.json" : "dry-run.json");
  await writeFile(report, JSON.stringify({ sourceSha256: pkg.sha256, ...result }, null, 2) + "\n", { mode: 0o600 }); await chmod(report, 0o600);
  return { sourceSha256: pkg.sha256, ...result, report };
});
