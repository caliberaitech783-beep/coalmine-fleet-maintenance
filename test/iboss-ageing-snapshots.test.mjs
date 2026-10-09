import test from 'node:test';import assert from 'node:assert/strict';
import {ageingSnapshots,ageingSummaryResult} from '../iboss-ageing-snapshots.mjs';
import {accountsResponse,fetchAccountsReport} from '../src/iboss-accounts-response.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
test('slow table and count requests share one background query and expire together',async()=>{
 let time=0,calls=0,finish;const poll=ageingSnapshots({now:()=>time,ttl:10});const load=()=>{calls++;return new Promise(r=>finish=r);};
 assert.equal(poll('payable:1:date',load),null);assert.equal(poll('payable:1:date',load),null);await tick();assert.equal(calls,1);
 finish([{ACCOUNT_CODE:'1'}]);await tick();assert.equal(poll('payable:1:date',load).length,1);
 time=11;assert.equal(poll('payable:1:date',load),null);await tick();assert.equal(calls,2);finish([]);await tick();assert.deepEqual(poll('payable:1:date',load),[]);
});
test('background errors are surfaced and pending reports are not evicted into duplicate loads',async()=>{
 const poll=ageingSnapshots({maxEntries:1});poll('1',()=>new Promise(()=>{}));assert.throws(()=>poll('2',()=>[]),/busy/);
 const fail=ageingSnapshots();fail('a',()=>{throw Error('Oracle unavailable');});await tick();assert.throws(()=>fail('a',()=>[]),/Oracle unavailable/);
});
test('search, age selection, totals and page all use the same company-scoped rows',()=>{
 const rows=[{COMPANYCODE:'1',ACCOUNT_CODE:'1',ACCOUNT_NAME:'Alpha',AGE_30:100,BALANCEAMOUNT:100,OUTSTANDING_CR:100},{COMPANYCODE:'1',ACCOUNT_CODE:'2',ACCOUNT_NAME:'Beta',AGE_30:-20,BALANCEAMOUNT:-20,OUTSTANDING_DR:20},{COMPANYCODE:'1',ACCOUNT_CODE:'3',ACCOUNT_NAME:'Zero',AGE_30:0}];
 const q={columns:[{key:'ACCOUNT_NAME'},{key:'ACCOUNT_CODE'}],page:1};const input={ageing:'summary:30',search:''};
 assert.deepEqual(ageingSummaryResult(rows,q,input,{count:true}),{totalCount:2,totalDr:20,totalCr:100,signedTotal:80});
 const page=ageingSummaryResult(rows,q,input,{pageSize:1});assert.equal(page.rows[0].ACCOUNT_NAME,'Beta');assert.equal(page.hasMore,false);
 assert.equal(ageingSummaryResult(rows,q,{...input,search:'ALPHA'},{count:true}).totalCount,1);
});
test('HTML proxy responses produce a useful error instead of a JSON parse exception',async()=>{
 await assert.rejects(accountsResponse(new Response('<!DOCTYPE html>',{status:504})),/temporarily unavailable or timed out/);
 await assert.rejects(accountsResponse(new Response('<html>',{status:401})),/session has expired/);
});
test('client waits for pending reports and returns final data without losing fetch options',async()=>{
 let calls=0;const options={signal:new AbortController().signal,headers:{Authorization:'test'}};
 const result=await fetchAccountsReport('/report',options,{fetcher:async(url,opt)=>{assert.equal(opt,options);return new Response(JSON.stringify(++calls<3?{pending:true}:{rows:[1]}));},pause:async()=>{}});
 assert.deepEqual(result,{rows:[1]});assert.equal(calls,3);
 await assert.rejects(fetchAccountsReport('/report',options,{fetcher:async()=>new Response('{"pending":true}'),pause:async()=>{},attempts:2}),/longer than expected/);
});
