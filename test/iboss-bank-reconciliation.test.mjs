import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDashboard,dashboardMetric} from '../iboss-dashboard.mjs';
import {BANK_RECONCILIATION_REPORT,BANK_RECONCILIATION_SUMMARY_SQL,reconciliationFilter} from '../iboss-bank-reconciliation.mjs';
import {accountDrill} from '../iboss-drill.mjs';
test('reconciliation card follows bank ledger and preserves signed pass-book balances',()=>{
 const dashboard=buildDashboard({reconciliation:[{PASSBOOK_BALANCE:96609917.84,UNRECONCILED_COUNT:7255},{PASSBOOK_BALANCE:-100,UNRECONCILED_COUNT:2}]});
 assert.deepEqual(dashboard.cards.slice(0,2).map(c=>c.key),['bank','bank-reconciliation']);
 assert.equal(dashboard.cards[1].amount,96609817.84);assert.equal(dashboard.cards[1].count,7257);
 assert.match(BANK_RECONCILIATION_SUMMARY_SQL,/b.balanceamount\+NVL\(t.unclear_dr,0\)-NVL\(t.unclear_cr,0\)/);
});
test('display date does not replace actual ERP reconciliation date or status',()=>{
 const sql=BANK_RECONCILIATION_REPORT.sql;
 assert.match(sql,/TO_CHAR\(v.voucherdate,'YYYY-MM-DD'\) display_reconcile_date/);
 assert.match(sql,/TO_CHAR\(d.reconsilationdate,'YYYY-MM-DD'\) erp_reconcile_date/);
 assert.match(sql,/WHEN d.reconsilationdate IS NULL THEN 'Not reconciled'/);
 assert.doesNotMatch(sql,/\bUPDATE\b|\bINSERT\b/i);
});
test('bank/status/date/company filters apply equally to details and total counts',()=>{
 for(const status of ['unreconciled','reconciled','both']){
  const q=dashboardMetric('bank-reconciliation',{from:'2026-04-01',to:'2026-09-30',company:'1',bank:'2685',status});
  for(const binds of [q.binds,q.countBinds]){assert.equal(binds.bank_code,'2685');assert.equal(binds.reconcile_status,status);assert.equal(binds.company_code,'1');assert.equal(binds.to_date,'2026-09-30');}
 }
 assert.throws(()=>reconciliationFilter("2685' OR 1=1",'both'));assert.throws(()=>reconciliationFilter('2685','anything'));
 assert.equal(reconciliationFilter().binds.bank_code,null);
 const target=accountDrill('bank-reconciliation','VOUCHER_NO',{ID:'123:456',VOUCHER_NO:'PMNT/1'});assert.equal(target.key,'123');assert.equal(target.chain,'voucher');
});
