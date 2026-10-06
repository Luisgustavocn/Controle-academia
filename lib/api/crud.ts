import { Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireCapability, requireRole } from "@/lib/auth/guards";
import type { Capability } from "@/lib/auth/capabilities";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type CrudConfig = {
  model: keyof typeof prisma;
  module: string;
  requiredRole?: UserRole;
  readCapability?: Capability;
  writeCapability?: Capability;
  searchFields?: string[];
  relationInclude?: Record<string, boolean | object>;
  orderBy?: Record<string, "asc" | "desc">;
  numericFields?: string[];
  nullableNumericFields?: string[];
  intFields?: string[];
  dateFields?: string[];
  booleanFields?: string[];
  defaultValues?: Record<string, unknown>;
  queryFilters?: (request: NextRequest) => Record<string, unknown>;
  validate?: (data: Record<string, unknown>, mode: "create" | "update") => string | null;
  validateAsync?: (data: Record<string, unknown>, mode: "create" | "update", previous?: Record<string, unknown>) => Promise<string | null>;
  deleteBlockedReason?: string;
};

function normalizePayload(payload: Record<string, unknown>, config: CrudConfig) {
  const data = { ...config.defaultValues, ...payload } as Record<string, unknown>;

  for (const [field, value] of Object.entries(data)) {
    if (value !== "") {
      continue;
    }

    // Empty relation and explicitly nullable numeric keys clear persisted values.
    if (field.endsWith("Id") || config.nullableNumericFields?.includes(field)) {
      data[field] = null;
      continue;
    }

    // Empty strings in generic handlers should not overwrite persisted data.
    delete data[field];
  }

  for (const field of config.numericFields ?? []) {
    const value = data[field];
    if (value === undefined || value === null || value === "") {
      delete data[field];
      continue;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      delete data[field];
      continue;
    }
    data[field] = parsed;
  }

  for (const field of config.nullableNumericFields ?? []) {
    const value = data[field];
    if (value === undefined) continue;
    if (value === null || value === "") {
      data[field] = null;
      continue;
    }
    const parsed = Number(value);
    data[field] = Number.isFinite(parsed) ? parsed : null;
  }

  for (const field of config.intFields ?? []) {
    const value = data[field];
    if (value === undefined || value === null || value === "") {
      delete data[field];
      continue;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      delete data[field];
      continue;
    }
    data[field] = Math.trunc(parsed);
  }

  for (const field of config.dateFields ?? []) {
    const value = data[field];
    if (value === undefined || value === null || value === "") {
      delete data[field];
      continue;
    }
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      delete data[field];
      continue;
    }
    data[field] = parsed;
  }

  for (const field of config.booleanFields ?? []) {
    const value = data[field];
    if (value === undefined || value === null || value === "") {
      delete data[field];
      continue;
    }
    if (typeof value === "boolean") continue;
    data[field] = ["true", "1", "sim", "yes"].includes(String(value).toLowerCase());
  }

  return data;
}

function buildSearchWhere(query: string, fields: string[]) {
  if (!query) {
    return {};
  }

  return {
    OR: fields.map((field) => ({
      [field]: {
        contains: query,
        mode: Prisma.QueryMode.insensitive
      }
    }))
  };
}

type CrudDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  delete: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

function getDelegate(model: keyof typeof prisma): CrudDelegate {
  return prisma[model] as unknown as CrudDelegate;
}

export function createListCreateHandlers(config: CrudConfig) {
  const role = config.requiredRole ?? UserRole.RECEPCAO;

  async function GET(request: NextRequest) {
    const auth = config.readCapability ? requireCapability(request, config.readCapability) : requireRole(request, role);
    if (auth instanceof Response) return auth;

    const q = request.nextUrl.searchParams.get("q") ?? "";
    const delegate = getDelegate(config.model);

    const filters = config.queryFilters ? config.queryFilters(request) : {};
    const where = {
      ...filters,
      ...buildSearchWhere(q, config.searchFields ?? [])
    };

    const items = await delegate.findMany({
      where,
      include: config.relationInclude,
      orderBy: config.orderBy ?? { createdAt: "desc" }
    });

    return ok({ items });
  }

  async function POST(request: NextRequest) {
    const auth = config.writeCapability ? requireCapability(request, config.writeCapability) : requireRole(request, role);
    if (auth instanceof Response) return auth;

    const body = (await request.json()) as Record<string, unknown>;
    const data = normalizePayload(body, config);
    const validationError = config.validate?.(data, "create");
    if (validationError) {
      return fail(validationError, 400);
    }
    const asyncValidationError = await config.validateAsync?.(data, "create");
    if (asyncValidationError) return fail(asyncValidationError, 400);

    try {
      const delegate = getDelegate(config.model);
      const created = await delegate.create({ data });
      if (["caixa", "mensalidades", "despesas-academia", "pagamentos"].includes(config.module)) {
        await logAudit({
          userId: auth.id,
          modulo: config.module,
          entidade: String(config.model),
          entidadeId: String(created.id),
          acao: "CREATE",
          depois: created
        });
      }
      return ok({ item: created }, 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return fail(`Erro de persistência: ${error.code}`, 400);
      }
      return fail("Erro ao criar registro", 500);
    }
  }

  return { GET, POST };
}

export function createByIdHandlers(config: CrudConfig) {
  const role = config.requiredRole ?? UserRole.RECEPCAO;

  async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const auth = config.writeCapability ? requireCapability(request, config.writeCapability) : requireRole(request, role);
    if (auth instanceof Response) return auth;

    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const data = normalizePayload(body, config);
    const validationError = config.validate?.(data, "update");
    if (validationError) {
      return fail(validationError, 400);
    }

    const delegate = getDelegate(config.model);
    const previous = await delegate.findUnique({ where: { id } });
    if (!previous) {
      return fail("Registro não encontrado", 404);
    }
    const asyncValidationError = await config.validateAsync?.(data, "update", previous);
    if (asyncValidationError) return fail(asyncValidationError, 400);

    const updated = await delegate.update({ where: { id }, data });

    if (["caixa", "mensalidades", "despesas-academia", "pagamentos"].includes(config.module)) {
      await logAudit({
        userId: auth.id,
        modulo: config.module,
        entidade: String(config.model),
        entidadeId: id,
        acao: "UPDATE",
        antes: previous,
        depois: updated
      });
    }

    return ok({ item: updated });
  }

  async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const auth = config.writeCapability ? requireCapability(request, config.writeCapability) : requireRole(request, role);
    if (auth instanceof Response) return auth;

    if (config.deleteBlockedReason) {
      return fail(config.deleteBlockedReason, 409);
    }

    const { id } = await context.params;
    const delegate = getDelegate(config.model);
    const previous = await delegate.findUnique({ where: { id } });
    if (!previous) {
      return fail("Registro não encontrado", 404);
    }

    await delegate.delete({ where: { id } });

    if (["caixa", "mensalidades", "despesas-academia", "pagamentos"].includes(config.module)) {
      await logAudit({
        userId: auth.id,
        modulo: config.module,
        entidade: String(config.model),
        entidadeId: id,
        acao: "DELETE",
        antes: previous
      });
    }

    return ok({ ok: true });
  }

  return { PUT, DELETE };
}
