import {formatDisplayDate} from '../date-time-format.mjs';
const money=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
export function ledgerReportColumns() {
 const text=(key,label)=>({key,label,value:row=>row[key]??''});
 const amount=(key,label,source,sign)=>({key,label,value:row=>Math.max(0,sign*Number(row[source]||0)),render:row=>money(Math.max(0,sign*Number(row[source]||0)))});
 return [
  {key:'VOUCHER_DATE',label:'Date',value:row=>formatDisplayDate(row.VOUCHER_DATE),sortValue:row=>row.VOUCHER_DATE},
  text('LOCATIONNAME','Location'),text('COUNTERPART_ACCOUNTS','Account'),text('VOUCHERNO','Voucher No.'),text('BILLNO','Party Bill No.'),
  amount('DEBIT','Amount Dr','AMOUNT',-1),amount('CREDIT','Amount Cr','AMOUNT',1),
  amount('BALANCE_DR','Balance Dr','RUNNING_BALANCE',-1),amount('BALANCE_CR','Balance Cr','RUNNING_BALANCE',1),
  text('NARRATION','Narration'),text('CREATOR_NAME','Created by'),text('CREATOR','ERP login'),text('CREATED_AT','Created date / time (ERP)')
 ];
}
