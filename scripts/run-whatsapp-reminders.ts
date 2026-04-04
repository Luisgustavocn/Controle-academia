import { dispatchWhatsAppBillingReminders } from "@/lib/services/whatsapp";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const result = await dispatchWhatsAppBillingReminders({ dryRun });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
