import { hash } from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return ["true", "1", "sim", "yes"].includes(String(value).toLowerCase());
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const q = request.nextUrl.searchParams.get("q") ?? "";

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: q, mode: Prisma.QueryMode.insensitive } }
          ]
        }
      : undefined,
    orderBy: { name: "asc" }
  });

  return ok({
    items: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt
    }))
  });
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const body = (await request.json()) as Record<string, unknown>;

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  const role = String(body.role ?? "RECEPCAO") as UserRole;

  if (!email || !password || !name) {
    return fail("name, email e password são obrigatórios", 400);
  }

  const passwordHash = await hash(password, 10);

  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      active: body.active === undefined ? true : parseBool(body.active)
    }
  });

  return ok({ item: { id: created.id, name: created.name, email: created.email, role: created.role } }, 201);
}
