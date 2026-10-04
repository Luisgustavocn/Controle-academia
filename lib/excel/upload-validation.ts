export const MAX_SPREADSHEET_IMPORT_BYTES = 10 * 1024 * 1024;

type SpreadsheetUpload = {
  name: string;
  size: number;
};

export type SpreadsheetUploadValidation =
  | { ok: true }
  | { ok: false; message: string; status: 400 | 413 };

export function validateSpreadsheetUpload(file: SpreadsheetUpload): SpreadsheetUploadValidation {
  if (file.size === 0) {
    return { ok: false, message: "O arquivo Excel está vazio", status: 400 };
  }

  if (file.size > MAX_SPREADSHEET_IMPORT_BYTES) {
    return {
      ok: false,
      message: "O arquivo Excel excede o limite de 10 MiB",
      status: 413
    };
  }

  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    return {
      ok: false,
      message: "Formato inválido. Envie um arquivo .xlsx ou .xls",
      status: 400
    };
  }

  return { ok: true };
}
