import {purchaseOrderRange} from './purchase-order-report.mjs';
import {companyCode,companyScopedSql} from './iboss-company-scope.mjs';
import {ledgerSql} from './iboss-bank-ledger.mjs';
export function accountLedgerQueries({account,company='',from,to,page=0}){
 purchaseOrderRange(from,to);companyCode(company);
 if(typeof account!=='string'||!account.trim()||account.length>100||!Number.isInteger(page)||page<0||page>100000)throw new Error('Choose a valid account and page.');
 const values={account,anchor_key:account,company_code:company,from_date:from,to_date:to,offset:page*200,limit:201};
 const auditName="(SELECT MAX(COALESCE(e.employeename,u.bossusername)) FROM cmpl.bossuser u LEFT JOIN cmpl.employee e ON e.employeecode=u.employeecode WHERE u.bossusercode=v.creator)";
 const base=`SELECT d.tno,d.sno,v.companycode,d.accountcode,v.voucherdate,v.voucherno,d.billno,COALESCE(d.narration,v.narration) narration,d.amount,
 l.locationname,v.creator,${auditName} creator_name,TO_CHAR(v.creationtime,'DD-MM-YYYY HH24:MI:SS') created_at,
 SUM(NVL(d.amount,0)) OVER (PARTITION BY v.companycode ORDER BY v.voucherdate,v.tno,d.sno ROWS UNBOUNDED PRECEDING) running_balance
 FROM cmpl.voucher v JOIN cmpl.voucherdetail d ON d.tno=v.tno LEFT JOIN cmpl.location l ON l.locationcode=COALESCE(d.locationcode,v.locationcode)
 WHERE d.accountcode=:account AND v.voucherdate<TO_DATE(:to_date,'YYYY-MM-DD')+1`;
 const detail=`SELECT r.*,TO_CHAR(r.voucherdate,'YYYY-MM-DD') voucher_date,
 (SELECT LISTAGG(p.partyname||' ('||x.accountcode||')','; ' ON OVERFLOW TRUNCATE) WITHIN GROUP (ORDER BY x.sno) FROM cmpl.voucherdetail x LEFT JOIN cmpl.party p ON p.partycode=x.accountcode WHERE x.tno=r.tno AND x.accountcode<>r.accountcode) counterpart_accounts
 FROM (${base}) r WHERE r.voucherdate>=TO_DATE(:from_date,'YYYY-MM-DD') ORDER BY r.voucherdate,r.tno,r.sno OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
 const sqls={
  account:`SELECT p.partycode,p.partyname,t.partytypename,p.creator,TO_CHAR(p.creationtime,'DD-MM-YYYY HH24:MI:SS') created_at,(SELECT MAX(COALESCE(e.employeename,u.bossusername)) FROM cmpl.bossuser u LEFT JOIN cmpl.employee e ON e.employeecode=u.employeecode WHERE u.bossusercode=p.creator) creator_name FROM cmpl.party p LEFT JOIN cmpl.partytype t ON t.partytypecode=p.partytypecode WHERE p.partycode=:account`,
  balances:ledgerSql('1=1','anchor_key'),
  count:`SELECT COUNT(*) total_count FROM cmpl.voucher v JOIN cmpl.voucherdetail d ON d.tno=v.tno WHERE d.accountcode=:account AND v.voucherdate>=TO_DATE(:from_date,'YYYY-MM-DD') AND v.voucherdate<TO_DATE(:to_date,'YYYY-MM-DD')+1`,
  rows:detail
 };
 return Object.fromEntries(Object.entries(sqls).map(([name,raw])=>{const sql=companyScopedSql(raw,company);return [name,{sql,binds:Object.fromEntries([...new Set([...sql.matchAll(/:(\w+)/g)].map(m=>m[1]).filter(k=>Object.hasOwn(values,k)))].map(k=>[k,values[k]]))}];}));
}
