import {} from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import {
  getWhatsAppConfig,
  getWhatsAppReminderPreview,
  isWhatsAppApiKeyConfigured,
  maskWhatsAppConfig,
  saveWhatsAppConfig,
  type WhatsAppConfig
} from "@/lib/services/whatsapp";

function toWhatsAppPayload(body: Record<string, unknown>, fallback: WhatsAppConfig): Partial<WhatsAppConfig> {
  const templates = (body.templates ?? {}) as Record<string, unknown>;

  return {
    enabled: Boolean(body.enabled ?? fallback.enabled),
    baseUrl: String(body.baseUrl ?? fallback.baseUrl),
    instanceName: String(body.instanceName ?? fallback.instanceName),
    countryCode: String(body.countryCode ?? fallback.countryCode),
    daysBeforeDue: Number(body.daysBeforeDue ?? fallback.daysBeforeDue),
    testPhone: String(body.testPhone ?? fallback.testPhone),
    templates: {
      dueSoon: String(templates.dueSoon ?? fallback.templates.dueSoon),
      overdue: String(templates.overdue ?? fallback.templates.overdue)
    }
  };
}

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "whatsapp.manage");
  if (auth instanceof Response) return auth;

  const [config, preview] = await Promise.all([getWhatsAppConfig(), getWhatsAppReminderPreview()]);
  return ok({ item: maskWhatsAppConfig(config), preview });
}

export async function PUT(request: NextRequest) {
  const auth = requireCapability(request, "whatsapp.manage");
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await getWhatsAppConfig();
  const payload = toWhatsAppPayload(body, current);

  if (payload.enabled && (!payload.baseUrl?.trim() || !payload.instanceName?.trim())) {
    return fail("Para ativar o WhatsApp, preencha base URL e instância.", 400);
  }

  if (payload.enabled && !isWhatsAppApiKeyConfigured()) {
    return fail("Para ativar o WhatsApp, configure WHATSAPP_API_KEY no ambiente do servidor.", 400);
  }

  const saved = await saveWhatsAppConfig(payload);
  const preview = await getWhatsAppReminderPreview();
  return ok({ item: maskWhatsAppConfig(saved), preview });
}
