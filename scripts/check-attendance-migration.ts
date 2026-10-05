import { runProductionCli } from "@/scripts/cli-runtime";

void runProductionCli("attendance-migration-preflight", async () => {
  const [{ prisma }, { inspectAttendanceMigration }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/services/attendance-preflight")
  ]);
  const result = await inspectAttendanceMigration(prisma);
  if (!result.safe) {
    throw new Error(`Migration de presença bloqueada: ${result.blockers.join("; ")}`);
  }
  return result;
});
