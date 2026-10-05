import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {} from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { getBrandingUploadsDirectory } from "@/lib/storage";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};

function hasBytes(bytes: Uint8Array, expected: number[], offset = 0) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function detectSafeImageExtension(file: File, bytes: Uint8Array) {
  const declaredExtension = MIME_TO_EXT[file.type];
  if (!declaredExtension) return "";

  const detectedExtension = hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ? "png"
    : hasBytes(bytes, [0xff, 0xd8, 0xff])
      ? "jpg"
      : hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
        ? "webp"
        : "";

  return detectedExtension === declaredExtension ? detectedExtension : "";
}

export async function POST(request: NextRequest) {
  const auth = requireCapability(request, "settings.manage");
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

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = detectSafeImageExtension(file, bytes);
  if (!ext) {
    return fail("Formato inválido. Use PNG, JPG ou WEBP", 400);
  }

  const fileName = `logo-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const brandingUploadsDir = getBrandingUploadsDirectory();
  const destinationPath = path.join(brandingUploadsDir, fileName);

  await mkdir(brandingUploadsDir, { recursive: true });
  await writeFile(destinationPath, bytes, { flag: "wx" });

  return ok({
    logoUrl: `/uploads/branding/${fileName}`
  });
}
