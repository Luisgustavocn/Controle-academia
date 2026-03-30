import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const BACKUP_DIR_KEY = "backup.exportDir";
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

export async function createBackupFile(targetDir?: string) {
  const resolvedBaseDir = path.resolve(targetDir?.trim() || (await getBackupDirectory()).backupDir);
  await mkdir(resolvedBaseDir, { recursive: true });

  const payload = await buildBackupPayload();
  const fileName = `backup-academia-${safeTimestamp()}.json`;
  const filePath = path.join(resolvedBaseDir, fileName);

  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    fileName,
    filePath,
    directory: resolvedBaseDir,
    generatedAt: payload.generatedAt
  };
}
