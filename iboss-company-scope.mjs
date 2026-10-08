// Company codes are bind values. SQL source identifiers are a fixed internal allowlist.
export function companyCode(value='') {
 if(typeof value!=='string'||!/^[-\w]{0,40}$/.test(value))throw new Error('Choose a valid company.');
 return value;
}
export const COMPANY_LIST_SQL='SELECT companycode,companyname FROM cmpl.company ORDER BY companyname';

// BI_RECEIVABLE omits company. Reproduce its allocation and bill-age rules using
// the voucher company, rather than guessing ownership from a shared location.
const allocated=`SELECT x.vouchertno,x.vouchersno,SUM(x.amount) allocatedamount FROM (
 SELECT aa.drvouchertno vouchertno,aa.drvouchersno vouchersno,-SUM(aa.amount) amount
 FROM cmpl.drcrallocation aa JOIN cmpl.voucher bb ON bb.tno=aa.drvouchertno JOIN cmpl.voucher cc ON cc.tno=aa.crvouchertno GROUP BY aa.drvouchertno,aa.drvouchersno
 UNION ALL SELECT aa.crvouchertno,aa.crvouchersno,SUM(aa.amount)
 FROM cmpl.drcrallocation aa JOIN cmpl.voucher bb ON bb.tno=aa.drvouchertno JOIN cmpl.voucher cc ON cc.tno=aa.crvouchertno GROUP BY aa.crvouchertno,aa.crvouchersno
) x GROUP BY x.vouchertno,x.vouchersno`;
const bill=`SELECT tno,invoiceno billno,invoicedate billdate FROM cmpl.invoice UNION ALL SELECT tno,servicebillno,servicebilldate FROM cmpl.servicebill`;
const balance=opening=>`SELECT b.companycode,a.locationcode,a.accountcode,a.voucherdate,d.billno,
 TRUNC(SYSDATE)-NVL(d.billdate,a.voucherdate) billage,a.amount voucheramount,c.allocatedamount,
 a.amount-NVL(c.allocatedamount,0) balanceamount
 FROM cmpl.voucherdetail a JOIN cmpl.voucher b ON b.tno=a.tno
 LEFT JOIN (${allocated}) c ON c.vouchertno=a.tno AND c.vouchersno=a.sno
 LEFT JOIN ${opening?'cmpl.accountopening':`(${bill})`} d ON d.tno=${opening?'a':'b'}.moduletno
 WHERE b.companycode=:company_code AND b.voucherno${opening?'=':'<>'}'OPENING' AND ROUND(a.amount-NVL(c.allocatedamount,0),0)<>0`;
export const COMPANY_RECEIVABLE_SQL=`SELECT x.companycode,x.locationcode,y.partyname,x.billno,x.voucherdate,x.billage,
 SUM(x.voucheramount) voucheramount,SUM(x.allocatedamount) allocatedamount,SUM(x.balanceamount) totalbalance,x.accountcode,y.partytypecode
 FROM (${balance(true)} UNION ALL ${balance(false)}) x JOIN cmpl.party y ON y.partycode=x.accountcode
 WHERE y.partytypecode='CUSTOMER'
 GROUP BY x.companycode,x.locationcode,y.partyname,x.billno,x.voucherdate,x.billage,x.accountcode,y.partytypecode
 HAVING ROUND(SUM(x.balanceamount),3)<>0`;

export function companyScopedSql(sql,company='') {
 if(!companyCode(company))return sql;
 return sql.replace(/CAST\(NULL AS VARCHAR2\(100\)\) AS companycode/gi,'a.companycode AS companycode')
  .replace(/cmpl\.(voucher|ap_bill_payable_v|paymentadvice|loan|emireport|fixeddeposit|bankgauranty|taxinoutdetail|costcentre|asset|accountopening|invoice|servicebill|fixeddepositinterest|fixeddepositwithdrawl|bankgaurantycommission|bankgaurantycloser|loanprecloser)\b/gi,
   (_,table)=>`(SELECT * FROM cmpl.${table} WHERE companycode=:company_code)`)
  .replace(/cmpl\.tdsdetail\b/gi,'(SELECT td.* FROM cmpl.tdsdetail td WHERE EXISTS (SELECT 1 FROM cmpl.voucher cv WHERE cv.tno=td.vouchertno AND cv.companycode=:company_code))')
  .replace(/cmpl\.bi_receivable\b/gi,`(${COMPANY_RECEIVABLE_SQL})`);
}
