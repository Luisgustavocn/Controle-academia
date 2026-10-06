import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AlunoStatus, Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { civilDateToPrisma, prismaDateToCivil } from "@/lib/attendance-date";
import { CANONICAL_PRICE_RULE, parseCanonicalOctoberWorkbook, type CanonicalPackage } from "@/lib/import/october-2026-canonical";
import { normalizePersonName } from "@/lib/import/october-2026";
import { prisma } from "@/lib/prisma";
import { runProductionCli } from "@/scripts/cli-runtime";

type Mode = "dry-run" | "apply";
type ExistingStudent = Awaited<ReturnType<typeof snapshot>>["students"][number];
const PRODUCTION_PRECEDENCE_STUDENTS = new Set(["adelar decezaro"]);

function args(argv: string[]) {
  const mode: Mode | null = argv.includes("--dry-run") ? "dry-run" : argv.includes("--apply") ? "apply" : null;
  if (!mode || (argv.includes("--dry-run") && argv.includes("--apply"))) throw new Error("Informe exatamente --dry-run ou --apply");
  const after = (flag: string) => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : undefined; };
  const source = after("--source"); if (!source) throw new Error("Informe --source <pacote.xlsx>");
  return { mode, source: path.resolve(source), expectedSha: after("--confirm-sha256"), snapshotStdin: argv.includes("--snapshot-stdin"), reportDir: path.resolve(after("--report-dir") ?? path.join(process.cwd(), "data/import-october-2026/canonical")) };
}

async function snapshotFromStdin(): Promise<Awaited<ReturnType<typeof snapshot>>> {
  let raw=""; process.stdin.setEncoding("utf8"); for await(const chunk of process.stdin) raw+=chunk;
  const parsed=JSON.parse(raw) as Awaited<ReturnType<typeof snapshot>>;
  for(const student of parsed.students){
    student.dataInicio=student.dataInicio?new Date(student.dataInicio):null;
    for(const period of student.periodosMatricula){period.dataInicio=period.dataInicio?new Date(period.dataInicio):null;period.dataSaida=period.dataSaida?new Date(period.dataSaida):null;}
  }
  for(const item of parsed.attendance) item.data=new Date(item.data);
  return parsed;
}

async function snapshot() {
  const [students, modalities, attendance] = await Promise.all([
    prisma.aluno.findMany({ select: { id:true,nomeCompleto:true,telefone:true,status:true,modalidadeId:true,vencimentoDia:true,valorMensal:true,usarValorPadrao:true,dataInicio:true,periodosMatricula:{select:{id:true,dataInicio:true,dataSaida:true,modalidadeId:true,valorMensal:true,usarValorPadrao:true,diaVencimento:true}} } }),
    prisma.modalidade.findMany({ select: { id:true,nome:true,valorPadrao:true } }),
    prisma.presenca.findMany({ where:{data:{gte:civilDateToPrisma("2026-10-01"),lt:civilDateToPrisma("2026-11-01")}},select:{alunoId:true,data:true} })
  ]);
  return { students, modalities, attendance };
}

