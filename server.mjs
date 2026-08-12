import express from 'express';
import pg from 'pg';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync,readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {matchesRequestedRole} from './auth-role.mjs';
import {createSessionStore} from './auth-session.mjs';
import {parseIndiaRequestDateTime} from './request-time.mjs';
import {hashPassword,initializeUserCredentials,publicUserRecord,verifyPassword} from './password-auth.mjs';

const {Pool}=pg;
const app=express();
const port=Number(process.env.PORT||3000);
const root=path.dirname(fileURLToPath(import.meta.url));
const staticRoot=existsSync(path.join(root,'dist','index.html'))?path.join(root,'dist'):root;
const versionFile=path.join(staticRoot,'app-version.txt');
const currentAppVersion=existsSync(versionFile)
  ? readFileSync(versionFile,'utf8').trim()
  : createHash('sha256').update(readFileSync(path.join(staticRoot,'index.html'))).digest('hex').slice(0,16);
const connectionString=process.env.DATABASE_URL;

const pool=new Pool({
  connectionString:connectionString||undefined,
  ssl:{rejectUnauthorized:false},
  max:10,
  idleTimeoutMillis:30000,
  connectionTimeoutMillis:10000
});
const sessionStore=createSessionStore(pool);
let databaseReady=false;
let databaseError='Database initialization is pending.';

async function migrate(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id BIGSERIAL PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      door_number TEXT NOT NULL,
      registration_number TEXT NOT NULL DEFAULT '',
      site TEXT NOT NULL DEFAULT 'Not assigned',
      category TEXT NOT NULL DEFAULT 'Maintenance request',
      complaint TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'Open',
      owner_name TEXT NOT NULL DEFAULT 'Normal User',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS maintenance_requests_created_at_idx
      ON maintenance_requests (created_at DESC);
    CREATE TABLE IF NOT EXISTS master_records (
      id BIGSERIAL PRIMARY KEY,
      master_name TEXT NOT NULL,
      record_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS master_records_master_name_idx
      ON master_records (master_name, created_at DESC);
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token UUID PRIMARY KEY,
      role TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS password_change_sessions (
      token UUID PRIMARY KEY,
      master_record_id BIGINT NOT NULL REFERENCES master_records(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS whatsapp_alert_history (
      id BIGSERIAL PRIMARY KEY,
      report_type TEXT NOT NULL,
      target_name TEXT NOT NULL,
      report_level TEXT NOT NULL DEFAULT '',
      recipient_name TEXT NOT NULL DEFAULT '',
      recipient_phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Prepared',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS whatsapp_alert_history_created_at_idx
      ON whatsapp_alert_history (created_at DESC);
  `);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows}=await client.query("SELECT value FROM app_metadata WHERE key='ui_version' FOR UPDATE");
    if(rows[0]?.value!==currentAppVersion){
      await client.query('DELETE FROM auth_sessions');
      await client.query(`INSERT INTO app_metadata (key,value,updated_at) VALUES ('ui_version',$1,NOW())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[currentAppVersion]);
    }
    await client.query('COMMIT');
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{client.release()}
}

app.use(express.json({limit:'256kb'}));

app.get('/api/app-version',(_req,res)=>{
  res.set('Cache-Control','no-store, no-cache, must-revalidate');
  res.json({version:currentAppVersion});
});

app.post('/api/login',async(req,res,next)=>{
  try{
    const username=String(req.body?.username||'').trim().toLowerCase();
    const password=String(req.body?.password||'').trim();
    const requestedRole=req.body?.role==='normal'?'normal':'super';
    if(!username||!password)return res.status(400).json({error:'Employee first name and phone number are required.'});
    const {rows}=await pool.query(`SELECT id,record_data FROM master_records WHERE master_name='Users & employees'`);
    const employeeRow=rows.find(row=>{
      const record=row.record_data;
      const firstName=String(record.employee||'').trim().split(/\s+/)[0].toLowerCase();
      const roleMatches=matchesRequestedRole(record.userType||record.role,requestedRole);
      const passwordMatches=record.passwordHash
        ? verifyPassword(password,record.passwordHash)
        : String(record.phone||'').trim()===password;
      return firstName===username&&passwordMatches&&roleMatches;
    });
    if(!employeeRow)return res.status(401).json({error:'Invalid employee first name, password, or access type.'});
    const employee=employeeRow.record_data;
    if(employee.mustChangePassword===true){
      const changeToken=randomUUID();
      await pool.query(`INSERT INTO password_change_sessions (token,master_record_id,role,employee_name)
        VALUES ($1,$2,$3,$4)`,[changeToken,employeeRow.id,requestedRole,employee.employee]);
      return res.json({requiresPasswordChange:true,changeToken,name:employee.employee});
    }
    const token=randomUUID();
    await sessionStore.create({token,role:requestedRole,name:employee.employee});
    res.json({token,role:requestedRole,name:employee.employee});
  }catch(error){next(error)}
});

app.post('/api/change-initial-password',async(req,res,next)=>{
  try{
    const changeToken=String(req.body?.changeToken||'');
    const password=String(req.body?.password||'');
    const confirmation=String(req.body?.confirmation||'');
    if(password.length<8)return res.status(400).json({error:'The new password must contain at least 8 characters.'});
    if(password!==confirmation)return res.status(400).json({error:'The password confirmation does not match.'});
    const {rows}=await pool.query(`SELECT token,master_record_id,role,employee_name
      FROM password_change_sessions WHERE token=$1 AND created_at>NOW()-INTERVAL '30 minutes'`,[changeToken]);
    const reset=rows[0];
    if(!reset)return res.status(401).json({error:'This password-change session has expired. Please sign in again.'});
    const userResult=await pool.query(`SELECT record_data FROM master_records
      WHERE id=$1 AND master_name='Users & employees'`,[reset.master_record_id]);
    const user=userResult.rows[0]?.record_data;
    if(!user)return res.status(404).json({error:'The user account no longer exists.'});
    if(password===String(user.phone||'').trim())return res.status(400).json({error:'Choose a password different from your registered phone number.'});
    const updated={...user,passwordHash:hashPassword(password),mustChangePassword:false};
    await pool.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(updated),reset.master_record_id]);
    await pool.query('DELETE FROM password_change_sessions WHERE master_record_id=$1',[reset.master_record_id]);
    const token=randomUUID();
    await sessionStore.create({token,role:reset.role,name:reset.employee_name});
    res.json({token,role:reset.role,name:reset.employee_name});
  }catch(error){next(error)}
});

