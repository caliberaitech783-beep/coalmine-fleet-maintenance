import {BANK_RECONCILIATION_SUMMARY_SQL,reconciliationFilter} from './iboss-bank-reconciliation.mjs';
import {companyCode,companyScopedSql} from './iboss-company-scope.mjs';
import {bankLedgerSql} from './iboss-bank-ledger.mjs';
import {accountView} from './iboss-accounts.mjs';
import {purchaseOrderRange} from './purchase-order-report.mjs';
export const DASHBOARD_PAGE_SIZE=200;
const yes="('Y','YES','1','T','TRUE','PAID','DONE')";
const age=expression=>`CASE WHEN ${expression}<=30 THEN '0–30' WHEN ${expression}<=60 THEN '31–60' WHEN ${expression}<=90 THEN '61–90' WHEN ${expression}<=180 THEN '91–180' ELSE '180+' END`;
const bank=bankLedgerSql();
export const DASHBOARD_QUERIES={
 masters:{sql:`SELECT (SELECT COUNT(*) FROM cmpl.party WHERE partytypecode<>'ACCOUNTGROUP') AS accounts,(SELECT COUNT(*) FROM cmpl.vendor) AS vendors,(SELECT COUNT(*) FROM cmpl.costcentre) AS cost_centres,(SELECT COUNT(*) FROM cmpl.workcentre) AS work_centres,(SELECT COUNT(*) FROM cmpl.asset) AS assets FROM dual`},
 bank:{sql:bank},
 reconciliation:{sql:BANK_RECONCILIATION_SUMMARY_SQL},
 payable:{sql:`SELECT a.vendorcode AS party_code,MAX(a.vendorname) AS party_name,${age('TRUNC(SYSDATE)-TRUNC(a.documentdate)')} AS age_band,COUNT(*) AS bills,SUM(a.outstanding) AS balance FROM cmpl.ap_bill_payable_v a WHERE NVL(a.outstanding,0)<>0 GROUP BY a.vendorcode,${age('TRUNC(SYSDATE)-TRUNC(a.documentdate)')}`},
 receivable:{sql:`SELECT a.accountcode AS party_code,MAX(a.partyname) AS party_name,${age('a.billage')} AS age_band,COUNT(*) AS bills,SUM(a.totalbalance) AS balance FROM cmpl.bi_receivable a WHERE NVL(a.totalbalance,0)<>0 GROUP BY a.accountcode,${age('a.billage')}`},
 advice:{sql:`SELECT CASE WHEN UPPER(TRIM(NVL(a.paymentdone,'N'))) IN ${yes} THEN 'Completed' ELSE 'Pending' END AS state,COUNT(*) AS records,SUM(NVL(a.amount,0)) AS amount FROM cmpl.paymentadvice a WHERE a.paymentadvicedate>=TO_DATE(:from_date,'YYYY-MM-DD') AND a.paymentadvicedate<TO_DATE(:to_date,'YYYY-MM-DD')+1 GROUP BY CASE WHEN UPPER(TRIM(NVL(a.paymentdone,'N'))) IN ${yes} THEN 'Completed' ELSE 'Pending' END`},
 loan:{sql:`SELECT COUNT(*) AS records,SUM(NVL(balanceamount,0)) AS balance FROM cmpl.loan WHERE NVL(balanceamount,0)<>0`},
 emi:{sql:`SELECT CASE WHEN e.duedate<TO_DATE(:to_date,'YYYY-MM-DD') THEN 'Overdue' WHEN e.duedate<TO_DATE(:to_date,'YYYY-MM-DD')+8 THEN 'Next 7 days' ELSE 'Next 30 days' END AS bucket,COUNT(*) AS instalments,SUM(NVL(e.installmentamount,0)) AS amount FROM cmpl.emireport e WHERE e.emistatus='UNPAID' AND e.duedate<TO_DATE(:to_date,'YYYY-MM-DD')+31 GROUP BY CASE WHEN e.duedate<TO_DATE(:to_date,'YYYY-MM-DD') THEN 'Overdue' WHEN e.duedate<TO_DATE(:to_date,'YYYY-MM-DD')+8 THEN 'Next 7 days' ELSE 'Next 30 days' END`},
 fd:{sql:`SELECT COUNT(*) AS records,SUM(NVL(f.maturityamount,0)) AS amount FROM cmpl.fixeddeposit f WHERE f.maturitydate>=TO_DATE(:to_date,'YYYY-MM-DD') AND f.maturitydate<TO_DATE(:to_date,'YYYY-MM-DD')+31 AND NOT EXISTS (SELECT 1 FROM cmpl.fixeddepositwithdrawl w WHERE w.fixeddeposittno=f.tno AND w.closingbalance=0 AND w.fixeddepositwithdrawldate<TO_DATE(:to_date,'YYYY-MM-DD')+1)`},
 guarantee:{sql:`SELECT CASE WHEN g.expirydate<TO_DATE(:to_date,'YYYY-MM-DD') THEN 'Expired' ELSE 'Next 30 days' END AS bucket,COUNT(*) AS records,SUM(NVL(g.bankgaurantyamount,0)) AS amount FROM cmpl.bankgauranty g WHERE g.expirydate<TO_DATE(:to_date,'YYYY-MM-DD')+31 AND NOT EXISTS (SELECT 1 FROM cmpl.bankgaurantycloser c WHERE c.bankgaurantytno=g.tno AND c.bankgaurantycloserdate<TO_DATE(:to_date,'YYYY-MM-DD')+1) GROUP BY CASE WHEN g.expirydate<TO_DATE(:to_date,'YYYY-MM-DD') THEN 'Expired' ELSE 'Next 30 days' END`},
 tax:{sql:`SELECT 'TDS' AS tax,SUM(NVL(a.tdsamount,0)) AS amount FROM cmpl.tdsdetail a WHERE a.transactiondate>=TO_DATE(:from_date,'YYYY-MM-DD') AND a.transactiondate<TO_DATE(:to_date,'YYYY-MM-DD')+1 UNION ALL SELECT 'TCS' AS tax,SUM(NVL(a.tcs,0)) AS amount FROM cmpl.taxinoutdetail a WHERE a.voucherdate>=TO_DATE(:from_date,'YYYY-MM-DD') AND a.voucherdate<TO_DATE(:to_date,'YYYY-MM-DD')+1`}
};
const num=value=>Number.isFinite(Number(value))?Number(value):0;
const sum=(rows,key)=>rows.reduce((total,row)=>total+num(row[key]),0);
export function buildDashboard(groups,{from,to,checkedAt=new Date().toISOString()}={}){
 const advice=groups.advice?.find(row=>row.STATE==='Pending'),loans=groups.loan?.[0],fd=groups.fd?.[0];
 const overdue=(groups.emi||[]).filter(row=>row.BUCKET==='Overdue'),upcoming=(groups.emi||[]).filter(row=>row.BUCKET!=='Overdue');
 const old=(groups.receivable||[]).filter(row=>row.AGE_BAND==='180+');
 const cards=[
  {key:'bank',title:'Bank ledger balance',amount:sum(groups.bank||[],'BALANCEAMOUNT'),count:(groups.bank||[]).length,note:'Ledger closing through To date · Cr positive / Dr negative',kind:'bank'},
  {key:'bank-reconciliation',title:'Bank Reconciliation',amount:sum(groups.reconciliation||[],'PASSBOOK_BALANCE'),count:sum(groups.reconciliation||[],'UNRECONCILED_COUNT'),note:'Calculated pass-book balance · current ERP reconciliation status',kind:'bank'},
  {key:'payable',title:'Current payables',amount:sum(groups.payable||[],'BALANCE'),count:sum(groups.payable||[],'BILLS'),note:'All open bills · current signed outstanding',kind:'payable'},
  {key:'receivable',title:'Current receivables',amount:sum(groups.receivable||[],'BALANCE'),count:sum(groups.receivable||[],'BILLS'),note:'All open customer bills · current signed balances',kind:'receivable'},
  {key:'aged-receivable',title:'Receivables older than 180 days',amount:sum(old,'BALANCE'),count:sum(old,'BILLS'),note:'Bill age · current balance, not a due-date estimate',kind:'risk'},
  {key:'loan',title:'Recorded loan balance',amount:num(loans?.BALANCE),count:num(loans?.RECORDS),note:'Non-zero balances stored in loan headers',kind:'loan'},
  {key:'overdue-emi',title:'Overdue unpaid EMI',amount:sum(overdue,'AMOUNT'),count:sum(overdue,'INSTALMENTS'),note:'Before To date · native unpaid EMI status',kind:'risk'},
  {key:'upcoming-emi',title:'EMI due in the next 30 days',amount:sum(upcoming,'AMOUNT'),count:sum(upcoming,'INSTALMENTS'),note:'From To date · native unpaid EMI status',kind:'calendar'},
  {key:'pending-advice',title:'Advice awaiting completion',amount:num(advice?.AMOUNT),count:num(advice?.RECORDS),note:'Advice created in period · ERP completion flag',kind:'advice'}
 ];
 const aging=['0–30','31–60','61–90','91–180','180+'].map(band=>({band,payable:sum((groups.payable||[]).filter(row=>row.AGE_BAND===band),'BALANCE'),receivable:sum((groups.receivable||[]).filter(row=>row.AGE_BAND===band),'BALANCE')}));
 const parties=side=>{
  const map=new Map();for(const row of groups[side]||[]){const key=String(row.PARTY_CODE);const current=map.get(key)||{code:key,name:row.PARTY_NAME||key,balance:0,bills:0};current.balance+=num(row.BALANCE);current.bills+=num(row.BILLS);map.set(key,current);}
  return [...map.values()].sort((a,b)=>Math.abs(b.balance)-Math.abs(a.balance)).slice(0,5);
 };
 const guarantees=(groups.guarantee||[]).find(row=>row.BUCKET==='Next 30 days'),expired=(groups.guarantee||[]).find(row=>row.BUCKET==='Expired');
 return {reconciliation:groups.reconciliation||[],cards,aging,parties:{payable:parties('payable'),receivable:parties('receivable')},bank:(groups.bank||[]).slice(0,6),masters:groups.masters?.[0]||{},advice:groups.advice||[],tax:groups.tax||[],
  tasks:[{key:'overdue-emi',title:'Review unpaid EMI past its due date',count:sum(overdue,'INSTALMENTS'),amount:sum(overdue,'AMOUNT'),tone:'urgent'},
   {key:'pending-advice',title:'Complete or review payment advice',count:num(advice?.RECORDS),amount:num(advice?.AMOUNT),tone:'urgent'},
   {key:'aged-receivable',title:'Follow up customer bills older than 180 days',count:sum(old,'BILLS'),amount:sum(old,'BALANCE'),tone:'urgent'},
   {key:'expiring-bg',title:'Renew guarantees expiring in 30 days',count:num(guarantees?.RECORDS),amount:num(guarantees?.AMOUNT),tone:'upcoming'},
   {key:'expired-bg',title:'Review expired guarantees without closure',count:num(expired?.RECORDS),amount:num(expired?.AMOUNT),tone:'urgent'},
   {key:'maturing-fd',title:'Plan deposits maturing in 30 days',count:num(fd?.RECORDS),amount:num(fd?.AMOUNT),tone:'upcoming'}],from,to,checkedAt,
  note:'Current bill balances follow Oracle’s current settlement views and do not reconstruct historical outstanding. Bank balances are calculated from voucher history through To date. EMI and expiry dates use To as the planning date. Tax figures are recorded TDS/TCS, not unpaid tax liability. Amounts remain in the ERP reporting basis; signed credits are retained.'};
}

