import {} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { buildBackupPayload } from "@/lib/services/backup";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "settings.manage");
  if (auth instanceof Response) return auth;

  const payload = await buildBackupPayload();

  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename=backup-academia-${new Date().toISOString().slice(0, 10)}.json`
    }
  });
}
