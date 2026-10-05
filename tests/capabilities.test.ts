import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  getCapabilitiesForRole,
  getUnauthorizedPageRedirect,
  hasCapability
} from "../lib/auth/capabilities";
import { requireCapability } from "../lib/auth/guards";
import { signSessionToken } from "../lib/auth/session";
import { SESSION_COOKIE_NAME, type SessionRole } from "../lib/auth/jwt-payload";
import { filterNavigationByCapabilities } from "../lib/navigation";

const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "capability-test-secret-with-enough-entropy";

function requestFor(role: SessionRole) {
  const token = signSessionToken({ id: `user-${role}`, name: role, email: `${role.toLowerCase()}@test.local`, role });
  return new NextRequest("http://localhost/api/test", { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });
}

test.after(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

test("role capability matrix prevents numeric inheritance", () => {
  assert.equal(hasCapability("ADMIN", "settings.manage"), true);
  assert.equal(hasCapability("FINANCEIRO", "finance.cash.manage"), true);
  assert.equal(hasCapability("FINANCEIRO", "attendance.write"), false);
  assert.equal(hasCapability("RECEPCAO", "sales.create"), true);
  assert.equal(hasCapability("RECEPCAO", "finance.cash.read"), false);
  assert.equal(hasCapability("PERSONAL", "schedule.write"), true);
  assert.equal(hasCapability("PERSONAL", "finance.monthlies.read"), false);
});

test("navigation is filtered from the same effective capabilities", () => {
  const financeiro = filterNavigationByCapabilities(getCapabilitiesForRole("FINANCEIRO"));
  const labels = financeiro.flatMap((group) => group.items.map((item) => item.label));
  assert.deepEqual(labels, ["Dashboard", "Alunos", "Mensalidades", "Caixa", "Despesas", "Relatórios"]);
  assert.equal(labels.includes("Presença"), false);
  assert.equal(labels.includes("Configurações"), false);
});

test("page access chooses a safe role-specific redirect", () => {
  assert.equal(getUnauthorizedPageRedirect("FINANCEIRO", "/frequencia"), "/dashboard");
  assert.equal(getUnauthorizedPageRedirect("PERSONAL", "/dashboard"), "/frequencia");
  assert.equal(getUnauthorizedPageRedirect("ADMIN", "/configuracoes"), null);
});

test("API capability guard returns 403 instead of relying on role rank", async () => {
  const denied = requireCapability(requestFor("FINANCEIRO"), "attendance.write");
  assert.equal(denied instanceof Response, true);
  assert.equal((denied as Response).status, 403);

  const allowed = requireCapability(requestFor("PERSONAL"), "attendance.write");
  assert.equal(allowed instanceof Response, false);
  assert.equal((allowed as { role: string }).role, "PERSONAL");
});
