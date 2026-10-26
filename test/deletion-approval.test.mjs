import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {protectDeletionPool,installDeletionApproval,resolveDeletionSelection,destructiveTables,assertDeletionSql} from '../deletion-approval.mjs';
import {createDeletionWhatsApp,DELETION_PHONE} from '../deletion-sms.mjs';
import {housekeepingCategory} from '../data-housekeeping.mjs';
import {restoreDatabase,BACKUP_FORMAT} from '../database-backup.mjs';
import {hashPassword,verifyPassword} from '../password-auth.mjs';

async function fixture(t,{configured=true,deleteOther=false,failDelete=false}={}) {
  const db=new PGlite();
  await db.exec(`CREATE TABLE maintenance_requests(reference TEXT PRIMARY KEY, name TEXT,
    complaint_audio TEXT DEFAULT '',complaint_media JSONB DEFAULT '[]',maintenance_audio TEXT DEFAULT '',first_trip_card_image TEXT DEFAULT '',verified_at TIMESTAMPTZ);
    CREATE TABLE maintenance_daily_remarks(id SERIAL PRIMARY KEY,request_reference TEXT REFERENCES maintenance_requests(reference) ON DELETE CASCADE);
    CREATE TABLE production_first_trip_acceptances(request_reference TEXT PRIMARY KEY REFERENCES maintenance_requests(reference) ON DELETE CASCADE);
    CREATE TABLE request_corrections(id SERIAL PRIMARY KEY,request_reference TEXT);
    CREATE TABLE whatsapp_workflow_dispatches(id SERIAL PRIMARY KEY,request_reference TEXT);
    INSERT INTO maintenance_requests(reference,name) VALUES('TEST-1','Test truck'),('TEST-2','Other truck');
    INSERT INTO maintenance_daily_remarks(request_reference) VALUES('TEST-1');
    INSERT INTO request_corrections(request_reference) VALUES('TEST-1');`);
  // A single in-memory PostgreSQL connection, with a lease to emulate pg.Pool.
  let tail=Promise.resolve();
  async function connect(){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;return {query:async(sql,values)=>{
    const text=typeof sql==='string'?sql:sql.text;
    if(text.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};
    const result=text.includes('CREATE TABLE IF NOT EXISTS deletion_approvals')?(await db.exec(text)).at(-1):await db.query(text,values || sql.values);return {...result,rowCount:result.affectedRows || result.rows.length};
  },release};}
  const rawPool={connect,query:async(...args)=>{const client=await connect();try{return await client.query(...args);}finally{client.release();}}};
  const pool=protectDeletionPool(rawPool),app=express();app.use(express.json());
  const requireSession=(req,res,next)=>{if(!/^Bearer (owner|other)$/.test(req.get('Authorization') || ''))return res.status(401).json({error:'Sign in'});req.session={login:req.get('Authorization'),role:'super'};next();};
  let sent=0,checks=0,executed=0;
  const service=installDeletionApproval(app,{pool,rawPool,requireSession,
    resolveSelection:(req,route,client)=>resolveDeletionSelection(req,route,client,{housekeeping:housekeepingCategory,cutoff:()=>({cutoff:new Date('2026-10-01T00:00:00Z')})}),
    sms:{configured:async()=>configured,send:async()=>{sent++;if(!configured)throw Object.assign(Error('WhatsApp not configured'),{status:503});return {id:'fast2sms-whatsapp:wamid.fictional-request',otpHash:hashPassword('123456')};},check:async(_id,code,otpHash)=>{checks++;return verifyPassword(code,otpHash);}}});
  await service.ready();
  app.delete('/api/requests/:reference',requireSession,async(req,res,next)=>{
    const client=await pool.connect();try{
      await client.query('BEGIN');
      await client.query('DELETE FROM request_corrections WHERE request_reference=$1',[req.params.reference]);
      if(failDelete)throw Object.assign(Error('Simulated operation failure'),{status:409});
      if(deleteOther)await client.query("DELETE FROM maintenance_requests WHERE reference='TEST-2'");
      await client.query('DELETE FROM maintenance_requests WHERE reference=$1',[req.params.reference]);
      await client.query('COMMIT');executed++;res.status(204).end();
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });
  app.post('/api/data-housekeeping/purge',requireSession,async(req,res,next)=>{try{
    await pool.query(housekeepingCategory(req.body.category).purge[0],['2026-10-01T00:00:00Z']);res.json({ok:true});
  }catch(error){next(error);}});
  app.post('/api/unprotected-delete',requireSession,async(req,res,next)=>{try{await pool.query("DELETE FROM maintenance_requests WHERE reference='TEST-2'");res.end();}catch(error){next(error);}});
  app.delete('/api/unknown/:id',requireSession,(_req,res)=>res.end());
  app.use((error,_req,res,_next)=>res.status(error.status || 500).json({error:error.message}));
  const server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();});
  const call=async(path,{method='POST',body,token='owner',approval}={})=>{
    const result=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(approval?{'X-Deletion-Approval':approval}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await result.json().catch(()=>null);return {status:result.status,data};
  };
  const preview=async()=>{const response=await call('/api/requests/TEST-1',{method:'DELETE'});assert.equal(response.status,428,JSON.stringify(response.data));return response.data.deletionApproval;};
  const send=id=>call(`/api/deletion-approvals/${id}/send`,{body:{confirmation:'Approve deletion of the listed items',reason:'Remove fictional test record'}});
  const verify=(id,otp='123456')=>call(`/api/deletion-approvals/${id}/verify`,{body:{otp}});
  return {db,pool,rawPool,call,preview,send,verify,counters:()=>({sent,checks,executed})};
}

