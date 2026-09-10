import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dashboardFleetSnapshot} from '../dashboard-fleet-snapshot.mjs';
import {liveEquipmentMetrics, fleetChartCounts} from '../dashboard-equipment-metrics.mjs';
import * as access from '../dashboard-equipment-access.mjs';

const assets = Object.freeze([
  Object.freeze({id:1,door:'V-01',chassisNo:'CH-01',category:'Vehicle',currentLocation:'Majri OB',status:'Off road'}),
  Object.freeze({id:2,door:'D-02',chassisNo:'CH-02',category:'Equipment',currentLocation:'Majri II',status:'Idle'}),
  Object.freeze({id:3,door:'V-03',chassisNo:'CH-03',category:'Vehicle',currentLocation:'Sasti OB',status:'Operational'}),
]);
const request = Object.freeze({ref:'TEST-ONLY',door:'V 01',chassis:'CH01',site:'Majri O.B.',status:'Open'});

test('closing the last active request reduces Off road by one without rewriting master data', () => {
  const before = liveEquipmentMetrics(dashboardFleetSnapshot(assets,[request]));
  const after = liveEquipmentMetrics(dashboardFleetSnapshot(assets,[{...request,status:'Closed'}]));
  assert.deepEqual([before.offRoad,before.onRoad,before.total],[1,2,3]);
  assert.deepEqual([after.offRoad,after.onRoad,after.total],[0,3,3]);
  assert.equal(assets[0].status,'Off road');
  assert.equal(request.status,'Open');
  assert.equal('dashboardRoadStatus' in assets[0],false);
});

test('duplicate open requests count one physical asset and closing only one leaves it off road', () => {
  const duplicate={...request,ref:'SECOND'};
  assert.equal(fleetChartCounts(dashboardFleetSnapshot(assets,[request,duplicate])).breakdown.total,1);
  assert.equal(liveEquipmentMetrics(dashboardFleetSnapshot(assets,[{...request,status:'Closed'},duplicate])).offRoad,1);
});

test('Idle is separate from breakdown and manager approval returns the vehicle on road', () => {
  const snapshot=dashboardFleetSnapshot(assets,[{...request,status:'Idle'}]);
  assert.deepEqual([liveEquipmentMetrics(snapshot).idle,fleetChartCounts(snapshot).breakdown.total],[1,0]);
  assert.equal(liveEquipmentMetrics(dashboardFleetSnapshot(assets,[{...request,status:'Closed',idealApprovedAt:'2026-09-10'}])).idle,0);
  assert.equal(liveEquipmentMetrics(dashboardFleetSnapshot(assets,[{...request,status:'Idle'}, {...request,status:'In progress'}])).offRoad,1);
});

test('a uniquely identified transferred vehicle keeps its live status at the current site', () => {
  const rows=dashboardFleetSnapshot(assets,[{...request,site:'Sasti OB'}]);
  assert.equal(rows[0].dashboardRoadStatus,'offroad');
  const scoped=access.scopeDashboardEquipmentRecords(rows,{role:'normal',assignedRole:'MIS User'},{site:'Majri OB'});
  assert.deepEqual(scoped.map(row=>row.id),[1,2]);
  assert.equal(liveEquipmentMetrics(scoped).offRoad,1);
  assert.equal(JSON.stringify(scoped).includes('TEST-ONLY'),false);
});

test('reused doors across sites and conflicting chassis are not silently merged', () => {
  const reused=[...assets,{...assets[0],id:4,chassisNo:'DIFFERENT',currentLocation:'Sasti OB'}];
  let rows=dashboardFleetSnapshot(reused,[request]);
  assert.deepEqual(rows.map(row=>row.dashboardRoadStatus),['offroad','onroad','onroad','onroad']);
  rows=dashboardFleetSnapshot(assets,[{...request,chassis:'CONFLICT'}]);
  assert.equal(rows[0].dashboardRoadStatus,'unknown');
  assert.match(rows[0].dashboardStatusWarning,/identity needs review/);
  const metrics=liveEquipmentMetrics(rows);
  assert.equal(metrics.total,metrics.onRoad+metrics.offRoad+metrics.idle+metrics.unknown);
});

test('ambiguous duplicate master identities require review instead of counting two breakdown vehicles', () => {
  const rows=dashboardFleetSnapshot([assets[0],{...assets[0],id:4}],[request]);
  assert.equal(liveEquipmentMetrics(rows).unknown,2);
  assert.equal(fleetChartCounts(rows).breakdown.total,0);
});

test('excluded trial entries do not affect availability but newer real entries still count', () => {
  const trial={...request,owner:'Stupal Moon',createdAt:'2026-09-09 18:00:00'};
  assert.equal(liveEquipmentMetrics(dashboardFleetSnapshot(assets,[trial])).offRoad,0);
  assert.equal(liveEquipmentMetrics(dashboardFleetSnapshot(assets,[{...trial,createdAt:'2026-09-10 08:00:00'}])).offRoad,1);
});

test('historical recomputation replaces live status metadata without modifying it', () => {
  const today=dashboardFleetSnapshot(assets,[]);
  const past=dashboardFleetSnapshot(today,[request]);
  assert.equal(liveEquipmentMetrics(today).offRoad,0);
  assert.equal(liveEquipmentMetrics(past).offRoad,1);
});

test('actual read-only dashboard route derives status before enforcing every role scope', async () => {
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const route=source.slice(source.indexOf("app.get('/api/dashboard/equipment'"),source.indexOf("app.get('/api/reports/master-data'"));
  let handlers,authorization;
  const queries=[];
  const dependencies={...access,dashboardFleetSnapshot,
    app:{get(path,...registered){assert.equal(path,'/api/dashboard/equipment');handlers=registered;}},
    requireSession(req,res,next){next();},
    currentDashboardAuthorization:async()=>authorization,
    pool:{async query(sql){queries.push(sql);return {rows:sql.includes('master_records')
      ? assets.map(({id,...record_data})=>({id,record_data})) : [{...request,site:'Sasti OB'}]};}},
  };
  new Function(...Object.keys(dependencies),route)(...Object.values(dependencies));
  for(const role of ['Production User','Maintenance User','MIS User','Manager','Admin','Super Admin']){
    const normal=role.endsWith('User');
    authorization={session:normal?{role:'normal',assignedRole:role}:{role:'super',permissions:{adminLevel:role,tabAccess:['Dashboard']}},
      user:normal?{site:'Majri OB'}:role==='Manager'?{managerSites:'Majri OB'}:{}};
    let result,status=200;
    const res={json(value){result=value;return this;},status(value){status=value;return this;}};
    await handlers.at(-1)({session:{}},res,error=>{throw error;});
    assert.equal(status,200,role);
    assert.equal(result.records.length,normal||role==='Manager'?2:3,role);
    assert.equal(liveEquipmentMetrics(result.records).offRoad,1,role);
    assert.equal(JSON.stringify(result).includes('TEST-ONLY'),false,role);
  }
  assert.ok(queries.every(sql=>/^SELECT\b/.test(sql)), 'no database mutation');
  assert.ok(queries.filter(sql=>sql.includes('maintenance_requests')).every(sql=>!sql.includes('remark')&&!sql.includes('opened_by')));
  authorization=null;
  let status;
  await handlers.at(-1)({session:{}},{status(value){status=value;return this;},json(){}},error=>{throw error;});
  assert.equal(status,401);
});
