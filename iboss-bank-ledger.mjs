// ERP vouchers include brought-forward entries; adding opening tables again double counts them.
// Conditions and bind names are internal allowlisted constants, never user input.
export function ledgerSql(condition,bind=''){
 return `SELECT v.companycode,d.accountcode AS account_code,p.partyname AS account_name,
 :to_date AS snapshot_date,
 SUM(CASE WHEN v.voucherdate< TO_DATE(:from_date,'YYYY-MM-DD') THEN NVL(d.amount,0) ELSE 0 END) AS opening_balance,
 SUM(CASE WHEN v.voucherdate>= TO_DATE(:from_date,'YYYY-MM-DD') AND d.amount<0 THEN -d.amount ELSE 0 END) AS debitamount,
 SUM(CASE WHEN v.voucherdate>= TO_DATE(:from_date,'YYYY-MM-DD') AND d.amount>0 THEN d.amount ELSE 0 END) AS creditamount,
 SUM(NVL(d.amount,0)) AS balanceamount,
 GREATEST(-SUM(NVL(d.amount,0)),0) AS closing_debit,
 GREATEST(SUM(NVL(d.amount,0)),0) AS closing_credit
 FROM cmpl.voucher v JOIN cmpl.voucherdetail d ON d.tno=v.tno
 JOIN cmpl.party p ON p.partycode=d.accountcode
 WHERE ${condition} AND v.voucherdate< TO_DATE(:to_date,'YYYY-MM-DD')+1${bind?` AND d.accountcode=:${bind}`:''}
 GROUP BY v.companycode,d.accountcode,p.partyname ORDER BY p.partyname,v.companycode,d.accountcode`;
}
export const bankLedgerSql=(keyed=false)=>ledgerSql("p.partytypecode='BANK'",keyed?'anchor_key':'');
export const BANK_LEDGER_REPORT={title:'Bank Balance Details',section:'transactions',dated:true,ledger:true,
 source:'CMPL.VOUCHER + CMPL.VOUCHERDETAIL',
 note:'Ledger closing through the selected To date, including brought-forward voucher entries. Opening is all earlier voucher movement; debit and credit are movement within the selected period. Negative signed balances are debit; positive balances are credit. No stored year-end snapshot is added. No row means no matching ledger entries, not a confirmed zero balance.',
 columns:[['COMPANYCODE','Company Code'],['ACCOUNT_CODE','Account Code'],['ACCOUNT_NAME','Account Name'],['SNAPSHOT_DATE','Closing as of'],['OPENING_BALANCE','Opening (Cr + / Dr −)'],['DEBITAMOUNT','Period Debit'],['CREDITAMOUNT','Period Credit'],['CLOSING_DEBIT','Closing Dr'],['CLOSING_CREDIT','Closing Cr'],['BALANCEAMOUNT','Closing (Cr + / Dr −)']].map(([key,label])=>({key,label})),
 sql:bankLedgerSql()};
export function ledgerReport(title,condition,bind=''){
 return {...BANK_LEDGER_REPORT,title,sql:ledgerSql(condition,bind)};
}
