import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordsForSite} from '../site-location.mjs';
import {isProductionFirstTripPending} from '../info-pulse-data.mjs';
import {requestWithEquipmentMasterDetails} from '../request-equipment.mjs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const normal=source.slice(source.indexOf('function Normal('),source.indexOf('function App('));
const queueCode=normal.slice(normal.indexOf('  const productionFirstTripSourceRows='),normal.indexOf('  const createLockedByFirstTrip='));
const base={site:'Sasti OB',status:'Closed',start:'2026-09-24 08:00:00',closedAt:'2026-09-24 09:00:00'};
const own={...base,ref:'OWN',requesterLogin:'production-a'};
const colleague={...base,ref:'COLLEAGUE',requesterLogin:'production-b'};
const maintenance={...base,ref:'MAINTENANCE',requesterLogin:'maintenance-a'};
const otherSite={...base,ref:'OTHER-SITE',site:'Jayant OB'};
const completed={...colleague,ref:'DONE',productionFirstTripAt:'2026-09-24 10:00:00'};
function queue(overrides={}) {
  const deps={useMemo:factory=>factory(),needsDedicatedDashboardFeed:true,dashboardRequestsReady:true,
    dashboardRequests:[own,colleague,maintenance,otherSite,completed],assignedLocation:'Sasti OB',equipmentRecords:[],closedRequests:[own],
    recordsForSite,isProductionFirstTripPending,requestWithEquipmentMasterDetails,...overrides};
  return new Function(...Object.keys(deps),`${queueCode};return {pending:productionFirstTripRows,history:productionFirstTripReportRows};`)(...Object.values(deps));
}
test('every production user at the site sees colleagues and maintenance-created first trips',()=>{
  for(const closedRequests of [[own],[colleague],[]]) {
    assert.deepEqual(queue({closedRequests}).pending.map(row=>row.ref),['OWN','COLLEAGUE','MAINTENANCE']);
  }
  assert.deepEqual(queue().history.map(row=>row.ref),['DONE']);
});
test('first-trip queue preserves site scope, rollout and lifecycle rules',()=>{
  assert.deepEqual(queue({assignedLocation:'Jayant OB'}).pending.map(row=>row.ref),['OTHER-SITE']);
  assert.equal(queue({assignedLocation:'Sasti OB | Jayant OB'}).pending.length,4);
  assert.deepEqual(queue({assignedLocation:''}).pending,[]);
  assert.deepEqual(queue({dashboardRequestsReady:false}).pending,[]);
  const rows=[own,{...own,ref:'OPEN',status:'Open'},{...own,ref:'IDLE',status:'Idle'},
    {...own,ref:'NO-CLOSE',closedAt:''},{...own,ref:'OLD',start:'2026-09-21 10:00:00'},completed,
    {...colleague,ref:'LEGACY-MIS',verifiedAt:'2026-09-24 09:30:00'}];
  assert.deepEqual(queue({dashboardRequests:rows}).pending.map(row=>row.ref),['OWN','LEGACY-MIS']);
});
test('embedded workspaces retain their server-scoped request feed',()=>{
  assert.deepEqual(queue({needsDedicatedDashboardFeed:false,closedRequests:[colleague]}).pending.map(row=>row.ref),['COLLEAGUE']);
});
test('saving a colleague first trip immediately updates the shared queue and preserves actor',async()=>{
  const start=normal.indexOf('  const saveProductionFirstTrip =');
  const end=normal.indexOf('\n  };',start)+5;
  let state={token:'session-a',records:[colleague]},dialog=colleague,tab='',notice='';
  const saved={...colleague,productionFirstTripAt:'2026-09-24 10:00:00',productionFirstTripBy:'Production A'};
  const deps={onUpdateRequest:async(ref,payload,action)=>{assert.equal(ref,colleague.ref);assert.equal(action,'production-first-trip');return saved;},
    productionFirstTrip:colleague,needsDedicatedDashboardFeed:true,session:{token:'session-a'},
    setDashboardState:fn=>{state=fn(state);},setProductionFirstTrip:value=>{dialog=value;},setCreatedRequestRef:value=>{notice=value;},setTab:value=>{tab=value;}};
  const save=new Function(...Object.keys(deps),`${normal.slice(start,end)};return saveProductionFirstTrip;`)(...Object.values(deps));
  await save({});
  assert.deepEqual(queue({dashboardRequests:state.records}).pending,[]);
  assert.equal(state.records[0].productionFirstTripBy,'Production A');
  assert.equal(dialog,null);assert.equal(tab,'productionFirstTrip');assert.ok(notice);
});
