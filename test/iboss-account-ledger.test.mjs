import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {accountLedgerQueries} from '../iboss-account-ledger.mjs';
const input={account:'5990',company:'1',from:'2026-04-01',to:'2026-09-30'};
test('ledger binds account and company and calculates running balance before period filtering',()=>{
 const q=accountLedgerQueries({...input,page:2});assert.equal(q.rows.binds.offset,400);assert.equal(q.rows.binds.limit,201);assert.equal(q.rows.binds.account,'5990');assert.equal(q.rows.binds.company_code,'1');assert.equal(q.rows.binds.MI,undefined);assert.ok(!Object.keys(q.rows.binds).includes('MI'));
 assert.match(q.rows.sql,/SUM\(NVL\(d.amount,0\)\) OVER/);assert.match(q.rows.sql,/ROWS UNBOUNDED PRECEDING/);assert.ok(q.rows.sql.indexOf('running_balance')<q.rows.sql.indexOf('WHERE r.voucherdate>='));assert.match(q.rows.sql,/companycode=:company_code/);assert.doesNotMatch(q.balances.sql,/accountopening|accountbalance/i);
 assert.doesNotMatch(q.count.sql,/OFFSET/i);assert.doesNotMatch(q.balances.sql,/OFFSET/i);assert.match(q.rows.sql,/creationtime/);assert.match(q.rows.sql,/employee/);
});
test('ledger rejects invalid range, account, company and page',()=>{
 for(const bad of [{account:''},{account:[]},{company:'1 OR 1=1'},{page:-1},{page:1.5},{from:'2026-10-01'}])assert.throws(()=>accountLedgerQueries({...input,...bad}));
});
test('trade account name and code open mounted ledger retaining row company and selected range',()=>{
 const s=readFileSync(new URL('../src/iboss-dashboard.jsx',import.meta.url),'utf8');assert.match(s,/\['ACCOUNT_NAME','ACCOUNT_CODE'\].includes\(column.key\)/);assert.match(s,/row.COMPANYCODE\|\|range.company/);assert.match(s,/<AccountLedger \{\.\.\.ledger\} range=\{range\}/);
 const ui=readFileSync(new URL('../src/iboss-account-ledger.jsx',import.meta.url),'utf8');assert.match(ui,/key:String\(r.TNO\)/);assert.match(ui,/CREATOR_NAME/);assert.match(ui,/CREATED_AT/);assert.match(ui,/RUNNING_BALANCE/);
});
