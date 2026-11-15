import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {createMisVehicleTransfers,normalizeMisTransfer} from '../mis-vehicle-transfer.mjs';

async function setup(){
 const db=new PGlite();
 const query=db.query.bind(db);
 const pool={query,connect:async()=>({query,release(){}})};
 await db.exec('CREATE TABLE master_records (id BIGSERIAL PRIMARY KEY, master_name TEXT NOT NULL, record_data JSONB NOT NULL)');
 const insert=async(master,data)=>Number((await query('INSERT INTO master_records (master_name,record_data) VALUES ($1,$2::jsonb) RETURNING id',[master,JSON.stringify(data)])).rows[0].id);
 const vpc=await insert('Equipment master',{door:'VPC40',reg:'MH34AB1234',chassisNo:'CHVPC40',currentLocation:'Sasti OC'});
 const other=await insert('Equipment master',{door:'V77',chassisNo:'CHV77',currentLocation:'Majri'});
 const lmv=await insert('LMV master',{door:'L5',chassisNo:'CHL5',currentLocation:'Majri'});
 let applied=0;
 const service=createMisVehicleTransfers({pool,siteOptions:async()=>['Sasti OC','Majri','Dudhichua East'],afterApply:()=>{applied++;},now:()=>Date.parse('2026-11-16T05:00:00Z')});
 const record=async id=>(await query('SELECT record_data FROM master_records WHERE id=$1',[id])).rows[0].record_data;
 const transfers=async()=>(await query("SELECT id,record_data FROM master_records WHERE master_name='Vehicle transfers' ORDER BY id")).rows;
 return {db,query,insert,service,record,transfers,vpc,other,lmv,applied:()=>applied};
}
const body=(extra={})=>({
 transfer:{transferNo:'VT-1763270000000-A1B2',transferDate:'2026-11-16',source:'Sasti OC',destination:'Majri',equipment:'VPC40',door:'VPC40',reg:'MH34AB1234',chassisNo:'CHVPC40',...extra.transfer},
 people:{submittedBy:'MIS Majri',submittedLogin:'MIS.Majri',sourceApprovedBy:'PM Shasti',destinationMisVerifiedBy:'MIS Majri',destinationAcceptedBy:'PM Majri',destinationAcceptedLogin:'pm.majri',destinationAcceptedAt:'2026-11-16T04:59:00.000Z',...extra.people},
 ...extra.top,
});

test('a Pulse-II transfer moves the vehicle in Pulse and is written to the Pulse register with every stage',async()=>{
 const t=await setup();
 try{
  const result=await t.service.complete(body({top:{equipmentId:t.vpc}}),{by:'pulse.sync'});
  assert.equal(result.replay,false);assert.equal(result.site,'Majri OC');assert.equal(result.previousSite,'Sasti OC');assert.equal(result.equipmentId,String(t.vpc));
  const vehicle=await t.record(t.vpc);
  assert.equal(vehicle.currentLocation,'Majri OC');assert.equal(vehicle.lastTransferNo,'VT-1763270000000-A1B2');assert.equal(vehicle.lastTransferAcceptedBy,'PM Majri');
  const [saved]=await t.transfers();
  assert.equal(saved.record_data.status,'Completed');assert.equal(saved.record_data.origin,'Pulse-II');assert.equal(saved.record_data.originChannel,'pulse.sync');
  assert.equal(saved.record_data.submittedLogin,'mis.majri');assert.equal(saved.record_data.destinationAcceptedBy,'PM Majri');assert.equal(Number(saved.record_data.equipmentMasterId),t.vpc);
  assert.equal(t.applied(),1);
 }finally{await t.db.close();}
});

test('the same transfer number sent again returns the first answer and records nothing twice',async()=>{
 const t=await setup();
 try{
  const first=await t.service.complete(body({top:{equipmentId:t.vpc}}));
  const again=await t.service.complete(body({top:{equipmentId:t.vpc}}));
  assert.equal(again.replay,true);assert.equal(again.pulseTransferId,first.pulseTransferId);assert.equal(again.site,'Majri OC');
  assert.equal((await t.transfers()).length,1);assert.equal(t.applied(),1);
  await assert.rejects(t.service.complete(body({top:{equipmentId:t.vpc},transfer:{destination:'Dudhichua East',source:'Majri'}})),e=>e.status===409&&/already used/.test(e.message));
 }finally{await t.db.close();}
});

