import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { normalizePersonName } from "@/lib/import/october-2026";

export const FINANCIAL_HISTORY_RULE = "HISTORICAL_PAYMENTS_WITH_AMBIGUOUS_GAPS_NOT_AUTO_PAUSED";
export const FINANCIAL_HISTORY_COMPETENCIAS = Array.from({ length: 10 }, (_, index) => `2026-${String(index + 1).padStart(2, "0")}`);

type CsvRow = Record<string, string>;
export type HistoricalPayment = { student:string; competence:string; value:number; paymentDate:string|null; status:"PAGO"; dueDay:number };
export type FinancialHistoryPackage = {
  sha256:string;
  studentNames:string[];
  payments:HistoricalPayment[];
  gaps:CsvRow[];
  returns:CsvRow[];
  periodCandidates:CsvRow[];
  cashCandidates:CsvRow[];
  summary:{students:number;payments:number;total:number;knownDates:number;unknownDates:number;gaps:number;returns:number;automaticCashMatches:number};
};

const REQUIRED_FILES = ["manifest.json","alunos_resumo_financeiro.csv","mensalidades_historico.csv","pagamentos_historicos.csv","lacunas_pagamento.csv","retornos_candidatos.csv","periodos_candidatos.csv","caixa_entradas_jan_out.csv","conciliacao_caixa_candidatos.csv"];

export function parseCsv(text:string):CsvRow[]{
  const rows:string[][]=[]; let row:string[]=[]; let field=""; let quoted=false;
  const source=text.replace(/^\uFEFF/,"");
  for(let index=0;index<source.length;index++){
    const char=source[index];
    if(quoted){if(char==='"'&&source[index+1]==='"'){field+='"';index++;}else if(char==='"')quoted=false;else field+=char;continue;}
    if(char==='"'){quoted=true;continue;} if(char===","){row.push(field);field="";continue;}
    if(char==="\n"){row.push(field.replace(/\r$/, ""));rows.push(row);row=[];field="";continue;} field+=char;
  }
  if(field||row.length){row.push(field.replace(/\r$/, ""));rows.push(row);}
  const headers=rows.shift()?.map(item=>item.trim())??[];
  return rows.filter(item=>item.some(Boolean)).map(item=>Object.fromEntries(headers.map((header,index)=>[header,(item[index]??"").trim()])));
}

