import test from 'node:test';import assert from 'node:assert/strict';
import {dashboardMetric} from '../iboss-dashboard.mjs';
import {AGEING_COLUMNS,TRADE_AGE_SUMMARIES,summaryAgeFilter} from '../iboss-trade-age-summary.mjs';
const range={from:'2026-04-01',to:'2026-09-30',company:'1'};
test('summary buckets cover each boundary exactly once with readable headings',()=>{
 assert.deepEqual(AGEING_COLUMNS.slice(0,3).map(x=>x.label),['0 - 30','31 - 60','61 - 90']);
 assert.equal(AGEING_COLUMNS[11].label,'331 - 360');assert.equal(AGEING_COLUMNS[12].label,'Above 360');
 assert.match(summaryAgeFilter('summary:60'),/r.AGE_60<>0/);assert.throws(()=>summaryAgeFilter('summary:bad'));
});
test('both summaries group before pagination and retain scope, age filter and search in count',()=>{
 for(const key of ['trade-payable','trade-receivable']){
 const q=dashboardMetric(key,{...range,ageing:'summary:60',search:'Example',page:1});
 assert.equal(q.view,key+'-ageing-summary');assert.equal(q.binds.to_date,range.to);assert.equal(q.binds.row_offset,200);
 assert.match(q.sql,/GROUP BY e.companycode,e.account_code,e.account_name/);assert.match(q.sql,/r.AGE_60<>0/);assert.match(q.countSql,/r.AGE_60<>0/);
 assert.match(q.sql,/companycode=:company_code/);assert.equal(q.countBinds.search_text,'Example');assert.ok(!('from_date' in q.binds));
 assert.match(q.sql,/Bill date unavailable/);assert.doesNotMatch(q.sql,/Voucher date \(fallback\)/);
 for(const [sql,binds] of [[q.sql,q.binds],[q.countSql,q.countBinds]])assert.deepEqual([...new Set([...sql.matchAll(/:(\w+)/g)].map(m=>m[1]))].sort(),Object.keys(binds).sort());
 }
});
test('receivable debit is positive while payable credit is positive, retaining opposite balances',()=>{
 assert.match(TRADE_AGE_SUMMARIES['trade-payable-ageing-summary'].sql,/SUM\(e.balanceamount\) AS total_outstanding/);
 assert.match(TRADE_AGE_SUMMARIES['trade-receivable-ageing-summary'].sql,/SUM\(-e.balanceamount\) AS total_outstanding/);
});
test('pending bill count is distinct, excludes advances and is placed beside the party',()=>{
 for(const [key,report] of Object.entries(TRADE_AGE_SUMMARIES)){
  assert.match(report.sql,/COUNT\(DISTINCT CASE WHEN -?e.balanceamount>0 THEN e.bill_identity END\) AS bill_count/);
  assert.match(report.sql,/bill_identity IS NULL/);
  assert.equal(report.columns[2].key,'BILL_COUNT');assert.equal(report.columns[2].label,'No. of Bills');assert.equal(report.columns[2].integer,true);
  assert.match(report.sql,/PURCHASEBILL:/);assert.match(report.sql,/JOBBILL:/);
 }
});
