import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const BACKUP_DIR_KEY = "backup.exportDir";
const BACKUP_MIRROR_DIR_KEY = "backup.exportDirMirror";
const DEFAULT_BACKUP_DIR = path.join(process.cwd(), "backups");

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

  return {
    generatedAt: new Date().toISOString(),
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
  };
}

export async function getBackupDirectory() {
  const item = await prisma.configuracao.findUnique({
    where: { chave: BACKUP_DIR_KEY }
  });

  const configuredDir = item?.valor?.trim();
  const envDir = process.env.BACKUP_EXPORT_DIR?.trim();
  const backupDir = configuredDir || envDir || DEFAULT_BACKUP_DIR;

  return {
    backupDir,
    source: configuredDir ? "config" : envDir ? "env" : "default"
  };
}

export async function getMirrorBackupDirectory() {
  const item = await prisma.configuracao.findUnique({
    where: { chave: BACKUP_MIRROR_DIR_KEY }
  });

  const configuredDir = item?.valor?.trim();
  const envDir = process.env.BACKUP_EXPORT_DIR_MIRROR?.trim();
  const backupDir = configuredDir || envDir || "";

  return {
    backupDir,
    source: configuredDir ? "config" : envDir ? "env" : "none"
  };
}

export async function saveBackupDirectory(backupDir: string) {
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
  const primaryDir = path.resolve(targetDir?.trim() || (await getBackupDirectory()).backupDir);
  const mirrorDir = targetDir?.trim() ? "" : (await getMirrorBackupDirectory()).backupDir;
  const directories = [primaryDir, mirrorDir].filter(Boolean);
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
