import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "production";
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), false);

const requiredEnvironment = ["DATABASE_URL", "JWT_SECRET", "APP_DATA_DIR"];
const missing = requiredEnvironment.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(`Variaveis de ambiente obrigatorias ausentes para producao: ${missing.join(", ")}`);
  process.exit(1);
}

const host = process.env.APP_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PORT || "3000");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT deve ser um numero inteiro entre 1 e 65535.");
  process.exit(1);
}

const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", host, "--port", String(port)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV
    }
  }
);

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : "Falha ao iniciar a aplicacao.");
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
