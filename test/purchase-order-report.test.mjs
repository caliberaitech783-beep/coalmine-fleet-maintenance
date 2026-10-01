import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PURCHASE_ORDER_SQL,purchaseOrderRange,purchaseOrderRow} from '../purchase-order-report.mjs';

test('purchase order dates reject invalid calendars and reversed ranges',()=>{
  assert.deepEqual(purchaseOrderRange('2024-02-29','2024-03-01'),{from_date:'2024-02-29',to_date:'2024-03-01'});
  for(const [from,to] of [['2026-02-29','2026-03-01'],['2026-13-01','2026-13-02'],['2026-08-02','2026-08-01'],['0000-01-01','2026-01-01'],['','2026-01-01'],[['2026-01-01'],'2026-01-01'],["2026-01-01' OR 1=1",'2026-01-02']])assert.throws(()=>purchaseOrderRange(from,to));
  assert.deepEqual(purchaseOrderRange('2026-08-01','2026-08-01'),{from_date:'2026-08-01',to_date:'2026-08-01'});
});

test('purchase order line identity preserves multiple items on one order and string material codes',()=>{
  const first=purchaseOrderRow({ORDER_ID:42,LINE_ID:1,ORDER_NO:'CMPL/Rev/26-27/004042',MATERIAL_CODE:'0012',ORDER_DATE:'2026-08-01'});
  const second=purchaseOrderRow({ORDER_ID:42,LINE_ID:2,ORDER_NO:first.orderNo});
  assert.notEqual(first.id,second.id);
  assert.equal(first.materialCode,'0012');
  assert.equal(first.orderDate,'2026-08-01');
  assert.equal(second.deliveryDate,'');
  assert.equal(second.vendorName,'');
});

test('purchase order query binds dates, includes the full final day and joins each item specification',()=>{
  assert.match(PURCHASE_ORDER_SQL,/po\.purchaseorderdate >= TO_DATE\(:from_date/);
  assert.match(PURCHASE_ORDER_SQL,/po\.purchaseorderdate < TO_DATE\(:to_date,'YYYY-MM-DD'\) \+ 1/);
  assert.match(PURCHASE_ORDER_SQL,/spec\.tno = item\.tno AND spec\.itemspecificationcode = detail\.itemspecificationcode/);
  assert.match(PURCHASE_ORDER_SQL,/status\.documentstatuscode = detail\.documentstatuscode/);
  assert.doesNotMatch(PURCHASE_ORDER_SQL,/\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i);
});

test('purchase order uses authenticated Oracle data and sits alongside stock under IBOSS',()=>{
  const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const oracle=fs.readFileSync(new URL('../oracle-db.mjs',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../src/purchase-order-report.jsx',import.meta.url),'utf8');
  assert.match(server,/app\.get\('\/api\/reports\/purchase-order',requireSession/);
  assert.match(server,/accessAllows\(permissions\.reportAccess,'Purchase Order'\)/);
  assert.match(main,/const visibleIbossNav = \[\["Stock Statement"[^\n]+\["Purchase Order"/);
  assert.match(main,/<ClockMenu label="IBOSS"[^\n]+items=\{visibleIbossNav\}/);
  assert.match(main,/active === "Purchase Order" \? \(\s*<PurchaseOrderReport/);
  assert.match(oracle,/maxRows:50001/);
  assert.match(oracle,/result\.rows\.length>50000/);
  assert.match(ui,/AbortController/);
  assert.doesNotMatch(ui,/oracledb|CMPLAI|13\.206/);
  assert.equal((ui.match(/key:'[a-zA-Z]+'/g)||[]).length,10);
});
