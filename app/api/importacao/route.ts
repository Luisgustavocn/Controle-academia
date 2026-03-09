import { NextRequest } from "next/server";
import path from "node:path";
import { runImportFromFile } from "@/scripts/import-core";
import { ok, fail } from "@/lib/api";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const filePath = body.filePath as string;

  if (!filePath) return fail("filePath obrigatorio", 422);

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const result = await runImportFromFile(absolutePath);
  return ok(result);
}
