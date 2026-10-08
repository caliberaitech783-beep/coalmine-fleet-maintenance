import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNT_VIEWS} from '../iboss-accounts.mjs';
import {accountPageQuery} from '../iboss-account-pages.mjs';
import {dashboardMetric,DASHBOARD_METRICS} from '../iboss-dashboard.mjs';
import {companyScopedSql} from '../iboss-company-scope.mjs';
import {createAccountPageLoader} from '../src/iboss-account-loader.mjs';
import {recordCountLabel} from '../src/iboss-record-count.mjs';
test('counts wrap the same filtered source without pagination or pagination binds',()=>{
 for(const key of Object.keys(ACCOUNT_VIEWS)){
  const q=accountPageQuery(key,'2026-04-01','2026-09-30',3,'2685');
  assert.ok(q.countSql.includes(ACCOUNT_VIEWS[key].sql));
  assert.doesNotMatch(q.countSql,/bdms_page/);
  assert.equal(q.countBinds.bdms_page_start,undefined);
 }
 for(const key of Object.keys(DASHBOARD_METRICS)){
  const q=dashboardMetric(key,{from:'2026-04-01',to:'2026-09-30',company:'4',page:2});
  assert.equal(q.countBinds.company_code,'4');assert.equal(q.countBinds.row_limit,undefined);
  assert.doesNotMatch(q.countSql,/:row_offset|:row_limit/);
 }
 const q=accountPageQuery('bank-balance','2026-04-01','2026-09-30');
 assert.match(companyScopedSql(q.countSql,'4'),/companycode=:company_code/);
});
const reply=body=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>body});
test('rows render while count is pending and count retains filters',async()=>{
 const states=[],calls=[];let finish;
 const loader=createAccountPageLoader({url:'/api/reports/iboss-accounts/bank-balance?company=4&from=2026-04-01',token:'fixture',onChange:s=>states.push(s),fetchImpl:async url=>{
  calls.push(url);if(url.includes('/count?'))return new Promise(resolve=>finish=resolve);
  return reply({rows:[{ID:'1'}],page:0,hasMore:true});
 }});
 const count=loader.loadCount();await loader.loadMore();assert.equal(states.at(-1).rows.length,1);assert.equal(states.at(-1).totalCount,null);
 assert.match(calls[0],/\/count\?company=4&from=2026-04-01$/);
 finish(reply({totalCount:501}));await count;assert.equal(states.at(-1).totalCount,501);assert.equal(states.at(-1).rows.length,1);
});
test('late canceled counts cannot replace current view; zero differs from unavailable',async()=>{
 const states=[];let finish;const loader=createAccountPageLoader({url:'/api/a?x=1',token:'x',onChange:s=>states.push(s),fetchImpl:()=>new Promise(resolve=>finish=resolve)});
 const pending=loader.loadCount();loader.dispose();finish(reply({totalCount:123}));await pending;
 assert.equal(states.some(s=>s.totalCount===123),false);
 assert.match(recordCountLabel({totalCount:0}),/Total: 0 records/);
 assert.match(recordCountLabel({totalCount:null}),/Counting/);
 assert.match(recordCountLabel({totalCount:null,countError:'Unavailable'}),/Unavailable/);
});
