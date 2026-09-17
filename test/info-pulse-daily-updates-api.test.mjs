import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {pulseDailyUpdates} from '../src/info-pulse-reasons.mjs';
import {buildInfoPulseBreakdowns} from '../info-pulse-data.mjs';
import {scopeInfoPulseRequests} from '../info-pulse-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const helper = server.slice(server.indexOf('async function attachDailyRemarks('), server.indexOf('async function requestWorkflowWhatsAppLogins('));
const start = server.indexOf("app.get('/api/info-pulse',");
const route = server.slice(start, server.indexOf("app.post('/api/info-pulse/prompt'", start));

async function load({sites = ['Sasti OB'], failRemarks = false, cached = false} = {}) {
  const queries = [];
  const rows = [
    {ref:'WITH-UPDATES', site:'Sasti OB', status:'Open', hasDailyRemarks:true},
    {ref:'EMPTY', site:'Sasti OB', status:'Open', hasDailyRemarks:false},
    {ref:'HIDDEN', site:'Sasti OB', status:'Open'},
    {ref:'OTHER-SITE', site:'Jayant OB', status:'Open'},
  ];
  const pool = {query: async (sql, values) => {
    queries.push({sql, values});
    if (!sql.includes('FROM maintenance_daily_remarks')) return {rows};
    if (failRemarks) throw new Error('History unavailable');
    return {rows:[
      {requestReference:'WITH-UPDATES', remark:'Compressor inspected', delayedReason:'Waiting for parts', authorName:'Maintenance team', createdAt:'2026-09-17 09:00'},
      {requestReference:'WITH-UPDATES', remark:'Parts ordered', delayReason:'Vendor delay', authorName:'Site team', createdAt:'2026-09-16 18:00'},
    ]};
  }};
  let handler, body, failure, cacheNamespace;
  const deps = {
    pool, infoPulseProjection:'reference AS ref', requireSession(){},
    app:{get(path, ...handlers){handler=handlers.at(-1);}},
    currentDashboardAuthorization:async()=>({session:{role:'super'}, user:{}}),
    infoPulseRequestScope:()=>({sites:sites.map(canonicalSiteName), restrictToScope:true}), scopeInfoPulseRequests,
    requestsVisibleToSession:rows=>rows.filter(row=>row.ref!=='HIDDEN'),
    ...(cached ? {sendPrivateJson(req,res,namespace,payload){cacheNamespace=namespace;res.json(payload);}} : {}),
  };
  new Function(...Object.keys(deps), `${helper}\n${route}`)(...Object.values(deps));
  await handler({session:{}}, {json(value){body=value;}}, error=>{failure=error;});
  return {queries, body, failure, cacheNamespace};
}

test('Info Pulse returns saved daily history through the actual route and attachment helper', async()=>{
  for (const cached of [false,true]) {
    const {queries,body,failure,cacheNamespace}=await load({cached});
    assert.equal(failure,undefined);
    assert.deepEqual(body.requests.map(row=>row.ref),['WITH-UPDATES','EMPTY']);
    assert.deepEqual(queries[1].values,[['WITH-UPDATES','EMPTY']], 'history lookup follows both visibility filters');
    const row=buildInfoPulseBreakdowns(body.requests).find(row=>row.request.ref==='WITH-UPDATES');
    const updates=pulseDailyUpdates(row.request.dailyRemarks);
    assert.equal(updates.length,2);
    assert.equal(updates[0].remark,'Compressor inspected');
    assert.equal(updates[0].delayReason,'Waiting for parts');
    assert.equal(updates[0].author,'Maintenance team');
    assert.equal(updates[1].delayReason,'Vendor delay');
    assert.deepEqual(body.requests[1].dailyRemarks,[]);
    assert.equal(cacheNamespace,cached?'info-pulse':undefined);
  }
});

test('an empty permitted scope does not query other requests’ history', async()=>{
  const {queries,body}=await load({sites:[]});
  assert.deepEqual(body.requests,[]);
  assert.equal(queries.length,1);
});

test('failed history loading fails the feed instead of returning misleading zero counts', async()=>{
  const {body,failure}=await load({failRemarks:true});
  assert.equal(body,undefined);
  assert.equal(failure.message,'History unavailable');
});
