import {TRADE_GROUPS} from './iboss-trade-ledger.mjs';
const allocated=`SELECT x.tno,x.sno,SUM(x.amount) allocated FROM (
 SELECT a.drvouchertno tno,a.drvouchersno sno,-SUM(a.amount) amount FROM cmpl.drcrallocation a
 JOIN cmpl.voucher dv ON dv.tno=a.drvouchertno JOIN cmpl.voucher cv ON cv.tno=a.crvouchertno
 WHERE dv.voucherdate<TO_DATE(:to_date,'YYYY-MM-DD')+1 AND cv.voucherdate<TO_DATE(:to_date,'YYYY-MM-DD')+1 GROUP BY a.drvouchertno,a.drvouchersno
 UNION ALL
 SELECT a.crvouchertno,a.crvouchersno,SUM(a.amount) FROM cmpl.drcrallocation a
 JOIN cmpl.voucher dv ON dv.tno=a.drvouchertno JOIN cmpl.voucher cv ON cv.tno=a.crvouchertno
 WHERE dv.voucherdate<TO_DATE(:to_date,'YYYY-MM-DD')+1 AND cv.voucherdate<TO_DATE(:to_date,'YYYY-MM-DD')+1 GROUP BY a.crvouchertno,a.crvouchersno
) x GROUP BY x.tno,x.sno`;
export const TRADE_AGE_REPORTS=Object.fromEntries(Object.entries(TRADE_GROUPS).map(([key,group])=>{
 const sourceDate=`CASE WHEN v.voucherno='OPENING' THEN (SELECT /*+ NO_UNNEST */ MAX(ao.billdate) FROM cmpl.accountopening ao WHERE ao.tno=d.moduletno)
 ELSE CASE v.modulecode
 WHEN 'PBPASS' THEN (SELECT /*+ NO_UNNEST */ MAX(pb.partybilldate) FROM cmpl.pbpass pp JOIN cmpl.purchasebill pb ON pb.tno=pp.purchasebilltno WHERE pp.tno=v.moduletno)
 WHEN 'JBPASS' THEN (SELECT /*+ NO_UNNEST */ MAX(jb.partybilldate) FROM cmpl.jbpass jp JOIN cmpl.jobbill jb ON jb.tno=jp.jobbilltno WHERE jp.tno=v.moduletno)
 WHEN 'FREIGHTADVICE' THEN (SELECT /*+ NO_UNNEST */ MAX(NVL(f.partybilldate,f.freightadvicedate)) FROM cmpl.freightadvice f WHERE f.tno=v.moduletno)
 WHEN 'EXTERNALSERVICESENTRY' THEN (SELECT /*+ NO_UNNEST */ MAX(NVL(x.billdate,x.externalservicesentrydate)) FROM cmpl.externalservicesentry x WHERE x.tno=v.moduletno)
 WHEN 'NECESSITYCOMPLETION' THEN (SELECT /*+ NO_UNNEST */ MAX(NVL(n.partybilldate,n.necessitycompletiondate)) FROM cmpl.necessitycompletion n WHERE n.tno=v.moduletno)
 WHEN 'CREDITNOTE' THEN (SELECT /*+ NO_UNNEST */ MAX(c.creditnotedate) FROM cmpl.creditnote c WHERE c.tno=v.moduletno)
 WHEN 'INVOICE' THEN (SELECT /*+ NO_UNNEST */ MAX(i.invoicedate) FROM cmpl.invoice i WHERE i.tno=v.moduletno)
 WHEN 'SERVICEBILL' THEN (SELECT /*+ NO_UNNEST */ MAX(s.servicebilldate) FROM cmpl.servicebill s WHERE s.tno=v.moduletno)
 END END`;
 const docDate='COALESCE('+sourceDate+',v.voucherdate)';
 const sql=`SELECT e.*,TO_DATE(:to_date,'YYYY-MM-DD')-TRUNC(e.document_date_raw) AS age_days,
 GREATEST(-e.balanceamount,0) AS outstanding_dr,GREATEST(e.balanceamount,0) AS outstanding_cr,
 CASE WHEN e.balanceamount${key==='trade-payable'?'>':'<'}0 THEN '${key==='trade-payable'?'Payable':'Receivable'}' ELSE 'Advance / opposite balance' END AS balance_type
 FROM (SELECT TO_CHAR(v.tno)||':'||TO_CHAR(d.sno) id,v.companycode,d.accountcode AS account_code,p.partyname AS account_name,
 v.voucherno AS voucher_no,TO_CHAR(v.voucherdate,'YYYY-MM-DD') AS voucher_date,
 d.billno AS bill_no,
 ${docDate} AS document_date_raw,TO_CHAR(${docDate},'YYYY-MM-DD') AS document_date,
 CASE WHEN ${sourceDate} IS NULL THEN 'Voucher date (fallback)' ELSE 'Bill / document date' END AS age_basis,
 d.amount AS original_amount,NVL(a.allocated,0) AS allocated_amount,d.amount-NVL(a.allocated,0) AS balanceamount
 FROM cmpl.voucher v JOIN cmpl.voucherdetail d ON d.tno=v.tno JOIN cmpl.party p ON p.partycode=d.accountcode
 LEFT JOIN (${allocated}) a ON a.tno=d.tno AND a.sno=d.sno
 WHERE p.partycode IN (SELECT h.partycode FROM cmpl.party h START WITH h.partycode='${group.root}' CONNECT BY NOCYCLE PRIOR h.partycode=h.parentcode)
 AND v.voucherdate<TO_DATE(:to_date,'YYYY-MM-DD')+1 AND d.amount-NVL(a.allocated,0)<>0) e`;
 const columns=[['ACCOUNT_CODE','Account Code'],['ACCOUNT_NAME','Account / Party Name'],['COMPANYCODE','Company Code'],['BILL_NO','Bill No'],['VOUCHER_NO','Voucher No'],['VOUCHER_DATE','Voucher Date'],['DOCUMENT_DATE','Ageing Date'],['AGE_BASIS','Ageing Date Source'],['AGE_DAYS','Age (days)'],['BALANCE_TYPE','Balance Type'],['ORIGINAL_AMOUNT','Original (Cr + / Dr −)'],['ALLOCATED_AMOUNT','Allocated (signed)'],['OUTSTANDING_DR','Outstanding Dr'],['OUTSTANDING_CR','Outstanding Cr'],['BALANCEAMOUNT','Net (Cr + / Dr −)']].map(([key,label])=>({key,label,date:key.endsWith('_DATE')}));
 return [key+'-ageing',{title:group.title+' — Ageing',asOf:true,columns,sql,source:'Oracle vouchers, allocations and bill dates',note:'Document age at To date. Uses current allocation links with both vouchers dated through To date; it cannot reconstruct when allocation links were created or edited. Advances/opposite balances remain visible.'}];
}));
