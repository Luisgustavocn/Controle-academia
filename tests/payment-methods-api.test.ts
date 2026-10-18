import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/formas-pagamento/route";
import { DELETE, PUT } from "../app/api/formas-pagamento/[id]/route";
import { signSessionToken } from "../lib/auth/session";
import { SESSION_COOKIE_NAME, type SessionRole } from "../lib/auth/jwt-payload";
import { prisma } from "../lib/prisma";

const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "payment-method-api-test-secret-with-enough-entropy";

const paymentMethods = prisma.formaPagamento;
const originals = {
  findMany: paymentMethods.findMany,
  findUnique: paymentMethods.findUnique,
  create: paymentMethods.create,
  update: paymentMethods.update,
  userFindUnique: prisma.user.findUnique,
  auditCreate: prisma.logAuditoria.create
};

function requestFor(role: SessionRole, url: string, init?: { method?: string; body?: BodyInit }) {
  const token = signSessionToken({ id: `user-${role}`, name: role, email: `${role.toLowerCase()}@test.local`, role });
  return new NextRequest(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    }
  });
}

beforeEach(() => {
  prisma.user.findUnique = (async () => ({ id: "user-ADMIN" })) as unknown as typeof prisma.user.findUnique;
  prisma.logAuditoria.create = (async ({ data }) => ({ ...data, id: "audit-1", createdAt: new Date() })) as typeof prisma.logAuditoria.create;
});

afterEach(() => {
  paymentMethods.findMany = originals.findMany;
  paymentMethods.findUnique = originals.findUnique;
  paymentMethods.create = originals.create;
  paymentMethods.update = originals.update;
  prisma.user.findUnique = originals.userFindUnique;
  prisma.logAuditoria.create = originals.auditCreate;
});

after(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

test("financial readers list only active receipt-compatible payment methods", async () => {
  let receivedArgs: unknown;
  paymentMethods.findMany = (async (args) => {
    receivedArgs = args;
    return [{ id: "pix", nome: "PIX", nomeNormalizado: "pix", ativo: true, aplicacao: "AMBOS", ordem: 0, createdAt: new Date(), updatedAt: new Date() }];
  }) as typeof paymentMethods.findMany;

  const response = await GET(requestFor("FINANCEIRO", "http://localhost/api/formas-pagamento?ativo=true&aplicacao=RECEBIMENTO"));
  assert.equal(response.status, 200);
  assert.deepEqual((receivedArgs as { where: unknown }).where, {
    ativo: true,
    aplicacao: { in: ["RECEBIMENTO", "AMBOS"] }
  });
});

test("only settings managers create methods and normalized duplicates are rejected", async () => {
  const denied = await POST(requestFor("FINANCEIRO", "http://localhost/api/formas-pagamento", {
    method: "POST",
    body: JSON.stringify({ nome: "PIX", aplicacao: "AMBOS" })
  }));
  assert.equal(denied.status, 403);

  paymentMethods.create = (async () => {
    throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
  }) as typeof paymentMethods.create;
  const duplicate = await POST(requestFor("ADMIN", "http://localhost/api/formas-pagamento", {
    method: "POST",
    body: JSON.stringify({ nome: "Pix", aplicacao: "AMBOS", ativo: true, ordem: 0 })
  }));
  assert.equal(duplicate.status, 400);
  assert.match(String((await duplicate.json()).error), /Já existe/);
});

test("administrators edit and deactivate without exposing destructive deletion", async () => {
  const previous = { id: "pix", nome: "PIX", nomeNormalizado: "pix", ativo: true, aplicacao: "AMBOS" as const, ordem: 0, createdAt: new Date(), updatedAt: new Date() };
  paymentMethods.findUnique = (async () => previous) as typeof paymentMethods.findUnique;
  paymentMethods.update = (async ({ data }) => ({ ...previous, ...data, ativo: false })) as typeof paymentMethods.update;

  const updated = await PUT(requestFor("ADMIN", "http://localhost/api/formas-pagamento/pix", {
    method: "PUT",
    body: JSON.stringify({ ativo: false })
  }), { params: Promise.resolve({ id: "pix" }) });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).item.ativo, false);

  const deletion = await DELETE(requestFor("ADMIN", "http://localhost/api/formas-pagamento/pix", { method: "DELETE" }));
  assert.equal(deletion.status, 409);
});
