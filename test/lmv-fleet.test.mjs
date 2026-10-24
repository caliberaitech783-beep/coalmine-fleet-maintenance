import test from 'node:test';
import assert from 'node:assert/strict';
import {REGION_DATA} from '../region-scope.mjs';
import {recordBelongsToSite} from '../site-location.mjs';
import {LMV_DEMO_SEED,lmvDemoRecords,seedLmvDemoRecords,lmvFleetSnapshot,lmvCounts,lmvRowsForMode,lmvSummaryRows} from '../lmv-fleet.mjs';
import {registerLmvFleet} from '../lmv-fleet-api.mjs';
import {fleetSectionExport} from '../src/dashboard-section-export.mjs';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('LMV route and one-time demo seed are wired into the application',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(server,/await seedLmvDemoRecords\(client\)/);
  assert.match(server,/registerLmvFleet\(app,\{pool,requireSession,currentDashboardAuthorization\}\)/);
});

test('real PostgreSQL-compatible SQL stores forty demos once and does not recreate deleted samples',async()=>{
  const db=new PGlite();
  try {
    await db.exec('CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ); CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB)');
    assert.equal(await seedLmvDemoRecords(db),40);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM master_records')).rows[0].count,40);
    await db.query("DELETE FROM master_records WHERE record_data->>'door'=$1",[lmvDemoRecords()[0].door]);
    assert.equal(await seedLmvDemoRecords(db),0);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM master_records')).rows[0].count,39);
  }finally{await db.close();}
});

test('forty unique labelled demo LMVs cover every site with five varied sample states',()=>{
  const records=lmvDemoRecords();
  assert.equal(records.length,40);
  assert.equal(new Set(records.map(record=>record.door)).size,40);
  for(const site of REGION_DATA.flatMap(region=>region.sites)){
    const rows=lmvFleetSnapshot(records.filter(record=>recordBelongsToSite(record,site)));
    assert.deepEqual(lmvCounts(rows),{total:5,onroad:2,idle:1,unknown:0,breakdown:2,oem:1,balance:1,bdPercent:40,demo:5});
    assert.ok(rows.every(record=>record.demo===true&&record.door.startsWith('DEMO-LMV-')));
  }
});

test('demo seeding is durable, idempotent and touches no maintenance requests',async()=>{
  const writes=[];let seeded=false;
  const client={async query(sql,args){writes.push({sql,args});if(sql.startsWith('SELECT'))return {rows:seeded?[{value:'true'}]:[]};if(sql.startsWith('INSERT INTO app_metadata'))seeded=true;return {rows:[]};}};
  assert.equal(await seedLmvDemoRecords(client),40);
  assert.equal(await seedLmvDemoRecords(client),0);
  assert.equal(writes.filter(call=>call.sql.includes('INSERT INTO master_records')).length,40);
  assert.ok(writes.every(call=>!call.sql.includes('maintenance_requests')));
  assert.deepEqual(writes.at(-1).args,[LMV_DEMO_SEED]);
});

test('live LMVs follow open, running, idle and closed requests with explicit OEM precedence',()=>{
  const records=[{id:1,door:'REAL-1',currentLocation:'Sasti OC',chassisNo:'CH-1'}];
  const request={ref:'R1',door:'REAL-1',site:'Sasti OC',chassis:'CH-1',status:'In progress',oemResponsibility:'OEM'};
  let rows=lmvFleetSnapshot(records,[request]);
  assert.equal(rows[0].lmvRoadStatus,'offroad');assert.equal(rows[0].lmvOemBreakdown,true);
  assert.equal(lmvFleetSnapshot(records,[{...request,status:'Running BD'}])[0].lmvRoadStatus,'onroad');
  assert.equal(lmvFleetSnapshot(records,[{...request,status:'Idle'}])[0].lmvRoadStatus,'idle');
  assert.equal(lmvFleetSnapshot(records,[{...request,status:'Closed'}])[0].lmvRoadStatus,'onroad');
  assert.equal(lmvFleetSnapshot(records,[{...request,oemResponsibility:'NON OEM',delayedReason:'OEM spares'}])[0].lmvOemBreakdown,false);
});

