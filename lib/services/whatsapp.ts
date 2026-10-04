import { MensalidadeStatus } from "@prisma/client";
import { addDays, differenceInCalendarDays } from "date-fns";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getBrandingConfig } from "@/lib/services/branding";
import { REDACTED_SECRET_VALUE } from "@/lib/configuration-secrets";

export type WhatsAppConfig = {
  enabled: boolean;
  baseUrl: string;
  instanceName: string;
  apiKey: string;
  countryCode: string;
  daysBeforeDue: number;
  testPhone: string;
  templates: {
    dueSoon: string;
    overdue: string;
  };
};

export type ReminderCandidate = {
  id: string;
  alunoId: string;
  nome: string;
  telefone: string;
  competencia: string;
  valor: number;
  vencimento: string;
  status: MensalidadeStatus;
  daysUntilDue: number;
};

type ReminderDispatchSummary = {
  configValid: boolean;
  enabled: boolean;
  reason?: string;
  dueSoonCandidates: ReminderCandidate[];
  overdueCandidates: ReminderCandidate[];
  sent: Array<{ mensalidadeId: string; tipo: "dueSoon" | "overdue"; phone: string }>;
  skipped: Array<{ mensalidadeId: string; tipo: "dueSoon" | "overdue"; reason: string }>;
  errors: Array<{ mensalidadeId: string; tipo: "dueSoon" | "overdue"; error: string }>;
};

const WHATSAPP_KEYS = {
  enabled: "whatsapp.enabled",
  baseUrl: "whatsapp.baseUrl",
  instanceName: "whatsapp.instanceName",
  apiKey: "whatsapp.apiKey",
  countryCode: "whatsapp.countryCode",
  daysBeforeDue: "whatsapp.daysBeforeDue",
  testPhone: "whatsapp.testPhone",
  dueSoonTemplate: "whatsapp.template.dueSoon",
  overdueTemplate: "whatsapp.template.overdue"
} as const;

const PERSISTED_WHATSAPP_KEYS = [
  WHATSAPP_KEYS.enabled,
  WHATSAPP_KEYS.baseUrl,
  WHATSAPP_KEYS.instanceName,
  WHATSAPP_KEYS.countryCode,
  WHATSAPP_KEYS.daysBeforeDue,
  WHATSAPP_KEYS.testPhone,
  WHATSAPP_KEYS.dueSoonTemplate,
  WHATSAPP_KEYS.overdueTemplate
];

const WHATSAPP_DEFAULTS: WhatsAppConfig = {
  enabled: false,
  baseUrl: process.env.WHATSAPP_BASE_URL?.trim() ?? "",
  instanceName: process.env.WHATSAPP_INSTANCE_NAME?.trim() ?? "",
  apiKey: process.env.WHATSAPP_API_KEY?.trim() ?? "",
  countryCode: process.env.WHATSAPP_COUNTRY_CODE?.trim() || "55",
  daysBeforeDue: Number(process.env.WHATSAPP_DAYS_BEFORE_DUE ?? "3") || 3,
  testPhone: process.env.WHATSAPP_TEST_PHONE?.trim() ?? "",
  templates: {
    dueSoon:
      "Oi, {nome}! Sua mensalidade da {academia} vence em {vencimento}. Valor: {valor}. Se ja pagou, desconsidere esta mensagem.",
    overdue:
      "Oi, {nome}! Sua mensalidade da {academia} venceu em {vencimento}. Valor pendente: {valor}. Se precisar, fale com a recepcao para regularizar."
  }
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["true", "1", "sim", "yes", "on"].includes(value.trim().toLowerCase());
}

function sanitizeText(value: string | undefined, fallback = "") {
  return String(value ?? fallback).trim();
}

function clampNumber(value: string | number | undefined, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(value);
}

function startOfDayLocal(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildTemplate(template: string, payload: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => payload[key] ?? "");
}

export function normalizeWhatsAppPhone(raw: string, countryCode = "55") {
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  if (digits.length >= 12 && digits.startsWith(countryCode)) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `${countryCode}${digits}`;
  }

  if (digits.startsWith("00") && digits.length > 4) {
    return digits.slice(2);
  }

  return digits.length >= 12 ? digits : null;
}

function sanitizeConfig(input: Partial<WhatsAppConfig>): WhatsAppConfig {
  return {
    enabled: Boolean(input.enabled),
    baseUrl: sanitizeText(input.baseUrl, WHATSAPP_DEFAULTS.baseUrl).replace(/\/+$/, ""),
    instanceName: sanitizeText(input.instanceName, WHATSAPP_DEFAULTS.instanceName),
    apiKey: sanitizeText(input.apiKey, WHATSAPP_DEFAULTS.apiKey),
    countryCode: sanitizeText(input.countryCode, WHATSAPP_DEFAULTS.countryCode).replace(/\D/g, "") || "55",
    daysBeforeDue: clampNumber(input.daysBeforeDue, WHATSAPP_DEFAULTS.daysBeforeDue, 1, 30),
    testPhone: sanitizeText(input.testPhone, WHATSAPP_DEFAULTS.testPhone),
    templates: {
      dueSoon: sanitizeText(input.templates?.dueSoon, WHATSAPP_DEFAULTS.templates.dueSoon),
      overdue: sanitizeText(input.templates?.overdue, WHATSAPP_DEFAULTS.templates.overdue)
    }
  };
}