function sourceReader(source:string){
  if(statSync(source).isDirectory())return{list:readdirSync(source),read:(file:string)=>readFileSync(`${source}/${file}`,"utf8")};
  return{list:execFileSync("unzip",["-Z1",source],{encoding:"utf8"}).trim().split(/\r?\n/),read:(file:string)=>execFileSync("unzip",["-p",source,file],{encoding:"utf8",maxBuffer:16*1024*1024})};
}
function validDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(`${value}T00:00:00.000Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;}
function number(value:string,label:string){const parsed=Number(value);if(!Number.isFinite(parsed)||parsed<=0)throw new Error(`${label} inválido`);return parsed;}

export function parseFinancialHistoryPackage(source:string,confirmedSha256?:string):FinancialHistoryPackage{
  const reader=sourceReader(source);const list=reader.list;
  for(const file of REQUIRED_FILES)if(!list.includes(file))throw new Error(`Arquivo obrigatório ausente: ${file}`);
  const manifest=JSON.parse(reader.read("manifest.json"));
  if(manifest.regra!==FINANCIAL_HISTORY_RULE||manifest.ano!==2026)throw new Error("Manifesto financeiro incompatível");
  if(JSON.stringify(manifest.competencias_incluidas)!==JSON.stringify(FINANCIAL_HISTORY_COMPETENCIAS))throw new Error("Competências do manifesto divergentes");
  const monthly=parseCsv(reader.read("mensalidades_historico.csv"));
  const monthlyByKey=new Map(monthly.map(item=>[`${normalizePersonName(item.aluno)}:${item.competencia}`,item]));
  const paymentRows=parseCsv(reader.read("pagamentos_historicos.csv"));
  const seen=new Set<string>();
  const payments=paymentRows.map((item,index)=>{
    const key=`${normalizePersonName(item.aluno)}:${item.competencia}`;
    if(seen.has(key))throw new Error(`Pagamento duplicado na fonte: linha ${index+2}`);seen.add(key);
    if(!FINANCIAL_HISTORY_COMPETENCIAS.includes(item.competencia))throw new Error(`Competência fora do escopo: ${item.competencia}`);
    if(item.status!=="PAGO")throw new Error(`Status não confirmado: linha ${index+2}`);
    if(item.data_pagamento&&!validDate(item.data_pagamento))throw new Error(`Data de pagamento inválida: linha ${index+2}`);
    const monthlyRow=monthlyByKey.get(key); if(!monthlyRow)throw new Error(`Mensalidade fonte ausente: linha ${index+2}`);
    const value=number(item.valor,`Valor linha ${index+2}`);
    if(monthlyRow.estado_fonte!=="PAGO"||Number(monthlyRow.valor_pago_fonte)!==value)throw new Error(`Divergência mensalidade/pagamento: linha ${index+2}`);
    const dueDay=Number(monthlyRow.dia_vencimento);if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31)throw new Error(`Vencimento inválido: linha ${index+2}`);
    return {student:item.aluno,competence:item.competencia,value,paymentDate:item.data_pagamento||null,status:"PAGO" as const,dueDay};
  });
  const gaps=parseCsv(reader.read("lacunas_pagamento.csv"));
  const returns=parseCsv(reader.read("retornos_candidatos.csv"));
  const periodCandidates=parseCsv(reader.read("periodos_candidatos.csv"));
  const cashCandidates=parseCsv(reader.read("conciliacao_caixa_candidatos.csv"));
  const automaticCash=cashCandidates.filter(item=>item.usar_automaticamente==="SIM");
  for(const item of automaticCash){const payment=payments.find(row=>normalizePersonName(row.student)===normalizePersonName(item.aluno)&&row.competence===item.competencia_sugerida);if(!payment||payment.value!==Number(item.valor)||payment.paymentDate!==item.data_caixa)throw new Error(`Conciliação automática inconsistente: ${item.aluno} ${item.competencia_sugerida}`);}
  const total=payments.reduce((sum,item)=>sum+item.value,0);
  const studentNames=parseCsv(reader.read("alunos_resumo_financeiro.csv")).map(item=>item.aluno);
  const students=new Set(studentNames.map(normalizePersonName)).size;
  const expected=manifest.totais;
  if(students!==289||payments.length!==1223||Math.round(total*100)!==20173000||gaps.length!==54||returns.length!==54)throw new Error("Totais do pacote divergentes do manifesto");
  const knownDates=payments.filter(item=>item.paymentDate).length;
  if(knownDates!==expected.pagamentos_com_data_preenchida)throw new Error("Total de datas conciliadas divergente");
  const sha256=statSync(source).isDirectory()?confirmedSha256:createHash("sha256").update(readFileSync(source)).digest("hex");
  if(!sha256||!/^[a-f0-9]{64}$/.test(sha256))throw new Error("SHA-256 confirmado é obrigatório para fonte em diretório");
  return {sha256,studentNames,payments,gaps,returns,periodCandidates,cashCandidates,summary:{students,payments:payments.length,total,knownDates,unknownDates:payments.length-knownDates,gaps:gaps.length,returns:returns.length,automaticCashMatches:automaticCash.length}};
}

export function historicalDueDate(competence:string,dueDay:number){const [year,month]=competence.split("-").map(Number);const last=new Date(Date.UTC(year,month,0)).getUTCDate();return `${competence}-${String(Math.min(last,dueDay)).padStart(2,"0")}`;}