function equalNumber(left: unknown, right: number | null) { return (left === null ? null : Number(left)) === right; }
function buildPlan(pkg: CanonicalPackage, db: Awaited<ReturnType<typeof snapshot>>) {
  const blockers = [...pkg.issues];
  const modalityGroups = new Map<string, typeof db.modalities>();
  for (const item of db.modalities) { const key=normalizePersonName(item.nome); modalityGroups.set(key,[...(modalityGroups.get(key)??[]),item]); }
  const modalities = pkg.modalities.map((item) => {
    const matches=modalityGroups.get(normalizePersonName(item.name))??[];
    if(matches.length>1) blockers.push(`${item.name}: modalidade duplicada em produção`);
    if(matches.length===1&&!equalNumber(matches[0].valorPadrao,item.defaultValue)) blockers.push(`${item.name}: valor padrão diverge da produção`);
    return {...item,action:matches.length===1?"REUTILIZAR":matches.length===0?"CRIAR":"CONFLITO",existingId:matches[0]?.id??null};
  });
  const studentGroups = new Map<string, ExistingStudent[]>();
  for(const item of db.students){const key=normalizePersonName(item.nomeCompleto);studentGroups.set(key,[...(studentGroups.get(key)??[]),item]);}
  const phones = new Map<string,ExistingStudent[]>();
  for(const item of db.students) if(item.telefone){const key=item.telefone.replace(/\D/g,"");phones.set(key,[...(phones.get(key)??[]),item]);}
  const modalityPlan = new Map(modalities.map((item)=>[normalizePersonName(item.name),item]));
  const students = pkg.students.map((item) => {
    const exact=studentGroups.get(normalizePersonName(item.name))??[];
    const phoneMatches=item.phone?phones.get(item.phone.replace(/\D/g,""))??[]:[];
    if(exact.length>1) blockers.push(`${item.name}: aluno canônico duplicado em produção`);
    if(exact.length===0&&phoneMatches.length>0) blockers.push(`${item.name}: telefone coincide fora dos aliases aprovados`);
    const existing=exact.length===1?exact[0]:null;
    const modality=modalityPlan.get(normalizePersonName(item.modality));
    if(!modality||modality.action==="CONFLITO") blockers.push(`${item.name}: modalidade não resolvida`);
    const sourceAlias=normalizePersonName(item.sourceName)!==normalizePersonName(item.name);
    const productionPrecedence=Boolean(existing&&PRODUCTION_PRECEDENCE_STUDENTS.has(normalizePersonName(item.name)));
    const match=productionPrecedence?"EXISTENTE":existing?(sourceAlias?"MATCH_MANUAL_APROVADO":"EXISTENTE_EXATO"):"NOVO";
    return {...item,match,existing,modality,productionPrecedence,observation:productionPrecedence?"override humano: PRODUÇÃO_PREVALECE":null};
  });
  const byName=new Map(students.map((item)=>[normalizePersonName(item.name),item]));
  const periods=pkg.periods.map((item)=>{
    const student=byName.get(normalizePersonName(item.student));
    const open=student?.existing?.periodosMatricula.filter((period)=>period.dataSaida===null)??[];
    if(open.length>1) blockers.push(`${item.student}: mais de um período aberto em produção`);
    let action="CRIAR";
    if(open.length===1){
      const current=open[0]; const modality=student?.modality;
      const same=(current.dataInicio?prismaDateToCivil(current.dataInicio):null)===item.startDate&&current.modalidadeId===modality?.existingId&&equalNumber(current.valorMensal,item.monthlyValue)&&current.usarValorPadrao===item.useDefault&&current.diaVencimento===item.dueDay;
      if(!same) blockers.push(`${item.student}: período aberto existente diverge do pacote`); else action="REUTILIZAR";
    }
    if(open.length===0&&student?.existing){
      const proposedStart=item.startDate?civilDateToPrisma(item.startDate):null;
      const overlap=student.existing.periodosMatricula.some((period)=>period.dataSaida===null||proposedStart===null||period.dataSaida>=proposedStart);
      if(overlap&&student.productionPrecedence) action="PERIODO_EXISTENTE_PRESERVADO";
      else if(overlap) blockers.push(`${item.student}: período histórico existente conflita com o início canônico`);
    }
    return {...item,studentPlan:student,action};
  });
  const existingAttendance=new Set(db.attendance.map((item)=>`${item.alunoId}:${prismaDateToCivil(item.data)}`));
  const attendance=pkg.attendance.map((item)=>{const student=byName.get(normalizePersonName(item.student));const exists=student?.existing?existingAttendance.has(`${student.existing.id}:${item.date}`):false;return {...item,studentPlan:student,action:exists?"REUTILIZAR":"CRIAR"};});
  return {blockers:[...new Set(blockers)],modalities,students,periods,attendance,summary:{students:students.length,existing:students.filter(x=>x.existing).length,newStudents:students.filter(x=>!x.existing).length,ambiguous:blockers.filter(x=>x.includes("aluno canônico")||x.includes("telefone coincide")).length,productionPrecedence:students.filter(x=>x.productionPrecedence).length,effectiveActive:students.filter(x=>x.status==="ATIVO"&&!x.productionPrecedence).length,modalitiesToCreate:modalities.filter(x=>x.action==="CRIAR").length,periodsToCreate:periods.filter(x=>x.action==="CRIAR").length,periodsPreserved:periods.filter(x=>x.action==="PERIODO_EXISTENTE_PRESERVADO").length,attendanceToCreate:attendance.filter(x=>x.action==="CRIAR").length}};
}

