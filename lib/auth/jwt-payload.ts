export const SESSION_COOKIE_NAME = "academy_session";

export const SESSION_ROLES = ["ADMIN", "FINANCEIRO", "RECEPCAO", "PERSONAL"] as const;

export type SessionRole = (typeof SESSION_ROLES)[number];

export type SessionPayload = {
  id: string;
  name: string;
  email: string;
  role: SessionRole;
  exp: number;
  iat?: number;
  nbf?: number;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    isNonEmptyString(payload.id) &&
    isNonEmptyString(payload.name) &&
    isNonEmptyString(payload.email) &&
    SESSION_ROLES.includes(payload.role as SessionRole) &&
    typeof payload.exp === "number" &&
    Number.isFinite(payload.exp)
  );
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonSegment(value: string): unknown {
  const bytes = decodeBase64Url(value);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/**
 * Edge-compatible verification used only by middleware. Server code continues
 * to use jsonwebtoken through lib/auth/session.ts.
 */
export async function verifySessionTokenAtEdge(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return false;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJsonSegment(encodedHeader);
    if (!header || typeof header !== "object" || Array.isArray(header)) {
      return false;
    }

    const headerFields = header as Record<string, unknown>;
    if (headerFields.alg !== "HS256" || headerFields.typ !== "JWT") {
      return false;
    }

    const payload = decodeJsonSegment(encodedPayload);
    if (!isSessionPayload(payload)) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now || (typeof payload.nbf === "number" && payload.nbf > now)) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    return crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
  } catch {
    return false;
  }
}
