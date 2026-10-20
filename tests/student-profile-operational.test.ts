import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profile = readFileSync("components/students/student-profile.tsx", "utf8");
const shell = readFileSync("components/layout-shell.tsx", "utf8");

test("student profile keeps attendance inside the profile and reuses the canonical API", () => {
  assert.match(profile, /Registrar frequência/);
  assert.match(profile, /fetch\("\/api\/presencas"/);
  assert.match(profile, /alunoId: student\.id/);
  assert.match(profile, /todayInAcademy\(\)/);
  assert.match(profile, /Presença de hoje já registrada/);
  assert.doesNotMatch(profile, /router\.push\("\/frequencia"\)/);
});

test("student profile payment action selects an eligible monthly and reuses MonthlyPaymentDialog", () => {
  assert.match(profile, /Registrar pagamento/);
  assert.match(profile, /item\.balance > 0/);
  assert.match(profile, /item\.status !== "PAGO"/);
  assert.match(profile, /item\.status !== "ISENTO"/);
  assert.match(profile, /<MonthlyPaymentDialog/);
  assert.doesNotMatch(profile, /router\.push\("\/mensalidades"\)/);
});

test("responsive navigation uses a drawer on tablets and scrolls only its navigation area", () => {
  assert.match(shell, /className="lg:hidden"/);
  assert.match(shell, /hidden overflow-hidden[^\n]+lg:flex/);
  assert.match(shell, /min-h-0 flex-1 overflow-y-auto overflow-x-hidden/);
  assert.match(shell, /min-h-screen lg:ml-20/);
  assert.doesNotMatch(shell, /className="md:hidden"/);
});
