import { currentCompetencia } from "@/lib/competencia";
import { runProductionCli } from "@/scripts/cli-runtime";

void runProductionCli("fechamento-caixa", async () => {
  const { runCashClosing } = await import("@/lib/services/jobs");
  const competencia = process.argv[2] || currentCompetencia();
  const result = await runCashClosing(competencia);

  if (!result.backupSaved) {
    throw new Error("Fechamento gravado, mas o backup JSON obrigatorio falhou");
  }

  return result;
});
