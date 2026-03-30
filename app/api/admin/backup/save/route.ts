import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { createBackupFile, getBackupDirectory, saveBackupDirectory } from "@/lib/services/backup";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const { backupDir, source } = await getBackupDirectory();
  return ok({ backupDir, source });
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    backupDir?: string;
    savePath?: boolean;
  };

  const requestedDir = String(body.backupDir ?? "").trim();
  const savePath = Boolean(body.savePath);

  if (!requestedDir) {
    return fail("Informe a pasta onde o backup deve ser salvo.", 400);
  }

  try {
    if (savePath) {
      await saveBackupDirectory(requestedDir);
    }

    const result = await createBackupFile(requestedDir);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar backup.";
    return fail(message, 500);
  }
}
