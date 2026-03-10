import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg"
};

const EXT_ALLOWED = new Set(["png", "jpg", "jpeg", "webp", "svg"]);

function pickExtension(file: File) {
  const byMime = MIME_TO_EXT[file.type];
  if (byMime) return byMime;

  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (EXT_ALLOWED.has(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  return "";
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return fail("Payload de upload inválido", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail("Arquivo não enviado", 400);
  }

  if (file.size <= 0) {
    return fail("Arquivo vazio", 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return fail("Arquivo muito grande. Limite de 4MB", 400);
  }

  const ext = pickExtension(file);
  if (!ext) {
    return fail("Formato inválido. Use PNG, JPG, WEBP ou SVG", 400);
  }

  const fileName = `logo-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const brandingUploadsDir = path.join(process.cwd(), "public", "uploads", "branding");
  const destinationPath = path.join(brandingUploadsDir, fileName);

  await mkdir(brandingUploadsDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  await writeFile(destinationPath, Buffer.from(bytes));

  return ok({
    logoUrl: `/uploads/branding/${fileName}`
  });
}
