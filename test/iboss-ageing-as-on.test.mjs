import test from 'node:test';import assert from 'node:assert/strict';
import {ageingAsOnRange} from '../src/iboss-ageing-as-on.mjs';
import {dashboardMetric} from '../iboss-dashboard.mjs';import {tradeAgeBand} from '../trade-age-bands.mjs';
const base={from:'2026-04-01',to:'2026-09-30',company:'1'};
test('custom As on date preserves company and gives both query paths the selected cutoff',()=>{
 for(const metric of ['trade-payable','trade-receivable']){
 const selected=ageingAsOnRange(base,'31-Aug-2026');const q=dashboardMetric(metric,{...selected,ageing:'summary:all'});
 assert.equal(q.binds.to_date,'2026-08-31');assert.equal(q.countBinds.to_date,'2026-08-31');assert.equal(q.binds.company_code,'1');
 assert.match(q.sql,/d.amount-NVL\(a.allocated,0\)<>0/);assert.match(q.sql,/cv.voucherdate<TO_DATE\(:to_date/);
 }
 assert.throws(()=>ageingAsOnRange(base,'31-Feb-2026'),/valid As on date/);
 assert.equal(ageingAsOnRange(base,'31-Mar-2026').from,'2025-04-01');assert.equal(base.to,'2026-09-30');
});
test('two settled bills drop out, two unpaid bills age independently as on 30 Sep',()=>{
 const bills=[{date:'2026-04-01',amount:100,allocated:100},{date:'2026-08-01',amount:200,allocated:200},{date:'2026-08-01',amount:300,allocated:100},{date:'2026-04-01',amount:400,allocated:0}];
 const open=bills.filter(b=>b.amount-b.allocated!==0).map(b=>({remaining:b.amount-b.allocated,band:tradeAgeBand((Date.parse(base.to)-Date.parse(b.date))/86400000)}));
 assert.deepEqual(open,[{remaining:200,band:'60'},{remaining:400,band:'210'}]);
});
