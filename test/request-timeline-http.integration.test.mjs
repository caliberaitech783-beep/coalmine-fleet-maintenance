import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {hashPassword} from '../password-auth.mjs';

const base=process.env.BDMS_AUDIT_BASE_URL,databaseUrl=process.env.BDMS_AUDIT_DATABASE_URL;
const india=value=>new Date(new Date(value).getTime()+19800000).toISOString().slice(0,19);
const pair=value=>{const [date,time]=india(value).split('T');return {date,time};};

test('isolated real PostgreSQL timeline validation, transactional corrections, scoped provenance and reused reference protection',{skip:!base||!databaseUrl},async t=>{
  for(const url of [new URL(base),new URL(databaseUrl)])assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Only loopback fixtures are allowed');
  assert.match(new URL(databaseUrl).pathname,/^\/bdms_audit_[a-z0-9_]+$/);
  const health=await fetch(`${base}/api/health`).then(response=>response.json());
  assert.equal(health.database,'connected');assert.equal(health.scheduledJobsEnabled,false);
  const pool=new pg.Pool({connectionString:databaseUrl});t.after(()=>pool.end());
  const run=Date.now().toString(36),site=`QA timeline ${run}`,otherSite=`QA other ${run}`,password='Local-timeline-fixture-only!';
  const tokens={},logins={};
  async function call(role,method,path,body,status=200){
    const response=await fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json',...(tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const result=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(result).slice(0,300)}`);return result;
  }
  for(const [role,userGroup] of [['production','Production User'],['otherProduction','Production User'],['maintenance','Maintenance User'],['mis','MIS User'],['otherMis','MIS User']]){
    const login=`timeline-${role.toLowerCase()}-${run}`;logins[role]=login;
    const record={login,employee:login,site:role==='otherMis'?otherSite:site,userType:'Mobile User',userGroup,phone:'',mail:'',passwordHash:hashPassword(password)};
    await pool.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1::jsonb)",[JSON.stringify(record)]);
    tokens[role]=(await call(role,'POST','/api/login',{username:login,password})).token;
  }
  const ref=`REQ-TIMELINE-${run}`,door=`TL-${run}`,chassis=`TLC-${run}`;
  const start=india(Date.now()-300000).replace('T',' · ');
  const create=extra=>call('production','POST','/api/requests',{ref,door,chassis,site,complaint:'Isolated timeline test',start,meterType:'HMR',...extra},201);
  const read=()=>call('production','GET',`/api/requests/${ref}/timeline`);
  const raw=async()=> (await pool.query('SELECT id,started_at,accepted_at,expected_completion_at,closed_at,verified_at FROM maintenance_requests WHERE reference=$1',[ref])).rows[0];
  const etc=india(Date.now()+3600000).slice(0,16);
  const edit=extra=>call('maintenance','PATCH',`/api/requests/${ref}`,{complaint:'Isolated timeline test',expectedCompletionAt:etc,meterType:'HMR',...extra});
  let originalId;

  await t.test('future submission and invalid dates are rejected without inserting a request',async()=>{
    for(const badStart of [india(Date.now()+600000).replace('T',' · '),'2026-02-31 · 10:00:00']){
      const result=await call('production','POST','/api/requests',{ref,door,chassis,site,complaint:'Bad timestamp fixture',start:badStart,meterType:'HMR'},400);
      assert.equal(result.code,'INVALID_REQUEST_TIMELINE');assert.equal((await pool.query('SELECT id FROM maintenance_requests WHERE reference=$1',[ref])).rowCount,0);
    }
  });

  await t.test('actual acceptance records system capture separately from user start and planned ETC',async()=>{
    await create({timelineHistory:[{source:'system',actorName:'Forged client'}]});
    originalId=(await raw()).id;
    await edit();
    const result=await read();
    assert.deepEqual(result.history.map(item=>[item.event,item.source]),[['start','user'],['acceptedAt','system'],['expectedCompletionAt','user']]);
    assert.equal(result.history[0].actorLogin,logins.production);assert.equal(result.history[1].actorLogin,logins.maintenance);
    assert.equal(result.events.find(item=>item.event==='acceptedAt').source,'system');
    assert.ok(new Date(result.history[0].recordedAt)>new Date(result.history[0].newValue));
    assert.ok(result.durations.waiting>0);
  });

  await t.test('ETC correction requires a reason and preserves exact original value through failed and successful saves',async()=>{
    // This synthetic legacy ETC has sub-minute precision not visible in the old form.
    const old=new Date(new Date((await raw()).expected_completion_at).getTime()+21321);
    await pool.query('UPDATE maintenance_requests SET expected_completion_at=$1 WHERE reference=$2',[old,ref]);
    const initialHistory=(await read()).history;
    await edit();assert.equal((await raw()).expected_completion_at.getTime(),old.getTime());
    assert.deepEqual((await read()).history,initialHistory);
    const next=india(Date.now()+7200000).slice(0,16);
    const denied=await call('maintenance','PATCH',`/api/requests/${ref}`,{complaint:'Must not be saved',expectedCompletionAt:next,meterType:'HMR',correctionReason:' \n '},400);
    assert.equal(denied.code,'TIMELINE_CORRECTION_REASON_REQUIRED');assert.equal((await raw()).expected_completion_at.getTime(),old.getTime());
    assert.deepEqual((await read()).history,initialHistory);
    await edit({expectedCompletionAt:next,correctionReason:'  Supplier confirmed a later completion  '});
    const history=(await read()).history,last=history.at(-1);
    assert.equal(history.length,initialHistory.length+1);assert.deepEqual(history.slice(0,-1),initialHistory);
    assert.equal(last.oldValue,old.toISOString());assert.equal(last.actorLogin,logins.maintenance);assert.equal(last.reason,'Supplier confirmed a later completion');assert.equal(last.correction,true);
  });

  await t.test('invalid ordering/future closure and first trip never write status or verification',async()=>{
    const accepted=(await raw()).accepted_at;
    const beforeAcceptance=pair(accepted.getTime()-1000),future=pair(Date.now()+600000);
    for(const value of [beforeAcceptance,future]){
      const denied=await call('maintenance','PATCH',`/api/requests/${ref}/close`,{closingDate:value.date,closingTime:value.time,maintenanceWork:'Fixture repair',status:'Closed'},400);
      assert.equal(denied.code,'INVALID_REQUEST_TIMELINE');assert.equal((await raw()).closed_at,null);
    }
    // Whole-second manual fields cannot represent the server's fractional capture.
    // Wait only until a representable valid closing second is in the past.
    const wait=Math.max(0,Math.ceil(accepted.getTime()/1000)*1000-Date.now()+10);
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    const closed=pair(Date.now());
    await call('maintenance','PATCH',`/api/requests/${ref}/close`,{closingDate:closed.date,closingTime:closed.time,maintenanceWork:'Fixture repair',status:'Closed'});
    const closedAt=(await raw()).closed_at;
    for(const value of [pair(closedAt.getTime()-1000),future]){
      const denied=await call('mis','PATCH',`/api/requests/${ref}/verify`,{firstTripDone:true,firstTripDate:value.date,firstTripTime:value.time,firstTripCardImage:'data:image/png;base64,iVBORw==',closingMeterReading:'123'},400);
      assert.equal(denied.code,'INVALID_REQUEST_TIMELINE');assert.equal((await raw()).verified_at,null);
    }
    const firstTrip=pair(Date.now());
    await call('mis','PATCH',`/api/requests/${ref}/verify`,{firstTripDone:true,firstTripDate:firstTrip.date,firstTripTime:firstTrip.time,firstTripCardImage:'data:image/png;base64,iVBORw==',closingMeterReading:'123'});
    const result=await read();
    assert.deepEqual(result.history.slice(-3).map(item=>[item.event,item.source]),[['closedAt','user'],['firstTripAt','user'],['verifiedAt','system']]);
    assert.ok(result.durations.verificationLag>=0);
  });

  await t.test('same-site ownership and other-site denial prevent unauthorized timeline/history reads',async()=>{
    await call('otherProduction','GET',`/api/requests/${ref}/timeline`,undefined,403);
    await call('otherMis','GET',`/api/requests/${ref}/timeline`,undefined,403);
    assert.equal((await call('maintenance','GET',`/api/requests/${ref}/timeline`)).reference,ref);
    assert.equal((await call('mis','GET',`/api/requests/${ref}/timeline`)).reference,ref);
  });

  await t.test('reusing a deleted synthetic reference cannot expose the old immutable request history',async()=>{
    const oldHistory=(await read()).history;assert.ok(oldHistory.length>3);
    // Deletes only this test's exact synthetic request; its append-only audit
    // rows intentionally remain to verify isolation on reference reuse.
    const deletion=await pool.query('DELETE FROM maintenance_requests WHERE id=$1 AND reference=$2 RETURNING id',[originalId,ref]);assert.equal(deletion.rowCount,1);
    await create();const replacement=(await raw()).id;assert.notEqual(replacement,originalId);
    const fresh=await read();assert.equal(fresh.history.length,1);assert.equal(fresh.history[0].event,'start');
    assert.equal(fresh.events.find(item=>item.event==='acceptedAt').source,'unknown');
    assert.ok((await pool.query("SELECT id FROM audit_events WHERE target_reference=$1 AND changed_fields @> $2::jsonb",[ref,JSON.stringify([{requestId:String(originalId)}])])).rowCount>0);
  });

  await t.test('clearing a legacy first-trip time requires a reason and preserves that original value in history',async()=>{
    const oldTrip=new Date(Date.now()-60000);
    await pool.query("UPDATE maintenance_requests SET status='Closed',accepted_at=$1,closed_at=$2,first_trip_at=$3,first_trip_done=TRUE WHERE reference=$4",[new Date(Date.now()-180000),new Date(Date.now()-120000),oldTrip,ref]);
    const body={firstTripDone:false,firstTripCardImage:'data:image/png;base64,iVBORw==',closingMeterReading:'123'};
    const denied=await call('mis','PATCH',`/api/requests/${ref}/verify`,body,400);
    assert.equal(denied.code,'TIMELINE_CORRECTION_REASON_REQUIRED');assert.match(denied.error,/first trip/i);
    assert.equal((await raw()).verified_at,null);
    assert.equal((await pool.query('SELECT first_trip_at FROM maintenance_requests WHERE reference=$1',[ref])).rows[0].first_trip_at.getTime(),oldTrip.getTime());
    await call('mis','PATCH',`/api/requests/${ref}/verify`,{...body,correctionReason:'Legacy trip entry belongs to a different shift.'});
    const correction=(await read()).history.find(item=>item.event==='firstTripAt');
    assert.equal(correction.oldValue,oldTrip.toISOString());assert.equal(correction.newValue,null);assert.equal(correction.correction,true);assert.equal(correction.reason,'Legacy trip entry belongs to a different shift.');
  });
});