async function requireSuper(req,res,next){
  try{
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const session=await sessionStore.get(token);
    if(session?.role!=='super')return res.status(403).json({error:'Your sign-in has expired. Please sign in again as Super User.'});
    next();
  }catch(error){next(error)}
}

app.get('/api/whatsapp-alert-history',requireSuper,async(_req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT id,report_type AS "reportType",target_name AS "targetName",
      report_level AS "reportLevel",recipient_name AS "recipientName",recipient_phone AS "recipientPhone",
      status,created_at AS "createdAt" FROM whatsapp_alert_history ORDER BY created_at DESC LIMIT 1000`);
    res.json(rows);
  }catch(error){next(error)}
});

app.post('/api/whatsapp-alert-history',requireSuper,async(req,res,next)=>{
  try{
    const {reportType,targetName,reportLevel='',recipientName='',recipientPhone='',status='Prepared'}=req.body||{};
    if(!reportType||!targetName)return res.status(400).json({error:'Report type and target are required.'});
    const {rows}=await pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id,report_type AS "reportType",target_name AS "targetName",report_level AS "reportLevel",
        recipient_name AS "recipientName",recipient_phone AS "recipientPhone",status,created_at AS "createdAt"`,
      [reportType,targetName,reportLevel,recipientName,recipientPhone,status]);
    res.status(201).json(rows[0]);
  }catch(error){next(error)}
});

app.get('/api/health',async(_req,res)=>{
  try{
    const result=await pool.query('SELECT NOW() AS database_time');
    databaseReady=true;
    databaseError='';
    res.json({status:'ok',database:'connected',databaseTime:result.rows[0].database_time});
  }catch(error){
    databaseReady=false;
    databaseError=error instanceof Error?error.message:'Database connection failed.';
    res.status(503).json({status:'degraded',database:'disconnected',error:databaseError});
  }
});

