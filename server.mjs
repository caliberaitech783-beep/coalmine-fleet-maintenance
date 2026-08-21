import express from 'express';
import pg from 'pg';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync,readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createSessionStore} from './auth-session.mjs';
import {parseIndiaRequestDateTime} from './request-time.mjs';
import {hashPassword,initializeUserCredentials,publicUserRecord,verifyPassword} from './password-auth.mjs';
import {equipmentIdentity} from './equipment-identity.mjs';
import {mergePrivilegeRecords} from './privilege-record.mjs';
import {loginRecordCandidates,resolveMobileAccess,userLoginCandidates} from './mobile-access.mjs';
import {REQUEST_CLOSE_STATUSES,requestDateTimeValue,validRequestAudioDataUrl,validTripCardImageDataUrl} from './request-workflow.mjs';
import {accessAllows} from './admin-access.mjs';
import {normalizeMobileNavigationVisibility} from './navigation-visibility.mjs';
import {TICKET_CATEGORIES,managerUserRole,ticketReference,validTicketMediaDataUrl} from './ticket-workflow.mjs';

const {Pool}=pg;
const app=express();
const port=Number(process.env.PORT||3000);
const root=path.dirname(fileURLToPath(import.meta.url));
const repairTypeDefaults=['Breakdown','Accidental','Preventive','Aggregate Repair','Super Structure','WGM'];
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
      equipment_name TEXT NOT NULL DEFAULT '',
      requester_login TEXT NOT NULL DEFAULT '',
      door_number TEXT NOT NULL,
      registration_number TEXT NOT NULL DEFAULT '',
      chassis_number TEXT NOT NULL DEFAULT '',
      complaint_audio TEXT NOT NULL DEFAULT '',
      site TEXT NOT NULL DEFAULT 'Not assigned',
      category TEXT NOT NULL DEFAULT 'Maintenance request',
      complaint TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'Open',
      owner_name TEXT NOT NULL DEFAULT 'Normal User',
      closed_at TIMESTAMPTZ,
      closed_by TEXT NOT NULL DEFAULT '',
      maintenance_work TEXT NOT NULL DEFAULT '',
      maintenance_audio TEXT NOT NULL DEFAULT '',
      verification_status TEXT NOT NULL DEFAULT 'Pending',
      verified_at TIMESTAMPTZ,
      verified_by TEXT NOT NULL DEFAULT '',
      first_trip_done BOOLEAN NOT NULL DEFAULT FALSE,
      first_trip_at TIMESTAMPTZ,
      first_trip_by TEXT NOT NULL DEFAULT '',
      first_trip_card_image TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS maintenance_requests_created_at_idx
      ON maintenance_requests (created_at DESC);
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS equipment_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS requester_login TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS chassis_number TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS complaint_audio TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS closed_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS maintenance_work TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS maintenance_audio TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'Pending';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS verified_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS first_trip_done BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS first_trip_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS first_trip_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS first_trip_card_image TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS maintenance_requests_requester_login_idx
      ON maintenance_requests (requester_login, created_at DESC);
    CREATE TABLE IF NOT EXISTS maintenance_daily_remarks (
      id BIGSERIAL PRIMARY KEY,
      request_reference TEXT NOT NULL REFERENCES maintenance_requests(reference) ON DELETE CASCADE,
      remark TEXT NOT NULL,
      delay_reason TEXT NOT NULL,
      author_login TEXT NOT NULL,
      author_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS maintenance_daily_remarks_request_idx ON maintenance_daily_remarks (request_reference, created_at DESC);
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
      login_name TEXT NOT NULL DEFAULT '',
      user_type TEXT NOT NULL DEFAULT '',
      assigned_role TEXT NOT NULL DEFAULT '',
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS login_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS assigned_role TEXT NOT NULL DEFAULT '';
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE TABLE IF NOT EXISTS password_change_sessions (
      token UUID PRIMARY KEY,
      master_record_id BIGINT NOT NULL REFERENCES master_records(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      login_name TEXT NOT NULL DEFAULT '',
      user_type TEXT NOT NULL DEFAULT '',
      assigned_role TEXT NOT NULL DEFAULT '',
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE password_change_sessions ADD COLUMN IF NOT EXISTS login_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE password_change_sessions ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE password_change_sessions ADD COLUMN IF NOT EXISTS assigned_role TEXT NOT NULL DEFAULT '';
    ALTER TABLE password_change_sessions ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
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
    CREATE TABLE IF NOT EXISTS crm_tickets (
      id BIGSERIAL PRIMARY KEY,
      reference TEXT UNIQUE,
      creator_login TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      creator_role TEXT NOT NULL DEFAULT '',
      site TEXT NOT NULL DEFAULT 'Not assigned',
      category TEXT NOT NULL DEFAULT 'General',
      priority TEXT NOT NULL DEFAULT 'Medium',
      message TEXT NOT NULL DEFAULT '',
      message_audio TEXT NOT NULL DEFAULT '',
      attachment_data TEXT NOT NULL DEFAULT '',
      attachment_name TEXT NOT NULL DEFAULT '',
      attachment_type TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Open',
      resolution_message TEXT NOT NULL DEFAULT '',
      resolution_audio TEXT NOT NULL DEFAULT '',
      resolution_attachment_data TEXT NOT NULL DEFAULT '',
      resolution_attachment_name TEXT NOT NULL DEFAULT '',
      resolution_attachment_type TEXT NOT NULL DEFAULT '',
      resolved_by TEXT NOT NULL DEFAULT '',
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE crm_tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Medium';
    ALTER TABLE crm_tickets ADD COLUMN IF NOT EXISTS resolution_audio TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_tickets ADD COLUMN IF NOT EXISTS resolution_attachment_data TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_tickets ADD COLUMN IF NOT EXISTS resolution_attachment_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_tickets ADD COLUMN IF NOT EXISTS resolution_attachment_type TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS crm_tickets_creator_idx ON crm_tickets (creator_login, created_at DESC);
    CREATE INDEX IF NOT EXISTS crm_tickets_scope_idx ON crm_tickets (creator_role, site, created_at DESC);
    CREATE TABLE IF NOT EXISTS crm_notifications (
      id BIGSERIAL PRIMARY KEY,
      recipient_login TEXT NOT NULL,
      ticket_reference TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE crm_notifications ADD COLUMN IF NOT EXISTS notification_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS crm_notifications_key_idx ON crm_notifications (notification_key) WHERE notification_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS crm_notifications_recipient_idx ON crm_notifications (recipient_login, is_read, created_at DESC);
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
    const {rows:repairSeed}=await client.query("SELECT value FROM app_metadata WHERE key='repair_type_defaults_seeded' FOR UPDATE");
    if(!repairSeed.length){
      for(const repairType of repairTypeDefaults){
        await client.query(`INSERT INTO master_records (master_name,record_data)
          SELECT $1,$2::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM master_records
            WHERE master_name=$1
              AND lower(trim(record_data->>'repairType'))=lower(trim($3))
          )`,['Repair type master',JSON.stringify({repairType}),repairType]);
      }
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('repair_type_defaults_seeded','true',NOW())
        ON CONFLICT (key) DO NOTHING`);
    }
    await client.query('COMMIT');
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{client.release()}
}

app.use(express.json({limit:'20mb'}));

app.get('/api/app-version',(_req,res)=>{
  res.set('Cache-Control','no-store, no-cache, must-revalidate');
  res.json({version:currentAppVersion});
});

function privilegeForUser(rows, identifiers){
  let privilege={};
  for(const row of rows){
    const record=row.record_data||{};
    const username=String(record.username||'').trim().toLowerCase();
    if(username&&identifiers.has(username))privilege=mergePrivilegeRecords(privilege,record);
  }
  return privilege;
}

function loginPayload({token,profile,employee,login}){
  return {
    token,
    role:profile.sessionRole,
    name:employee.employee,
    login,
    userType:profile.userType,
    assignedRole:profile.assignedRole,
    permissions:profile.permissions,
  };
}

app.post('/api/login',async(req,res,next)=>{
  try{
    const username=String(req.body?.username||'').trim().toLowerCase();
    const password=String(req.body?.password||'').trim();
    if(!username||!password)return res.status(400).json({error:'User name and password are required.'});
    const {rows:userRows}=await pool.query(`SELECT id,record_data FROM master_records WHERE master_name='Users & employees'`);
    // Filter by the submitted login before verifying any password hashes. A
    // scrypt verification is deliberately costly, so checking all employee
    // records here makes login scale linearly with the entire master and can
    // starve the single App Service worker.
    const loginRows=loginRecordCandidates(userRows,username);
    const candidates=loginRows.filter(row=>{
      const record=row.record_data;
      const passwordMatches=record.passwordHash
        ? verifyPassword(password,record.passwordHash)
        : String(record.phone||'').trim()===password;
      return passwordMatches&&userLoginCandidates(record).includes(username);
    });
    const exactLoginCandidates=candidates.filter(row=>String(row.record_data.login||'').trim().toLowerCase()===username);
    const matchingRows=exactLoginCandidates.length?exactLoginCandidates:candidates;
    if(!matchingRows.length)return res.status(401).json({error:'Invalid employee first name or password.'});
    if(matchingRows.length>1)return res.status(409).json({error:'More than one account uses this login. A Super User must assign a unique Login name in Users & employees.'});
    const employeeRow=matchingRows[0];
    const employee=employeeRow.record_data;
    const login=String(employee.login||userLoginCandidates(employee)[0]||username).trim();
    const identifiers=new Set([...userLoginCandidates(employee),login.toLowerCase(),username]);
    const {rows:privilegeRows}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Privilege'`);
    const profile=resolveMobileAccess({user:employee,privilege:privilegeForUser(privilegeRows,identifiers)});
    if(!profile.userType)return res.status(403).json({error:'This account does not have an application user type. Set it to Super User or Mobile User in Users & employees.'});
    if(profile.userType==='Mobile User'&&!profile.assignedRole)return res.status(403).json({error:'This Mobile User does not have an assigned User Group. Set Production User, Maintenance User, or MIS User in Users & employees.'});
    if(employee.mustChangePassword===true){
      const changeToken=randomUUID();
      await pool.query(`INSERT INTO password_change_sessions
        (token,master_record_id,role,employee_name,login_name,user_type,assigned_role,permissions)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[
          changeToken,employeeRow.id,profile.sessionRole,employee.employee,login,profile.userType,profile.assignedRole,JSON.stringify(profile.permissions)
        ]);
      return res.json({requiresPasswordChange:true,changeToken,name:employee.employee});
    }
    const token=randomUUID();
    await sessionStore.create({token,role:profile.sessionRole,name:employee.employee,login,userType:profile.userType,assignedRole:profile.assignedRole,permissions:profile.permissions});
    res.json(loginPayload({token,profile,employee,login}));
  }catch(error){next(error)}
});

app.post('/api/change-initial-password',async(req,res,next)=>{
  try{
    const changeToken=String(req.body?.changeToken||'');
    const password=String(req.body?.password||'');
    const confirmation=String(req.body?.confirmation||'');
    if(password.length<8)return res.status(400).json({error:'The new password must contain at least 8 characters.'});
    if(password!==confirmation)return res.status(400).json({error:'The password confirmation does not match.'});
    const {rows}=await pool.query(`SELECT token,master_record_id,role,employee_name,login_name,user_type,assigned_role,permissions
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
    const profile={sessionRole:reset.role,userType:reset.user_type,assignedRole:reset.assigned_role,permissions:reset.permissions||{}};
    await sessionStore.create({token,role:profile.sessionRole,name:reset.employee_name,login:reset.login_name,userType:profile.userType,assignedRole:profile.assignedRole,permissions:profile.permissions});
    res.json(loginPayload({token,profile,employee:{employee:reset.employee_name},login:reset.login_name}));
  }catch(error){next(error)}
});

async function readSession(req){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  return sessionStore.get(token);
}

async function requireSession(req,res,next){
  try{
    const session=await readSession(req);
    if(!session)return res.status(401).json({error:'Your sign-in has expired. Please sign in again.'});
    req.session=session;
    next();
  }catch(error){next(error)}
}

function requirePermission(permission,{role}={}){
  return (req,res,next)=>{
    if(role&&((req.session?.role==='super'&&req.session?.permissions?.adminLevel==='Manager')||(req.session?.role!=='super'&&req.session?.assignedRole!==role)))return res.status(403).json({error:'Your assigned user role is not authorized for this action.'});
    if(req.session?.permissions?.[permission]===true)return next();
    return res.status(403).json({error:'Your Maintenance Head has not granted this permission.'});
  };
}

async function requireSuper(req,res,next){
  try{
    const session=await readSession(req);
    if(session?.role!=='super')return res.status(403).json({error:'Your sign-in has expired. Please sign in again as Super User.'});
    const requestedMaster=req.params?.master?decodeURIComponent(req.params.master):'';
    if(requestedMaster&&!accessAllows(session.permissions?.masterAccess,requestedMaster))
      return res.status(403).json({error:'You do not have access to this master.'});
    if(req.path.startsWith('/api/whatsapp')&&!accessAllows(session.permissions?.tabAccess,'WhatsApp Integration'))
      return res.status(403).json({error:'You do not have access to WhatsApp Integration.'});
    req.session=session;
    next();
  }catch(error){next(error)}
}

app.get('/api/navigation-settings',requireSuper,async(_req,res,next)=>{
  try{
    const {rows}=await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='mobile_navigation'");
    res.json(normalizeMobileNavigationVisibility(rows[0]?.setting_value||{}));
  }catch(error){next(error)}
});

app.put('/api/navigation-settings',requireSuper,async(req,res,next)=>{
  try{
    const settings=normalizeMobileNavigationVisibility(req.body||{});
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ('mobile_navigation',$1::jsonb,NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,[JSON.stringify(settings)]);
    res.json(settings);
  }catch(error){next(error)}
});

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

// Return the signed-in employee's current master location without exposing
// the Users & employees master to mobile users. This is intentionally read
// live so a location update in the master is reflected on the next form open
// (or page refresh) without putting sensitive account data in the session.
app.get('/api/me/profile',requireSession,async(req,res,next)=>{
  try{
    const login=String(req.session.login||'').trim().toLowerCase();
    const name=String(req.session.name||'').trim().toLowerCase();
    const {rows}=await pool.query(`SELECT record_data
      FROM master_records
      WHERE master_name='Users & employees'
        AND (
          ($1 <> '' AND lower(trim(record_data->>'login'))=$1)
          OR ($2 <> '' AND lower(trim(record_data->>'employee'))=$2)
        )
      ORDER BY CASE WHEN lower(trim(record_data->>'login'))=$1 THEN 0 ELSE 1 END, created_at DESC
      LIMIT 1`,[login,name]);
    const record=rows[0]?.record_data||{};
    const location=String(record.site||record.location||record.currentLocation||'').trim();
    res.json({location});
  }catch(error){next(error)}
});

async function currentUserRecord(session,client=pool){
  const login=String(session?.login||'').trim().toLowerCase();
  const name=String(session?.name||'').trim().toLowerCase();
  const {rows}=await client.query(`SELECT record_data FROM master_records
    WHERE master_name='Users & employees' AND (
      ($1 <> '' AND lower(trim(record_data->>'login'))=$1) OR
      ($2 <> '' AND lower(trim(record_data->>'employee'))=$2)
    ) ORDER BY CASE WHEN lower(trim(record_data->>'login'))=$1 THEN 0 ELSE 1 END,created_at DESC LIMIT 1`,[login,name]);
  return rows[0]?.record_data||{};
}

function ticketProjection(){
  return `reference,creator_login AS "creatorLogin",creator_name AS "creatorName",creator_role AS "creatorRole",site,category,priority,
    message,message_audio AS "messageAudio",attachment_data AS "attachmentData",attachment_name AS "attachmentName",
    attachment_type AS "attachmentType",status,resolution_message AS "resolutionMessage",resolution_audio AS "resolutionAudio",
    resolution_attachment_data AS "resolutionAttachmentData",resolution_attachment_name AS "resolutionAttachmentName",
    resolution_attachment_type AS "resolutionAttachmentType",resolved_by AS "resolvedBy",
    to_char(resolved_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "resolvedAt",
    to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "createdAt"`;
}

function isTicketAdmin(session){return session?.role==='super'&&session?.permissions?.adminLevel!=='Manager'}

async function addTicketNotifications(client,recipients,reference,message){
  for(const login of [...new Set(recipients.map((value)=>String(value||'').trim().toLowerCase()).filter(Boolean))]){
    await client.query(`INSERT INTO crm_notifications (recipient_login,ticket_reference,message) VALUES ($1,$2,$3)`,[login,reference,message]);
  }
}

async function ticketSuperRecipients(client,{creatorRole,site}){
  const {rows}=await client.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  const adminLogins=[];
  const managerLogins=[];
  for(const row of rows){
    const user=row.record_data||{};
    const login=String(user.login||'').trim().toLowerCase();
    if(!login)continue;
    const profile=resolveMobileAccess({user});
    if(profile.sessionRole!=='super')continue;
    if(profile.permissions.adminLevel==='Admin')adminLogins.push(login);
    else if(managerUserRole(profile.permissions.managerRole)===creatorRole){
      const managerSite=String(user.site||user.location||'').trim().toLowerCase();
      if(!managerSite||managerSite===String(site||'').trim().toLowerCase())managerLogins.push(login);
    }
  }
  return {adminLogins,managerLogins};
}

app.get('/api/tickets',requireSession,async(req,res,next)=>{
  try{
    const category=TICKET_CATEGORIES.includes(String(req.query.category||''))?String(req.query.category):'';
    const values=[];
    const conditions=[];
    if(req.session.role!=='super'){
      values.push(String(req.session.login||'').trim().toLowerCase());
      conditions.push(`lower(creator_login)=$${values.length}`);
    }else if(req.session.permissions?.adminLevel==='Manager'){
      const user=await currentUserRecord(req.session);
      values.push(managerUserRole(req.session.permissions?.managerRole));
      conditions.push(`creator_role=$${values.length}`);
      const managerSite=String(user.site||user.location||'').trim();
      if(managerSite){values.push(managerSite);conditions.push(`lower(site)=lower($${values.length})`)}
    }
    if(category){values.push(category);conditions.push(`category=$${values.length}`)}
    const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
    const {rows}=await pool.query(`SELECT ${ticketProjection()} FROM crm_tickets ${where} ORDER BY created_at DESC`,values);
    res.json(rows);
  }catch(error){next(error)}
});

app.post('/api/tickets',requireSession,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    if(req.session.role==='super')return res.status(403).json({error:'Managers and Admins have view-only ticket intake access.'});
    const category=TICKET_CATEGORIES.includes(String(req.session.assignedRole||'').replace(/ User$/,''))?String(req.session.assignedRole).replace(/ User$/,''):'General';
    const priority=['Low','Medium','High'].includes(String(req.body?.priority||''))?String(req.body.priority):'';
    const message=String(req.body?.message||'').trim();
    const messageAudio=String(req.body?.messageAudio||'');
    const attachmentData=String(req.body?.attachmentData||'');
    const attachmentName=String(req.body?.attachmentName||'').slice(0,255);
    const attachmentType=String(req.body?.attachmentType||'').slice(0,100);
    if(!priority)return res.status(400).json({error:'Select a ticket priority.'});
    if(!message&&!messageAudio)return res.status(400).json({error:'Write a message or record an audio message.'});
    if(!validTicketMediaDataUrl(messageAudio,{kind:'audio'}))return res.status(400).json({error:'Ticket audio must be a supported recording up to 3 MB.'});
    if(!validTicketMediaDataUrl(attachmentData))return res.status(400).json({error:'Upload a supported image or video up to 10 MB.'});
    const user=await currentUserRecord(req.session,client);
    const site=String(user.site||user.location||user.currentLocation||'Not assigned').trim()||'Not assigned';
    const creatorRole=req.session.role==='super'?(req.session.permissions?.managerRole||'Admin'):String(req.session.assignedRole||'User');
    await client.query('BEGIN');
    const inserted=await client.query(`INSERT INTO crm_tickets
      (creator_login,creator_name,creator_role,site,category,priority,message,message_audio,attachment_data,attachment_name,attachment_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,created_at`,[
      String(req.session.login||'').trim().toLowerCase(),String(req.session.name||'User'),creatorRole,site,category,priority,message,messageAudio,attachmentData,attachmentName,attachmentType
    ]);
    const reference=ticketReference({site,date:new Date(inserted.rows[0].created_at),number:inserted.rows[0].id});
    const {rows}=await client.query(`UPDATE crm_tickets SET reference=$1 WHERE id=$2 RETURNING ${ticketProjection()}`,[reference,inserted.rows[0].id]);
    const recipients=await ticketSuperRecipients(client,{creatorRole,site});
    const creatorLogin=String(req.session.login||'').trim().toLowerCase();
    await addTicketNotifications(client,[...recipients.adminLogins,...recipients.managerLogins],reference,`${req.session.name||'A user'} (@${creatorLogin}) created ticket ${reference}.`);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

app.patch('/api/tickets/resolve',requireSession,async(req,res,next)=>{
  if(!isTicketAdmin(req.session))return res.status(403).json({error:'Only an Admin can resolve tickets.'});
  const client=await pool.connect();
  try{
    const resolution=String(req.body?.resolutionMessage||'').trim();
    const resolutionAudio=String(req.body?.resolutionAudio||'');
    const resolutionAttachmentData=String(req.body?.resolutionAttachmentData||'');
    const resolutionAttachmentName=String(req.body?.resolutionAttachmentName||'').slice(0,255);
    const resolutionAttachmentType=String(req.body?.resolutionAttachmentType||'').slice(0,100);
    const reference=String(req.body?.reference||'').trim();
    if(!reference)return res.status(400).json({error:'Ticket reference is required.'});
    if(!resolution&&!resolutionAudio)return res.status(400).json({error:'Write a resolution message or record resolution audio.'});
    if(!validTicketMediaDataUrl(resolutionAudio,{kind:'audio'}))return res.status(400).json({error:'Resolution audio must be a supported recording up to 3 MB.'});
    if(!validTicketMediaDataUrl(resolutionAttachmentData))return res.status(400).json({error:'Upload a supported resolution image or video up to 10 MB.'});
    await client.query('BEGIN');
    const result=await client.query(`UPDATE crm_tickets SET status='Resolved',resolution_message=$1,resolution_audio=$2,
      resolution_attachment_data=$3,resolution_attachment_name=$4,resolution_attachment_type=$5,resolved_by=$6,resolved_at=NOW()
      WHERE reference=$7 AND status<>'Resolved' RETURNING ${ticketProjection()}`,[resolution,resolutionAudio,resolutionAttachmentData,
      resolutionAttachmentName,resolutionAttachmentType,String(req.session.name||'Admin'),reference]);
    if(!result.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Open ticket not found.'})}
    const ticket=result.rows[0];
    const recipients=await ticketSuperRecipients(client,{creatorRole:ticket.creatorRole,site:ticket.site});
    await addTicketNotifications(client,[ticket.creatorLogin,...recipients.managerLogins],ticket.reference,`Ticket ${ticket.reference} was resolved by ${req.session.name||'Admin'}.`);
    await client.query('COMMIT');
    res.json(ticket);
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

async function createMaintenanceReminderNotifications(){
  const clock=await pool.query(`SELECT to_char(NOW() AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS day,
    EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata')::int AS hour`);
  const {day,hour}=clock.rows[0];
  const slot=hour>=18?'18':hour>=9?'09':'';
  if(!slot)return;
  const {rows:requests}=await pool.query(`SELECT reference,site FROM maintenance_requests WHERE status<>'Closed' AND started_at<=NOW()-INTERVAL '1 day'`);
  if(!requests.length)return;
  const {rows:users}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  for(const request of requests){
    const recipients=[];
    for(const row of users){
      const user=row.record_data||{};
      const login=String(user.login||'').trim().toLowerCase();
      if(!login)continue;
      const profile=resolveMobileAccess({user});
      const userSite=String(user.site||user.location||'').trim().toLowerCase();
      const siteMatches=!userSite||userSite===String(request.site||'').trim().toLowerCase();
      if(profile.assignedRole==='Maintenance User'&&siteMatches)recipients.push(login);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Admin')recipients.push(login);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&profile.permissions.managerRole==='Maintenance Manager'&&siteMatches)recipients.push(login);
    }
    for(const login of [...new Set(recipients)]){
      const key=`maintenance-reminder:${day}:${slot}:${request.reference}:${login}`;
      await pool.query(`INSERT INTO crm_notifications (recipient_login,ticket_reference,message,notification_key)
        VALUES ($1,$2,$3,$4) ON CONFLICT (notification_key) DO NOTHING`,[login,request.reference,
        `${slot}:00 reminder: add today’s maintenance update and delay reason for ${request.reference}.`,key]);
    }
  }
}

app.get('/api/notifications',requireSession,async(req,res,next)=>{
  try{
    await createMaintenanceReminderNotifications();
    const login=String(req.session.login||'').trim().toLowerCase();
    const {rows}=await pool.query(`SELECT id,ticket_reference AS "ticketReference",message,is_read AS "isRead",
      to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "createdAt"
      FROM crm_notifications WHERE recipient_login=$1 ORDER BY created_at DESC LIMIT 50`,[login]);
    res.json(rows);
  }catch(error){next(error)}
});

app.patch('/api/notifications/read',requireSession,async(req,res,next)=>{
  try{
    const login=String(req.session.login||'').trim().toLowerCase();
    await pool.query('UPDATE crm_notifications SET is_read=TRUE WHERE recipient_login=$1',[login]);
    res.json({ok:true});
  }catch(error){next(error)}
});

const requestProjection=`reference AS ref, equipment_name AS equipment, door_number AS door,
  registration_number AS reg, chassis_number AS chassis, site, category, complaint, complaint_audio AS "complaintAudio",
  to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS start,
  CASE WHEN closed_at IS NULL THEN '—' ELSE CONCAT(FLOOR(EXTRACT(EPOCH FROM (closed_at-started_at))/86400)::int,'d ',FLOOR(MOD(EXTRACT(EPOCH FROM (closed_at-started_at)),86400)/3600)::int,'h ',FLOOR(MOD(EXTRACT(EPOCH FROM (closed_at-started_at)),3600)/60)::int,'m') END AS hours,
  status, owner_name AS owner, requester_login AS "requesterLogin",
  to_char(closed_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "closedAt",
  closed_by AS "closedBy", maintenance_work AS "maintenanceWork", maintenance_audio AS "maintenanceAudio", verification_status AS "verificationStatus",
  to_char(verified_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "verifiedAt",
  verified_by AS "verifiedBy", first_trip_done AS "firstTripDone",
  to_char(first_trip_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "firstTripAt",
  first_trip_by AS "firstTripBy", (first_trip_card_image <> '') AS "firstTripCardUploaded"`;

async function attachDailyRemarks(rows,client=pool){
  if(!rows.length)return rows;
  const refs=rows.map((row)=>row.ref);
  const {rows:remarks}=await client.query(`SELECT request_reference AS "requestReference",remark,delay_reason AS "delayReason",
    author_login AS "authorLogin",author_name AS "authorName",to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "createdAt"
    FROM maintenance_daily_remarks WHERE request_reference=ANY($1::text[]) ORDER BY created_at DESC`,[refs]);
  const grouped=new Map();
  for(const remark of remarks){const list=grouped.get(remark.requestReference)||[];list.push(remark);grouped.set(remark.requestReference,list)}
  return rows.map((row)=>({...row,dailyRemarks:grouped.get(row.ref)||[]}));
}

app.get('/api/requests',requireSession,async(req,res,next)=>{
  try{
    if(req.session.role!=='super'&&req.session.permissions?.readRequests!==true)
      return res.status(403).json({error:'Your assigned role is not authorized to view maintenance requests.'});
    const requesterLogin=String(req.session.login||'').trim().toLowerCase();
    let query=req.session.role==='normal'&&req.session.assignedRole==='Production User'
      ? {text:`SELECT ${requestProjection} FROM maintenance_requests WHERE requester_login=$1 ORDER BY created_at DESC`,values:[requesterLogin]}
      : {text:`SELECT ${requestProjection} FROM maintenance_requests ORDER BY created_at DESC`,values:[]};
    if(req.session.role==='super'&&req.session.permissions?.adminLevel==='Manager'){
      const manager=await currentUserRecord(req.session);
      const managerSite=String(manager.site||manager.location||'').trim();
      query=managerSite
        ? {text:`SELECT ${requestProjection} FROM maintenance_requests WHERE lower(trim(site))=lower(trim($1)) ORDER BY created_at DESC`,values:[managerSite]}
        : {text:`SELECT ${requestProjection} FROM maintenance_requests WHERE FALSE`,values:[]};
    }
    const {rows}=await pool.query(query);
    res.json(await attachDailyRemarks(rows));
  }catch(error){next(error)}
});

app.post('/api/requests/:reference/daily-remarks',requireSession,requirePermission('closeRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const remark=String(req.body?.remark||'').trim();
    const delayReason=String(req.body?.delayReason||'').trim();
    if(!remark||!delayReason)return res.status(400).json({error:'Enter today’s update and the reason for delay.'});
    const eligible=await pool.query(`SELECT reference,site,requester_login FROM maintenance_requests WHERE reference=$1 AND status<>'Closed' AND started_at<=NOW()-INTERVAL '1 day'`,[reference]);
    if(!eligible.rows.length)return res.status(409).json({error:'Daily remarks are available only for open requests older than one day.'});
    await pool.query(`INSERT INTO maintenance_daily_remarks (request_reference,remark,delay_reason,author_login,author_name) VALUES ($1,$2,$3,$4,$5)`,
      [reference,remark,delayReason,String(req.session.login||'').trim().toLowerCase(),req.session.name||'Maintenance User']);
    const {rows:userRows}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
    const recipients=[String(eligible.rows[0].requester_login||'').trim().toLowerCase()];
    for(const row of userRows){const user=row.record_data||{};const login=String(user.login||'').trim().toLowerCase();if(!login)continue;
      const profile=resolveMobileAccess({user});const userSite=String(user.site||user.location||'').trim().toLowerCase();const siteMatches=!userSite||userSite===String(eligible.rows[0].site||'').trim().toLowerCase();
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Admin')recipients.push(login);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&['Maintenance Manager','Production Manager'].includes(profile.permissions.managerRole)&&siteMatches)recipients.push(login);
    }
    await addTicketNotifications(pool,recipients,reference,`${req.session.name||'Maintenance User'} added a daily maintenance update for ${reference}.`);
    const {rows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
    res.status(201).json((await attachDailyRemarks(rows))[0]);
  }catch(error){next(error)}
});

app.post('/api/requests',requireSession,requirePermission('createRequests'),async(req,res,next)=>{
  try{
    const {ref,equipment='',door,reg='',chassis='',site='Not assigned',category='Maintenance request',complaint,complaintAudio='',start,forceDuplicate=false}=req.body||{};
    if(!ref||!door||!complaint)return res.status(400).json({error:'Reference, door number and complaint are required.'});
    if(!String(chassis).trim())return res.status(400).json({error:'Chassis number is required. Contact the admin team to update the chassis number in Equipment Master.'});
    if(!validRequestAudioDataUrl(complaintAudio))return res.status(400).json({error:'Complaint audio must be a supported recording up to 3 MB.'});
    if(forceDuplicate!==true){
      const duplicate=await pool.query(`SELECT reference FROM maintenance_requests WHERE lower(trim(chassis_number))=lower(trim($1)) AND status<>'Closed' ORDER BY created_at DESC LIMIT 1`,[chassis]);
      if(duplicate.rows.length)return res.status(409).json({duplicate:true,existingReference:duplicate.rows[0].reference,error:`Request ${duplicate.rows[0].reference} already exists for this equipment. Do you still want to add another request?`});
    }
    const startedAt=parseIndiaRequestDateTime(start);
    const {rows}=await pool.query(`INSERT INTO maintenance_requests
      (reference,equipment_name,door_number,registration_number,chassis_number,site,category,complaint,complaint_audio,started_at,status,owner_name,requester_login)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Open',$11,$12)
      RETURNING ${requestProjection}`,
      [ref,equipment,door,reg,chassis,site,category,complaint,complaintAudio,startedAt,req.session.name||'Mobile User',String(req.session.login||'').trim().toLowerCase()]);
    res.status(201).json(rows[0]);
  }catch(error){next(error)}
});

app.patch('/api/requests/:reference',requireSession,requirePermission('editRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const {equipment='',door,reg='',chassis='',site='Not assigned',category='Maintenance request',complaint,start}=req.body||{};
    if(!reference||!door||!complaint||!String(chassis).trim())return res.status(400).json({error:'Door number, chassis number and complaint are required.'});
    const startedAt=parseIndiaRequestDateTime(start);
    const {rows}=await pool.query(`UPDATE maintenance_requests SET equipment_name=$1,door_number=$2,registration_number=$3,chassis_number=$4,
      site=$5,category=$6,complaint=$7,started_at=$8 WHERE reference=$9 AND status<>'Closed' AND verified_at IS NULL
      RETURNING ${requestProjection}`,[equipment,door,reg,chassis,site,category,complaint,startedAt,reference]);
    if(!rows.length)return res.status(409).json({error:'Only open, unverified requests can be edited.'});
    res.json(rows[0]);
  }catch(error){next(error)}
});

app.patch('/api/requests/:reference/close',requireSession,requirePermission('closeRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const closingDate=String(req.body?.closingDate||'');
    const closingTime=String(req.body?.closingTime||'');
    const maintenanceWork=String(req.body?.maintenanceWork||'').trim();
    const maintenanceAudio=String(req.body?.maintenanceAudio||'');
    const status=String(req.body?.status||'Closed').trim();
    const closedAt=requestDateTimeValue(closingDate,closingTime);
    if(!closedAt)return res.status(400).json({error:'Enter a valid closing date and time in HH:MM:SS format.'});
    if(!maintenanceWork)return res.status(400).json({error:'Describe the maintenance work completed.'});
    if(!validRequestAudioDataUrl(maintenanceAudio))return res.status(400).json({error:'Maintenance audio must be a supported recording up to 3 MB.'});
    if(!REQUEST_CLOSE_STATUSES.includes(status))return res.status(400).json({error:'Choose a valid maintenance status.'});
    const {rows}=await pool.query(`UPDATE maintenance_requests SET closed_at=$1,closed_by=$2,maintenance_work=$3,maintenance_audio=$4,status=$5
      WHERE reference=$6 AND status<>'Closed' AND verified_at IS NULL RETURNING ${requestProjection}`,
      [closedAt,req.session.name||'Maintenance User',maintenanceWork,maintenanceAudio,status,reference]);
    if(!rows.length)return res.status(409).json({error:'This request has already been verified or no longer exists.'});
    res.json(rows[0]);
  }catch(error){next(error)}
});

app.delete('/api/requests/:reference',requireSession,requirePermission('deleteRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const result=await pool.query(`DELETE FROM maintenance_requests WHERE reference=$1 AND verified_at IS NULL`,[reference]);
    if(!result.rowCount)return res.status(409).json({error:'Verified requests cannot be deleted, or the request no longer exists.'});
    res.status(204).end();
  }catch(error){next(error)}
});

app.patch('/api/requests/:reference/verify',requireSession,requirePermission('verifyRequests',{role:'MIS User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const firstTripDone=req.body?.firstTripDone===true||String(req.body?.firstTripDone||'').toLowerCase()==='true';
    const firstTripAt=firstTripDone?requestDateTimeValue(req.body?.firstTripDate,req.body?.firstTripTime):null;
    const firstTripCardImage=firstTripDone?String(req.body?.firstTripCardImage||''):'';
    if(firstTripDone&&!firstTripAt)return res.status(400).json({error:'Enter a valid first-trip date and time in HH:MM:SS format.'});
    if(firstTripDone&&!validTripCardImageDataUrl(firstTripCardImage))return res.status(400).json({error:'Upload a JPEG, PNG, or WebP trip-card image up to 5 MB.'});
    const {rows}=await pool.query(`UPDATE maintenance_requests SET verification_status='Verified',verified_at=NOW(),verified_by=$1,
      first_trip_done=$2,first_trip_at=$3,first_trip_by=$4,first_trip_card_image=$5 WHERE reference=$6 AND status='Closed' AND verified_at IS NULL
      RETURNING ${requestProjection}`,[req.session.name||'MIS User',firstTripDone,firstTripAt,firstTripDone?(req.session.name||'MIS User'):'',firstTripCardImage,reference]);
    if(!rows.length)return res.status(409).json({error:'Only unverified closed requests can be verified.'});
    res.json(rows[0]);
  }catch(error){next(error)}
});

app.get('/api/masters',requireSession,async(req,res,next)=>{
  try{
    const superCanView=(master)=>req.session.role==='super'&&accessAllows(req.session.permissions?.masterAccess,master);
    const canViewEquipment=superCanView('Equipment master')||req.session.permissions?.viewEquipment===true;
    const canViewRepairTypes=superCanView('Repair type master')||req.session.permissions?.viewRepairTypes===true;
    if(!canViewEquipment&&!canViewRepairTypes)
      return res.status(403).json({error:'Your assigned role is not authorized to view master records.'});
    const managerRecord=req.session.role==='super'&&req.session.permissions?.adminLevel==='Manager'?await currentUserRecord(req.session):null;
    const managerSite=String(managerRecord?.site||managerRecord?.location||'').trim().toLowerCase();
    const {rows}=await pool.query('SELECT id, master_name, record_data FROM master_records ORDER BY created_at ASC');
    const grouped={},privilegesByUsername=new Map();
    for(const row of rows){
      if(req.session.role==='super'){
        if(!accessAllows(req.session.permissions?.masterAccess,row.master_name))continue;
      }else{
        if(row.master_name==='Equipment master'&&!canViewEquipment)continue;
        if(row.master_name==='Repair type master'&&!canViewRepairTypes)continue;
        if(row.master_name!=='Equipment master'&&row.master_name!=='Repair type master')continue;
      }
      const record=row.master_name==='Users & employees'?publicUserRecord(row.record_data):row.record_data;
      if(managerRecord&&row.master_name==='Equipment master'){
        const equipmentSite=String(record.currentLocation||record.site||record.location||'').trim().toLowerCase();
        if(!managerSite||equipmentSite!==managerSite)continue;
      }
      if(row.master_name==='Privilege'){
        const username=String(record.username||'').trim().toLowerCase();
        const existing=username&&privilegesByUsername.get(username);
        if(existing){
          Object.assign(existing,mergePrivilegeRecords(existing,record));
          continue;
        }
        const privilege={id:row.id,...record};
        if(username)privilegesByUsername.set(username,privilege);
        (grouped[row.master_name]??=[]).push(privilege);
        continue;
      }
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
    let prepared;
    try{
      prepared=records.map((record,index)=>{
        try{return master==='Users & employees'?initializeUserCredentials(record):record}
        catch(error){throw new Error(`CSV row ${index+2}: ${error.message}`)}
      });
    }catch(error){return res.status(400).json({error:error.message})}
    let rows;
    if(master==='Equipment master'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const existing=await client.query(
          'SELECT id,record_data FROM master_records WHERE master_name=$1 FOR UPDATE',
          [master]
        );
        const byIdentity=new Map(
          existing.rows.map(row=>[equipmentIdentity(row.record_data),row]).filter(([identity])=>identity)
        );
        rows=[];
        for(const record of prepared){
          const identity=equipmentIdentity(record);
          const match=identity&&byIdentity.get(identity);
          if(match){
            const updated=await client.query(
              'UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 RETURNING id,record_data',
              [JSON.stringify(record),match.id]
            );
            rows.push(updated.rows[0]);
            byIdentity.set(identity,updated.rows[0]);
          }else{
            const inserted=await client.query(
              'INSERT INTO master_records (master_name,record_data) VALUES ($1,$2::jsonb) RETURNING id,record_data',
              [master,JSON.stringify(record)]
            );
            rows.push(inserted.rows[0]);
            if(identity)byIdentity.set(identity,inserted.rows[0]);
          }
        }
        await client.query('COMMIT');
      }catch(error){
        await client.query('ROLLBACK');
        throw error;
      }finally{client.release()}
    }else if(master==='Privilege'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query('LOCK TABLE master_records IN SHARE ROW EXCLUSIVE MODE');
        const existing=await client.query(
          'SELECT id,record_data FROM master_records WHERE master_name=$1',
          [master]
        );
        const byUsername=new Map(existing.rows.map(row=>[
          String(row.record_data.username||'').trim().toLowerCase(),row
        ]).filter(([username])=>username));
        rows=[];
        for(const record of prepared){
          const username=String(record.username||'').trim().toLowerCase();
          const match=username&&byUsername.get(username);
          if(match){
            const matchingIds=[...new Set([
              match.id,
              ...existing.rows
                .filter(row=>String(row.record_data.username||'').trim().toLowerCase()===username)
                .map(row=>row.id)
            ])];
            const updated=await client.query(
              'UPDATE master_records SET record_data=$1::jsonb WHERE master_name=$2 AND id=ANY($3::bigint[]) RETURNING id,record_data',
              [JSON.stringify(record),master,matchingIds]
            );
            const saved=updated.rows.find(row=>Number(row.id)===Number(match.id))||updated.rows[0];
            rows.push(saved);
            byUsername.set(username,saved);
          }else{
            const inserted=await client.query(
              'INSERT INTO master_records (master_name,record_data) VALUES ($1,$2::jsonb) RETURNING id,record_data',
              [master,JSON.stringify(record)]
            );
            rows.push(inserted.rows[0]);
            if(username)byUsername.set(username,inserted.rows[0]);
          }
        }
        await client.query('COMMIT');
      }catch(error){
        await client.query('ROLLBACK');
        throw error;
      }finally{client.release()}
    }else{
      ({rows}=await pool.query(`INSERT INTO master_records (master_name,record_data)
        SELECT $1,value FROM jsonb_array_elements($2::jsonb) AS value
        RETURNING id,record_data`,[master,JSON.stringify(prepared)]));
    }
    const saved=rows.map(row=>({id:row.id,...(master==='Users & employees'?publicUserRecord(row.record_data):row.record_data)}));
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
    if(master==='Privilege'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const existing=await client.query(
          'SELECT id,record_data FROM master_records WHERE master_name=$1 FOR UPDATE',
          [master]
        );
        const target=existing.rows.find(row=>Number(row.id)===id);
        if(!target){
          await client.query('ROLLBACK');
          return res.status(404).json({error:'Master record not found.'});
        }
        const currentUsername=String(target.record_data.username||'').trim().toLowerCase();
        const requestedUsername=String(record.username||'').trim().toLowerCase();
        if(!currentUsername||requestedUsername!==currentUsername){
          await client.query('ROLLBACK');
          return res.status(400).json({error:'Privilege usernames cannot be changed. Select the correct user instead.'});
        }
        const matchingIds=existing.rows
          .filter(row=>{
            if(Number(row.id)===id)return true;
            const username=String(row.record_data.username||'').trim().toLowerCase();
            return Boolean(username&&username===currentUsername);
          })
          .map(row=>row.id);
        const updated=await client.query(
          'UPDATE master_records SET record_data=$1::jsonb WHERE master_name=$2 AND id=ANY($3::bigint[]) RETURNING id,record_data',
          [JSON.stringify(storedRecord),master,matchingIds]
        );
        await client.query('COMMIT');
        const saved=updated.rows.find(row=>Number(row.id)===id)||updated.rows[0];
        return res.json({id:saved.id,...saved.record_data});
      }catch(error){
        await client.query('ROLLBACK');
        throw error;
      }finally{client.release()}
    }
    const {rows}=await pool.query(
      'UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3 RETURNING id,record_data',
      [JSON.stringify(storedRecord),id,master]
    );
    if(!rows.length)return res.status(404).json({error:'Master record not found.'});
    res.json({id:rows[0].id,...(master==='Users & employees'?publicUserRecord(rows[0].record_data):rows[0].record_data)});
  }catch(error){next(error)}
});

app.delete('/api/masters/:master/all',requireSuper,async(req,res,next)=>{
  try{
    const master=decodeURIComponent(req.params.master);
    if(!master)return res.status(400).json({error:'A master name is required.'});
    if(master==='Breakdown master'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const manual=await client.query('DELETE FROM master_records WHERE master_name=$1',[master]);
        const requests=await client.query('DELETE FROM maintenance_requests');
        await client.query('COMMIT');
        return res.json({deleted:manual.rowCount+requests.rowCount});
      }catch(error){await client.query('ROLLBACK');throw error}
      finally{client.release()}
    }
    const result=await pool.query('DELETE FROM master_records WHERE master_name=$1',[master]);
    res.json({deleted:result.rowCount});
  }catch(error){next(error)}
});

app.delete('/api/masters/:master/:id',requireSuper,async(req,res,next)=>{
  try{
    const master=decodeURIComponent(req.params.master);
    const id=Number(req.params.id);
    if(!master||!Number.isInteger(id)||id<=0)return res.status(400).json({error:'A valid master record is required.'});
    if(master==='Privilege'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const existing=await client.query(
          'SELECT id,record_data FROM master_records WHERE master_name=$1 FOR UPDATE',
          [master]
        );
        const target=existing.rows.find(row=>Number(row.id)===id);
        if(!target){
          await client.query('ROLLBACK');
          return res.status(404).json({error:'Master record not found.'});
        }
        const targetUsername=String(target.record_data.username||'').trim().toLowerCase();
        const matchingIds=existing.rows
          .filter(row=>Number(row.id)===id||(
            targetUsername&&String(row.record_data.username||'').trim().toLowerCase()===targetUsername
          ))
          .map(row=>row.id);
        await client.query(
          'DELETE FROM master_records WHERE master_name=$1 AND id=ANY($2::bigint[])',
          [master,matchingIds]
        );
        await client.query('COMMIT');
        return res.status(204).end();
      }catch(error){
        await client.query('ROLLBACK');
        throw error;
      }finally{client.release()}
    }
    const result=await pool.query('DELETE FROM master_records WHERE id=$1 AND master_name=$2',[id,master]);
    if(!result.rowCount)return res.status(404).json({error:'Master record not found.'});
    res.status(204).end();
  }catch(error){next(error)}
});

app.use(express.static(staticRoot));
app.get(/^(?!\/api).*/,(_req,res)=>res.sendFile(path.join(staticRoot,'index.html')));
app.use((error,_req,res,_next)=>{
  console.error(error);
  if(error?.type==='entity.too.large')return res.status(413).json({error:'The CSV is too large to import. Split it into smaller files.'});
  res.status(500).json({error:'Server error'});
});

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
