import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getBrandingUploadsDirectory } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAFE_FILE_NAME = /^logo-[0-9]+-[0-9a-f]{8}\.(png|jpg|webp)$/;
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp"
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileName: string }> }
) {
  const { fileName } = await context.params;
  const match = SAFE_FILE_NAME.exec(fileName);
  if (!match) {
    return new NextResponse("Not found", { status: 404 });
  }

  const candidates = [
    path.join(getBrandingUploadsDirectory(), fileName),
    path.join(process.cwd(), "public", "uploads", "branding", fileName)
  ];

  for (const filePath of candidates) {
    try {
      const content = await readFile(filePath);

      return new NextResponse(new Uint8Array(content), {
        headers: {
          "Content-Type": CONTENT_TYPES[match[1]],
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff"
        }
      });
    } catch {
      // Continue to the legacy public directory before returning 404.
    }
  }

  return new NextResponse("Not found", { status: 404 });
}
