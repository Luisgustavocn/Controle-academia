import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { sendWhatsAppTestMessage } from "@/lib/services/whatsapp";

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const result = await sendWhatsAppTestMessage({
      phone: body.phone ? String(body.phone) : undefined,
      message: body.message ? String(body.message) : undefined
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha ao enviar teste de WhatsApp", 400);
  }
}
