import { runProductionCli } from "@/scripts/cli-runtime";

void runProductionCli("atrasos", async () => {
  const { atualizarStatusMensalidadesAtrasadas } = await import("@/lib/services/mensalidades");
  const updated = await atualizarStatusMensalidadesAtrasadas();

  return { updated };
});
