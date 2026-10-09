import test from 'node:test';import assert from 'node:assert/strict';
import {TRADE_AGE_BANDS,tradeAgeBand,tradeAgeFilter} from '../trade-age-bands.mjs';
import {dashboardMetric} from '../iboss-dashboard.mjs';
import {TRADE_AGE_REPORTS} from '../iboss-trade-ageing.mjs';
const range={from:'2026-04-01',to:'2026-09-30',company:'1'};
test('every 30-day boundary is inclusive once, with older, future and missing dates retained',()=>{
 assert.equal(tradeAgeBand(0),'30');assert.equal(tradeAgeBand(-1),'future');assert.equal(tradeAgeBand(null),'unknown');
 for(let end=30;end<=360;end+=30){assert.equal(tradeAgeBand(end),String(end));assert.equal(tradeAgeBand(end+1),end===360?'older':String(end+30));}
 assert.equal(TRADE_AGE_BANDS.filter(b=>b.min!=null&&b.max!=null).length,12);
 assert.throws(()=>tradeAgeFilter('30 OR 1=1'));
});
test('ageing applies the same scope, search and band to full totals and paged rows',()=>{
 for(const key of ['trade-payable','trade-receivable'])for(const band of TRADE_AGE_BANDS){
  const q=dashboardMetric(key,{...range,ageing:band.value,search:'Example',page:1});
  assert.equal(q.view,key+'-ageing');assert.equal(q.binds.to_date,range.to);assert.equal(q.binds.row_offset,200);assert.equal(q.countBinds.search_text,'Example');
  assert.match(q.countSql,/SUM\(r.balanceamount\) AS SIGNED_TOTAL/);assert.ok(q.sql.includes(tradeAgeFilter(band.value).where));assert.ok(q.countSql.includes(tradeAgeFilter(band.value).where));
  assert.ok(!('from_date' in q.binds),'old opening bills must not be excluded');
  for(const [sql,binds] of [[q.sql,q.binds],[q.countSql,q.countBinds]])assert.deepEqual([...new Set([...sql.matchAll(/:(\w+)/g)].map(m=>m[1]))].sort(),Object.keys(binds).sort());
 }
 assert.equal(dashboardMetric('trade-payable',range).view,'trade-payable');
 assert.throws(()=>dashboardMetric('trade-payable',{...range,ageing:'bad'}));
});
test('historical settlement requires both voucher dates and preserves opposing residuals',()=>{
 for(const report of Object.values(TRADE_AGE_REPORTS)){
  assert.match(report.sql,/dv.voucherdate<TO_DATE\(:to_date/);assert.match(report.sql,/cv.voucherdate<TO_DATE\(:to_date/);
  assert.match(report.sql,/d.amount-NVL\(a.allocated,0\)<>0/);assert.doesNotMatch(report.sql,/SYSDATE|ROUND\(.*balance|INSERT|UPDATE/);
  assert.match(report.sql,/Bill date unavailable/);assert.match(report.sql,/Advance \/ opposite balance/);
 }
});
