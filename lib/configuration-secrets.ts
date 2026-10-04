export const REDACTED_SECRET_VALUE = "[REDACTED]";

const SENSITIVE_KEY_FRAGMENTS = [
  "apikey",
  "secret",
  "token",
  "password",
  "senha",
  "credential",
  "privatekey",
  "databaseurl"
];

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveConfigurationKey(key: string) {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function redactConfigurationValue<T extends { chave: string; valor: string }>(item: T): T {
  if (!isSensitiveConfigurationKey(item.chave)) {
    return item;
  }

  return {
    ...item,
    valor: REDACTED_SECRET_VALUE
  };
}

export function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    result[key] = isSensitiveConfigurationKey(key)
      ? REDACTED_SECRET_VALUE
      : redactSensitiveFields(nestedValue);
  }
  return result;
}