export async function ensureWhatsAppDefaults() {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await prisma.configuracao.createMany({
    data: [
      { chave: WHATSAPP_KEYS.enabled, valor: String(WHATSAPP_DEFAULTS.enabled), descricao: "Liga os envios automaticos de WhatsApp" },
      { chave: WHATSAPP_KEYS.baseUrl, valor: WHATSAPP_DEFAULTS.baseUrl, descricao: "Base URL da API WhatsApp compatível com Evolution" },
      { chave: WHATSAPP_KEYS.instanceName, valor: WHATSAPP_DEFAULTS.instanceName, descricao: "Nome da instancia conectada no provedor WhatsApp" },
      { chave: WHATSAPP_KEYS.countryCode, valor: WHATSAPP_DEFAULTS.countryCode, descricao: "Codigo de pais padrao para telefones sem DDI" },
      { chave: WHATSAPP_KEYS.daysBeforeDue, valor: String(WHATSAPP_DEFAULTS.daysBeforeDue), descricao: "Quantos dias antes do vencimento enviar o lembrete" },
      { chave: WHATSAPP_KEYS.testPhone, valor: WHATSAPP_DEFAULTS.testPhone, descricao: "Numero usado para testes manuais de WhatsApp" },
      { chave: WHATSAPP_KEYS.dueSoonTemplate, valor: WHATSAPP_DEFAULTS.templates.dueSoon, descricao: "Template da mensagem de mensalidade proxima do vencimento" },
      { chave: WHATSAPP_KEYS.overdueTemplate, valor: WHATSAPP_DEFAULTS.templates.overdue, descricao: "Template da mensagem de mensalidade vencida" }
    ],
    skipDuplicates: true
  });
}

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  try {
    await ensureWhatsAppDefaults();

    if (!process.env.DATABASE_URL) {
      return WHATSAPP_DEFAULTS;
    }

    const items = await prisma.configuracao.findMany({
      where: {
        chave: {
          in: PERSISTED_WHATSAPP_KEYS
        }
      }
    });

    const byKey = new Map(items.map((item) => [item.chave, item.valor]));
    return sanitizeConfig({
      enabled: parseBoolean(byKey.get(WHATSAPP_KEYS.enabled), WHATSAPP_DEFAULTS.enabled),
      baseUrl: byKey.get(WHATSAPP_KEYS.baseUrl) ?? WHATSAPP_DEFAULTS.baseUrl,
      instanceName: byKey.get(WHATSAPP_KEYS.instanceName) ?? WHATSAPP_DEFAULTS.instanceName,
      apiKey: WHATSAPP_DEFAULTS.apiKey,
      countryCode: byKey.get(WHATSAPP_KEYS.countryCode) ?? WHATSAPP_DEFAULTS.countryCode,
      daysBeforeDue: Number(byKey.get(WHATSAPP_KEYS.daysBeforeDue) ?? WHATSAPP_DEFAULTS.daysBeforeDue),
      testPhone: byKey.get(WHATSAPP_KEYS.testPhone) ?? WHATSAPP_DEFAULTS.testPhone,
      templates: {
        dueSoon: byKey.get(WHATSAPP_KEYS.dueSoonTemplate) ?? WHATSAPP_DEFAULTS.templates.dueSoon,
        overdue: byKey.get(WHATSAPP_KEYS.overdueTemplate) ?? WHATSAPP_DEFAULTS.templates.overdue
      }
    });
  } catch {
    return WHATSAPP_DEFAULTS;
  }
}