test('Pulse refuses when the vehicle is at another site, the site is unknown or a Pulse transfer is open; nothing changes',async()=>{
 const t=await setup();
 try{
  await assert.rejects(t.service.complete(body({top:{equipmentId:t.other},transfer:{destination:'Dudhichua East',door:'V77',chassisNo:'CHV77',reg:'',equipment:'V77'}})),
   e=>e.status===409&&e.site==='Majri OC'&&/Pulse shows V77 at Majri OC, not Sasti OC/.test(e.message));
  await assert.rejects(t.service.complete(body({top:{equipmentId:t.vpc},transfer:{destination:'Nowhere Mine'}})),e=>e.status===404&&/not a site in Pulse/.test(e.message));
  await t.insert('Vehicle transfers',{transferNo:'VT-PULSE-1',equipmentMasterId:t.vpc,status:'Awaiting source approval'});
  await assert.rejects(t.service.complete(body({top:{equipmentId:t.vpc}})),e=>e.status===409&&/VT-PULSE-1 .*still in progress/.test(e.message));
  assert.equal((await t.record(t.vpc)).currentLocation,'Sasti OC');
  assert.equal((await t.transfers()).filter(r=>r.record_data.origin==='Pulse-II').length,0);
  assert.equal(t.applied(),0);
 }finally{await t.db.close();}
});

test('without a Pulse id the vehicle is found by chassis, registration or door; LMV transfers use the LMV master',async()=>{
 const t=await setup();
 try{
  const byChassis=await t.service.complete(body({transfer:{door:'',reg:'',equipment:''}}));
  assert.equal(byChassis.equipmentId,String(t.vpc));
  const lmv=await t.service.complete({transfer:{transferNo:'VT-LMV-1',source:'Majri',destination:'Sasti OC',door:'L5',chassisNo:'CHL5'},people:{destinationAcceptedBy:'PM Sasti'},master:'LMV master'});
  assert.equal(lmv.master,'LMV master');assert.equal((await t.record(t.lmv)).currentLocation,'Sasti OC');
  await assert.rejects(t.service.complete({transfer:{transferNo:'VT-NONE',source:'Majri',destination:'Sasti OC',door:'ZZ9'},people:{destinationAcceptedBy:'PM'}}),e=>e.status===404);
 }finally{await t.db.close();}
});

test('a vehicle already at the destination in Pulse is recorded without moving it',async()=>{
 const t=await setup();
 try{
  const result=await t.service.complete(body({top:{equipmentId:t.other},transfer:{source:'Sasti OC',destination:'Majri',door:'V77',chassisNo:'CHV77',reg:'',equipment:'V77'}}));
  assert.equal(result.alreadyAtDestination,true);assert.equal((await t.record(t.other)).currentLocation,'Majri','not rewritten');
  assert.equal((await t.transfers())[0].record_data.alreadyAtDestination,true);
 }finally{await t.db.close();}
});

test('the request is checked before anything is read',()=>{
 assert.throws(()=>normalizeMisTransfer({transfer:{transferNo:'x',source:'Majri',destination:'Sasti OC'},people:{destinationAcceptedBy:'PM'}}),/transfer number/);
 assert.throws(()=>normalizeMisTransfer({transfer:{transferNo:'VT-1',source:'Majri',destination:'Majri'},people:{destinationAcceptedBy:'PM'}}),/different/);
 assert.throws(()=>normalizeMisTransfer({transfer:{transferNo:'VT-1',source:'Majri',destination:'Sasti OC'},people:{}}),/approved/);
 const ok=normalizeMisTransfer({transfer:{transferNo:'VT-1',source:'Majri',destination:'Sasti OC'},people:{destinationAcceptedBy:'PM'},master:'Something else'},{now:Date.parse('2026-11-15T20:00:00Z')});
 assert.equal(ok.transfer.transferDate,'2026-11-16','missing date = today in IST');assert.equal(ok.master,'Equipment master');assert.equal(ok.route,'workflow');
});
