import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ACCOUNT_VIEWS,accountView,accountRecord} from '../iboss-accounts.mjs';
test('Accounts includes every link from the reference in its row order',()=>{
 assert.deepEqual(Object.values(ACCOUNT_VIEWS).map(view=>view.title),['Account Master','Vendor Master','Account Opening Register','Cost Centre Master','Work Centre Master','Chart Of Accounts','Day Book','Bank Interest']);
});
test('only allowlisted views can select Oracle SQL and registers bind dates',()=>{
 for(const view of Object.values(ACCOUNT_VIEWS)){
  assert.doesNotMatch(view.sql,/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|DROP)\b/i);
  if(view.dated){assert.match(view.sql,/:from_date/);assert.match(view.sql,/:to_date/);}
  for(const column of view.columns)assert.ok(column.key&&column.label);
 }
 for(const key of ['__proto__','constructor',"account-master; DROP TABLE party"]){assert.throws(()=>accountView(key),{code:'INVALID_ACCOUNT_VIEW'});}
});
test('records retain account code leading zeros, signed amounts and null metadata',()=>{
 const row=accountRecord({ID:15,ACCOUNT_CODE:'0012',AMOUNT:-42.5,REMARK:null},0);
 assert.equal(row.ID,'15');assert.equal(row.ACCOUNT_CODE,'0012');assert.equal(row.AMOUNT,-42.5);assert.equal(row.REMARK,null);
});
test('Accounts endpoint is session and report permission protected; UI loads live Oracle views',()=>{
 const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../src/iboss-accounts.jsx',import.meta.url),'utf8');
 const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.match(server,/app\.get\('\/api\/reports\/iboss-accounts\/:view',requireSession/);
 assert.match(server,/accessAllows\(permissions\.reportAccess,'Accounts'\)/);
 assert.match(server,/accountView\(req\.params\.view\)/);
 assert.match(ui,/AbortController/);assert.match(ui,/purchaseOrderRange\(draft\.from,draft\.to\)/);
 assert.match(ui,/key==='day-book'.*currentDay=\{from:today,to:today\}/);
 assert.match(main,/renderedActive === "Accounts" \? \(\s*<IbossAccounts/);
 assert.doesNotMatch(ui,/CMPLAI|13\.206|oracledb/);
});
