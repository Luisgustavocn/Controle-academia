import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { InvalidSpreadsheetError, parseSpreadsheetBuffer } from "../lib/excel/importer";
import {
  MAX_SPREADSHEET_IMPORT_BYTES,
  validateSpreadsheetUpload
} from "../lib/excel/upload-validation";

test("accepts and parses a small valid XLSX workbook", () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Nome", "Telefone", "Vencimento"],
    ["Pessoa Teste", "00000000000", 10]
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Musc");

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  const parsed = parseSpreadsheetBuffer(buffer);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(parsed.Sheets.Musc, { header: 1 });

  assert.equal(parsed.SheetNames[0], "Musc");
  assert.equal(rows.length, 2);
  assert.ok(XLSX.SSF.parse_date_code(1));
});

test("rejects an empty upload", () => {
  assert.deepEqual(validateSpreadsheetUpload({ name: "dados.xlsx", size: 0 }), {
    ok: false,
    message: "O arquivo Excel está vazio",
    status: 400
  });
});

test("rejects an upload larger than 10 MiB", () => {
  const result = validateSpreadsheetUpload({
    name: "dados.xlsx",
    size: MAX_SPREADSHEET_IMPORT_BYTES + 1
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});

test("accepts only XLSX and XLS extensions", () => {
  assert.deepEqual(validateSpreadsheetUpload({ name: "dados.XLSX", size: 1 }), { ok: true });
  assert.deepEqual(validateSpreadsheetUpload({ name: "dados.xls", size: 1 }), { ok: true });
  assert.equal(validateSpreadsheetUpload({ name: "dados.csv", size: 1 }).ok, false);
});

test("rejects invalid content disguised as XLSX", () => {
  assert.throws(
    () => parseSpreadsheetBuffer(Buffer.from("conteudo que nao e uma planilha")),
    InvalidSpreadsheetError
  );
});
