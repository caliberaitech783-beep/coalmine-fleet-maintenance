// Oracle ledger amounts are credit-positive and debit-negative.
export function splitLedgerBalance(value){
 const n=Math.round(Number(value||0)*100)/100;
 return {debit:n<0?-n:0,credit:n>0?n:0};
}
export function ledgerFooter(totals){
 const opening=splitLedgerBalance(totals.OPENING_BALANCE);
 const periodDebit=Number(totals.DEBITAMOUNT||0),periodCredit=Number(totals.CREDITAMOUNT||0);
 return {periodDebit,periodCredit,totalDebit:periodDebit+opening.debit,totalCredit:periodCredit+opening.credit};
}
