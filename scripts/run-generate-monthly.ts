import { currentCompetencia } from "@/lib/competencia";
import { runProductionCli } from "@/scripts/cli-runtime";

void runProductionCli("mensalidades", async () => {
  const { runMonthlyGeneration } = await import("@/lib/services/jobs");
  const competencia = process.argv[2] || currentCompetencia();

  return runMonthlyGeneration(competencia);
});
