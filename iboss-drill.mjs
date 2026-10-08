// Drill-down targets for the Accounts Masters and Transactions reports.
// Each clickable column opens a document trail (see iboss-report-merge.mjs):
// a party, bank, vehicle, voucher, bank guarantee, fixed deposit or loan.
const recordId=row=>String(row.ID??'').split(':')[0];
export const vehicleKey=value=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');

const party=(column,step)=>({chain:'party-position',step,key:row=>row[column]});
const bank=(column,step)=>({chain:'bank-position',step,key:row=>row[column]});
const own=(chain,step,key=recordId)=>({chain,step,key});

export const ACCOUNT_DRILLS={
 'bank-reconciliation':{VOUCHER_NO:own('voucher','voucher'),BANK_CODE:bank('BANK_CODE','bank'),BANK_NAME:bank('BANK_CODE','bank')},
 'account-master':{ACCOUNT_CODE:party('ACCOUNT_CODE','party'),ACCOUNT_NAME:party('ACCOUNT_CODE','party'),PARENT_CODE:party('PARENT_CODE','party'),PARENT_ACCOUNT:party('PARENT_CODE','party')},
 'chart-of-accounts':{ACCOUNT_CODE:party('ACCOUNT_CODE','party'),ACCOUNT_NAME:party('ACCOUNT_CODE','party'),PARENT_CODE:party('PARENT_CODE','party'),PARENT_ACCOUNT:party('PARENT_CODE','party')},
 'vendor-master':{VENDOR_CODE:party('VENDOR_CODE','vendor'),VENDOR_NAME:party('VENDOR_CODE','vendor')},
 'account-opening':{OPENING_NO:party('ACCOUNT_CODE','account-opening'),ACCOUNT_CODE:party('ACCOUNT_CODE','party'),ACCOUNT_NAME:party('ACCOUNT_CODE','party')},
 'day-book':{VOUCHER_NO:own('voucher','voucher'),ACCOUNT_CODE:party('ACCOUNT_CODE','day-book'),ACCOUNT_NAME:party('ACCOUNT_CODE','day-book')},
 'bank-interest':{ACCOUNT_CODE:bank('ACCOUNT_CODE','interest'),ACCOUNT_NAME:bank('ACCOUNT_CODE','interest')},
 'payment-advice':{PAYMENTADVICENO:party('PARTYCODE','payment-advice'),PARTYCODE:party('PARTYCODE','payment-advice'),PARTY_NAME:party('PARTYCODE','payment-advice')},
 'debit-note':{DEBITNOTENO:party('PARTYCODE','debit-note'),PARTYCODE:party('PARTYCODE','debit-note'),PARTY_NAME:party('PARTYCODE','debit-note')},
 'credit-note':{CREDITNOTENO:party('PARTYCODE','credit-note'),PARTYCODE:party('PARTYCODE','credit-note'),PARTY_NAME:party('PARTYCODE','credit-note')},
 'bill-receipt':{DFREIGHTBILLRECEIPTNO:party('ACCOUNTCODE','bill-receipt'),ACCOUNTCODE:party('ACCOUNTCODE','bill-receipt'),PARTY_NAME:party('ACCOUNTCODE','bill-receipt')},
 'payable-receivable':{BILL_NO:party('ACCOUNT_CODE','outstanding'),ACCOUNT_CODE:party('ACCOUNT_CODE','outstanding'),PARTY_NAME:party('ACCOUNT_CODE','outstanding')},
 'outstanding-180':{BILL_NO:party('ACCOUNT_CODE','outstanding-180'),ACCOUNT_CODE:party('ACCOUNT_CODE','outstanding-180'),PARTY_NAME:party('ACCOUNT_CODE','outstanding-180')},
 'tds-payable':{PARTYCODE:party('PARTYCODE','tds-payable'),PARTYNAME:party('PARTYCODE','tds-payable')},
 'tds-receivable':{DFREIGHTBILLRECEIPTNO:party('PARTYCODE','tds-receivable'),PARTYCODE:party('PARTYCODE','tds-receivable'),PARTY_NAME:party('PARTYCODE','tds-receivable')},
 'party-tcs':{PARTYCODE:party('PARTYCODE','party-tcs'),PARTYNAME:party('PARTYCODE','party-tcs')},
 'cash-purchase':{CASHPURCHASENO:party('PARTYCODE','cash-purchase'),PARTYCODE:party('PARTYCODE','cash-purchase'),PARTY_NAME:party('PARTYCODE','cash-purchase')},
 'emi-details':{LOANNO:own('loan-emi','loan'),PARTYCODE:party('PARTYCODE','party'),PARTY_NAME:party('PARTYCODE','party')},
 'fixed-deposit':{FIXEDDEPOSITNO:own('fixed-deposit','fd'),FIXEDDEPOSITACCOUNTCODE:party('FIXEDDEPOSITACCOUNTCODE','party'),PARTY_NAME:party('FIXEDDEPOSITACCOUNTCODE','party')},
 'bank-guarantee':{BANKGAURANTYNO:own('bank-guarantee','bg'),BGNO:own('bank-guarantee','bg'),ISSUEINGBANKCODE:bank('ISSUEINGBANKCODE','bg'),PARTY_NAME:bank('ISSUEINGBANKCODE','bg')},
 'bank-guarantee-closure':{BANKGAURANTYCLOSERNO:own('bank-guarantee','closure',row=>row.BANKGAURANTYTNO),BANKGAURANTYTNO:own('bank-guarantee','bg',row=>row.BANKGAURANTYTNO)},
 'bank-guarantee-commission':{BANKGAURANTYCOMMISSIONNO:own('bank-guarantee','commission',row=>row.BANKGAURANTYTNO),BANKGAURANTYTNO:own('bank-guarantee','bg',row=>row.BANKGAURANTYTNO)},
 'fixed-deposit-interest':{FIXEDDEPOSITINTERESTNO:own('fixed-deposit','interest',row=>row.FIXEDDEPOSITTNO),FIXEDDEPOSITTNO:own('fixed-deposit','fd',row=>row.FIXEDDEPOSITTNO)},
 'fixed-deposit-withdrawal':{FIXEDDEPOSITWITHDRAWLNO:own('fixed-deposit','withdrawal',row=>row.FIXEDDEPOSITTNO),FIXEDDEPOSITTNO:own('fixed-deposit','fd',row=>row.FIXEDDEPOSITTNO)},
 'imprest-balance':{ACCOUNT_CODE:party('ACCOUNT_CODE','imprest'),ACCOUNT_NAME:party('ACCOUNT_CODE','imprest')},
 'internal-balance':{ACCOUNT_CODE:party('ACCOUNT_CODE','internal'),ACCOUNT_NAME:party('ACCOUNT_CODE','internal')},
 'bank-balance':{ACCOUNT_CODE:bank('ACCOUNT_CODE','balance'),ACCOUNT_NAME:bank('ACCOUNT_CODE','balance')},
 'expense-vehicle':{VEHICLENO:own('vehicle-cost','expense',row=>vehicleKey(row.VEHICLENO)),MODULENO:own('vehicle-cost','expense',row=>vehicleKey(row.VEHICLENO))},
 'emi-schedule':{DOORNO:own('vehicle-cost','emi',row=>vehicleKey(row.DOORNO)),AGREEMENTNO:own('vehicle-cost','emi',row=>vehicleKey(row.DOORNO)),PAIDBYPAYMENTADVICENO:own('vehicle-cost','payment',row=>vehicleKey(row.DOORNO))},
 'combined-emi-schedule':{LOANNO:own('loan-emi','instalments')}
};

// The trail to open for one clicked cell, or null when that cell has nothing to drill into.
export function accountDrill(view,columnKey,row){
 const target=ACCOUNT_DRILLS[view]?.[columnKey];
 if(!target)return null;
 const key=String(target.key(row)??'').trim();
 const docNo=String(row[columnKey]??'').trim();
 return key&&docNo?{chain:target.chain,key,focus:{step:target.step,docNo}}:null;
}
