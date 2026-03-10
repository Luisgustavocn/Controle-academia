import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { importFromExcelBuffer } from "@/lib/excel/importer";

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const formData = await request.formData();
  const file = formData.get("file");
  const year = Number(formData.get("year") || new Date().getFullYear());

  if (!(file instanceof File)) {
    return fail("Envie o arquivo Excel no campo 'file'", 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const result = await importFromExcelBuffer(Buffer.from(arrayBuffer), year);

  return ok({
    message: "Importação concluída",
    result
  });
}
