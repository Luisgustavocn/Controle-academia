import { createHash } from "node:crypto";
import { chmod, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { prismaDateToCivil, civilDateToPrisma } from "@/lib/attendance-date";
import {
  buildOctoberDryRunPlan,
  createOctoberDryRunWorkbook,
  OCTOBER_2026_END_EXCLUSIVE,
  OCTOBER_2026_START,
  parseOctober2026Workbook,
  type ProductionSnapshot
} from "@/lib/import/october-2026";
import { prisma } from "@/lib/prisma";
import { runProductionCli } from "@/scripts/cli-runtime";

type Mode = "dry-run" | "apply";

function parseArguments(argv: string[]) {
  const mode: Mode | null = argv.includes("--dry-run") ? "dry-run" : argv.includes("--apply") ? "apply" : null;
  if (!mode || (argv.includes("--dry-run") && argv.includes("--apply"))) {
    throw new Error("Informe exatamente uma opção: --dry-run ou --apply. Sem flag, nenhuma operação é permitida.");
  }
  const valueAfter = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const sourcePath = valueAfter("--source");
  if (!sourcePath) throw new Error("Informe a planilha descriptografada com --source <arquivo.xlsx>");
  const reportDir = valueAfter("--report-dir") ?? path.join(process.cwd(), "data", "import-october-2026", "reports");
  const snapshotStdin = argv.includes("--snapshot-stdin");
  return { mode, sourcePath: path.resolve(sourcePath), reportDir: path.resolve(reportDir), snapshotStdin };
}

async function snapshotFromStdin(): Promise<ProductionSnapshot> {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  const parsed = JSON.parse(raw) as ProductionSnapshot;
  if (!Array.isArray(parsed.students) || !Array.isArray(parsed.modalities) || !Array.isArray(parsed.attendance)) {
    throw new Error("Snapshot de produção inválido");
  }
  return parsed;
}

async function productionSnapshot(): Promise<ProductionSnapshot> {
  const [students, modalities, attendance] = await Promise.all([
    prisma.aluno.findMany({
      select: {
        id: true,
        nomeCompleto: true,
        telefone: true,
        vencimentoDia: true,
        status: true,
        modalidadeId: true,
        modalidade: { select: { nome: true } },
        periodosMatricula: {
          select: {
            id: true,
            dataInicio: true,
            dataSaida: true,
            modalidadeId: true,
            valorMensal: true,
            usarValorPadrao: true,
            diaVencimento: true
          }
        }
      }
    }),
    prisma.modalidade.findMany({ select: { id: true, nome: true, valorPadrao: true, ativa: true } }),
    prisma.presenca.findMany({
      where: { data: { gte: civilDateToPrisma(OCTOBER_2026_START), lt: civilDateToPrisma(OCTOBER_2026_END_EXCLUSIVE) } },
      select: { alunoId: true, data: true }
    })
  ]);
  return {
    students: students.map((student) => ({
      id: student.id,
      name: student.nomeCompleto,
      phone: student.telefone,
      dueDay: student.vencimentoDia,
      status: student.status,
      modalityId: student.modalidadeId,
      modalityName: student.modalidade?.nome ?? null,
      enrollments: student.periodosMatricula.map((period) => ({
        id: period.id,
        startDate: period.dataInicio ? prismaDateToCivil(period.dataInicio) : null,
        exitDate: period.dataSaida ? prismaDateToCivil(period.dataSaida) : null,
        modalityId: period.modalidadeId,
        monthlyValue: period.valorMensal === null ? null : Number(period.valorMensal),
        useDefaultValue: period.usarValorPadrao,
        dueDay: period.diaVencimento
      }))
    })),
    modalities: modalities.map((modality) => ({
      id: modality.id,
      name: modality.nome,
      defaultValue: modality.valorPadrao === null ? null : Number(modality.valorPadrao),
      active: modality.ativa
    })),
    attendance: attendance.map((item) => ({ studentId: item.alunoId, date: prismaDateToCivil(item.data) }))
  };
}

const options = parseArguments(process.argv.slice(2));

void runProductionCli("import-october-2026", async () => {
  const source = await readFile(options.sourcePath);
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const workbook = XLSX.read(source, { type: "buffer", cellDates: true, cellStyles: true });
  const parsed = parseOctober2026Workbook(workbook);
  const snapshot = options.snapshotStdin ? await snapshotFromStdin() : await productionSnapshot();
  const plan = buildOctoberDryRunPlan(parsed, snapshot);
  await mkdir(options.reportDir, { recursive: true, mode: 0o700 });
  const generatedAt = new Date();
  const reportName = `dry-run-outubro-2026-${generatedAt.toISOString().replace(/[:.]/g, "-")}.xlsx`;
  const reportPath = path.join(options.reportDir, reportName);
  XLSX.writeFile(createOctoberDryRunWorkbook(plan), reportPath, { compression: true });
  await chmod(reportPath, 0o600);

  if (options.mode === "apply") {
    if (plan.summary.blockers > 0) {
      throw new Error(`Apply bloqueado por ${plan.summary.blockers} gate(s). Revise o relatório de dry-run.`);
    }
    throw new Error("Apply exige aprovação explícita de um relatório de dry-run e permanece desabilitado neste checkpoint.");
  }

  return {
    mode: options.mode,
    sourceSha256,
    reportPath,
    approvedForReview: plan.summary.blockers === 0,
    ...plan.summary,
    modalityNames: plan.modalities.map((item) => item.sourceLabels.join(" / ")),
    issueCodes: [...new Set(plan.issues.map((issue) => issue.code))]
  };
});
