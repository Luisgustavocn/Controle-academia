export const OPERATIONAL_DATA_ENTITIES = [
  "Aluno",
  "PeriodoMatricula",
  "Presenca",
  "Mensalidade",
  "Pagamento",
  "MovimentacaoCaixa",
  "DespesaAcademia",
  "Produto",
  "PedidoProduto",
  "PedidoItem",
  "AgendaPersonal",
  "Configuracao"
] as const;

export type OperationalDataEntity = (typeof OPERATIONAL_DATA_ENTITIES)[number] | (string & {});
export type DataProvenance = "SISTEMA_OPERACIONAL" | "IMPORTACAO" | "SCRIPT_CONTROLADO" | "MIGRACAO" | "DESCONHECIDO";
export type HistoricalOperation = "CREATE" | "UPDATE" | "DELETE" | "UPSERT";
export type ProtectionClassification =
  | "NOVO"
  | "EXISTENTE"
  | "PROTEGIDO_DADO_OPERACIONAL"
  | "CONFLITO_COM_DADO_OPERACIONAL"
  | "SKIPPED_PRECONDITION"
  | "ALTERACAO_IMPORTADA_EXPLICITAMENTE_AUTORIZADA";

export type HistoricalMutationDecision = {
  allowed: boolean;
  classification: ProtectionClassification;
  action: "CREATE" | "UPDATE" | "PRESERVAR" | "SKIP";
  reason: string;
  conflict?: {
    entity: OperationalDataEntity;
    recordId: string;
    currentValue: unknown;
    currentProvenance: DataProvenance;
    historicalValue: unknown;
    historicalProvenance: "PLANILHA" | "IMPORTACAO" | "SNAPSHOT" | "INFERENCIA";
    comparedAt: string;
  };
};

type ExistingRecord = {
  id: string;
  updatedAt?: Date | string | null;
  provenance: DataProvenance;
  value?: unknown;
};

export type HistoricalMutationInput = {
  entity: OperationalDataEntity;
  operation: HistoricalOperation;
  existing?: ExistingRecord | null;
  historicalValue?: unknown;
  historicalProvenance?: "PLANILHA" | "IMPORTACAO" | "SNAPSHOT" | "INFERENCIA";
  observedUpdatedAt?: Date | string | null;
  allowExplicitImportedMutation?: boolean;
  comparedAt?: Date;
};

function instant(value: Date | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}
function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function protectHistoricalMutation(input: HistoricalMutationInput): HistoricalMutationDecision {
  const comparedAt = (input.comparedAt ?? new Date()).toISOString();
  const existing = input.existing ?? null;

  if (!existing) {
    if (input.operation === "CREATE" || input.operation === "UPSERT") {
      return { allowed: true, classification: "NOVO", action: "CREATE", reason: "Registro ausente; criação idempotente permitida" };
    }
    return { allowed: false, classification: "SKIPPED_PRECONDITION", action: "SKIP", reason: "Registro esperado não existe mais" };
  }

  const observed = instant(input.observedUpdatedAt);
  const current = instant(existing.updatedAt);
  if (observed !== null && observed !== current) {
    return { allowed: false, classification: "SKIPPED_PRECONDITION", action: "SKIP", reason: "updatedAt mudou desde o dry-run" };
  }

  const conflicts = input.historicalValue !== undefined && !sameValue(existing.value, input.historicalValue);
  const conflict = conflicts ? {
    entity: input.entity,
    recordId: existing.id,
    currentValue: existing.value,
    currentProvenance: existing.provenance,
    historicalValue: input.historicalValue,
    historicalProvenance: input.historicalProvenance ?? "INFERENCIA" as const,
    comparedAt
  } : undefined;

  if (
    input.operation === "UPDATE"
    && existing.provenance === "IMPORTACAO"
    && input.allowExplicitImportedMutation === true
    && observed !== null
  ) {
    return {
      allowed: true,
      classification: "ALTERACAO_IMPORTADA_EXPLICITAMENTE_AUTORIZADA",
      action: "UPDATE",
      reason: "Registro importado, alteração explicitamente autorizada e guarda updatedAt válida",
      conflict
    };
  }

  const protectedOperational = existing.provenance === "SISTEMA_OPERACIONAL" || existing.provenance === "SCRIPT_CONTROLADO";
  return {
    allowed: false,
    classification: conflicts ? "CONFLITO_COM_DADO_OPERACIONAL" : protectedOperational ? "PROTEGIDO_DADO_OPERACIONAL" : "EXISTENTE",
    action: input.operation === "CREATE" || input.operation === "UPSERT" ? "PRESERVAR" : "SKIP",
    reason: conflicts
      ? "Dado histórico diverge do registro persistido; sistema preservado"
      : "Registro existente preservado; rotina histórica não pode sobrescrevê-lo",
    conflict
  };
}
