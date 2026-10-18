import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getStudentUploadsDirectory } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_AVATAR_SIZE = 1024 * 1024;

function isWebp(bytes: Uint8Array) {
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

function webpDimensions(bytes: Uint8Array) {
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "students.update");
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const previous = await prisma.aluno.findUnique({ where: { id }, select: { id: true, fotoPath: true } });
  if (!previous) return fail("Aluno não encontrado", 404);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File) || file.size <= 0) return fail("Foto não enviada", 400);
  if (file.type !== "image/webp") return fail("Formato inválido. Confirme o recorte para gerar uma imagem WebP", 400);
  if (file.size > MAX_AVATAR_SIZE) return fail("Foto muito grande. Limite de 1MB", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebp(bytes)) return fail("Conteúdo de imagem inválido", 400);
  const dimensions = webpDimensions(bytes);
  if (!dimensions || dimensions.width !== 512 || dimensions.height !== 512) {
    return fail("A foto confirmada deve possuir enquadramento 1:1 em 512 × 512 px", 400);
  }

  const fileName = `avatar-${randomUUID()}.webp`;
  const relativePath = `/uploads/students/${id}/${fileName}`;
  const directory = getStudentUploadsDirectory(id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, fileName), bytes, { flag: "wx", mode: 0o600 });

  const updated = await prisma.aluno.update({ where: { id }, data: { fotoPath: relativePath }, select: { id: true, fotoPath: true } });
  await logAudit({
    userId: auth.id,
    modulo: "alunos",
    entidade: "Aluno",
    entidadeId: id,
    acao: "UPDATE_PROFILE_PHOTO",
    antes: { fotoPath: previous.fotoPath },
    depois: { fotoPath: updated.fotoPath }
  });

  return ok({ fotoPath: updated.fotoPath });
}
