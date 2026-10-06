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
const AUTO_BATCH_START=new Date("2026-10-06T18:10:44.000Z");
const AUTO_BATCH_END=new Date("2026-10-06T18:10:45.000Z");

void runProductionCli("import-financial-history-2026",async()=>{
  const pkg=parseFinancialHistoryPackage(input.source,input.confirmedSha256);
  const [students,existingFees,existingPayments,periods,financialRows,auditRows]=await Promise.all([
    prisma.aluno.findMany({select:{id:true,nomeCompleto:true,status:true,periodosMatricula:{select:{dataInicio:true,dataSaida:true}}}}),
    prisma.mensalidade.findMany({where:{competencia:{in:Array.from({length:10},(_,i)=>`2026-${String(i+1).padStart(2,"0")}`)}},select:{id:true,alunoId:true,competencia:true,valor:true,vencimento:true,dataPagamento:true,formaPagamento:true,status:true,observacao:true,createdAt:true,updatedAt:true}}),
    prisma.pagamento.findMany({select:{id:true,alunoId:true,mensalidadeId:true,valor:true,dataPagamento:true,formaPagamento:true,status:true}}),
    prisma.periodoMatricula.findMany({select:{alunoId:true,dataInicio:true,dataSaida:true}}),
    Promise.all([prisma.mensalidade.findMany({orderBy:{id:"asc"}}),prisma.pagamento.findMany({orderBy:{id:"asc"}}),prisma.movimentacaoCaixa.findMany({orderBy:{id:"asc"}})]),
    prisma.logAuditoria.findMany({where:{entidade:"Mensalidade",acao:"UPDATE"},select:{entidadeId:true,antes:true,depois:true}})
  ]);
  const groups=new Map<string,typeof students>();for(const student of students){const key=normalizePersonName(student.nomeCompleto);groups.set(key,[...(groups.get(key)??[]),student]);}
  const unresolved=new Set<string>();const ambiguous=new Set<string>();const studentByName=new Map<string,(typeof students)[number]>();
  for(const studentName of pkg.studentNames){const key=normalizePersonName(studentName);const matches=groups.get(key)??[];if(matches.length===0)unresolved.add(studentName);else if(matches.length>1)ambiguous.add(studentName);else studentByName.set(key,matches[0]);}
  const existingByKey=new Map(existingFees.map(item=>[`${item.alunoId}:${item.competencia}`,item]));
  let feesNew=0,feesExisting=0,feesReconciliable=0,feesWithFinancialEvidence=0,statusToPaid=0,valuesToCorrect=0,datesToFill=0,datesToClear=0,datesToMaintainNull=0;
  const conflicts:Array<{aluno:string;competencia:string;motivos:string;classificacao:string}>=[];const reconciliations:Array<{aluno:string;competencia:string;alteracoes:string}>=[];const conflictReasons={value:0,status:0,paymentDate:0,dueDate:0};
  const createPlan:Array<{alunoId:string;competencia:string;valor:number;vencimento:string;dataPagamento:string|null}>=[];
  const reconcilePlan:Array<{id:string;previous:{valor:Prisma.Decimal;status:MensalidadeStatus;dataPagamento:Date|null;updatedAt:Date};valor:number;dataPagamento:string|null}>=[];
  const cashRows=financialRows[2];
  for(const payment of pkg.payments){
    const student=studentByName.get(normalizePersonName(payment.student));if(!student)continue;
    const existing=existingByKey.get(`${student.id}:${payment.competence}`);
    if(!existing){feesNew++;if(payment.paymentDate)datesToFill++;else datesToMaintainNull++;createPlan.push({alunoId:student.id,competencia:payment.competence,valor:payment.value,vencimento:historicalDueDate(payment.competence,payment.dueDay),dataPagamento:payment.paymentDate});continue;}
    const reasons:string[]=[];if(Number(existing.valor)!==payment.value){reasons.push("VALOR");conflictReasons.value++;}if(existing.status!==MensalidadeStatus.PAGO){reasons.push("STATUS");conflictReasons.status++;}if(civil(existing.dataPagamento)!==payment.paymentDate){reasons.push("DATA_PAGAMENTO");conflictReasons.paymentDate++;}if(civil(existing.vencimento)!==historicalDueDate(payment.competence,payment.dueDay)){reasons.push("VENCIMENTO");conflictReasons.dueDate++;}
    if(reasons.length===0){feesExisting++;if(!payment.paymentDate)datesToMaintainNull++;continue;}
    const linkedPayments=existingPayments.filter(item=>item.mensalidadeId===existing.id);
    const automaticCash=cashRows.filter(item=>item.id===`auto_mensalidade_${existing.id}`);
    const linkedCash=cashRows.filter(item=>item.id!==`auto_mensalidade_${existing.id}`&&item.alunoId===student.id&&item.competencia===payment.competence);
    const contradictoryCash=linkedCash.some(item=>Number(item.valor)!==payment.value||(payment.paymentDate!==null&&civil(item.data)!==payment.paymentDate));
    const auditProvesArtificialDate=auditRows.some(item=>{if(item.entidadeId!==existing.id||payment.paymentDate!==null||!existing.dataPagamento)return false;const before=item.antes as Record<string,unknown>|null;const after=item.depois as Record<string,unknown>|null;return before?.dataPagamento===null&&(before?.status===MensalidadeStatus.PENDENTE||before?.status===MensalidadeStatus.ATRASADO)&&after?.status===MensalidadeStatus.PAGO&&String(after?.dataPagamento??"").slice(0,10)===existing.dataPagamento.toISOString().slice(0,10)&&existing.dataPagamento.getUTCFullYear()!==Number(payment.competence.slice(0,4));});
    const manualEvidence=existing.status===MensalidadeStatus.PAGO||existing.status===MensalidadeStatus.PARCIAL||existing.dataPagamento!==null||existing.formaPagamento!==null||existing.observacao!==null||linkedPayments.length>0||linkedCash.length>0;
    const fromAutomaticBatch=existing.createdAt>=AUTO_BATCH_START&&existing.createdAt<AUTO_BATCH_END;
    const automaticBatchReconciliation=fromAutomaticBatch&&(existing.status===MensalidadeStatus.PENDENTE||existing.status===MensalidadeStatus.ATRASADO)&&existing.dataPagamento===null&&existing.formaPagamento===null&&existing.observacao===null&&linkedPayments.length===0&&!contradictoryCash&&!manualEvidence;
    const artificialDateReconciliation=auditProvesArtificialDate&&existing.status===MensalidadeStatus.PAGO&&Number(existing.valor)===payment.value&&existing.formaPagamento===null&&existing.observacao===null&&linkedPayments.length===0&&linkedCash.length===0&&automaticCash.every(item=>item.id.startsWith("auto_mensalidade_"));
    const reconciliable=automaticBatchReconciliation||artificialDateReconciliation;
    if(reconciliable){feesReconciliable++;if(existing.status!==MensalidadeStatus.PAGO)statusToPaid++;if(Number(existing.valor)!==payment.value)valuesToCorrect++;if(payment.paymentDate)datesToFill++;else{datesToMaintainNull++;if(existing.dataPagamento)datesToClear++;}reconciliations.push({aluno:payment.student,competencia:payment.competence,alteracoes:[...reasons,...(artificialDateReconciliation?["DATA_ARTIFICIAL_COMPROVADA"]:[])].join("+")});reconcilePlan.push({id:existing.id,previous:{valor:existing.valor,status:existing.status,dataPagamento:existing.dataPagamento,updatedAt:existing.updatedAt},valor:payment.value,dataPagamento:payment.paymentDate});continue;}
    if(manualEvidence)feesWithFinancialEvidence++;
    conflicts.push({aluno:payment.student,competencia:payment.competence,motivos:[...reasons,...(contradictoryCash?["CAIXA_CONTRADITORIO"]:[])].join("+"),classificacao:"CONFLITO_REAL"});
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
  const blockers=unresolved.size+ambiguous.size+conflicts.length;
  const gapClassifications=Object.fromEntries(["POSSÍVEL_INADIMPLÊNCIA","POSSÍVEL_PAUSA","NECESSITA_REVISÃO"].map(key=>[key,gapReport.filter(item=>item.classificacao===key).length]));
  const baseResult={sourceSha256:pkg.sha256,...pkg.summary,studentsResolved:studentByName.size,studentsUnresolved:unresolved.size,studentsAmbiguous:ambiguous.size,feesNew,feesReconciliable,feesExisting,feesWithFinancialEvidence,feeConflicts:conflicts.length,conflictReasons,statusToPaid,valuesToCorrect,datesToFill,datesToClear,datesToMaintainNull,paymentsNew:0,paymentsExisting:existingPayments.length,paymentsWithoutDate:pkg.summary.unknownDates,paymentModelDecision:"MENSALIDADE_PAGA_IS_CANONICAL; PAGAMENTO_NOT_CREATED_WITHOUT_DATE_AND_PAYMENT_METHOD",periodChanges:0,cashMovements:0,auditActionPlanned:"HISTORICAL_FINANCIAL_RECONCILIATION_2026",blockers,gapClassifications,gapReportPath:gapPath,reconciliationReportPath:reconciliationPath,conflictReportPath:conflictPath,financialHashes:{mensalidades:stableHash(financialRows[0]),pagamentos:stableHash(financialRows[1]),movimentacoes:stableHash(financialRows[2])}};
  if(input.mode==="apply"){
    if(input.confirmedSha256!==pkg.sha256)throw new Error("SHA-256 do pacote não confirmado para apply");
    if(blockers>0)throw new Error(`Apply bloqueado por ${blockers} conflito(s)`);
    if(feesNew!==167||feesReconciliable!==1056||feesExisting!==0||statusToPaid!==1053||valuesToCorrect!==118||datesToFill!==19||datesToClear!==3)throw new Error("Plano de apply diverge das contagens autorizadas");
    const applied=await prisma.$transaction(async tx=>{
      for(const item of reconcilePlan){const updated=await tx.mensalidade.updateMany({where:{id:item.id,valor:item.previous.valor,status:item.previous.status,dataPagamento:item.previous.dataPagamento,updatedAt:item.previous.updatedAt},data:{valor:item.valor,status:MensalidadeStatus.PAGO,dataPagamento:historicalDate(item.dataPagamento)}});if(updated.count!==1)throw new Error(`Mensalidade mudou durante o apply: ${item.id}`);}
      if(createPlan.length)await tx.mensalidade.createMany({data:createPlan.map(item=>({alunoId:item.alunoId,competencia:item.competencia,valor:item.valor,vencimento:historicalDate(item.vencimento)!,status:MensalidadeStatus.PAGO,dataPagamento:historicalDate(item.dataPagamento),formaPagamento:null,observacao:null}))});
      await tx.logAuditoria.create({data:{modulo:"importacao-financeira",entidade:"HistoricoFinanceiro2026",entidadeId:pkg.sha256,acao:"HISTORICAL_FINANCIAL_RECONCILIATION_2026",depois:{mensalidadesCriadas:feesNew,mensalidadesReconciliadas:feesReconciliable,statusAlterados:statusToPaid,valoresCorrigidos:valuesToCorrect,datasPreenchidas:datesToFill,datasLimpas:datesToClear,totalHistorico:pkg.summary.total}}});
      return{created:createPlan.length,reconciled:reconcilePlan.length};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:120000});
    const result={mode:"apply",...baseResult,...applied};const reportPath=path.join(input.reportDir,"apply.json");await writeFile(reportPath,JSON.stringify(result,null,2)+"\n",{mode:0o600});await chmod(reportPath,0o600);return result;
  }
  const result={mode:"dry-run",...baseResult};
  const reportPath=path.join(input.reportDir,"dry-run.json");await writeFile(reportPath,JSON.stringify(result,null,2)+"\n",{mode:0o600});await chmod(reportPath,0o600);
  return result;
});