test('preview, explicit confirmation and WhatsApp verification are required; approval is single use',async t=>{
  const f=await fixture(t),preview=await f.preview();
  assert.deepEqual(new Set(preview.items.map(row=>row.table)),new Set(['maintenance_requests','maintenance_daily_remarks','request_corrections']));
  assert.equal(f.counters().executed,0);assert.equal(f.counters().sent,0);
  assert.equal((await f.call('/api/requests/TEST-1',{method:'DELETE',approval:preview.id})).status,403);
  assert.equal((await f.call(`/api/deletion-approvals/${preview.id}/send`,{body:{reason:'test'}})).status,400);
  assert.equal((await f.send(preview.id)).status,200);
  assert.equal((await f.verify(preview.id,'000000')).status,400);
  assert.equal((await f.verify(preview.id)).status,200);
  assert.equal((await f.call('/api/requests/TEST-1',{method:'DELETE',approval:preview.id})).status,204);
  assert.equal((await f.db.query("SELECT * FROM maintenance_requests WHERE reference='TEST-1'")).rows.length,0);
  assert.equal((await f.db.query('SELECT * FROM maintenance_daily_remarks')).rows.length,0);
  assert.equal((await f.db.query('SELECT status,outcome FROM deletion_approvals')).rows[0].status,'used');
  assert.equal((await f.call('/api/requests/TEST-1',{method:'DELETE',approval:preview.id})).status,403);
  assert.equal(f.counters().executed,1);
});

test('changed records, changed targets and another session cannot reuse approval',async t=>{
  const f=await fixture(t),p=await f.preview();await f.send(p.id);await f.verify(p.id);
  assert.equal((await f.call('/api/requests/TEST-2',{method:'DELETE',approval:p.id})).status,409);
  assert.equal((await f.call('/api/requests/TEST-1',{method:'DELETE',approval:p.id,token:'other'})).status,403);
  await f.db.query("UPDATE maintenance_requests SET name='Changed' WHERE reference='TEST-1'");
  assert.equal((await f.call('/api/requests/TEST-1',{method:'DELETE',approval:p.id})).status,409);
  assert.equal(f.counters().executed,0);
});

