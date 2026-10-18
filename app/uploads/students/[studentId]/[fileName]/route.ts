import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { getStudentUploadsDirectory } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_FILE_NAME = /^avatar-[0-9a-f-]{36}\.webp$/;

export async function GET(request: NextRequest, context: { params: Promise<{ studentId: string; fileName: string }> }) {
  const auth = requireCapability(request, "students.read");
  if (auth instanceof Response) return auth;

  const { studentId, fileName } = await context.params;
  if (!SAFE_ID.test(studentId) || !SAFE_FILE_NAME.test(fileName)) return new NextResponse("Not found", { status: 404 });

  const expectedPath = `/uploads/students/${studentId}/${fileName}`;
  const student = await prisma.aluno.findFirst({ where: { id: studentId, fotoPath: expectedPath }, select: { id: true } });
  if (!student) return new NextResponse("Not found", { status: 404 });

  try {
    const content = await readFile(path.join(getStudentUploadsDirectory(studentId), fileName));
    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
