import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {STOCK_STATEMENT_SQL,stockStatementRow} from '../stock-statement.mjs';

test('stock statement is removed from the top-level IBOSS dropdown',()=>{
  const source=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const adminMenu=source.slice(source.indexOf('{canViewAdmin && <div'),source.indexOf('{(canViewDirectory ||'));
  assert.doesNotMatch(adminMenu,/IBOSS|visibleIbossNav/);
  assert.match(source,/className="masters-dropdown iboss-dropdown"/);
  assert.doesNotMatch(source,/const visibleIbossNav = [^\n]+\["Stock Statement"/);
  assert.match(source,/selectDropdownPage\(name,event,setIbossSelectionClosed\)/);
  assert.match(source,/visibleIbossNav\.some\(\(\[name\]\) => name === active\)/);
  assert.doesNotMatch(source,/data-nav="stock-statement"/);
});

test('stock statement preserves item codes and optional metadata with only visible columns',()=>{
  const row=stockStatementRow({LOCATION:'AMRAPALI',ITEM_CODE:'0012'},4);
  assert.equal(row.serialNo,5);
  assert.equal(row.itemCode,'0012');
  assert.equal(row.specification,'');
  assert.equal(Object.keys(row).length,9);
});

test('stock query joins item groups and specifications by their full identity',()=>{
  assert.match(STOCK_STATEMENT_SQL,/itemgroup\.itemcode = item\.parentcode/);
  assert.match(STOCK_STATEMENT_SQL,/spec\.tno = item\.tno AND spec\.itemspecificationcode = balance\.itemspecificationcode/);
  assert.match(STOCK_STATEMENT_SQL,/SELECT DISTINCT locationcode, itemcode, itemspecificationcode/);
  assert.doesNotMatch(STOCK_STATEMENT_SQL,/\b(?:INSERT|DELETE|UPDATE|MERGE)\b/i);
});

test('stock statement is an authenticated report with server-only Oracle access',()=>{
  const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const client=fs.readFileSync(new URL('../src/stock-statement.jsx',import.meta.url),'utf8');
  assert.match(server,/app\.get\('\/api\/reports\/stock-statement',requireSession/);
  assert.match(server,/accessAllows\(permissions\.reportAccess,'Stock Statement'\)/);
  assert.match(client,/AbortController/);
  assert.match(client,/ReportSection/);
  assert.doesNotMatch(client,/oracledb|CMPLAI|13\.206/);
});
