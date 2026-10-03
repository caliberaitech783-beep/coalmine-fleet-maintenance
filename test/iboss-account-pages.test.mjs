import test from 'node:test';import assert from 'node:assert/strict';
import {accountPageQuery,accountPageResult,accountPageNumber,ACCOUNT_PAGE_SIZE} from '../iboss-account-pages.mjs';
import {ACCOUNT_VIEWS} from '../iboss-accounts.mjs';
import {createAccountPageLoader} from '../src/iboss-account-loader.mjs';
test('every Accounts master, transaction and report uses bounded bound-variable pagination',()=>{
 for(const key of Object.keys(ACCOUNT_VIEWS)){
  const result=accountPageQuery(key,'2026-04-01','2026-10-03',2);assert.equal(result.binds.bdms_page_start,1000);assert.equal(result.binds.bdms_page_end,1501);assert.match(result.sql,/ROWNUM<=:bdms_page_end/);assert.match(result.sql,/BDMS_PAGE_ROW>:bdms_page_start/);assert.match(result.sql,/ORDER BY BDMS_PAGE_ROW$/);
 }
 for(const page of [-1,'1.5','1 OR 1=1',[],Infinity,1000001])assert.throws(()=>accountPageNumber(page));
 assert.throws(()=>accountPageQuery('__proto__'));
});
test('lookahead row is withheld, final page detected, fallback IDs use global position',()=>{
 const source=Array.from({length:501},(_,i)=>({BDMS_PAGE_ROW:i+501,VALUE:i}));const page=accountPageResult(source,1);assert.equal(page.hasMore,true);assert.equal(page.rows.length,500);assert.equal(page.rows[0].ID,'500');assert.equal('BDMS_PAGE_ROW' in page.rows[0],false);assert.equal(accountPageResult(source.slice(0,500),1).hasMore,false);assert.equal(accountPageResult([],4).hasMore,false);
});
const response=(rows,page,hasMore)=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({rows,page,hasMore})});
test('lazy loader only requests another batch on demand, retries same page and preserves existing rows',async()=>{
 const calls=[],states=[],replies=[response([{ID:'1'}],0,true),{ok:false,headers:{get:()=> 'application/json'},json:async()=>({error:'Temporary failure'})},response([{ID:'2'}],1,false)];
 const loader=createAccountPageLoader({url:'/api/test?from=2026',token:'fixture',onChange:s=>states.push(s),fetchImpl:async(url,options)=>{calls.push({url,options});return replies.shift();}});
 assert.equal(calls.length,0);await loader.loadMore();assert.equal(calls.length,1);await loader.loadMore();assert.equal(states.at(-1).rows.length,1);assert.equal(states.at(-1).error,'Temporary failure');await loader.loadMore();assert.deepEqual(states.at(-1).rows.map(r=>r.ID),['1','2']);assert.equal(calls[1].url,calls[2].url);await loader.loadMore();assert.equal(calls.length,3);assert.equal(calls[0].options.headers.Authorization,'Bearer fixture');
});
test('duplicate clicks, canceled views and HTML responses cannot replace the current report',async()=>{
 let finish,count=0;const states=[];const loader=createAccountPageLoader({url:'/api/test?x=1',token:'x',onChange:s=>states.push(s),fetchImpl:()=>{count++;return new Promise(r=>finish=r);}});const pending=loader.loadMore();await loader.loadMore();assert.equal(count,1);loader.dispose();finish(response([{ID:'stale'}],0,true));await pending;assert.equal(states.some(s=>s.rows.length),false);
 const failed=[];const html=createAccountPageLoader({url:'/api/test?x=1',token:'x',onChange:s=>failed.push(s),fetchImpl:async()=>({headers:{get:()=> 'text/html'}})});await html.loadMore();assert.match(failed.at(-1).error,/did not return data/);assert.equal(failed.at(-1).loading,false);
});
