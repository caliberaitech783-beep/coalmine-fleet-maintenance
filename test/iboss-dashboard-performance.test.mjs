import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardCache} from '../iboss-dashboard-cache.mjs';
import {buildDashboard} from '../iboss-dashboard.mjs';
import {mergeDashboardSection} from '../src/iboss-dashboard-sections.mjs';

test('dashboard requests share work, cache for ten minutes and isolate date/section keys',async()=>{
 let time=0,calls=0,release;
 const cached=dashboardCache({now:()=>time});
 const load=()=>{calls++;return new Promise(resolve=>release=resolve);};
 const first=cached('range/core',load),second=cached('range/core',load);
 await Promise.resolve();assert.equal(calls,1);release({value:1});
 assert.deepEqual(await first,await second);
 assert.deepEqual(await cached('range/core',()=>{throw Error('must reuse');}),{value:1});
 assert.equal(await cached('range/tax',()=>2),2);
 assert.equal(await cached('another/core',()=>3),3);
 time=600000;assert.equal(await cached('range/core',()=>4),4);
});
test('failed dashboard loads can retry and cache size stays bounded',async()=>{
 const cached=dashboardCache({maxEntries:1});
 await assert.rejects(cached('a',()=>{throw Error('offline');}));
 assert.equal(await cached('a',()=>1),1);
 await cached('b',()=>2);assert.equal(await cached('a',()=>3),3);
});
test('partial dashboard never claims unloaded receivables are zero and preserves loaded sections',()=>{
 const range={from:'2026-04-01',to:'2026-10-03'};
 const core=buildDashboard({bank:[{BALANCEAMOUNT:100}]},range);
 let state=mergeDashboardSection({},core,'core');
 assert.equal(state.cards.find(c=>c.key==='receivable').amount,null);
 assert.ok(state.aging.every(row=>row.receivable===null));
 const received=buildDashboard({receivable:[{PARTY_CODE:'A',AGE_BAND:'0–30',TOTAL:0,BILLS:2,BALANCE:42}]},range);
 state=mergeDashboardSection(state,received,'receivable');
 assert.equal(state.cards.find(c=>c.key==='bank').amount,100);
 assert.equal(state.cards.find(c=>c.key==='receivable').amount,42);
 state=mergeDashboardSection(state,{tax:[{TAX:'TDS',AMOUNT:9}]},'tax');
 state=mergeDashboardSection(state,core,'core');
 assert.equal(state.cards.find(c=>c.key==='receivable').amount,42);
 assert.equal(state.tax[0].AMOUNT,9);
 assert.equal(state.sectionPending.receivable,true);
});
