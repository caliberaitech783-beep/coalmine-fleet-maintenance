import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFeedCache} from '../request-feed-cache.mjs';
import {scopeInfoPulseRequests} from '../info-pulse-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=server.indexOf("app.get('/api/info-pulse',");
const route=server.slice(start,server.indexOf('\n});',start)+4);

test('concurrent Info Pulse callers share the full read and retain independent history/site scopes',async()=>{
 let handler,reads=0,revision=1;
 const source=[{ref:'A',site:'Sasti OB'},{ref:'B',site:'Jayant OB'}];
 const requestFeedCache=createFeedCache();
 const historyScopes=[];
 const bindings={
  app:{get(_path,_guard,run){handler=run;}},requireSession(){},
  pool:{query:async()=>{reads++;await new Promise(resolve=>setImmediate(resolve));return {rows:source};}},
  infoPulseProjection:'reference AS ref',requestFeedCache,
  currentDashboardAuthorization:async session=>({session:{...session,role:'super'},user:{}}),
  infoPulseRequestScope:session=>({sites:[canonicalSiteName(session.site)],restrictToScope:true}),scopeInfoPulseRequests,
  currentDataRevisions:async()=>({'request-feed':revision}),
  requestsVisibleToSession:rows=>rows,
  attachDailyRemarks:async rows=>{historyScopes.push(rows.map(x=>x.ref));return rows.map(x=>({...x,dailyRemarks:[{remark:x.ref}]}));},
 };
 new Function(...Object.keys(bindings),route)(...Object.values(bindings));
 const read=site=>new Promise((resolve,reject)=>handler({session:{site}},{json:resolve},reject));
 const results=await Promise.all(Array.from({length:30},(_,i)=>read(i%2?'Sasti OB':'Jayant OB')));
 assert.equal(reads,1,'one full scan for thirty simultaneous login prompts');
 results.forEach((body,i)=>assert.deepEqual(body.requests.map(x=>x.ref),[i%2?'A':'B']));
 assert.ok(historyScopes.every(refs=>refs.length===1),'history is loaded only after caller filtering');
 revision++;
 await read('Sasti OB');assert.equal(reads,2,'a database revision refreshes the source');
 requestFeedCache.clear();await read('Jayant OB');assert.equal(reads,3,'application writes invalidate immediately');
 assert.equal(source[0].dailyRemarks,undefined,'per-user enrichment cannot mutate shared rows');
});

