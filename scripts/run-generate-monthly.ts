import { runMonthlyGeneration } from "@/lib/services/jobs";
import { currentCompetencia } from "@/lib/competencia";

async function main() {
  const competencia = process.argv[2] || currentCompetencia();
  const result = await runMonthlyGeneration(competencia);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
