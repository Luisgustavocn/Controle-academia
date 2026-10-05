import {} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guards";

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "reports.financial");
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as { filename?: string; rows?: Array<Record<string, unknown>> };
  const filename = body.filename || "relatorio";
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!rows.length) {
    return new NextResponse("", { status: 400 });
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(";")];
  for (const row of rows) {
    lines.push(
      headers
        .map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`)
        .join(";")
    );
  }

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}.csv`
    }
  });
}