test('a demo active request overrides its sample status and ambiguous identities need review',()=>{
  const sample=lmvDemoRecords()[0];
  assert.equal(lmvFleetSnapshot([sample],[{door:sample.door,site:sample.currentLocation,status:'In progress'}])[0].lmvRoadStatus,'offroad');
  const duplicate=[{door:'SAME',currentLocation:'Sasti OC'},{door:'SAME',currentLocation:'Sasti OC'}];
  const rows=lmvFleetSnapshot(duplicate,[{door:'SAME',site:'Sasti OC',status:'In progress'}]);
  assert.equal(lmvCounts(rows).unknown,2);
  assert.equal(lmvCounts(rows).breakdown,0);
});

test('each LMV mode reconciles and percentages use physical LMVs rather than case counts',()=>{
  const rows=lmvFleetSnapshot(lmvDemoRecords());
  assert.equal(lmvRowsForMode(rows,'total').length,40);
  assert.equal(lmvRowsForMode(rows,'breakdown').length,16);
  assert.equal(lmvRowsForMode(rows,'oem').length,8);
  assert.equal(lmvRowsForMode(rows,'balance').length,8);
  assert.equal(lmvRowsForMode(rows,'onroad').length,16);
  assert.equal(lmvRowsForMode(rows,'idle').length,8);
  assert.equal(lmvCounts([]).bdPercent,0);
  const summary=lmvSummaryRows(rows);
  assert.equal(summary.find(row=>row.name==='WCL total').total,25);
  assert.equal(summary.find(row=>row.name==='NCL total').total,15);
  assert.equal(summary.at(-1).breakdown,16);
  assert.equal(summary.at(-1).bdPercent,40);
});

function setupApi({authorization,records=lmvDemoRecords(),requests=[]}) {
  let handler;const queries=[];
  registerLmvFleet({get(_path,_auth,callback){handler=callback;}},{requireSession(){},currentDashboardAuthorization:async()=>authorization,pool:{async query(sql){queries.push(sql);return {rows:sql.includes('FROM master_records')?records.map((record,index)=>({id:index+1,record_data:record})):requests};}}});
  const res={code:200,set(){},vary(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  return {queries,res,async run(){await handler({session:{}},res,error=>{throw error;});return res;}};
}

test('LMV API uses current authorization and limits records to assigned sites',async()=>{
  const api=setupApi({authorization:{session:{role:'normal',assignedRole:'MIS User'},user:{site:'Majri OC'}}});
  const res=await api.run();
  assert.equal(res.code,200);assert.equal(res.data.records.length,5);
  assert.ok(res.data.records.every(record=>recordBelongsToSite(record,'Majri OC')));
  assert.ok(res.data.records.every(record=>!('ref' in record)),'case references never cross a scope boundary');
});

test('LMV API denies missing identities, unsupported roles and unassigned sites before reading fleet',async()=>{
  for(const [authorization,code] of [[null,401],[{session:{role:'normal',assignedRole:'Unknown'},user:{}},403],[{session:{role:'normal',assignedRole:'MIS User'},user:{}},409]]){
    const api=setupApi({authorization});assert.equal((await api.run()).code,code);assert.equal(api.queries.length,0);
  }
});

test('reports-only administrators can read scoped LMV reports without dashboard permission',async()=>{
  const api=setupApi({authorization:{session:{role:'super',permissions:{adminLevel:'Admin',tabAccess:['Reports'],mobileTabAccess:[],dashboardAccess:[]}},user:{}}});
  assert.equal((await api.run()).data.records.length,40);
});

test('Total Fleet exports include separate LMV counts and a combined fleet column',()=>{
  const lmv={total:5,breakdown:2,oem:1,onroad:2,idle:1};
  const site={name:'Sasti OC',equipment:10,vehicles:20,total:30,breakdown:{total:3,equipment:1,vehicles:2},lmv};
  const table=fleetSectionExport({regions:[{...site,code:'WCL',sites:[site]}],totals:site});
  const value=label=>table.columns.find(column=>column.label===label).value(table.rows.at(-1));
  assert.equal(value('Other vehicles / Total LMV'),5);
  assert.equal(value('LMV BD'),2);
  assert.equal(value('LMV BD (%)'),'40.0');
  assert.equal(value('Combined fleet including LMV'),35);
});
