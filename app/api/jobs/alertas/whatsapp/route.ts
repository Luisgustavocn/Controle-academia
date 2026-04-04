import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { dispatchWhatsAppBillingReminders, getWhatsAppReminderPreview } from "@/lib/services/whatsapp";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.FINANCEIRO);
  if (auth instanceof Response) return auth;

  const preview = await getWhatsAppReminderPreview();
  return ok(preview);
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.FINANCEIRO);
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const dryRun = Boolean(body.dryRun);
  const referenceDateRaw = body.referenceDate ? new Date(String(body.referenceDate)) : undefined;
  const referenceDate =
    referenceDateRaw && !Number.isNaN(referenceDateRaw.getTime()) ? referenceDateRaw : undefined;

  const result = await dispatchWhatsAppBillingReminders({ dryRun, referenceDate });
  return ok(result);
}
