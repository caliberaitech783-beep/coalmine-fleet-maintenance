import {ledgerReport} from './iboss-bank-ledger.mjs';
// These are the account-group codes verified in the ERP PARTY hierarchy.
export const TRADE_GROUPS={'trade-payable':{root:'SUNDRYCREDITORS',title:'Trade Payables',kind:'payable'},'trade-receivable':{root:'SUNDRYDEBTORS',title:'Trade Receivables',kind:'receivable'}};
export const TRADE_REPORTS=Object.fromEntries(Object.entries(TRADE_GROUPS).map(([key,group])=>{
 const report=ledgerReport(group.title,`p.partycode IN (SELECT h.partycode FROM cmpl.party h START WITH h.partycode='${group.root}' CONNECT BY NOCYCLE PRIOR h.partycode=h.parentcode)`);
 return [key,{...report,note:`ERP ${group.title} group and all child ledgers. ${report.note}`}];
}));
export function tradeCard(key,rows=[]){
 const group=TRADE_GROUPS[key];
 // Oracle ledger sign: credit positive, debit negative. Preserve opposing balances.
 const balance=rows.reduce((sum,row)=>sum+Number(row.BALANCEAMOUNT||0),0);
 return {key,title:group.title,amount:Math.abs(balance),balanceSide:balance<0?'Dr':balance>0?'Cr':'Nil',count:rows.length,kind:group.kind,note:'ERP trade group · net ledger closing through To date'};
}
