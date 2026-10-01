import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPoGrnReconciliation,reconciliationMatches} from '../po-grn-reconciliation.mjs';
const range={from:'2026-09-01',to:'2026-09-30'};
const po=(extra={})=>({PO_ID:1,ITEM_CODE:'01',SPECIFICATION_CODE:2,ORDERED_QTY:10,PO_STATUS:'ACTIVE',DUE_DATE:'2026-09-20',VENDOR_CODE:3,...extra});
const grn=(extra={})=>({GRN_ID:1,LINE_ID:1,GRN_NO:'G1',PO_ID:1,ITEM_CODE:'01',SPECIFICATION_CODE:2,GRN_DATE:'2026-09-21',RECEIVED_QTY:3,ACCEPTED_QTY:2,REJECTED_QTY:1,GRN_STATUS:'ACTIVE',VENDOR_CODE:3,...extra});
test('aggregates repeated PO items and multiple receipts without multiplying quantities',()=>{
 const result=buildPoGrnReconciliation([po(),po({ORDERED_QTY:5})],[grn(),grn({GRN_ID:2,GRN_NO:'G2',RECEIVED_QTY:4,REJECTED_QTY:0})],range);
 const row=result.rows[0];
 assert.equal(row.ordered,15);assert.equal(row.received,7);assert.equal(row.pending,8);assert.equal(row.rejected,1);assert.equal(row.grnCount,2);assert.equal(row.overdueDays,10);assert.equal(row.lateReceiptDays,1);
 assert.equal(result.summary.orders,1);assert.equal(result.summary.overdueItems,1);assert.ok(reconciliationMatches(row,'overdue'));
});
test('matches exact item and specification and separates legitimate outside-period POs',()=>{
 const result=buildPoGrnReconciliation([po()],[grn({SPECIFICATION_CODE:9}),grn({PO_ID:7,KNOWN_MATCH:1}),grn({PO_ID:null}),grn({GRN_DATE:'2026-10-01'})],range);
 assert.equal(result.rows[0].received,0);assert.equal(result.summary.brokenPoLines,1);assert.equal(result.summary.withoutPoLines,1);assert.equal(result.summary.outsideCohortLines,1);assert.equal(result.unmatched.length,2);
});
test('excludes cancelled receipts and only flags active outstanding items as overdue',()=>{
 const result=buildPoGrnReconciliation([po(),po({PO_ID:2,PO_STATUS:'CLOSED'}),po({PO_ID:3,DUE_DATE:null})],[grn({GRN_STATUS:'CANCELLED'})],range);
 assert.equal(result.summary.cancelledLines,1);assert.equal(result.rows[0].received,0);assert.equal(result.rows[1].overdueDays,0);assert.equal(result.rows[2].overdueDays,0);assert.match(result.rows[2].flags,/Delivery date missing/);assert.equal(result.summary.pendingItems,2);
});
test('preserves units and exposes over receipts, vendor mismatch and missing statuses',()=>{
 const result=buildPoGrnReconciliation([po({UNIT:'NOS',ORDERED_QTY:0.3}),po({PO_ID:2,UNIT:'LTR'})],[grn({RECEIVED_QTY:0.1,GRN_STATUS:null}),grn({GRN_ID:2,RECEIVED_QTY:0.3,VENDOR_CODE:8})],range);
 assert.equal(result.rows[0].received,0.4);assert.equal(result.rows[0].overReceived,0.1);assert.equal(result.rows[0].pending,0);assert.match(result.rows[0].flags,/Vendor mismatch/);assert.match(result.rows[0].flags,/GRN status missing/);assert.deepEqual(result.rows.map(row=>row.unit),['NOS','LTR']);
 assert.equal(result.vendors[0].overReceivedItems,1);
});
test('includes earlier receipts for selected POs, but does not classify older unlinked lines as period exceptions',()=>{
 const result=buildPoGrnReconciliation([po()],[grn({GRN_DATE:'2026-08-30'}),grn({PO_ID:null,GRN_DATE:'2026-08-30'})],range);
 assert.equal(result.rows[0].received,3);assert.equal(result.unmatched.length,0);
});
test('merged report requires report access and opens through Admin IBOSS',()=>{
 const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.match(server,/app\.get\('\/api\/reports\/po-grn-reconciliation',requireSession/);
 assert.match(server,/accessAllows\(permissions\.reportAccess,'PO-GRN Reconciliation'\)/);
 assert.match(main,/renderedActive === "PO-GRN Reconciliation" \? \(\s*<PoGrnReconciliation/);
});
