import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { importFromExcelBuffer, InvalidSpreadsheetError } from "@/lib/excel/importer";
import { validateSpreadsheetUpload } from "@/lib/excel/upload-validation";

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const formData = await request.formData();
  const file = formData.get("file");
  const year = Number(formData.get("year") || new Date().getFullYear());

  if (!(file instanceof File)) {
    return fail("Envie o arquivo Excel no campo 'file'", 400);
  }

  const validation = validateSpreadsheetUpload(file);
  if (!validation.ok) {
    return fail(validation.message, validation.status);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await importFromExcelBuffer(Buffer.from(arrayBuffer), year);

    return ok({
      message: "Importação concluída",
      result
    });
  } catch (error) {
    if (error instanceof InvalidSpreadsheetError) {
      return fail(error.message, 400);
    }

    console.error("Falha ao importar planilha", error);
    return fail("Não foi possível concluir a importação da planilha", 500);
  }
}
