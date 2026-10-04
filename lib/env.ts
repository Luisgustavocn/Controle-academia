const REQUIRED_PRODUCTION_ENV = ["DATABASE_URL", "JWT_SECRET", "APP_DATA_DIR"] as const;

type RuntimeEnvironment = Record<string, string | undefined>;

export function validateProductionEnvironment(env: RuntimeEnvironment = process.env) {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const missing = REQUIRED_PRODUCTION_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Variaveis de ambiente obrigatorias ausentes para producao: ${missing.join(", ")}`
    );
  }
}

export function getOptionalEnvironmentValue(name: string) {
  return process.env[name]?.trim() ?? "";
}