app.get('/api/requests',async(_req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT reference AS ref, door_number AS door, registration_number AS reg,
      site, category, complaint, to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS start,
      '—' AS hours, status, owner_name AS owner FROM maintenance_requests ORDER BY created_at DESC`);
    res.json(rows);
  }catch(error){next(error)}
});

app.post('/api/requests',async(req,res,next)=>{
  try{
    const {ref,door,reg='',site='Not assigned',category='Maintenance request',complaint,start,status='Open',owner='Normal User'}=req.body||{};
    if(!ref||!door||!complaint)return res.status(400).json({error:'Reference, door number and complaint are required.'});
    const startedAt=parseIndiaRequestDateTime(start);
    const {rows}=await pool.query(`INSERT INTO maintenance_requests
      (reference,door_number,registration_number,site,category,complaint,started_at,status,owner_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING reference AS ref,door_number AS door,registration_number AS reg,site,category,complaint,
        to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS start,'—' AS hours,status,owner_name AS owner`,
      [ref,door,reg,site,category,complaint,startedAt,status,owner]);
    res.status(201).json(rows[0]);
  }catch(error){next(error)}
});

app.get('/api/masters',async(_req,res,next)=>{
  try{
    const {rows}=await pool.query('SELECT id, master_name, record_data FROM master_records ORDER BY created_at ASC');
    const grouped={};
    for(const row of rows){
      const record=row.master_name==='Users & employees'?publicUserRecord(row.record_data):row.record_data;
      (grouped[row.master_name]??=[]).push({id:row.id,...record});
    }
    res.json(grouped);
  }catch(error){next(error)}
});

app.post('/api/masters/:master',requireSuper,async(req,res,next)=>{
  try{
    const master=decodeURIComponent(req.params.master);
    const records=Array.isArray(req.body)?req.body:[req.body];
    if(!master||!records.length||records.some(record=>!record||typeof record!=='object'||Array.isArray(record)))
      return res.status(400).json({error:'A master name and one or more records are required.'});
    const saved=[];
    for(const record of records){
      const storedRecord=master==='Users & employees'?initializeUserCredentials(record):record;
      const {rows}=await pool.query('INSERT INTO master_records (master_name,record_data) VALUES ($1,$2::jsonb) RETURNING id,record_data',[master,JSON.stringify(storedRecord)]);
      saved.push({id:rows[0].id,...(master==='Users & employees'?publicUserRecord(rows[0].record_data):rows[0].record_data)});
    }
    res.status(201).json(saved);
  }catch(error){next(error)}
});

app.put('/api/masters/:master/:id',requireSuper,async(req,res,next)=>{
  try{
    const master=decodeURIComponent(req.params.master);
    const id=Number(req.params.id);
    const record=req.body;
    if(!master||!Number.isInteger(id)||id<=0||!record||typeof record!=='object'||Array.isArray(record))
      return res.status(400).json({error:'A valid master record is required.'});
    let storedRecord=record;
    if(master==='Users & employees'){
      const existing=await pool.query('SELECT record_data FROM master_records WHERE id=$1 AND master_name=$2',[id,master]);
      if(!existing.rows.length)return res.status(404).json({error:'Master record not found.'});
      storedRecord={...record,passwordHash:existing.rows[0].record_data.passwordHash,mustChangePassword:existing.rows[0].record_data.mustChangePassword};
    }
    const {rows}=await pool.query(
      'UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3 RETURNING id,record_data',
      [JSON.stringify(storedRecord),id,master]
    );
    if(!rows.length)return res.status(404).json({error:'Master record not found.'});
    res.json({id:rows[0].id,...(master==='Users & employees'?publicUserRecord(rows[0].record_data):rows[0].record_data)});
  }catch(error){next(error)}
});

app.delete('/api/masters/:master/:id',requireSuper,async(req,res,next)=>{
  try{
    const master=decodeURIComponent(req.params.master);
    const id=Number(req.params.id);
    if(!master||!Number.isInteger(id)||id<=0)return res.status(400).json({error:'A valid master record is required.'});
    const result=await pool.query('DELETE FROM master_records WHERE id=$1 AND master_name=$2',[id,master]);
    if(!result.rowCount)return res.status(404).json({error:'Master record not found.'});
    res.status(204).end();
  }catch(error){next(error)}
});

app.use(express.static(staticRoot));
app.get(/^(?!\/api).*/,(_req,res)=>res.sendFile(path.join(staticRoot,'index.html')));
app.use((error,_req,res,_next)=>{console.error(error);res.status(500).json({error:'Server error'});});

app.listen(port,()=>console.log(`Nerve Center listening on port ${port}`));

async function initializeDatabase(){
  try{
    await migrate();
    databaseReady=true;
    databaseError='';
    console.log('Database initialization completed.');
  }catch(error){
    databaseReady=false;
    databaseError=error instanceof Error?error.message:'Database initialization failed.';
    console.error('Database initialization failed; retrying in 30 seconds.',error);
    setTimeout(initializeDatabase,30000);
  }
}

void initializeDatabase();
