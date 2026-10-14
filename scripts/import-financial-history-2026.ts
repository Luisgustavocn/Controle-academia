import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { MensalidadeStatus, Prisma } from "@prisma/client";
import { parseFinancialHistoryPackage, historicalDueDate } from "../lib/import/financial-history-2026";
import { normalizePersonName } from "@/lib/import/october-2026";
import { prisma } from "@/lib/prisma";
import { runProductionCli } from "@/scripts/cli-runtime";

function options(argv:string[]){const mode=argv.includes("--apply")?"apply":argv.includes("--dry-run")?"dry-run":null;if(!mode||(argv.includes("--dry-run")&&argv.includes("--apply")))throw new Error("Informe exatamente --dry-run ou --apply");const after=(flag:string)=>{const i=argv.indexOf(flag);return i<0?undefined:argv[i+1]};const source=after("--source");if(!source)throw new Error("Informe --source <pacote.zip|diretório>");return{mode,source:path.resolve(source),confirmedSha256:after("--confirm-sha256"),reportDir:path.resolve(after("--report-dir")??path.join(process.cwd(),"data/import-financial-history-2026"))};}
function civil(date:Date|null){if(!date)return null;return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);}
function historicalDate(value:string|null){return value?new Date(`${value}T00:00:00-03:00`):null;}
function stableHash(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
const input=options(process.argv.slice(2));
void runProductionCli("import-financial-history-2026",async()=>{
  const pkg=parseFinancialHistoryPackage(input.source,input.confirmedSha256);
  const [students,existingFees,existingPayments,periods,financialRows]=await Promise.all([
    prisma.aluno.findMany({select:{id:true,nomeCompleto:true,status:true,periodosMatricula:{select:{dataInicio:true,dataSaida:true}}}}),
    prisma.mensalidade.findMany({where:{competencia:{in:Array.from({length:10},(_,i)=>`2026-${String(i+1).padStart(2,"0")}`)}},select:{id:true,alunoId:true,competencia:true,valor:true,vencimento:true,dataPagamento:true,formaPagamento:true,status:true,observacao:true,createdAt:true,updatedAt:true}}),
    prisma.pagamento.findMany({select:{id:true,alunoId:true,mensalidadeId:true,valor:true,dataPagamento:true,formaPagamento:true,status:true}}),
    prisma.periodoMatricula.findMany({select:{alunoId:true,dataInicio:true,dataSaida:true}}),
    Promise.all([prisma.mensalidade.findMany({orderBy:{id:"asc"}}),prisma.pagamento.findMany({orderBy:{id:"asc"}}),prisma.movimentacaoCaixa.findMany({orderBy:{id:"asc"}})])
  ]);
  const groups=new Map<string,typeof students>();for(const student of students){const key=normalizePersonName(student.nomeCompleto);groups.set(key,[...(groups.get(key)??[]),student]);}
  const unresolved=new Set<string>();const ambiguous=new Set<string>();const studentByName=new Map<string,(typeof students)[number]>();
  for(const studentName of pkg.studentNames){const key=normalizePersonName(studentName);const matches=groups.get(key)??[];if(matches.length===0)unresolved.add(studentName);else if(matches.length>1)ambiguous.add(studentName);else studentByName.set(key,matches[0]);}
  const existingByKey=new Map(existingFees.map(item=>[`${item.alunoId}:${item.competencia}`,item]));
  let feesNew=0,feesExisting=0,feesReconciliable=0,feesWithFinancialEvidence=0,statusToPaid=0,valuesToCorrect=0,datesToFill=0,datesToClear=0,datesToMaintainNull=0;
  const conflicts:Array<{aluno:string;competencia:string;motivos:string;classificacao:string}>=[];const reconciliations:Array<{aluno:string;competencia:string;alteracoes:string}>=[];const conflictReasons={value:0,status:0,paymentDate:0,dueDate:0};
  const createPlan:Array<{alunoId:string;competencia:string;valor:number;vencimento:string;dataPagamento:string|null}>=[];
  for(const payment of pkg.payments){
    const student=studentByName.get(normalizePersonName(payment.student));if(!student)continue;
    const existing=existingByKey.get(`${student.id}:${payment.competence}`);
    if(!existing){feesNew++;if(payment.paymentDate)datesToFill++;else datesToMaintainNull++;createPlan.push({alunoId:student.id,competencia:payment.competence,valor:payment.value,vencimento:historicalDueDate(payment.competence,payment.dueDay),dataPagamento:payment.paymentDate});continue;}
    const reasons:string[]=[];if(Number(existing.valor)!==payment.value){reasons.push("VALOR");conflictReasons.value++;}if(existing.status!==MensalidadeStatus.PAGO){reasons.push("STATUS");conflictReasons.status++;}if(civil(existing.dataPagamento)!==payment.paymentDate){reasons.push("DATA_PAGAMENTO");conflictReasons.paymentDate++;}if(civil(existing.vencimento)!==historicalDueDate(payment.competence,payment.dueDay)){reasons.push("VENCIMENTO");conflictReasons.dueDate++;}
    if(reasons.length===0){feesExisting++;if(!payment.paymentDate)datesToMaintainNull++;continue;}
    feesWithFinancialEvidence++;
    conflicts.push({aluno:payment.student,competencia:payment.competence,motivos:reasons.join("+"),classificacao:"CONFLITO_COM_DADO_OPERACIONAL"});
  }
  const periodByStudent=new Map<string,typeof periods>();for(const period of periods)periodByStudent.set(period.alunoId,[...(periodByStudent.get(period.alunoId)??[]),period]);
  const gapReport=pkg.gaps.map(item=>{const student=studentByName.get(normalizePersonName(item.aluno));const current=student?(periodByStudent.get(student.id)??[]):[];const hasOpen=current.some(period=>period.dataSaida===null);const classification=!student||((item.status_outubro==="ATIVO")!==hasOpen)?"NECESSITA_REVISÃO":item.status_outubro==="ATIVO"?"POSSÍVEL_INADIMPLÊNCIA":"POSSÍVEL_PAUSA";return{aluno:item.aluno,pagamento_antes:item.pagamento_antes,meses_vazios:item.meses,pagamento_depois:item.pagamento_depois,status_outubro:item.status_outubro,periodo_atual:hasOpen?"ABERTO":"ENCERRADO",classificacao:classification};});
  await mkdir(input.reportDir,{recursive:true,mode:0o700});
  const csv=["aluno,pagamento_antes,meses_vazios,pagamento_depois,status_outubro,periodo_atual,classificacao",...gapReport.map(item=>Object.values(item).map(value=>`"${String(value).replaceAll('"','""')}"`).join(","))].join("\n")+"\n";
  const gapPath=path.join(input.reportDir,"lacunas-classificadas.csv");await writeFile(gapPath,csv,{mode:0o600});await chmod(gapPath,0o600);
  const conflictCsv=["aluno,competencia,motivos,classificacao",...conflicts.map(item=>Object.values(item).map(value=>`"${String(value).replaceAll('"','""')}"`).join(","))].join("\n")+"\n";
  const conflictPath=path.join(input.reportDir,"conflitos-mensalidades.csv");await writeFile(conflictPath,conflictCsv,{mode:0o600});await chmod(conflictPath,0o600);
  const reconciliationCsv=["aluno,competencia,alteracoes",...reconciliations.map(item=>Object.values(item).map(value=>`"${String(value).replaceAll('"','""')}"`).join(","))].join("\n")+"\n";
  const reconciliationPath=path.join(input.reportDir,"mensalidades-reconciliaveis.csv");await writeFile(reconciliationPath,reconciliationCsv,{mode:0o600});await chmod(reconciliationPath,0o600);
  const blockers=unresolved.size+ambiguous.size;
  const gapClassifications=Object.fromEntries(["POSSÍVEL_INADIMPLÊNCIA","POSSÍVEL_PAUSA","NECESSITA_REVISÃO"].map(key=>[key,gapReport.filter(item=>item.classificacao===key).length]));
  const baseResult={sourceSha256:pkg.sha256,...pkg.summary,studentsResolved:studentByName.size,studentsUnresolved:unresolved.size,studentsAmbiguous:ambiguous.size,feesNew,feesReconciliable,feesExisting,feesWithFinancialEvidence,feesProtected:conflicts.length,feeConflicts:conflicts.length,conflictReasons,statusToPaid,valuesToCorrect,datesToFill,datesToClear,datesToMaintainNull,paymentsNew:0,paymentsExisting:existingPayments.length,paymentsWithoutDate:pkg.summary.unknownDates,paymentModelDecision:"EXISTING_FINANCIAL_DATA_IS_PROTECTED; PAGAMENTO_NOT_CREATED",periodChanges:0,cashMovements:0,auditActionPlanned:"HISTORICAL_FINANCIAL_INSERT_ONLY_2026",blockers,gapClassifications,gapReportPath:gapPath,reconciliationReportPath:reconciliationPath,conflictReportPath:conflictPath,financialHashes:{mensalidades:stableHash(financialRows[0]),pagamentos:stableHash(financialRows[1]),movimentacoes:stableHash(financialRows[2])}};
  if(input.mode==="apply"){
    if(input.confirmedSha256!==pkg.sha256)throw new Error("SHA-256 do pacote não confirmado para apply");
    if(blockers>0)throw new Error(`Apply bloqueado por ${blockers} conflito(s)`);
    const applied=await prisma.$transaction(async tx=>{
      const created=createPlan.length?await tx.mensalidade.createMany({data:createPlan.map(item=>({alunoId:item.alunoId,competencia:item.competencia,valor:item.valor,vencimento:historicalDate(item.vencimento)!,status:MensalidadeStatus.PAGO,dataPagamento:historicalDate(item.dataPagamento),formaPagamento:null,observacao:null})),skipDuplicates:true}):{count:0};
      await tx.logAuditoria.create({data:{modulo:"importacao-financeira",entidade:"HistoricoFinanceiro2026",entidadeId:pkg.sha256,acao:"HISTORICAL_FINANCIAL_INSERT_ONLY_2026",depois:{mensalidadesCriadas:created.count,mensalidadesProtegidas:conflicts.length,conflitos:conflicts.length,statusAlterados:0,valoresCorrigidos:0,datasAlteradas:0,totalHistorico:pkg.summary.total}}});
      return{created:created.count,reconciled:0,protected:conflicts.length};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:120000});
    const result={mode:"apply",...baseResult,...applied};const reportPath=path.join(input.reportDir,"apply.json");await writeFile(reportPath,JSON.stringify(result,null,2)+"\n",{mode:0o600});await chmod(reportPath,0o600);return result;
  }
  const result={mode:"dry-run",...baseResult};
  const reportPath=path.join(input.reportDir,"dry-run.json");await writeFile(reportPath,JSON.stringify(result,null,2)+"\n",{mode:0o600});await chmod(reportPath,0o600);
  return result;
});
