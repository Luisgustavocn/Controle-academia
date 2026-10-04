import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getOptionalEnvironmentValue } from "@/lib/env";
import { getDefaultBackupDirectory } from "@/lib/storage";
import {
  REDACTED_SECRET_VALUE,
  redactConfigurationValue,
  redactSensitiveFields
} from "@/lib/configuration-secrets";

const BACKUP_DIR_KEY = "backup.exportDir";
const BACKUP_MIRROR_DIR_KEY = "backup.exportDirMirror";
function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function buildBackupPayload() {
  const [
    users,
    configuracoes,
    categoriasFinanceiras,
    modalidades,
    alunos,
    historicoPlanos,
    mensalidades,
    pagamentos,
    caixa,
    despesasAcademia,
    presencas,
    agendaPersonal,
    produtos,
    pedidos,
    controleMensal,
    logsAuditoria
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.configuracao.findMany(),
    prisma.categoriaFinanceira.findMany(),
    prisma.modalidade.findMany(),
    prisma.aluno.findMany(),
    prisma.historicoPlano.findMany(),
    prisma.mensalidade.findMany(),
    prisma.pagamento.findMany(),
    prisma.movimentacaoCaixa.findMany(),
    prisma.despesaAcademia.findMany(),
    prisma.presenca.findMany(),
    prisma.agendaPersonal.findMany(),
    prisma.produto.findMany(),
    prisma.pedidoProduto.findMany({ include: { itens: true } }),
    prisma.controleMensalAlunos.findMany(),
    prisma.logAuditoria.findMany()
  ]);

  const sanitizedUsers = users.map((user) => ({
    ...user,
    passwordHash: REDACTED_SECRET_VALUE
  }));
  const sanitizedConfiguracoes = configuracoes.map(redactConfigurationValue);
  const sanitizedLogsAuditoria = logsAuditoria.map((log) => ({
    ...log,
    antes: redactSensitiveFields(log.antes),
    depois: redactSensitiveFields(log.depois)
  }));

  return {
    generatedAt: new Date().toISOString(),
    users: sanitizedUsers,
    configuracoes: sanitizedConfiguracoes,
    categoriasFinanceiras,
    modalidades,
    alunos,
    historicoPlanos,
    mensalidades,
    pagamentos,
    caixa,
    despesasAcademia,
    presencas,
    agendaPersonal,
    produtos,
    pedidos,
    controleMensal,
    logsAuditoria: sanitizedLogsAuditoria
  };
}

export async function getBackupDirectory() {
  const item = await prisma.configuracao.findUnique({
    where: { chave: BACKUP_DIR_KEY }
  });

  const configuredDir = item?.valor?.trim();
  const envDir = getOptionalEnvironmentValue("BACKUP_EXPORT_DIR");
  const usePersistedConfig = process.env.NODE_ENV !== "production" && !envDir;
  const backupDir = envDir || (usePersistedConfig ? configuredDir : "") || getDefaultBackupDirectory();

  return {
    backupDir,
    source: envDir ? "env" : usePersistedConfig && configuredDir ? "config" : "app-data"
  };
}

export async function getMirrorBackupDirectory() {
  const item = await prisma.configuracao.findUnique({
    where: { chave: BACKUP_MIRROR_DIR_KEY }
  });

  const configuredDir = item?.valor?.trim();
  const mirrorDefinedInEnvironment = process.env.BACKUP_EXPORT_DIR_MIRROR !== undefined;
  const envDir = getOptionalEnvironmentValue("BACKUP_EXPORT_DIR_MIRROR");
  const usePersistedConfig = process.env.NODE_ENV !== "production" && !mirrorDefinedInEnvironment;
  const backupDir = mirrorDefinedInEnvironment ? envDir : usePersistedConfig ? configuredDir : "";

  return {
    backupDir,
    source: mirrorDefinedInEnvironment ? "env" : usePersistedConfig && configuredDir ? "config" : "none"
  };
}

export async function saveBackupDirectory(backupDir: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("O diretorio de backup de producao deve ser configurado pelo ambiente.");
  }

  const trimmed = backupDir.trim();
  await prisma.configuracao.upsert({
    where: { chave: BACKUP_DIR_KEY },
    update: {
      valor: trimmed,
      descricao: "Pasta usada para salvar backups JSON do sistema"
    },
    create: {
      chave: BACKUP_DIR_KEY,
      valor: trimmed,
      descricao: "Pasta usada para salvar backups JSON do sistema"
    }
  });
}

function buildChecksum(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function writeBackupArtifact(directory: string, fileName: string, content: string, checksum: string) {
  const resolvedDir = path.resolve(directory);
  await mkdir(resolvedDir, { recursive: true });

  const filePath = path.join(resolvedDir, fileName);
  await writeFile(filePath, content, "utf8");
  await writeFile(`${filePath}.sha256`, `${checksum}  ${fileName}\n`, "utf8");

  return filePath;
}

export async function createBackupFile(targetDir?: string) {
  const payload = await buildBackupPayload();
  const content = JSON.stringify(payload, null, 2);
  const checksum = buildChecksum(content);
  const fileName = `backup-academia-${safeTimestamp()}.json`;
  const requestedDir = process.env.NODE_ENV === "production" ? "" : (targetDir?.trim() ?? "");
  const primaryDir = path.resolve(requestedDir || (await getBackupDirectory()).backupDir);
  const mirrorDir = requestedDir ? "" : (await getMirrorBackupDirectory()).backupDir;
  const directories = [primaryDir, mirrorDir].filter(
    (directory): directory is string => Boolean(directory)
  );
  const filePaths: string[] = [];

  for (const directory of directories) {
    filePaths.push(await writeBackupArtifact(directory, fileName, content, checksum));
  }

  return {
    fileName,
    filePath: filePaths[0],
    filePaths,
    directory: primaryDir,
    directories,
    checksum,
    generatedAt: payload.generatedAt
  };
}