export const DASHBOARD_METRICS={
 'bank-reconciliation':{view:'bank-reconciliation',dates:'period'},
 bank:{view:'bank-balance',dates:'period'},payable:{view:'payable-receivable',where:"r.side='Payable'"},receivable:{view:'payable-receivable',where:"r.side='Receivable'"},
 'aged-receivable':{view:'outstanding-180',where:"r.side='Receivable'"},loan:{view:'emi-details',where:'NVL(r.balanceamount,0)<>0'},
 'overdue-emi':{view:'emi-schedule',where:"r.emistatus='UNPAID'",dates:'overdue'},'upcoming-emi':{view:'emi-schedule',where:"r.emistatus='UNPAID'",dates:'upcoming'},
 'pending-advice':{view:'payment-advice',where:`UPPER(TRIM(NVL(r.paymentdone,'N'))) NOT IN ${yes}`,dates:'period'},
 'maturing-fd':{view:'fixed-deposit',where:"r.maturitydate>=:planning_date AND r.maturitydate<=:planning_end AND NOT EXISTS (SELECT 1 FROM cmpl.fixeddepositwithdrawl w WHERE w.fixeddeposittno=TO_NUMBER(r.id) AND w.closingbalance=0 AND w.fixeddepositwithdrawldate<TO_DATE(:planning_date,'YYYY-MM-DD')+1)"},
 'expiring-bg':{view:'bank-guarantee',where:"r.expirydate>=:planning_date AND r.expirydate<=:planning_end AND NOT EXISTS (SELECT 1 FROM cmpl.bankgaurantycloser c WHERE c.bankgaurantytno=TO_NUMBER(r.id) AND c.bankgaurantycloserdate<TO_DATE(:planning_date,'YYYY-MM-DD')+1)"},
 'expired-bg':{view:'bank-guarantee',where:"r.expirydate<:planning_date AND NOT EXISTS (SELECT 1 FROM cmpl.bankgaurantycloser c WHERE c.bankgaurantytno=TO_NUMBER(r.id) AND c.bankgaurantycloserdate<TO_DATE(:planning_date,'YYYY-MM-DD')+1)"}
};
const shift=(day,days)=>new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function dashboardMetric(key,{from,to,company='',bank='',status='unreconciled',search='',page=0}={}){
 purchaseOrderRange(from,to);companyCode(company);
 if(!Object.hasOwn(DASHBOARD_METRICS,key)||!Number.isInteger(page)||page<0||page>5000)throw new Error('Choose a valid dashboard card and page.');
 const metric={...DASHBOARD_METRICS[key]},reconcile=key==='bank-reconciliation'?reconciliationFilter(bank,status):null;if(reconcile)metric.where=reconcile.where;
 const definition=accountView(metric.view);
 if(typeof search!=='string'||search.length>120)throw new Error('Search must contain at most 120 characters.');
 const terms=[metric.where];
 if(search.trim())terms.push('('+definition.columns.map(column=>'INSTR(LOWER(CAST(r.'+column.key+' AS VARCHAR2(4000))),LOWER(:search_text))>0').join(' OR ')+')');
 metric.where=terms.filter(Boolean).map(term=>'('+term+')').join(' AND ');
 // Current outstanding cards include undated open bills, as their summary does.
 const sourceSql=metric.view==='payable-receivable'&&!metric.dates?definition.sql.replace(/a\.(documentdate|voucherdate) >= TO_DATE\(:from_date,'YYYY-MM-DD'\) AND a\.\1 < TO_DATE\(:to_date,'YYYY-MM-DD'\)\+1/g,'1=1'):definition.sql;
 const dates=metric.dates==='period'?{from,to}:metric.dates==='overdue'?{from:'1900-01-01',to:shift(to,-1)}:metric.dates==='upcoming'?{from:to,to:shift(to,30)}:{from:'1900-01-01',to:'2999-12-31'};
 const values={search_text:search.trim(),...reconcile?.binds,company_code:company,from_date:dates.from,to_date:dates.to,planning_date:to,planning_end:shift(to,30),row_offset:page*DASHBOARD_PAGE_SIZE,row_limit:DASHBOARD_PAGE_SIZE+1};
 const sql=`SELECT * FROM (${companyScopedSql(sourceSql,company)}) r ${metric.where?'WHERE '+metric.where:''} ORDER BY ${key==='bank-reconciliation'?'r.voucher_date,r.id':definition.columns.map(column=>`r.${column.key}`).join(',')} OFFSET :row_offset ROWS FETCH NEXT :row_limit ROWS ONLY`;
 if(definition.asOf)values.to_date=to;
 const binds=Object.fromEntries([...new Set([...sql.matchAll(/:(\w+)/g)].map(match=>match[1]))].map(name=>[name,values[name]]));
 const countSql=`SELECT COUNT(*) AS TOTAL_COUNT FROM (${companyScopedSql(sourceSql,company)}) r ${metric.where?'WHERE '+metric.where:''}`;
 const countBinds=Object.fromEntries(Object.entries(binds).filter(([name])=>!['row_offset','row_limit'].includes(name)));
 return {sql,binds,countSql,countBinds,view:metric.view,columns:definition.columns,from:dates.from,to:definition.asOf?to:dates.to,page};
}
