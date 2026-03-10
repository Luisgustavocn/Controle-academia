import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { getBrandingConfig, saveBrandingConfig, type BrandingConfig } from "@/lib/services/branding";

function toBrandingPayload(body: Record<string, unknown>, fallback: BrandingConfig): BrandingConfig {
  const colorsRaw = (body.colors ?? {}) as Record<string, unknown>;

  return {
    academyName: String(body.academyName ?? fallback.academyName),
    logoUrl: String(body.logoUrl ?? fallback.logoUrl),
    colors: {
      bg: String(colorsRaw.bg ?? fallback.colors.bg),
      ink: String(colorsRaw.ink ?? fallback.colors.ink),
      muted: String(colorsRaw.muted ?? fallback.colors.muted),
      line: String(colorsRaw.line ?? fallback.colors.line),
      accent: String(colorsRaw.accent ?? fallback.colors.accent),
      accentDark: String(colorsRaw.accentDark ?? fallback.colors.accentDark),
      accentSoft: String(colorsRaw.accentSoft ?? fallback.colors.accentSoft),
      sidebar: String(colorsRaw.sidebar ?? fallback.colors.sidebar),
      sidebarLine: String(colorsRaw.sidebarLine ?? fallback.colors.sidebarLine)
    }
  };
}

export async function GET() {
  const branding = await getBrandingConfig();
  return ok({ item: branding });
}

export async function PUT(request: NextRequest) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await getBrandingConfig();
  const payload = toBrandingPayload(body, current);

  if (!payload.academyName.trim()) {
    return fail("Nome da academia é obrigatório", 400);
  }

  if (!payload.logoUrl.trim()) {
    return fail("Logo é obrigatória", 400);
  }

  const saved = await saveBrandingConfig(payload);
  return ok({ item: saved });
}
