import test from 'node:test';import assert from 'node:assert/strict';
import {BANK_LEDGER_REPORT,bankLedgerSql} from '../iboss-bank-ledger.mjs';
import {accountPageQuery} from '../iboss-account-pages.mjs';
import {dashboardMetric,DASHBOARD_QUERIES} from '../iboss-dashboard.mjs';
import {mergeStatements} from '../iboss-report-merge.mjs';
test('bank closing uses voucher history once with inclusive selected end date and explicit debit/credit',()=>{
 const sql=bankLedgerSql(true);assert.match(sql,/v.voucherdate< TO_DATE\(:to_date,'YYYY-MM-DD'\)\+1/);assert.match(sql,/:to_date AS snapshot_date/);assert.match(sql,/d.accountcode=:anchor_key/);assert.doesNotMatch(sql,/cmpl.accountbalance|cmpl.accountopening/i);
 assert.match(sql,/d.amount<0 THEN -d.amount/);assert.match(sql,/GREATEST\(-SUM\(NVL\(d.amount,0\)\),0\) AS closing_debit/);assert.match(sql,/GROUP BY v.companycode,d.accountcode/);
 assert.equal(BANK_LEDGER_REPORT.dated,true);assert.equal(BANK_LEDGER_REPORT.asOf,undefined);
});
test('list dashboard and keyed drill all retain the requested period',()=>{
 const from='2026-04-01',to='2026-09-30';const list=accountPageQuery('bank-balance',from,to);assert.equal(list.binds.from_date,from);assert.equal(list.binds.to_date,to);
 const dashboard=dashboardMetric('bank',{from,to});assert.equal(dashboard.binds.from_date,from);assert.equal(dashboard.binds.to_date,to);assert.equal(DASHBOARD_QUERIES.bank.sql,bankLedgerSql());
 const [drill]=mergeStatements('bank-position',['balance'],{from,to,anchorKey:'2683'});assert.deepEqual(drill.binds,{to_date:to,from_date:from,anchor_key:'2683'});assert.match(drill.sql,/b.snapshot_date AS doc_date/);
});

test('all account and vendor closing queries share ledger dates and never select stored year-end balances',()=>{
 for(const view of ['chat-vendor-closing','chat-account-closing','chat-account-balances','internal-balance','imprest-balance']){
  const q=accountPageQuery(view,'2026-04-01','2026-09-30',0,'2683');assert.equal(q.binds.from_date,'2026-04-01');assert.equal(q.binds.to_date,'2026-09-30');assert.doesNotMatch(q.sql,/cmpl.accountbalance|ROW_NUMBER/);assert.match(q.sql,/:to_date AS snapshot_date/);
 }
});