export async function saveWhatsAppConfig(input: Partial<WhatsAppConfig>) {
  const safe = sanitizeConfig({
    ...input,
    apiKey: WHATSAPP_DEFAULTS.apiKey
  });
  await ensureWhatsAppDefaults();

  const entries: Array<{ chave: string; valor: string; descricao: string }> = [
    { chave: WHATSAPP_KEYS.enabled, valor: String(safe.enabled), descricao: "Liga os envios automaticos de WhatsApp" },
    { chave: WHATSAPP_KEYS.baseUrl, valor: safe.baseUrl, descricao: "Base URL da API WhatsApp compatível com Evolution" },
    { chave: WHATSAPP_KEYS.instanceName, valor: safe.instanceName, descricao: "Nome da instancia conectada no provedor WhatsApp" },
    { chave: WHATSAPP_KEYS.countryCode, valor: safe.countryCode, descricao: "Codigo de pais padrao para telefones sem DDI" },
    { chave: WHATSAPP_KEYS.daysBeforeDue, valor: String(safe.daysBeforeDue), descricao: "Quantos dias antes do vencimento enviar o lembrete" },
    { chave: WHATSAPP_KEYS.testPhone, valor: safe.testPhone, descricao: "Numero usado para testes manuais de WhatsApp" },
    { chave: WHATSAPP_KEYS.dueSoonTemplate, valor: safe.templates.dueSoon, descricao: "Template da mensagem de mensalidade proxima do vencimento" },
    { chave: WHATSAPP_KEYS.overdueTemplate, valor: safe.templates.overdue, descricao: "Template da mensagem de mensalidade vencida" }
  ];

  for (const entry of entries) {
    await prisma.configuracao.upsert({
      where: { chave: entry.chave },
      update: { valor: entry.valor, descricao: entry.descricao },
      create: entry
    });
  }

  return safe;
}

export function isWhatsAppApiKeyConfigured() {
  return Boolean(WHATSAPP_DEFAULTS.apiKey);
}

export function maskWhatsAppConfig(config: WhatsAppConfig): WhatsAppConfig {
  return {
    ...config,
    apiKey: config.apiKey ? REDACTED_SECRET_VALUE : ""
  };
}

function validateConfig(config: WhatsAppConfig) {
  if (!config.enabled) {
    return "Integração de WhatsApp desativada.";
  }

  if (!config.baseUrl || !config.instanceName || !config.apiKey) {
    return "Preencha base URL, instância e API key do WhatsApp.";
  }

  return null;
}

