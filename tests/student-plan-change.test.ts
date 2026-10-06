import assert from "node:assert/strict";
import test from "node:test";
import { AlunoStatus, MensalidadeStatus } from "@prisma/client";
import { resolveFutureMonthlyValue } from "../lib/services/mensalidades";
import { updateStudentRegistration } from "../lib/services/student-registration";

type Student = {
  id: string;
  nomeCompleto: string;
  telefone: string;
  modalidadeId: string;
  modalidade: { id: string; nome: string; valorPadrao: number };
  vencimentoDia: number;
  status: AlunoStatus;
  dataInicio: Date | null;
  valorMensal: number | null;
  usarValorPadrao: boolean;
  dataSaidaCancelamento: Date | null;
  observacoes: string | null;
};

type Fee = {
  competencia: string;
  valor: number;
  status: MensalidadeStatus;
  vencimento: string;
};

type ControlledState = {
  student: Student;
  fees: Fee[];
  histories: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
};

function controlledDatabase(historyFails = false) {
  const modalities = {
    old: { id: "old", nome: "Musculação", valorPadrao: 110 },
    next: { id: "next", nome: "Personal", valorPadrao: 300 }
  };
  let state: ControlledState = {
    student: {
      id: "student-1",
      nomeCompleto: "Aluno Teste",
      telefone: "11999999999",
      modalidadeId: "old",
      modalidade: modalities.old,
      vencimentoDia: 10,
      status: AlunoStatus.ATIVO,
      dataInicio: new Date("2026-09-01T00:00:00.000Z"),
      valorMensal: null,
      usarValorPadrao: true,
      dataSaidaCancelamento: null,
      observacoes: null
    },
    fees: [
      { competencia: "2026-09", valor: 110, status: MensalidadeStatus.PAGO, vencimento: "2026-09-10" },
      { competencia: "2026-10", valor: 110, status: MensalidadeStatus.PENDENTE, vencimento: "2026-10-10" },
      { competencia: "2026-11", valor: 110, status: MensalidadeStatus.PARCIAL, vencimento: "2026-11-10" }
    ] satisfies Fee[],
    histories: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>
  };

  const client = {
    async $transaction<T>(operation: (tx: unknown) => Promise<T>) {
      const draft = structuredClone(state);
      const tx = {
        aluno: {
          findUnique: async () => draft.student,
          update: async ({ data }: { data: Partial<Student> & { modalidadeId?: string | null } }) => {
            const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
            const modalityId = defined.modalidadeId ?? draft.student.modalidadeId;
            draft.student = {
              ...draft.student,
              ...defined,
              modalidadeId: String(modalityId),
              modalidade: modalityId === "next" ? modalities.next : modalities.old
            } as Student;
            return draft.student;
          }
        },
        historicoPlano: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            if (historyFails) throw new Error("controlled history failure");
            draft.histories.push(data);
            return data;
          }
        },
        user: {
          findUnique: async () => ({ id: "admin-1" })
        },
        logAuditoria: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            draft.audits.push(data);
            return data;
          }
        }
      };
      const result = await operation(tx);
      state = draft;
      return result;
    }
  };

  return { client, get state() { return state; } };
}

test("plan change preserves every issued fee and records plan history plus audit", async () => {
  const db = controlledDatabase();
  const issuedBefore = structuredClone(db.state.fees);

  const result = await updateStudentRegistration("student-1", {
    modalidadeId: "next",
    hasDataSaidaPayload: false
  }, { id: "admin-1", name: "Admin Teste" }, {
    client: db.client as never,
    now: new Date("2026-10-05T15:00:00.000Z")
  });

  assert.equal(result.updated.modalidadeId, "next");
  assert.deepEqual(db.state.fees, issuedBefore);
  assert.equal(db.state.histories.length, 1);
  assert.equal(db.state.histories[0]?.valorAnterior, null);
  assert.equal(db.state.histories[0]?.valorNovo, null);
  assert.match(String(db.state.histories[0]?.observacao), /Mensalidades emitidas foram preservadas/);
  assert.equal(db.state.audits.length, 1);
});

test("due-day change preserves due dates for paid, pending, partial and future issued fees", async () => {
  const db = controlledDatabase();
  const issuedBefore = structuredClone(db.state.fees);

  await updateStudentRegistration("student-1", {
    vencimentoDia: 25,
    hasDataSaidaPayload: false
  }, { id: "admin-1", name: "Admin Teste" }, { client: db.client as never });

  assert.equal(db.state.student.vencimentoDia, 25);
  assert.deepEqual(db.state.fees, issuedBefore);
  assert.equal(db.state.audits.length, 1);
  assert.equal(db.state.histories.length, 0);
});

test("individual billing configuration is audited without rewriting issued fees", async () => {
  const db = controlledDatabase();
  const issuedBefore = structuredClone(db.state.fees);

  await updateStudentRegistration("student-1", {
    valorMensal: 250,
    usarValorPadrao: false,
    hasDataSaidaPayload: false
  }, { id: "admin-1", name: "Admin Teste" }, { client: db.client as never });

  assert.equal(db.state.student.valorMensal, 250);
  assert.equal(db.state.student.usarValorPadrao, false);
  assert.deepEqual(db.state.fees, issuedBefore);
  assert.equal(db.state.audits.length, 1);
});

test("history failure rolls back the student update atomically", async () => {
  const db = controlledDatabase(true);

  await assert.rejects(() => updateStudentRegistration("student-1", {
    modalidadeId: "next",
    hasDataSaidaPayload: false
  }, { id: "admin-1", name: "Admin Teste" }, { client: db.client as never }), /controlled history failure/);

  assert.equal(db.state.student.modalidadeId, "old");
  assert.equal(db.state.histories.length, 0);
  assert.equal(db.state.audits.length, 0);
});

test("future value resolver is ready for individual value with modality fallback", () => {
  assert.equal(resolveFutureMonthlyValue({ individualValue: 250, useModalityDefault: true, modalityDefaultValue: 300 }), 250);
  assert.equal(resolveFutureMonthlyValue({ individualValue: null, useModalityDefault: true, modalityDefaultValue: 300 }), 300);
  assert.equal(resolveFutureMonthlyValue({ individualValue: null, useModalityDefault: false, modalityDefaultValue: 300 }), null);
  assert.equal(resolveFutureMonthlyValue({ individualValue: null, useModalityDefault: true, modalityDefaultValue: null }), null);
  assert.equal(resolveFutureMonthlyValue({ individualValue: 0, useModalityDefault: true, modalityDefaultValue: 0 }), null);
});
