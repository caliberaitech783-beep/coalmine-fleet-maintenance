import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {addonRepairTypeKey,supportsMaintenanceAddon,createMaintenanceAddon} from '../maintenance-addon.mjs';

test('WGM and both service spellings support add-ons; unrelated repairs do not',()=>{
  for(const value of ['WGM','wgm','Schedule Service','SCHEDULED SERVICE'])assert.equal(supportsMaintenanceAddon(value),true);
  assert.equal(addonRepairTypeKey('Schedule Service'),addonRepairTypeKey('Scheduled Service'));
  assert.equal(supportsMaintenanceAddon('Engine'),false);
});

test('add-on creation and linked closure commit together and roll back together',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE maintenance_requests (
      reference text PRIMARY KEY,equipment_name text,equipment_group text,door_number text,
      registration_number text,chassis_number text,driver_name text,driver_name_source text,
      superior_name text,site text,category text,sub_category text,complaint text,started_at timestamptz,
      acceptance_required boolean,status text,owner_name text,requester_login text,requester_role text,
      meter_type text,request_shift text,linked_request_references jsonb DEFAULT '[]',archived_at timestamptz);
      CREATE TABLE master_records(master_name text,record_data jsonb);
      INSERT INTO master_records VALUES ('Repair type master','{"repairType":"Engine"}'),('Repair type master','{"repairType":"WGM"}'),('Repair type master','{"repairType":"Scheduled Service"}');
      INSERT INTO maintenance_requests(reference,status,linked_request_references) VALUES ('REQ-OLD','Open','["REQ-LINKED"]'),('REQ-LINKED','Open','["REQ-OLD"]');`);
    const projection='reference AS ref,status,door_number AS door,chassis_number AS chassis,site,category,complaint,sub_category AS "subCategory",started_at AS start,linked_request_references AS "linkedRequestReferences"';
    const original={ref:'REQ-OLD',category:'WGM',door:'D17',chassis:'CH17',equipment:'Truck',equipmentGroup:'TIPPER',site:'Mine',meterType:'KMR',closedAt:'2026-10-26T18:00:00+05:30'};
    let failTimeline=false,conflict=null;
    const dependencies={requestProjection:projection,parseRequestTimelineTimestamp:value=>new Date(value),requestShiftLabel:()=> 'Day',
      requestSubCategory:async(_client,category,value)=>{if(category!=='Engine'||value!=='Water Pump')throw Error('Invalid sub-category');return value;},
      activeRequestConflict:async()=>conflict,recordRequestTimeline:async()=>{if(failTimeline)throw Error('Timeline failed');}};
    const req={session:{role:'normal',assignedRole:'Maintenance User',login:'maintenance',name:'Mechanic'},body:{status:'Closed'}};
    const draft={ref:'REQ-ADDON',category:'Engine',subCategory:'Water Pump',complaint:'Coolant leaking'};
    const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
    const helper=source.slice(source.indexOf('async function withLinkedMaintenanceSelection('),source.indexOf("app.post('/api/requests/:reference/daily-remarks'"));
    const client={query:(...args)=>db.query(...args),release(){}};
    const guard=async(request,ref,write,shared=null)=>{
      if(!shared)await db.exec('BEGIN');
      try{const result=await write(client,{},ref);if(!shared)await db.exec('COMMIT');return result;}
      catch(error){if(!shared)await db.exec('ROLLBACK');throw error;}
    };
    const scope={pool:{connect:async()=>client},withMaintenanceArrivalGuard:guard};
    runInNewContext(helper+';globalThis.select=withLinkedMaintenanceSelection;',scope);
    const close=async(client,_before,ref)=>({rows:(await client.query("UPDATE maintenance_requests SET status='Closed' WHERE reference=$1 RETURNING reference AS ref,status",[ref])).rows});
    const save=(body={})=>scope.select({...req,body:{...req.body,...body}},'REQ-OLD',close,client=>createMaintenanceAddon(client,req,original,draft,dependencies));
    const statuses=async()=> (await db.query('SELECT status FROM maintenance_requests ORDER BY reference')).rows.map(row=>row.status);
    draft.subCategory='';await assert.rejects(()=>save(),/sub-category/);assert.deepEqual(await statuses(),['Open','Open']);draft.subCategory='Water Pump';
    draft.category='wgm';await assert.rejects(()=>save(),/different repair type/);assert.deepEqual(await statuses(),['Open','Open']);draft.category='Engine';
    conflict={ref:'REQ-OTHER'};await assert.rejects(()=>save(),/still open/);assert.deepEqual(await statuses(),['Open','Open']);conflict=null;
    failTimeline=true;await assert.rejects(()=>save({targetReferences:['REQ-OLD','REQ-LINKED']}),/Timeline failed/);assert.deepEqual(await statuses(),['Open','Open']);failTimeline=false;
    const saved=await save({targetReferences:['REQ-OLD','REQ-LINKED']});
    assert.equal(saved.rows.length,2);assert.equal(saved.addonRequest.status,'Open');assert.equal(saved.addonRequest.door,'D17');assert.equal(saved.addonRequest.chassis,'CH17');assert.equal(saved.addonRequest.site,'Mine');
    assert.equal(saved.addonRequest.category,'Engine');assert.equal(saved.addonRequest.start.toISOString(),'2026-10-26T12:30:00.000Z');
    assert.deepEqual(await statuses(),['Open','Closed','Closed']);
    assert.deepEqual(saved.addonRequest.linkedRequestReferences,['REQ-OLD']);
    assert.ok((await db.query("SELECT linked_request_references FROM maintenance_requests WHERE reference='REQ-OLD'")).rows[0].linked_request_references.includes('REQ-ADDON'));
    await assert.rejects(()=>save(),/already in use/);assert.equal((await db.query('SELECT count(*)::int AS n FROM maintenance_requests')).rows[0].n,3);
    await assert.rejects(()=>createMaintenanceAddon(client,{...req,session:{assignedRole:'Production User'}},original,draft,dependencies),/Only Maintenance/);
    await assert.rejects(()=>createMaintenanceAddon(client,req,{...original,category:'Engine'},draft,dependencies),/only when closing/);
    await assert.rejects(()=>createMaintenanceAddon(client,{...req,body:{status:'Closed',ideal:true}},original,draft,dependencies),/without marking/);
    await assert.rejects(()=>createMaintenanceAddon(client,req,{...original,category:'Schedule Service'},{...draft,category:'Scheduled Service'},dependencies),/different repair type/);
  }finally{await db.close();}
});
