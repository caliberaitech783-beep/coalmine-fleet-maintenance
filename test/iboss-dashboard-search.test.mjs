import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardMetric,DASHBOARD_METRICS} from '../iboss-dashboard.mjs';
import {accountView} from '../iboss-accounts.mjs';
const range={from:'2026-04-01',to:'2026-09-30',company:'1'};
test('dashboard search applies to the full source and count before pagination, with bound literal text',()=>{
 for(const key of Object.keys(DASHBOARD_METRICS)){
  const q=dashboardMetric(key,{...range,search:" test%'_ ",page:2});
  assert.equal(q.binds.search_text,"test%'_");assert.equal(q.countBinds.search_text,q.binds.search_text);
  assert.match(q.countSql,/INSTR\(LOWER\(CAST\(r\./);
  assert.ok(q.sql.indexOf('LOWER(:search_text)')<q.sql.indexOf('OFFSET :row_offset'));
  assert.equal(q.binds.row_offset,400);assert.doesNotMatch(q.sql,/test%/);
  for(const [sql,binds] of [[q.sql,q.binds],[q.countSql,q.countBinds]])assert.deepEqual([...new Set([...sql.matchAll(/:(\w+)/g)].map(m=>m[1]))].sort(),Object.keys(binds).sort());
 }
 assert.throws(()=>dashboardMetric('payable',{...range,search:[]}));
 assert.throws(()=>dashboardMetric('payable',{...range,search:'a'.repeat(121)}));
 assert.ok(!('search_text' in dashboardMetric('payable',{...range,search:'  '}).binds));
});
test('payable and receivable reports expose separate master account name and source party details',()=>{
 for(const key of ['payable-receivable','outstanding-180']){
  const view=accountView(key);
  assert.deepEqual(view.columns.slice(0,3).map(c=>c.label),['Account Code','Account Name','Party Name']);
  assert.match(view.sql,/SELECT MAX\(p.partyname\).*p.partycode=a.vendorcode/);
  assert.match(view.sql,/a.vendorname AS party_name/);
  assert.match(view.sql,/a.voucherno AS voucher_no/);
  assert.match(view.sql,/a.supplierinvoiceno AS supplier_invoice_no/);
  assert.match(view.sql,/a.outstanding AS balance/);
 }
});
test('current outstanding details retain undated bills and use the same open-bill scope as the card',()=>{
 for(const key of ['payable','receivable']){
  const q=dashboardMetric(key,range);
  assert.ok(!('from_date' in q.binds));assert.ok(!('to_date' in q.binds));
  assert.doesNotMatch(q.sql,/a\.documentdate >=|a\.voucherdate >=/);
 }
});
