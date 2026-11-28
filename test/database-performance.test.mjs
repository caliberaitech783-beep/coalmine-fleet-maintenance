import test from 'node:test';
import assert from 'node:assert/strict';
import {observeDatabaseQueries,requestWorkDuration} from '../database-performance.mjs';
import {protectDeletionPool} from '../deletion-approval.mjs';

test('instrumenting the underlying pool preserves the guarded query path without recursion',async()=>{
  let calls=0;
  const raw={query:async()=>{calls++;return {rows:[1]};}};
  const guarded=protectDeletionPool(raw);
  observeDatabaseQueries(raw,{name:'operational'});
  assert.deepEqual(await guarded.query('SELECT 1'),{rows:[1]});
  assert.equal(calls,1);
});

test('slow database reads retain promise/error behavior and never log SQL or values',async()=>{
  let time=0,fail=false;
  const events=[];
  const failure=Object.assign(new Error('private error text'),{code:'57014'});
  const pool={waitingCount:7,query:async()=>{time+=1500;if(fail)throw failure;return {rows:[1]};}};
  observeDatabaseQueries(pool,{name:'test',now:()=>time,log:e=>events.push(e)});
  assert.deepEqual(await pool.query('SELECT secret FROM private_table WHERE password=$1',['private password']),{rows:[1]});
  fail=true;
  await assert.rejects(pool.query({text:'SELECT secret',values:['private password']}),e=>e===failure);
  assert.equal(events.length,2);
  assert.equal(events[0].waitingAtStart,7);
  assert.equal(events[1].errorCode,'57014');
  assert.doesNotMatch(JSON.stringify(events),/secret|private|password/);
});

test('callback queries preserve their return value and only slow work is recorded',()=>{
  let time=0,slow=false;
  const events=[],result={};
  const pool={query(_sql,callback){time+=slow?1200:20;callback(null,result);return result;}};
  observeDatabaseQueries(pool,{now:()=>time,log:e=>events.push(e)});
  let callbacks=0;
  const callback=(err,value)=>{assert.equal(err,null);assert.equal(value,result);callbacks++;};
  assert.equal(pool.query('SELECT 1',callback),result);
  slow=true;
  assert.equal(pool.query('SELECT 1',callback),result);
  assert.equal(callbacks,2);
  assert.equal(events.length,1);
});

test('intentional long polling is excluded while actual notification work is measured',()=>{
  assert.equal(requestWorkDuration(25100,25000),100);
  assert.equal(requestWorkDuration(28000,25000),3000);
  assert.equal(requestWorkDuration(2000),2000);
});
