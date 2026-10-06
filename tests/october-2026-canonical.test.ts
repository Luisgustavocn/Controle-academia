import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { CANONICAL_PRICE_RULE, parseCanonicalOctoberWorkbook } from "../lib/import/october-2026-canonical";

function workbook(monthlyValue: number | null, useDefault: "SIM" | "NÃO") {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  add("Modalidades", [["Modalidade Final","Acao","Valor Padrao","Origem Valor Padrao","Qtd Alunos"],["3x Musculação","REUTILIZAR",100,"APROVADO_OU_EXISTENTE",1],["Todos os dias","REUTILIZAR",110,"APROVADO_OU_EXISTENTE",0],["2x Personal","CRIAR",290,"APROVADO_OU_EXISTENTE",0],["3x Personal","CRIAR",350,"APROVADO_OU_EXISTENTE",0]]);
  add("Alunos", [["Nome Fonte","Nome Canonico","Telefone","Status Outubro","Modalidade Final","Dia Vencimento","Valor Mensal","Usar Valor Padrao","Data Inicio Inferida","Origem Data Inicio","Primeiro Mes Pago"],["Pessoa","Pessoa","", "ATIVO","3x Musculação",10,monthlyValue,useDefault,"2026-03-10","INFERIDA_PRIMEIRO_PAGAMENTO","Mar"]]);
  add("Periodos_Matricula", [["Aluno","Data Inicio","Origem Data Inicio","Data Saida","Periodo Aberto","Modalidade","Valor Mensal","Usar Valor Padrao","Dia Vencimento"],["Pessoa","2026-03-10","INFERIDA_PRIMEIRO_PAGAMENTO",null,"SIM","3x Musculação",monthlyValue,useDefault,10]]);
  add("Presencas", [["Aluno","Data","Horario","Presente","Nome Fonte Frequencia"]]);
  add("Aliases", [["Alias","Nome Canonico","Contexto"],["Adelar de cezaro","Adelar Decezaro","CADASTRO_PRODUCAO"],["Andressa da Rosa","Andressa de Souza Rosa","FREQUENCIA"],["Javier Gonzalez","Javier Gonsalez","FREQUENCIA"],["Kevin Picoli","Kevin Picolli","FREQUENCIA"]]);
  return wb;
}

test("canonical price rule keeps the modality default without a redundant override", () => {
  const parsed = parseCanonicalOctoberWorkbook(workbook(null, "SIM"));
  assert.equal(CANONICAL_PRICE_RULE, "DEFAULT_MODALITY_PRICE_WITH_STUDENT_OVERRIDE");
  assert.equal(parsed.students[0].monthlyValue, null);
  assert.equal(parsed.students[0].useDefault, true);
  assert.ok(!parsed.issues.some((issue) => issue.includes("override redundante")));
});

test("canonical validation rejects an override equal to the modality default", () => {
  const parsed = parseCanonicalOctoberWorkbook(workbook(100, "NÃO"));
  assert.ok(parsed.issues.some((issue) => issue.includes("override redundante igual ao padrão")));
});