async function postWhatsAppMessage(config: WhatsAppConfig, phone: string, text: string) {
  const url = `${config.baseUrl}/message/sendText/${config.instanceName}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.apiKey
    },
    body: JSON.stringify({
      number: phone,
      text
    })
  });

  const raw = await response.text();
  let payload: unknown = raw;

  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    throw new Error(typeof payload === "string" && payload ? payload : `Falha ao enviar WhatsApp (${response.status})`);
  }

  return payload;
}

async function listReminderCandidates(referenceDate = new Date(), daysBeforeDue = WHATSAPP_DEFAULTS.daysBeforeDue) {
  const today = startOfDayLocal(referenceDate);
  const dueLimit = addDays(today, daysBeforeDue);

  const [dueSoonRows, overdueRows] = await Promise.all([
    prisma.mensalidade.findMany({
      where: {
        status: MensalidadeStatus.PENDENTE,
        vencimento: {
          gte: today,
          lte: dueLimit
        }
      },
      include: {
        aluno: {
          select: {
            id: true,
            nomeCompleto: true,
            telefone: true
          }
        }
      },
      orderBy: { vencimento: "asc" }
    }),
    prisma.mensalidade.findMany({
      where: {
        status: {
          in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO]
        },
        vencimento: {
          lt: today
        }
      },
      include: {
        aluno: {
          select: {
            id: true,
            nomeCompleto: true,
            telefone: true
          }
        }
      },
      orderBy: { vencimento: "asc" }
    })
  ]);

  const mapCandidate = (item: (typeof dueSoonRows)[number]): ReminderCandidate => ({
    id: item.id,
    alunoId: item.alunoId,
    nome: item.aluno.nomeCompleto,
    telefone: item.aluno.telefone,
    competencia: item.competencia,
    valor: Number(item.valor),
    vencimento: item.vencimento.toISOString(),
    status: item.status,
    daysUntilDue: differenceInCalendarDays(startOfDayLocal(item.vencimento), today)
  });

  return {
    dueSoonCandidates: dueSoonRows.map(mapCandidate),
    overdueCandidates: overdueRows.map(mapCandidate)
  };
}

async function getAlreadySentIds(ids: string[], action: string) {
  if (!ids.length) {
    return new Set<string>();
  }

  const sentLogs = await prisma.logAuditoria.findMany({
    where: {
      modulo: "whatsapp",
      entidade: "Mensalidade",
      entidadeId: { in: ids },
      acao: action
    },
    select: {
      entidadeId: true
    }
  });

  return new Set(sentLogs.map((item) => item.entidadeId));
}

async function dispatchReminderBatch(
  config: WhatsAppConfig,
  type: "dueSoon" | "overdue",
  candidates: ReminderCandidate[],
  dryRun: boolean
) {
  const action = type === "dueSoon" ? "WHATSAPP_MENSALIDADE_PRE_VENCIMENTO" : "WHATSAPP_MENSALIDADE_VENCIDA";
  const template = type === "dueSoon" ? config.templates.dueSoon : config.templates.overdue;
  const branding = await getBrandingConfig();
  const alreadySent = await getAlreadySentIds(
    candidates.map((item) => item.id),
    action
  );

  const sent: ReminderDispatchSummary["sent"] = [];
  const skipped: ReminderDispatchSummary["skipped"] = [];
  const errors: ReminderDispatchSummary["errors"] = [];

  for (const candidate of candidates) {
    if (alreadySent.has(candidate.id)) {
      skipped.push({ mensalidadeId: candidate.id, tipo: type, reason: "Mensagem ja enviada anteriormente." });
      continue;
    }

    const phone = normalizeWhatsAppPhone(candidate.telefone, config.countryCode);
    if (!phone) {
      skipped.push({ mensalidadeId: candidate.id, tipo: type, reason: "Telefone do aluno invalido para WhatsApp." });
      continue;
    }

    const payload = {
      nome: candidate.nome,
      academia: branding.academyName,
      valor: formatCurrency(candidate.valor),
      vencimento: formatDate(new Date(candidate.vencimento)),
      competencia: candidate.competencia,
      telefone: phone,
      dias: String(candidate.daysUntilDue)
    };

    const message = buildTemplate(template, payload).trim();
    if (!message) {
      skipped.push({ mensalidadeId: candidate.id, tipo: type, reason: "Template de mensagem vazio." });
      continue;
    }

    if (dryRun) {
      skipped.push({ mensalidadeId: candidate.id, tipo: type, reason: "Dry run: envio nao executado." });
      continue;
    }

    try {
      const providerResponse = await postWhatsAppMessage(config, phone, message);
      await logAudit({
        modulo: "whatsapp",
        entidade: "Mensalidade",
        entidadeId: candidate.id,
        acao: action,
        depois: {
          tipo: type,
          phone,
          message,
          providerResponse
        }
      });

      sent.push({ mensalidadeId: candidate.id, tipo: type, phone });
    } catch (error) {
      errors.push({
        mensalidadeId: candidate.id,
        tipo: type,
        error: error instanceof Error ? error.message : "Falha ao enviar mensagem"
      });
    }
  }

  return { sent, skipped, errors };
}

export async function getWhatsAppReminderPreview(referenceDate = new Date()) {
  const config = await getWhatsAppConfig();
  const candidates = await listReminderCandidates(referenceDate, config.daysBeforeDue);
  const reason = validateConfig(config) ?? undefined;

  return {
    enabled: config.enabled,
    configValid: !reason,
    reason,
    ...candidates
  };
}

export async function dispatchWhatsAppBillingReminders(options?: { referenceDate?: Date; dryRun?: boolean }): Promise<ReminderDispatchSummary> {
  const config = await getWhatsAppConfig();
  const reason = validateConfig(config);
  const candidates = await listReminderCandidates(options?.referenceDate ?? new Date(), config.daysBeforeDue);

  if (reason) {
    return {
      enabled: config.enabled,
      configValid: false,
      reason,
      ...candidates,
      sent: [],
      skipped: [],
      errors: []
    };
  }

  const [soonResult, overdueResult] = await Promise.all([
    dispatchReminderBatch(config, "dueSoon", candidates.dueSoonCandidates, Boolean(options?.dryRun)),
    dispatchReminderBatch(config, "overdue", candidates.overdueCandidates, Boolean(options?.dryRun))
  ]);

  return {
    enabled: config.enabled,
    configValid: true,
    dueSoonCandidates: candidates.dueSoonCandidates,
    overdueCandidates: candidates.overdueCandidates,
    sent: [...soonResult.sent, ...overdueResult.sent],
    skipped: [...soonResult.skipped, ...overdueResult.skipped],
    errors: [...soonResult.errors, ...overdueResult.errors]
  };
}

export async function sendWhatsAppTestMessage(input?: { phone?: string; message?: string }) {
  const config = await getWhatsAppConfig();
  const reason = validateConfig(config);
  if (reason) {
    throw new Error(reason);
  }

  const targetPhone = normalizeWhatsAppPhone(input?.phone ?? config.testPhone, config.countryCode);
  if (!targetPhone) {
    throw new Error("Informe um telefone de teste valido.");
  }

  const branding = await getBrandingConfig();
  const message =
    sanitizeText(input?.message) ||
    `Teste de integração do WhatsApp da ${branding.academyName}. Se voce recebeu esta mensagem, a integração esta funcionando.`;

  const providerResponse = await postWhatsAppMessage(config, targetPhone, message);

  await logAudit({
    modulo: "whatsapp",
    entidade: "Configuracao",
    entidadeId: WHATSAPP_KEYS.instanceName,
    acao: "WHATSAPP_TESTE",
    depois: {
      phone: targetPhone,
      message,
      providerResponse
    }
  });

  return {
    ok: true,
    phone: targetPhone,
    message
  };
}