async function apply(pkg: CanonicalPackage, plan: ReturnType<typeof buildPlan>, sha: string) {
  if(plan.blockers.length) throw new Error(`Apply bloqueado por ${plan.blockers.length} problema(s)`);
  return prisma.$transaction(async(tx)=>{
    const modalityIds=new Map<string,string>();
    for(const item of plan.modalities){
      const row=item.existingId?await tx.modalidade.findUniqueOrThrow({where:{id:item.existingId}}):await tx.modalidade.create({data:{nome:item.name,valorPadrao:item.defaultValue,ativa:true}});
      modalityIds.set(normalizePersonName(item.name),row.id);
    }
    const studentIds=new Map<string,string>();
    for(const item of plan.students){
      if(item.existing&&item.productionPrecedence){studentIds.set(normalizePersonName(item.name),item.existing.id);continue;}
      const data={nomeCompleto:item.name,telefone:item.phone,modalidadeId:modalityIds.get(normalizePersonName(item.modality))!,vencimentoDia:item.dueDay,status:item.status==="ATIVO"?AlunoStatus.ATIVO:AlunoStatus.INATIVO,dataInicio:item.startDate?civilDateToPrisma(item.startDate):null,valorMensal:item.monthlyValue,usarValorPadrao:item.useDefault,dataSaidaCancelamento:null};
      const row=item.existing?await tx.aluno.update({where:{id:item.existing.id},data}):await tx.aluno.create({data});
      studentIds.set(normalizePersonName(item.name),row.id);
    }
    for(const item of plan.periods.filter(x=>x.action==="CRIAR")) await tx.periodoMatricula.create({data:{alunoId:studentIds.get(normalizePersonName(item.student))!,dataInicio:item.startDate?civilDateToPrisma(item.startDate):null,dataSaida:null,modalidadeId:modalityIds.get(normalizePersonName(item.modality))!,valorMensal:item.monthlyValue,usarValorPadrao:item.useDefault,diaVencimento:item.dueDay}});
    if(plan.attendance.some(x=>x.action==="CRIAR")) await tx.presenca.createMany({data:plan.attendance.filter(x=>x.action==="CRIAR").map(item=>({alunoId:studentIds.get(normalizePersonName(item.student))!,data:civilDateToPrisma(item.date),horario:null,tipoAula:"Não informado",presente:true})),skipDuplicates:true});
    await tx.logAuditoria.create({data:{modulo:"importacao",entidade:"PacoteOutubro2026",entidadeId:sha,acao:"IMPORT_CANONICAL_OCTOBER_2026",depois:{regra:CANONICAL_PRICE_RULE,alunosNovos:plan.summary.newStudents,modalidadesNovas:plan.summary.modalitiesToCreate,periodosNovos:plan.summary.periodsToCreate,presencasNovas:plan.summary.attendanceToCreate}}});
    return {studentsCreated:plan.summary.newStudents,studentsReused:plan.summary.existing,modalitiesCreated:plan.summary.modalitiesToCreate,periodsCreated:plan.summary.periodsToCreate,attendanceCreated:plan.summary.attendanceToCreate};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:120000});
}
const options=args(process.argv.slice(2));
void runProductionCli("import-october-2026-canonical",async()=>{
  const source=await readFile(options.source); const sha=createHash("sha256").update(source).digest("hex");
  const workbook=XLSX.read(source,{type:"buffer",cellDates:true});
  const pkg=parseCanonicalOctoberWorkbook(workbook);
  const before=options.snapshotStdin?await snapshotFromStdin():await snapshot(); const plan=buildPlan(pkg,before);
  await mkdir(options.reportDir,{recursive:true,mode:0o700});
  const manifest={version:2,priceRule:CANONICAL_PRICE_RULE,sourceSha256:sha,humanOverrides:[{student:"Adelar Decezaro",rule:"PRODUÇÃO_PREVALECE",action:"PERÍODO_EXISTENTE_PRESERVADO / SEM_NOVO_PERÍODO"}],students:pkg.students.length,modalities:pkg.modalities.length,periods:pkg.periods.length,attendance:pkg.attendance.length,...pkg.summary,blockers:plan.blockers.length};
  const manifestPath=path.join(options.reportDir,"manifest.json"); await writeFile(manifestPath,JSON.stringify(manifest,null,2)+"\n",{mode:0o600}); await chmod(manifestPath,0o600);
  for(const [sheet,file] of [["Alunos","alunos.csv"],["Modalidades","modalidades.csv"],["Periodos_Matricula","periodos_matricula.csv"],["Presencas","presencas.csv"],["Aliases","aliases.csv"],["Pendencias","pendencias.csv"]] as const){
    const target=path.join(options.reportDir,file); await writeFile(target,XLSX.utils.sheet_to_csv(workbook.Sheets[sheet]),{mode:0o600}); await chmod(target,0o600);
  }
  if(options.mode==="apply"){
    if(options.expectedSha!==sha) throw new Error("SHA-256 do pacote não confirmado para apply");
    const result=await apply(pkg,plan,sha); return {mode:options.mode,sourceSha256:sha,manifestPath,blockers:0,...plan.summary,...pkg.summary,...result};
  }
  return {mode:options.mode,sourceSha256:sha,manifestPath,blockers:plan.blockers.length,issues:plan.blockers,...plan.summary,...pkg.summary};
});
