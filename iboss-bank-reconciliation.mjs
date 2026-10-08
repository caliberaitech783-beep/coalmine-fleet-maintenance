import {bankLedgerSql} from './iboss-bank-ledger.mjs';
export const BANK_RECONCILIATION_SUMMARY_SQL=`SELECT b.*,
 NVL(t.unreconciled_count,0) unreconciled_count,NVL(t.reconciled_count,0) reconciled_count,
 NVL(t.unclear_dr,0) unclear_dr,NVL(t.unclear_cr,0) unclear_cr,
 NVL(t.reconciled_dr,0) reconciled_dr,NVL(t.reconciled_cr,0) reconciled_cr,
 b.balanceamount+NVL(t.unclear_dr,0)-NVL(t.unclear_cr,0) passbook_balance
 FROM (${bankLedgerSql()}) b LEFT JOIN (
 SELECT v.companycode,d.accountcode,
 SUM(CASE WHEN d.reconsilationdate IS NULL THEN 1 ELSE 0 END) unreconciled_count,
 SUM(CASE WHEN d.reconsilationdate IS NOT NULL THEN 1 ELSE 0 END) reconciled_count,
 SUM(CASE WHEN d.reconsilationdate IS NULL AND d.amount<0 THEN -d.amount ELSE 0 END) unclear_dr,
 SUM(CASE WHEN d.reconsilationdate IS NULL AND d.amount>0 THEN d.amount ELSE 0 END) unclear_cr,
 SUM(CASE WHEN d.reconsilationdate IS NOT NULL AND d.amount<0 THEN -d.amount ELSE 0 END) reconciled_dr,
 SUM(CASE WHEN d.reconsilationdate IS NOT NULL AND d.amount>0 THEN d.amount ELSE 0 END) reconciled_cr
 FROM cmpl.voucher v JOIN cmpl.voucherdetail d ON d.tno=v.tno JOIN cmpl.party p ON p.partycode=d.accountcode
 WHERE p.partytypecode='BANK' AND v.voucherdate>= TO_DATE(:from_date,'YYYY-MM-DD') AND v.voucherdate< TO_DATE(:to_date,'YYYY-MM-DD')+1
 GROUP BY v.companycode,d.accountcode
 ) t ON t.companycode=b.companycode AND t.accountcode=b.account_code ORDER BY b.account_name,b.companycode`;

export const BANK_RECONCILIATION_REPORT={title:'Bank Reconciliation',section:'transactions',dated:true,source:'CMPL.VOUCHER + CMPL.VOUCHERDETAIL',
 note:'Voucher date is used for the reporting date and display reconciliation date. Actual ERP reconciliation date and status are preserved. Calculated pass-book balance uses book closing plus unreconciled debits minus unreconciled credits in the selected period; it is not independently verified against a bank statement.',
 columns:[['COMPANYCODE','Company Code'],['BANK_CODE','Bank Code'],['BANK_NAME','Bank Account'],['VOUCHER_DATE','Voucher Date'],['VOUCHER_NO','Voucher No'],['REFERENCE_NO','DD / Cheque Reference'],['ACCOUNT_HEAD','Account Head'],['DEBIT_AMOUNT','Dr'],['CREDIT_AMOUNT','Cr'],['DISPLAY_RECONCILE_DATE','Reconcile Date (voucher date)'],['ERP_RECONCILE_DATE','Actual ERP Reconcile Date'],['RECONCILIATION_STATUS','ERP Status'],['REMARK','Remark']].map(([key,label])=>({key,label,date:key.endsWith('_DATE')})),
 sql:`SELECT TO_CHAR(d.tno)||':'||TO_CHAR(d.sno) id,v.companycode,d.accountcode bank_code,p.partyname bank_name,
 TO_CHAR(v.voucherdate,'YYYY-MM-DD') voucher_date,v.voucherno voucher_no,
 NVL(d.moneytransferreferenceno,v.moneytransferreferenceno) reference_no,
 (SELECT LISTAGG(ph.partyname,'; ' ON OVERFLOW TRUNCATE) WITHIN GROUP (ORDER BY ph.partyname)
 FROM cmpl.voucherdetail h JOIN cmpl.party ph ON ph.partycode=h.accountcode WHERE h.tno=d.tno AND h.accountcode<>d.accountcode) account_head,
 GREATEST(-NVL(d.amount,0),0) debit_amount,GREATEST(NVL(d.amount,0),0) credit_amount,
 TO_CHAR(v.voucherdate,'YYYY-MM-DD') display_reconcile_date,TO_CHAR(d.reconsilationdate,'YYYY-MM-DD') erp_reconcile_date,
 CASE WHEN d.reconsilationdate IS NULL THEN 'Not reconciled' ELSE 'Reconciled' END reconciliation_status,d.reconsilationremark remark
 FROM cmpl.voucher v JOIN cmpl.voucherdetail d ON d.tno=v.tno JOIN cmpl.party p ON p.partycode=d.accountcode
 WHERE p.partytypecode='BANK' AND v.voucherdate>= TO_DATE(:from_date,'YYYY-MM-DD') AND v.voucherdate< TO_DATE(:to_date,'YYYY-MM-DD')+1
 ORDER BY v.voucherdate,v.tno,d.sno`};

export function reconciliationFilter(bank='',status='unreconciled'){
 if(typeof bank!=='string'||!/^[-\w]{0,40}$/.test(bank)||!['unreconciled','reconciled','both'].includes(status))throw new Error('Choose a valid bank and reconciliation status.');
 return {where:`(:bank_code IS NULL OR r.bank_code=:bank_code) AND (:reconcile_status='both' OR r.reconciliation_status=CASE WHEN :reconcile_status='unreconciled' THEN 'Not reconciled' ELSE 'Reconciled' END)`,binds:{bank_code:bank||null,reconcile_status:status}};
}
