import {TRADE_AGE_REPORTS} from './iboss-trade-ageing.mjs';
import {TRADE_AGE_BANDS,tradeAgeFilter} from './trade-age-bands.mjs';
export const AGEING_COLUMNS=TRADE_AGE_BANDS.filter(b=>b.value!=='all').map(b=>({
 key:b.value==='older'?'AGE_OVER_360':b.value==='future'?'AGE_FUTURE':b.value==='unknown'?'AGE_UNKNOWN':'AGE_'+b.value,
 label:b.value==='older'?'Above 360':b.value==='future'?'Future dated':b.value==='unknown'?'Date unavailable':`${b.min} - ${b.max}`,
 value:b.value,where:tradeAgeFilter(b.value).where.replaceAll('r.','e.')
}));
export const TRADE_AGE_SUMMARIES=Object.fromEntries(Object.entries(TRADE_AGE_REPORTS).map(([key,report])=>{
 const sign=key.startsWith('trade-receivable')?'-':'';
 const sql=`SELECT e.companycode,e.account_code,e.account_name,MAX(p.msme) AS msme,
 ${AGEING_COLUMNS.map(b=>`SUM(CASE WHEN ${b.where} THEN ${sign}e.balanceamount ELSE 0 END) AS ${b.key}`).join(',\n')},
 COUNT(DISTINCT CASE WHEN ${sign}e.balanceamount>0 THEN e.bill_identity END) AS bill_count,
 SUM(CASE WHEN ${sign}e.balanceamount>0 AND e.bill_identity IS NULL THEN 1 ELSE 0 END) AS unreferenced_entries,SUM(${sign}e.balanceamount) AS total_outstanding,
 SUM(e.outstanding_dr) AS outstanding_dr,SUM(e.outstanding_cr) AS outstanding_cr,SUM(e.balanceamount) AS balanceamount
 FROM (${report.sql}) e LEFT JOIN cmpl.party p ON p.partycode=e.account_code
 GROUP BY e.companycode,e.account_code,e.account_name`;
 return [key+'-summary',{...report,title:report.title+' — Party Summary',sql,columns:[
 {key:'MSME',label:'Is MSME'},{key:'ACCOUNT_NAME',label:'Party Name'},{key:'BILL_COUNT',label:'No. of Bills',numeric:true,integer:true},
 ...AGEING_COLUMNS.map(({key,label})=>({key,label,numeric:true})),
 {key:'TOTAL_OUTSTANDING',label:'Total Outstanding',numeric:true},{key:'UNREFERENCED_ENTRIES',label:'Entries without Bill Reference',numeric:true,integer:true},
 {key:'ACCOUNT_CODE',label:'Account Code'},{key:'COMPANYCODE',label:'Company Code'}]}];
}));
export function summaryAgeFilter(value){
 const band=value.slice('summary:'.length);tradeAgeFilter(band);
 return band==='all'?'1=1':`r.${AGEING_COLUMNS.find(b=>b.value===band).key}<>0`;
}
