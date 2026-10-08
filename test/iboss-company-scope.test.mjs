import test from 'node:test';
import assert from 'node:assert/strict';
import {companyCode,companyScopedSql} from '../iboss-company-scope.mjs';
import {DASHBOARD_QUERIES,DASHBOARD_METRICS,dashboardMetric} from '../iboss-dashboard.mjs';

test('company is a bind and all-companies preserves the existing queries',()=>{
 for(const value of [[],{},"1' OR 1=1",'x'.repeat(41)])assert.throws(()=>companyCode(value));
 for(const {sql} of Object.values(DASHBOARD_QUERIES)){
  assert.equal(companyScopedSql(sql,''),sql);
  assert.match(companyScopedSql(sql,'1'),/:company_code/);
  assert.doesNotMatch(companyScopedSql(sql,'1'),/companycode='1'/);
 }
});
test('every dashboard detail carries the same company bind',()=>{
 for(const key of Object.keys(DASHBOARD_METRICS)){
  const q=dashboardMetric(key,{from:'2026-04-01',to:'2026-09-30',company:'4'});
  assert.equal(q.binds.company_code,'4');
  assert.ok(Object.values(q.binds).every(value=>value!==undefined));
 }
});
test('receivables use voucher ownership, preserve cross-company allocations and original rounding',()=>{
 const sql=companyScopedSql(DASHBOARD_QUERIES.receivable.sql,'4');
 assert.match(sql,/b.companycode=:company_code/);
 assert.match(sql,/JOIN cmpl.voucher cc ON cc.tno=aa.crvouchertno/);
 assert.match(sql,/ROUND\(a.amount-NVL\(c.allocatedamount,0\),0\)<>0/);
 assert.match(sql,/HAVING ROUND\(SUM\(x.balanceamount\),3\)<>0/);
 assert.doesNotMatch(sql,/locationcode=:company_code/);
});
