import { runProductionCli } from "@/scripts/cli-runtime";

void runProductionCli("whatsapp-alertas", async () => {
  const { dispatchWhatsAppBillingReminders } = await import("@/lib/services/whatsapp");
  const dryRun = process.argv.includes("--dry-run");
  const result = await dispatchWhatsAppBillingReminders({ dryRun });
  const summary = {
    dryRun,
    enabled: result.enabled,
    configValid: result.configValid,
    dueSoonCandidates: result.dueSoonCandidates.length,
    overdueCandidates: result.overdueCandidates.length,
    sent: result.sent.length,
    skipped: result.skipped.length,
    errors: result.errors.length
  };

  if (result.enabled && !result.configValid) {
    throw new Error("Integracao WhatsApp habilitada com configuracao incompleta");
  }

  if (result.errors.length > 0) {
    throw new Error(
      `Falha parcial no lote WhatsApp: ${summary.dueSoonCandidates + summary.overdueCandidates} candidatos, ${result.sent.length} enviados, ${result.skipped.length} ignorados, ${result.errors.length} erros`
    );
  }

  return summary;
});