test('attempt limits, expiry and WhatsApp failures fail closed',async t=>{
  const f=await fixture(t),p=await f.preview();await f.send(p.id);
  for(let i=0;i<5;i++)assert.equal((await f.verify(p.id,'000000')).status,400);
  assert.equal((await f.verify(p.id)).status,409);assert.equal(f.counters().checks,5);
  const p2=await f.preview();await f.db.query("UPDATE deletion_approvals SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[p2.id]);
  assert.equal((await f.send(p2.id)).status,410);assert.equal(f.counters().executed,0);
});

test('unconfigured WhatsApp, rate limiting and missing preview adapters cannot delete',async t=>{
  const f=await fixture(t,{configured:false}),p=await f.preview();assert.equal(p.deliveryConfigured,false);
  assert.equal((await f.send(p.id)).status,503);
  const p2=await f.preview();assert.equal((await f.send(p2.id)).status,429);
  assert.equal((await f.call('/api/unprotected-delete')).status,403);
  assert.equal((await f.call('/api/unknown/1',{method:'DELETE'})).status,403);
  assert.equal((await f.db.query('SELECT * FROM maintenance_requests')).rows.length,2);
});

test('concurrent replays execute exactly once',async t=>{
  const f=await fixture(t),p=await f.preview();await f.send(p.id);await f.verify(p.id);
  const responses=await Promise.all([f.call('/api/requests/TEST-1',{method:'DELETE',approval:p.id}),f.call('/api/requests/TEST-1',{method:'DELETE',approval:p.id})]);
  assert.deepEqual(responses.map(row=>row.status).sort(),[204,403]);assert.equal(f.counters().executed,1);
});

test('previously verified Twilio and SMS approvals cannot authorize deletion after the WhatsApp switch',async t=>{
  const f=await fixture(t),p=await f.preview();await f.send(p.id);await f.verify(p.id);
  for(const id of [`VE${'1'.repeat(32)}`,'fast2sms:old-sms-request']){
    await f.db.query('UPDATE deletion_approvals SET provider_sid=$2 WHERE id=$1',[p.id,id]);
    assert.equal((await f.call('/api/requests/TEST-1',{method:'DELETE',approval:p.id})).status,403);
  }
  assert.equal(f.counters().executed,0);
});

test('a handler cannot delete outside its preview, and failures roll back child deletions',async t=>{
  for(const options of [{deleteOther:true},{failDelete:true}]){
    const f=await fixture(t,options),p=await f.preview();await f.send(p.id);await f.verify(p.id);
    assert.equal((await f.call('/api/requests/TEST-1',{method:'DELETE',approval:p.id})).status,409);
    assert.equal((await f.db.query('SELECT * FROM maintenance_requests')).rows.length,2);
    assert.equal((await f.db.query('SELECT * FROM request_corrections')).rows.length,1);
    assert.equal((await f.db.query('SELECT used_at FROM deletion_approvals WHERE id=$1',[p.id])).rows[0].used_at,null);
  }
});

test('media purge requires approval and retains the maintenance request',async t=>{
  const f=await fixture(t);
  await f.db.query("UPDATE maintenance_requests SET verified_at='2026-09-01',complaint_audio='fictional-audio' WHERE reference='TEST-1'");
  const body={category:'media',reason:'Remove fictional old evidence',confirmation:'DELETE'};
  const response=await f.call('/api/data-housekeeping/purge',{body});assert.equal(response.status,428);
  const p=response.data.deletionApproval;assert.equal(p.items.length,1);assert.equal(p.items[0].id,'TEST-1');
  assert.equal((await f.send(p.id)).status,200);assert.equal((await f.verify(p.id)).status,200);
  assert.equal((await f.call('/api/data-housekeeping/purge',{body,approval:p.id})).status,200);
  const {rows:[row]}=await f.db.query("SELECT complaint_audio FROM maintenance_requests WHERE reference='TEST-1'");
  assert.equal(row.complaint_audio,'');
});

test('a no-op unapproved DELETE is never executed; it returns zero without blocking normal workflows',async t=>{
  const f=await fixture(t);
  const result=await f.pool.query("DELETE FROM production_first_trip_acceptances WHERE request_reference='TEST-1'");
  assert.equal(result.rowCount,0);
  await assert.rejects(f.pool.query("DELETE FROM maintenance_requests WHERE reference='TEST-1'"),/blocked/);
});

test('restore cannot import historical OTP grants or erase live approval history',async()=>{
  const db=new PGlite();
  try{
    await db.exec("CREATE TABLE deletion_approvals(id TEXT PRIMARY KEY); INSERT INTO deletion_approvals VALUES('live-approval'); CREATE TABLE example_records(id TEXT PRIMARY KEY); INSERT INTO example_records VALUES('old-record');");
    const records=[{type:'header',format:BACKUP_FORMAT,version:1,tables:['deletion_approvals','example_records']},
      {type:'table',name:'deletion_approvals',columns:[{name:'id'}]},{type:'row',values:['old-reusable-grant']},{type:'table-end',rowCount:1},
      {type:'table',name:'example_records',columns:[{name:'id'}]},{type:'row',values:['restored-record']},{type:'table-end',rowCount:1},{type:'footer'}];
    await restoreDatabase({client:db,records});
    assert.deepEqual((await db.query('SELECT * FROM deletion_approvals')).rows,[{id:'live-approval'}]);
    assert.deepEqual((await db.query('SELECT * FROM example_records')).rows,[{id:'restored-record'}]);
  }finally{await db.close();}
});

test('SQL fence blocks destructive SQL outside an approved execution, while logout remains possible',()=>{
  for(const sql of ['DELETE FROM master_records','WITH gone AS (DELETE FROM audit_events RETURNING *) SELECT * FROM gone','TRUNCATE "master_records", "maintenance_requests" RESTART IDENTITY','DELETE /* note */ FROM published_reports'])assert.throws(()=>assertDeletionSql(sql));
  assert.deepEqual(destructiveTables('TRUNCATE "master_records", "maintenance_requests" RESTART IDENTITY'),['master_records','maintenance_requests']);
  assert.doesNotThrow(()=>assertDeletionSql('DELETE FROM auth_sessions WHERE token=$1'));
});

test('Fast2SMS WhatsApp uses only the fixed owner phone and binds verification to the generated code',async()=>{
  const calls=[];
  const sms=createDeletionWhatsApp({env:{},readSettings:async()=>({providerApiKey:'test-secret',phoneNumberId:'111',businessAccountId:'222'}),fetchImpl:async(url,options)=>{
    calls.push({url,fields:options.body?JSON.parse(options.body):null,headers:options.headers});
    return {ok:true,json:async()=>options.method==='GET'?{data:[{name:'nerve_password_reset_otp',category:'AUTHENTICATION',status:'APPROVED',language:'en_US'}]}:{messaging_product:'whatsapp',messages:[{id:'wamid.fictional-send'}]}};
  }});
  assert.equal(await sms.configured(),true);
  const delivery=await sms.send(),code=calls[1].fields.template.components[0].parameters[0].text;
  assert.equal(calls[1].fields.to,DELETION_PHONE.slice(1));assert.equal(calls[1].fields.messaging_product,'whatsapp');
  assert.equal(calls[1].fields.template.name,'nerve_password_reset_otp');assert.match(code,/^\d{6}$/);
  assert.equal(calls[1].headers.Authorization,'test-secret');assert.ok(!JSON.stringify(delivery).includes(`"${code}"`));
  assert.equal(await sms.check(delivery.id,code,delivery.otpHash),true);
  assert.equal(await sms.check(delivery.id,'bad',delivery.otpHash),false);assert.equal(calls.length,2);
  assert.equal(await sms.check(`VE${'1'.repeat(32)}`,code,delivery.otpHash),false);
  await assert.rejects(createDeletionWhatsApp({env:{}}).send(),/configure/);
});
