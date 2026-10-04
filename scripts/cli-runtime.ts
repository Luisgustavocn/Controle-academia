import { createRequire } from "node:module";
import { validateProductionEnvironment } from "@/lib/env";

Object.assign(process.env, { NODE_ENV: "production" });

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");
loadEnvConfig(process.cwd(), false);

function safeErrorMessage(error: unknown) {
  let message = error instanceof Error ? error.message : "Falha desconhecida no job";

  for (const name of ["DATABASE_URL", "JWT_SECRET", "WHATSAPP_API_KEY"]) {
    const value = process.env[name];
    if (value) {
      message = message.split(value).join(`[${name}_REDACTED]`);
    }
  }

  return message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[DATABASE_URL_REDACTED]");
}

export async function runProductionCli(
  job: string,
  task: () => Promise<Record<string, unknown>>
) {
  const startedAt = new Date();

  try {
    validateProductionEnvironment();
    const result = await task();
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        timezone: process.env.TZ || "America/Sao_Paulo",
        job,
        status: "success",
        durationMs: Date.now() - startedAt.getTime(),
        result
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        timezone: process.env.TZ || "America/Sao_Paulo",
        job,
        status: "error",
        durationMs: Date.now() - startedAt.getTime(),
        error: safeErrorMessage(error)
      })
    );
    process.exitCode = 1;
  } finally {
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.$disconnect();
    } catch (error) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          timezone: process.env.TZ || "America/Sao_Paulo",
          job,
          status: "disconnect_error",
          error: safeErrorMessage(error)
        })
      );
      process.exitCode = 1;
    }
  }
}
