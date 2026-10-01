import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GRN_REGISTER_SQL,grnRegisterRow} from '../grn-register.mjs';

test('GRN register retains all item lines under a repeated receipt number',()=>{
  const first=grnRegisterRow({GRN_ID:42,LINE_ID:1,GRN_NO:'CMPL/PUR/26-27/009103',GRN_DATE:'2026-08-03'},0);
  const second=grnRegisterRow({GRN_ID:42,LINE_ID:2,GRN_NO:first.grnNo},1);
  assert.equal(first.serialNo,1);
  assert.equal(second.serialNo,2);
  assert.notEqual(first.id,second.id);
  assert.equal(first.grnNo,second.grnNo);
  assert.equal(first.grnDate,'2026-08-03');
  assert.equal(first.weighmentNo,'');
  assert.equal(first.documentStatus,'');
});

test('GRN register uses the latest receipt status without multiplying item lines',()=>{
  assert.match(GRN_REGISTER_SQL,/modulecode = 'GRN'/);
  assert.match(GRN_REGISTER_SQL,/PARTITION BY moduletno ORDER BY statustime DESC NULLS LAST/);
  assert.match(GRN_REGISTER_SQL,/current_status\.status_rank = 1/);
  assert.match(GRN_REGISTER_SQL,/detail\.tno = grn\.tno/);
  assert.match(GRN_REGISTER_SQL,/material\.tno = grn\.materialintno/);
  assert.match(GRN_REGISTER_SQL,/weight\.tno = grn\.weighmenttno/);
  assert.match(GRN_REGISTER_SQL,/grndate < TO_DATE\(:to_date,'YYYY-MM-DD'\) \+ 1/);
  assert.doesNotMatch(GRN_REGISTER_SQL,/\b(?:UPDATE|INSERT|DELETE|MERGE)\b/i);
});

test('GRN report is permission protected and opens under Admin IBOSS',()=>{
  const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../src/grn-register.jsx',import.meta.url),'utf8');
  assert.match(server,/app\.get\('\/api\/reports\/grn-register',requireSession/);
  assert.match(server,/accessAllows\(permissions\.reportAccess,'GRN Register'\)/);
  assert.match(main,/const visibleIbossNav = [^\n]+\["GRN Register"/);
  assert.match(main,/active === "GRN Register" \? \(\s*<GrnRegister/);
  assert.match(ui,/AbortController/);
  assert.match(ui,/purchaseOrderRange\(draft\.from,draft\.to\)/);
  assert.equal((ui.match(/key:'[a-zA-Z]+'/g)||[]).length,10);
  assert.doesNotMatch(ui,/oracledb|CMPLAI|13\.206/);
});
