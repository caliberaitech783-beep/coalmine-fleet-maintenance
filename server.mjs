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
import {accessAllows,managerRoleSelection} from './admin-access.mjs';
import {normalizeMobileNavigationVisibility} from './navigation-visibility.mjs';
import {TICKET_CATEGORIES,managerUserRole,ticketReference,validTicketMediaDataUrl} from './ticket-workflow.mjs';
import {oracleConfigured,oracleDriverLookup,oracleEquipmentMasterRecords,oracleEquipmentTransfers,oracleHealth} from './oracle-db.mjs';
import {applyLatestTransfer,equipmentMatchKeys,isAllowedOracleEquipment,latestTransferByEquipment,oracleEquipmentMasterRecord,transferMasterRecord} from './equipment-transfer-sync.mjs';
import {sendTicketRaisedEmail} from './ticket-email.mjs';
import {prepareTicketReportRows,ticketReportDue,ticketReportWindow} from './ticket-consolidated-report.mjs';
import {metaWhatsAppStatus,sendMetaWhatsAppDocument,sendMetaWhatsAppTemplate,sendMetaWhatsAppText,submitMetaWhatsAppTemplates} from './meta-whatsapp.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {managerReportScope,reportScopeIncludesSite} from './region-scope.mjs';
import {attachRequestOems,consolidatedReportDue,consolidatedReportWindow,prepareConsolidatedRows} from './consolidated-whatsapp-report.mjs';
import {buildFleetConsolidatedReportPdf,buildTicketConsolidatedReportPdf} from './consolidated-report-pdf.mjs';
import {ADMIN_LOCK_TICKET_CUTOFF,isLockableAdmin,isTrueSuperAdmin} from './admin-lock-policy.mjs';

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
const driverSyncIntervalMs=2*60*1000;
const reportDateTime=(value)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(value);
const reportFilename=(kind,scope,slot)=>`Nerve-Center-${kind}-${scope}-${slot}.pdf`.replace(/[^a-z0-9._-]+/gi,'-').replace(/-+/g,'-');

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
      equipment_group TEXT NOT NULL DEFAULT '',
      requester_login TEXT NOT NULL DEFAULT '',
      door_number TEXT NOT NULL,
      registration_number TEXT NOT NULL DEFAULT '',
      chassis_number TEXT NOT NULL DEFAULT '',
      driver_name TEXT NOT NULL DEFAULT '',
      driver_name_source TEXT NOT NULL DEFAULT '',
      driver_synced_at TIMESTAMPTZ,
      ideal_requested_at TIMESTAMPTZ,
      ideal_requested_by TEXT NOT NULL DEFAULT '',
      ideal_approved_at TIMESTAMPTZ,
      ideal_approved_by TEXT NOT NULL DEFAULT '',
      idle_reason TEXT NOT NULL DEFAULT '',
      complaint_audio TEXT NOT NULL DEFAULT '',
      superior_name TEXT NOT NULL DEFAULT '',
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
      ADD COLUMN IF NOT EXISTS equipment_group TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS requester_login TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS chassis_number TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS driver_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS driver_name_source TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS driver_synced_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS ideal_requested_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS ideal_requested_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS ideal_approved_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS ideal_approved_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS idle_reason TEXT NOT NULL DEFAULT '';
    UPDATE maintenance_requests SET status='Idle' WHERE status='Ideal';
    UPDATE maintenance_requests SET driver_name_source='Legacy'
      WHERE driver_name_source='' AND driver_name<>'';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS complaint_audio TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS superior_name TEXT NOT NULL DEFAULT '';
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
    UPDATE maintenance_requests AS request
      SET equipment_group=COALESCE(NULLIF(equipment.record_data->>'group',''),NULLIF(equipment.record_data->>'equipmentGroup',''),'')
      FROM master_records AS equipment
      WHERE equipment.master_name='Equipment master'
        AND request.equipment_group=''
        AND COALESCE(NULLIF(equipment.record_data->>'group',''),NULLIF(equipment.record_data->>'equipmentGroup',''),'')<>''
        AND lower(trim(request.door_number))=ANY(ARRAY[
          lower(trim(COALESCE(equipment.record_data->>'door',''))),
          lower(trim(COALESCE(equipment.record_data->>'registration',''))),
          lower(trim(COALESCE(equipment.record_data->>'reg',''))),
          lower(trim(COALESCE(equipment.record_data->>'equipmentName',''))),
          lower(trim(COALESCE(equipment.record_data->>'itemName',''))),
          lower(trim(COALESCE(equipment.record_data->>'manufacturerSerialNo','')))
        ]);
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
    CREATE TABLE IF NOT EXISTS whatsapp_consolidated_report_runs (
      id BIGSERIAL PRIMARY KEY,
      slot_key TEXT NOT NULL,
      recipient_login TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Sending',
      attempts INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(slot_key,recipient_login,scope_key)
    );
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
    CREATE TABLE IF NOT EXISTS admin_lock_incidents (
      ticket_reference TEXT PRIMARY KEY REFERENCES crm_tickets(reference) ON DELETE CASCADE,
      ticket_created_at TIMESTAMPTZ NOT NULL,
      locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      unlocked_at TIMESTAMPTZ,
      unlocked_by TEXT NOT NULL DEFAULT ''
    );
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
    const seededSuperAdmin={login:'superadamin',employee:'System Super Admin',mail:'',phone:'',userType:'Super Admin',userGroup:'',adminLevel:'Super Admin',passwordHash:hashPassword('admin'),mustChangePassword:false};
    await client.query(`INSERT INTO master_records (master_name,record_data)
      SELECT 'Users & employees',$1::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM master_records WHERE master_name='Users & employees' AND lower(trim(record_data->>'login'))='superadamin')`,[JSON.stringify(seededSuperAdmin)]);
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

async function auditAdminLockIncidents(client=pool){
  await client.query(`INSERT INTO admin_lock_incidents (ticket_reference,ticket_created_at)
    SELECT reference,created_at FROM crm_tickets
    WHERE created_at >= $1::timestamptz AND created_at <= NOW()-INTERVAL '72 hours'
      AND lower(status) NOT IN ('resolved','closed')
    ON CONFLICT (ticket_reference) DO NOTHING`,[ADMIN_LOCK_TICKET_CUTOFF]);
}

async function activeAdminLockIncidents(client=pool){
  await auditAdminLockIncidents(client);
  const {rows}=await client.query(`SELECT ticket_reference AS "ticketReference",ticket_created_at AS "ticketCreatedAt",locked_at AS "lockedAt"
    FROM admin_lock_incidents WHERE unlocked_at IS NULL ORDER BY locked_at DESC`);
  return rows;
}

function requireTrueSuperAdmin(req,res,next){
  if(req.session?.role==='super'&&isTrueSuperAdmin(req.session.permissions))return next();
  return res.status(403).json({error:'Only a Super Admin can perform this action.'});
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
    if(profile.sessionRole==='super'&&isLockableAdmin(profile.permissions)){
      const incidents=await activeAdminLockIncidents();
      if(incidents.length)return res.status(423).json({error:`This admin account is locked because CRM ticket ${incidents[0].ticketReference} has remained open for 72 hours. Contact a Super Admin.`});
    }
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
    if(requestedMaster&&!accessAllows(session.permissions?.masterAccess,requestedMaster)&&!accessAllows(session.permissions?.mobileMasterAccess,requestedMaster))
      return res.status(403).json({error:'You do not have access to this master.'});
    if(req.path.startsWith('/api/whatsapp')&&!accessAllows(session.permissions?.tabAccess,'WhatsApp Integration')&&!accessAllows(session.permissions?.mobileTabAccess,'WhatsApp Integration'))
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

app.get('/api/admin-locks',requireSuper,requireTrueSuperAdmin,async(_req,res,next)=>{
  try{
    const incidents=await activeAdminLockIncidents();
    const {rows}=await pool.query(`SELECT id,record_data FROM master_records WHERE master_name='Users & employees' ORDER BY created_at ASC`);
    const accounts=rows.map(row=>({id:row.id,...publicUserRecord(row.record_data)})).filter(row=>isLockableAdmin(row));
    res.json({locked:incidents.length>0,incidents,accounts:incidents.length?accounts:[]});
  }catch(error){next(error)}
});

app.post('/api/admin-locks/unlock',requireSuper,requireTrueSuperAdmin,async(req,res,next)=>{
  try{
    await auditAdminLockIncidents();
    const result=await pool.query(`UPDATE admin_lock_incidents SET unlocked_at=NOW(),unlocked_by=$1 WHERE unlocked_at IS NULL`,[req.session.name||req.session.login||'Super Admin']);
    res.json({unlocked:result.rowCount});
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

app.get('/api/whatsapp/status',requireSuper,async(_req,res)=>{
  try{res.json(await metaWhatsAppStatus())}
  catch(error){res.status(503).json({configured:true,connected:false,error:error instanceof Error?error.message:'Meta WhatsApp connection failed.'})}
});

app.post('/api/whatsapp/send',requireSuper,async(req,res,next)=>{
  const {reportType,targetName,reportLevel='',recipientName='',recipientPhone='',message=''}=req.body||{};
  if(!reportType||!targetName||!recipientPhone||!message)
    return res.status(400).json({error:'Report type, target, recipient phone, and message are required.'});
  try{
    const result=await sendMetaWhatsAppText({to:recipientPhone,message});
    const {rows}=await pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id,report_type AS "reportType",target_name AS "targetName",report_level AS "reportLevel",
        recipient_name AS "recipientName",recipient_phone AS "recipientPhone",status,created_at AS "createdAt"`,
      [reportType,targetName,reportLevel,recipientName,result.recipient,'Sent']);
    res.status(201).json({...rows[0],messageId:result.messageId});
  }catch(error){
    try{await pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
      [reportType,targetName,reportLevel,recipientName,recipientPhone,'Failed'])}catch(historyError){console.error('Could not record failed WhatsApp delivery.',historyError)}
    const status=Number(error?.status)>=400&&Number(error?.status)<500?400:502;
    res.status(status).json({error:error instanceof Error?error.message:'WhatsApp delivery failed.'});
  }
});

app.get('/api/oracle/health',requireSuper,async(_req,res)=>{
  if(!oracleConfigured)return res.status(503).json({configured:false,connected:false,error:'Oracle database settings are not configured.'});
  try{
    res.json(await oracleHealth());
  }catch(error){
    res.status(503).json({configured:true,connected:false,error:error instanceof Error?error.message:'Oracle connection failed.'});
  }
});

app.get('/api/oracle/driver',requireSession,async(req,res)=>{
  const date=String(req.query.date||'').trim();
  const time=String(req.query.time||'').trim();
  const location=String(req.query.location||'').trim();
  const equipmentNo=String(req.query.equipmentNo||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)||!location||!equipmentNo)
    return res.status(400).json({error:'Date, time, location and equipment number are required.'});
  if(location.length>150||equipmentNo.length>200)return res.status(400).json({error:'Oracle lookup values are too long.'});
  if(!oracleConfigured)return res.status(503).json({error:'Oracle driver lookup is not configured.'});
  try{
    res.json(await oracleDriverLookup({date,time,location,equipmentNo}));
  }catch(error){
    console.error('Oracle driver lookup failed.',error);
    res.status(503).json({error:'Driver/operator lookup is temporarily unavailable.'});
  }
});

let equipmentTransferSyncPromise;
let equipmentMasterSyncPromise;
async function syncOracleEquipmentMaster(){
  if(equipmentMasterSyncPromise)return equipmentMasterSyncPromise;
  equipmentMasterSyncPromise=(async()=>{
    const oracleSourceRecords=await oracleEquipmentMasterRecords();
    const oracleRecords=oracleSourceRecords.filter(isAllowedOracleEquipment);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('oracle-equipment-master-sync'))");
      const existingResult=await client.query(`SELECT id,record_data FROM master_records
        WHERE master_name='Equipment master' FOR UPDATE`);
      const byKey=new Map();
      for(const row of existingResult.rows){
        for(const key of equipmentMatchKeys(row.record_data))if(!byKey.has(key))byKey.set(key,row);
      }
      const updates=[],inserts=[],retainedIds=[];
      for(const equipment of oracleRecords){
        const match=equipmentMatchKeys(equipment).map(key=>byKey.get(key)).find(Boolean);
        const record=oracleEquipmentMasterRecord(equipment,match?.record_data||{});
        if(match){
          updates.push({id:match.id,...record});
          retainedIds.push(match.id);
          for(const key of equipmentMatchKeys(record))byKey.set(key,{id:match.id,record_data:record});
        }else{
          inserts.push(record);
        }
      }
      await client.query(`DELETE FROM master_records
        WHERE master_name='Equipment master'
          AND record_data->>'oracleSource'='EQUIPMENT'
          AND NOT (id=ANY($1::bigint[]))`,[retainedIds]);
      if(updates.length){
        await client.query(`UPDATE master_records AS target
          SET record_data=incoming.value-'id'
          FROM jsonb_array_elements($1::jsonb) AS incoming(value)
          WHERE target.id=(incoming.value->>'id')::bigint
            AND target.master_name='Equipment master'`,[JSON.stringify(updates)]);
      }
      if(inserts.length){
        await client.query(`INSERT INTO master_records (master_name,record_data)
          SELECT 'Equipment master',value FROM jsonb_array_elements($1::jsonb) AS value`,[JSON.stringify(inserts)]);
      }
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('oracle_equipment_master_sync',$1,NOW())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[
        JSON.stringify({sourceRecords:oracleSourceRecords.length,oracleRecords:oracleRecords.length,updated:updates.length,inserted:inserts.length})
      ]);
      await client.query('COMMIT');
      return {equipmentImported:oracleRecords.length,equipmentUpdated:updates.length,equipmentInserted:inserts.length};
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{client.release()}
  })().finally(()=>{equipmentMasterSyncPromise=undefined});
  return equipmentMasterSyncPromise;
}

app.post('/api/oracle/equipment/sync',requireSuper,async(_req,res)=>{
  if(!oracleConfigured)return res.status(503).json({error:'Oracle equipment sync is not configured.'});
  try{
    const equipment=await syncOracleEquipmentMaster();
    const transfers=await syncOracleEquipmentTransfers();
    res.json({...equipment,...transfers});
  }catch(error){
    console.error('Oracle equipment sync failed.',error);
    res.status(503).json({error:'Equipment Master could not be synchronized from Oracle.'});
  }
});

async function syncOracleEquipmentTransfers(){
  if(equipmentTransferSyncPromise)return equipmentTransferSyncPromise;
  equipmentTransferSyncPromise=(async()=>{
    const transfers=await oracleEquipmentTransfers();
    const transferRecords=transfers.map(transferMasterRecord);
    const latest=latestTransferByEquipment(transfers);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('oracle-equipment-transfer-sync'))");
      await client.query(`DELETE FROM master_records
        WHERE master_name='Vehicle transfers' AND record_data->>'oracleSource'='EQUIPMENTTRANSFER'`);
      if(transferRecords.length){
        await client.query(`INSERT INTO master_records (master_name,record_data)
          SELECT 'Vehicle transfers',value FROM jsonb_array_elements($1::jsonb) AS value`,[JSON.stringify(transferRecords)]);
      }
      const equipmentRows=await client.query(`SELECT id,record_data FROM master_records
        WHERE master_name='Equipment master' FOR UPDATE`);
      const changed=[];
      for(const row of equipmentRows.rows){
        const updated=applyLatestTransfer(row.record_data,latest);
        if(updated!==row.record_data&&JSON.stringify(updated)!==JSON.stringify(row.record_data))changed.push({id:row.id,...updated});
      }
      if(changed.length){
        await client.query(`UPDATE master_records AS target
          SET record_data=incoming.value-'id'
          FROM jsonb_array_elements($1::jsonb) AS incoming(value)
          WHERE target.id=(incoming.value->>'id')::bigint
            AND target.master_name='Equipment master'`,[JSON.stringify(changed)]);
      }
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('oracle_equipment_transfer_sync',$1,NOW())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[JSON.stringify({transfers:transferRecords.length,equipmentUpdated:changed.length})]);
      await client.query('COMMIT');
      return {transfersImported:transferRecords.length,equipmentUpdated:changed.length};
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{client.release()}
  })().finally(()=>{equipmentTransferSyncPromise=undefined});
  return equipmentTransferSyncPromise;
}

app.post('/api/oracle/equipment-transfers/sync',requireSuper,async(_req,res)=>{
  if(!oracleConfigured)return res.status(503).json({error:'Oracle equipment-transfer sync is not configured.'});
  try{
    res.json(await syncOracleEquipmentTransfers());
  }catch(error){
    console.error('Oracle equipment-transfer sync failed.',error);
    res.status(503).json({error:'Equipment transfers could not be synchronized from Oracle.'});
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
const userManagesSite=(user,site)=>reportScopeIncludesSite(managerReportScope(user),site);

async function sendWhatsAppNotifications(client,recipients,reference,message,workflowTemplate){
  const logins=[...new Set(recipients.map((value)=>String(value||'').trim().toLowerCase()).filter(Boolean))];
  if(!logins.length)return;
  const {rows}=await client.query(`SELECT record_data FROM master_records
    WHERE master_name='Users & employees' AND lower(trim(record_data->>'login'))=ANY($1::text[])`,[logins]);
  const contacts=new Map();
  const usersByLogin=new Map();
  for(const row of rows){
    const user=row.record_data||{};
    const login=String(user.login||'').trim().toLowerCase();
    const phone=String(user.phone||user.phoneNo||user.phoneNumber||'').trim();
    if(login&&!usersByLogin.has(login))usersByLogin.set(login,user);
    if(login&&phone&&!contacts.has(login))contacts.set(login,{name:String(user.employee||user.name||user.login||login),phone});
  }
  const missingPhone=logins.filter((login)=>!contacts.has(login));
  await Promise.all(missingPhone.map((login)=>{const user=usersByLogin.get(login)||{};return pool.query(`INSERT INTO whatsapp_alert_history
    (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
    ['System notification',String(reference||''),'',String(user.employee||user.name||user.login||login),'','Skipped - phone number missing']);}));
  await Promise.allSettled([...contacts.entries()].map(async([login,contact])=>{
    let status='Sent';
    try{
      if(workflowTemplate)try{await sendMetaWhatsAppTemplate({to:contact.phone,...workflowTemplate})}
      catch(templateError){console.warn(`WhatsApp template ${workflowTemplate.templateKey} unavailable; using text fallback:`,templateError.message);await sendMetaWhatsAppText({to:contact.phone,message:`Nerve Center notification\n${message}`})}
      else await sendMetaWhatsAppText({to:contact.phone,message:`Nerve Center notification\n${message}`});
    }
    catch(error){status=`Failed - ${String(error?.message||'Meta delivery error').slice(0,160)}`;console.error(`WhatsApp notification failed for ${login}:`,error.message)}
    await pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
      ['System notification',String(reference||''),'',contact.name,contact.phone,status]);
  }));
}

async function addTicketNotifications(client,recipients,reference,message,workflowTemplate,{whatsapp=true}={}){
  const logins=[...new Set(recipients.map((value)=>String(value||'').trim().toLowerCase()).filter(Boolean))];
  for(const login of logins){
    await client.query(`INSERT INTO crm_notifications (recipient_login,ticket_reference,message) VALUES ($1,$2,$3)`,[login,reference,message]);
  }
  if(whatsapp)await sendWhatsAppNotifications(client,logins,reference,message,workflowTemplate);
}

let consolidatedReportRunning=false;
async function sendScheduledConsolidatedWhatsAppReports(now=new Date()){
  if(!databaseReady||consolidatedReportRunning)return {skipped:true};
  if(!consolidatedReportDue(now))return {skipped:true,reason:'outside scheduled report window'};
  consolidatedReportRunning=true;
  try{
    const window=consolidatedReportWindow(now);
    const [{rows:requestRows},{rows:equipmentRows},{rows:userRows}]=await Promise.all([
      pool.query(`SELECT reference,equipment_name AS equipment,door_number AS door,chassis_number AS chassis,site,status,idle_reason AS "idleReason",
        owner_name AS "user",closed_by AS "closedBy",started_at AS "startedAt",closed_at AS "closedAt"
        FROM maintenance_requests
        WHERE (started_at >= $1 AND started_at < $2 AND status <> 'Closed')
           OR (closed_at >= $1 AND closed_at < $2)`,[window.start,window.end]),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Equipment master'`),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`),
    ]);
    const enriched=prepareConsolidatedRows(attachRequestOems(requestRows,equipmentRows.map(({record_data})=>record_data||{})),window.end);
    const openRequests=enriched.filter((request)=>request.status!=='Closed'&&!request.closedAt);
    const closedRequests=enriched.filter((request)=>Boolean(request.closedAt));
    let sent=0,failed=0,skipped=0;
    for(const row of userRows){
      const user=row.record_data||{};
      const profile=resolveMobileAccess({user});
      if(profile.sessionRole!=='super')continue;
      const isAdmin=profile.permissions.adminLevel==='Admin';
      const isManager=profile.permissions.adminLevel==='Manager';
      if(!isAdmin&&!isManager)continue;
      const login=String(user.login||'').trim().toLowerCase();
      const phone=String(user.phone||user.phoneNo||user.phoneNumber||'').trim();
      if(!login)continue;
      let scope=managerReportScope(user);
      if(isAdmin&&scope.sites!==null&&!scope.sites.length)scope={key:'ALL',label:'All regions',sites:null};
      if(scope.sites!==null&&!scope.sites.length){skipped++;continue}
      const scopedOpen=openRequests.filter((request)=>reportScopeIncludesSite(scope,request.site));
      const scopedClosed=closedRequests.filter((request)=>reportScopeIncludesSite(scope,request.site));
      const claim=await pool.query(`INSERT INTO whatsapp_consolidated_report_runs
        (slot_key,recipient_login,scope_key,status,attempts,updated_at) VALUES ($1,$2,$3,'Sending',1,NOW())
        ON CONFLICT (slot_key,recipient_login,scope_key) DO UPDATE
          SET status='Sending',attempts=whatsapp_consolidated_report_runs.attempts+1,updated_at=NOW()
          WHERE whatsapp_consolidated_report_runs.status LIKE 'Failed%' AND whatsapp_consolidated_report_runs.attempts<3
        RETURNING id`,[window.slotKey,login,scope.key]);
      if(!claim.rowCount){skipped++;continue}
      const recipientName=String(user.employee||user.name||user.login||login);
      let status='Sent';
      try{
        if(!phone)throw new Error('Phone number missing');
        const summary=`SCOPE: ${scope.label}\nWINDOW: ${reportDateTime(window.start)} - ${reportDateTime(window.end)}\nOFF ROAD / OPEN: ${scopedOpen.length}\nON ROAD / CLOSED: ${scopedClosed.length}\nThe complete report is attached as a PDF.`;
        try{await sendMetaWhatsAppTemplate({to:phone,templateKey:'consolidatedRequestReport',parameters:[summary]})}
        catch(templateError){console.warn('Consolidated WhatsApp notification template unavailable; attempting PDF delivery:',templateError.message)}
        const pdf=await buildFleetConsolidatedReportPdf({scopeLabel:scope.label,start:window.start,end:window.end,openRequests:scopedOpen,closedRequests:scopedClosed});
        await sendMetaWhatsAppDocument({to:phone,buffer:pdf,filename:reportFilename('Fleet',scope.key,window.slotKey),caption:`Nerve Center fleet report • ${scope.label} • ${reportDateTime(window.end)}. Open the attached PDF for complete details.`});
        sent++;
      }catch(error){
        status=`Failed - ${String(error?.message||'Meta delivery error').slice(0,160)}`;
        failed++;
        console.error(`Consolidated WhatsApp report failed for ${login}:`,error.message);
      }
      await Promise.all([
        pool.query(`UPDATE whatsapp_consolidated_report_runs SET status=$1,updated_at=NOW() WHERE id=$2`,[status,claim.rows[0].id]),
        pool.query(`INSERT INTO whatsapp_alert_history
          (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
          ['Consolidated request report',scope.label,window.slotKey,recipientName,phone,status]),
      ]);
    }
    return {slotKey:window.slotKey,sent,failed,skipped,open:openRequests.length,closed:closedRequests.length};
  }finally{consolidatedReportRunning=false}
}

let consolidatedTicketReportRunning=false;
async function sendScheduledConsolidatedTicketReports(now=new Date()){
  if(!databaseReady||consolidatedTicketReportRunning)return {skipped:true};
  if(!ticketReportDue(now))return {skipped:true,reason:'outside scheduled CRM report window'};
  consolidatedTicketReportRunning=true;
  try{
    const window=ticketReportWindow(now);
    const [{rows:ticketRows},{rows:userRows}]=await Promise.all([
      pool.query(`SELECT reference,site,creator_name AS "user",message AS remarks,status,
        created_at AS "openedAt",resolved_at AS "resolvedAt"
        FROM crm_tickets
        WHERE (created_at >= $1 AND created_at < $2 AND status <> 'Resolved')
           OR (resolved_at >= $1 AND resolved_at < $2)`,[window.start,window.end]),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`),
    ]);
    const tickets=prepareTicketReportRows(ticketRows,window.end);
    const openTickets=tickets.filter((ticket)=>ticket.status!=='Resolved'&&!ticket.resolvedAt);
    const closedTickets=tickets.filter((ticket)=>Boolean(ticket.resolvedAt));
    let sent=0,failed=0,skipped=0;
    for(const row of userRows){
      const user=row.record_data||{};
      const profile=resolveMobileAccess({user});
      if(profile.sessionRole!=='super')continue;
      const isAdmin=profile.permissions.adminLevel==='Admin';
      const isManager=profile.permissions.adminLevel==='Manager';
      if(!isAdmin&&!isManager)continue;
      const login=String(user.login||'').trim().toLowerCase();
      const phone=String(user.phone||user.phoneNo||user.phoneNumber||'').trim();
      if(!login)continue;
      let scope=managerReportScope(user);
      if(isAdmin&&scope.sites!==null&&!scope.sites.length)scope={key:'ALL',label:'All regions',sites:null};
      if(scope.sites!==null&&!scope.sites.length){skipped++;continue}
      const scopedOpen=openTickets.filter((ticket)=>reportScopeIncludesSite(scope,ticket.site));
      const scopedClosed=closedTickets.filter((ticket)=>reportScopeIncludesSite(scope,ticket.site));
      const claim=await pool.query(`INSERT INTO whatsapp_consolidated_report_runs
        (slot_key,recipient_login,scope_key,status,attempts,updated_at) VALUES ($1,$2,$3,'Sending',1,NOW())
        ON CONFLICT (slot_key,recipient_login,scope_key) DO UPDATE
          SET status='Sending',attempts=whatsapp_consolidated_report_runs.attempts+1,updated_at=NOW()
          WHERE whatsapp_consolidated_report_runs.status LIKE 'Failed%' AND whatsapp_consolidated_report_runs.attempts<3
        RETURNING id`,[window.slotKey,login,`CRM-${scope.key}`]);
      if(!claim.rowCount){skipped++;continue}
      const recipientName=String(user.employee||user.name||user.login||login);
      let status='Sent';
      try{
        if(!phone)throw new Error('Phone number missing');
        const summary=`SCOPE: ${scope.label}\nWINDOW: ${reportDateTime(window.start)} - ${reportDateTime(window.end)}\nOPEN TICKETS: ${scopedOpen.length}\nCLOSED TICKETS: ${scopedClosed.length}\nThe complete report is attached as a PDF.`;
        try{await sendMetaWhatsAppTemplate({to:phone,templateKey:'consolidatedTicketReport',parameters:[summary]})}
        catch(templateError){console.warn('Consolidated CRM WhatsApp notification template unavailable; attempting PDF delivery:',templateError.message)}
        const pdf=await buildTicketConsolidatedReportPdf({scopeLabel:scope.label,start:window.start,end:window.end,openTickets:scopedOpen,closedTickets:scopedClosed});
        await sendMetaWhatsAppDocument({to:phone,buffer:pdf,filename:reportFilename('CRM',scope.key,window.slotKey),caption:`Nerve Center CRM ticket report • ${scope.label} • ${reportDateTime(window.end)}. Open the attached PDF for complete details.`});
        sent++;
      }catch(error){
        status=`Failed - ${String(error?.message||'Meta delivery error').slice(0,160)}`;
        failed++;
        console.error(`Consolidated CRM WhatsApp report failed for ${login}:`,error.message);
      }
      await Promise.all([
        pool.query(`UPDATE whatsapp_consolidated_report_runs SET status=$1,updated_at=NOW() WHERE id=$2`,[status,claim.rows[0].id]),
        pool.query(`INSERT INTO whatsapp_alert_history
          (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
          ['Consolidated CRM ticket report',scope.label,window.slotKey,recipientName,phone,status]),
      ]);
    }
    return {slotKey:window.slotKey,sent,failed,skipped,open:openTickets.length,closed:closedTickets.length};
  }finally{consolidatedTicketReportRunning=false}
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
    else if(profile.permissions.managerRoles.some((role)=>managerUserRole(role)===creatorRole)){
      if(userManagesSite(user,site))managerLogins.push(login);
    }
  }
  return {adminLogins,managerLogins};
}

function requestNotificationTime(value){
  return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(new Date(value));
}

async function requestStakeholderLogins(client,{site,requesterLogin}){
  const {rows}=await client.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  const recipients=[String(requesterLogin||'').trim().toLowerCase()];
  const requestSite=canonicalSiteName(site);
  for(const row of rows){
    const user=row.record_data||{};
    const login=String(user.login||'').trim().toLowerCase();
    if(!login)continue;
    const profile=resolveMobileAccess({user});
    const userSite=canonicalSiteName(user.site||user.location||user.currentLocation);
    const siteMatches=Boolean(requestSite)&&userSite===requestSite;
    if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Admin')recipients.push(login);
    if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&userManagesSite(user,site))recipients.push(login);
    if(profile.sessionRole==='normal'&&siteMatches&&['Production User','Maintenance User','MIS User'].includes(profile.assignedRole))recipients.push(login);
  }
  return [...new Set(recipients.filter(Boolean))];
}

app.get('/api/tickets',requireSession,async(req,res,next)=>{
  try{
    const category=TICKET_CATEGORIES.includes(String(req.query.category||''))?String(req.query.category):'';
    const values=[];
    const conditions=[];
    let managerScope=null;
    if(req.session.role!=='super'){
      values.push(String(req.session.login||'').trim().toLowerCase());
      conditions.push(`lower(creator_login)=$${values.length}`);
    }else if(req.session.permissions?.adminLevel==='Manager'){
      const user=await currentUserRecord(req.session);
      values.push(managerRoleSelection(req.session.permissions?.managerRoles?.length?req.session.permissions.managerRoles:req.session.permissions?.managerRole).map(managerUserRole));
      conditions.push(`creator_role=ANY($${values.length}::text[])`);
      managerScope=managerReportScope(user);
    }
    if(category){values.push(category);conditions.push(`category=$${values.length}`)}
    const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
    const {rows}=await pool.query(`SELECT ${ticketProjection()} FROM crm_tickets ${where} ORDER BY created_at DESC`,values);
    res.json(managerScope?rows.filter((ticket)=>reportScopeIncludesSite(managerScope,ticket.site)):rows);
  }catch(error){next(error)}
});

app.post('/api/tickets',requireSession,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const managerRoles=managerRoleSelection(req.session.permissions?.managerRoles?.length?req.session.permissions.managerRoles:req.session.permissions?.managerRole);
    const creatorRole=req.session.role==='super'
      ? req.session.permissions?.adminLevel==='Manager'&&managerRoles.length
        ? managerUserRole(managerRoles[0])
        : 'Admin'
      : String(req.session.assignedRole||'User');
    const roleCategory=String(creatorRole).replace(/ User$/,'');
    const category=TICKET_CATEGORIES.includes(roleCategory)?roleCategory:'General';
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
    await addTicketNotifications(client,[...recipients.adminLogins,...recipients.managerLogins],reference,`${req.session.name||'A user'} (@${creatorLogin}) created ticket ${reference}.`,
      {templateKey:'ticketCreated',parameters:[reference,req.session.name||creatorLogin,site]},{whatsapp:false});
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
    sendTicketRaisedEmail(rows[0]).catch((error)=>console.error(`Ticket email failed for ${reference}:`,error.message));
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
    await addTicketNotifications(client,[ticket.creatorLogin,...recipients.managerLogins],ticket.reference,`Ticket ${ticket.reference} was resolved by ${req.session.name||'Admin'}.`,
      {templateKey:'ticketResolved',parameters:[ticket.reference,req.session.name||'Admin']},{whatsapp:false});
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
      const userSite=canonicalSiteName(user.site||user.location||user.currentLocation);
      const siteMatches=!userSite||userSite===canonicalSiteName(request.site);
      if(profile.assignedRole==='Maintenance User'&&siteMatches)recipients.push(login);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Admin')recipients.push(login);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&profile.permissions.managerRoles.includes('Maintenance Manager')&&userManagesSite(user,request.site))recipients.push(login);
    }
    const newRecipients=[];
    const message=`${slot}:00 reminder: add today’s maintenance update and delay reason for ${request.reference}.`;
    for(const login of [...new Set(recipients)]){
      const key=`maintenance-reminder:${day}:${slot}:${request.reference}:${login}`;
      const inserted=await pool.query(`INSERT INTO crm_notifications (recipient_login,ticket_reference,message,notification_key)
        VALUES ($1,$2,$3,$4) ON CONFLICT (notification_key) DO NOTHING RETURNING id`,[login,request.reference,message,key]);
      if(inserted.rowCount)newRecipients.push(login);
    }
    // Maintenance reminders remain available in-app. WhatsApp request traffic is
    // delivered only through the scheduled consolidated report.
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

const requestProjection=`reference AS ref, equipment_name AS equipment, equipment_group AS "equipmentGroup", door_number AS door,
  registration_number AS reg, chassis_number AS chassis, driver_name AS "driverName", driver_name_source AS "driverNameSource", superior_name AS superior, site, category, complaint, complaint_audio AS "complaintAudio",
  to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS start,
  CASE WHEN closed_at IS NULL THEN '—' ELSE CONCAT(FLOOR(EXTRACT(EPOCH FROM (closed_at-started_at))/86400)::int,'d ',FLOOR(MOD(EXTRACT(EPOCH FROM (closed_at-started_at)),86400)/3600)::int,'h ',FLOOR(MOD(EXTRACT(EPOCH FROM (closed_at-started_at)),3600)/60)::int,'m') END AS hours,
  status, idle_reason AS "idleReason", owner_name AS owner, requester_login AS "requesterLogin",
  to_char(ideal_requested_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "idealRequestedAt",
  ideal_requested_by AS "idealRequestedBy",to_char(ideal_approved_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "idealApprovedAt",ideal_approved_by AS "idealApprovedBy",
  to_char(closed_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "closedAt",
  closed_by AS "closedBy", maintenance_work AS "maintenanceWork", maintenance_audio AS "maintenanceAudio", verification_status AS "verificationStatus",
  to_char(verified_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "verifiedAt",
  verified_by AS "verifiedBy", first_trip_done AS "firstTripDone",
  to_char(first_trip_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "firstTripAt",
  first_trip_by AS "firstTripBy", (first_trip_card_image <> '') AS "firstTripCardUploaded"`;

function requestEquipmentNotificationDetails(request={}){
  return [
    String(request.equipment||'').trim(),
    String(request.door||'').trim()?`Door: ${String(request.door).trim()}`:'',
    String(request.chassis||'').trim()?`Chassis: ${String(request.chassis).trim()}`:'',
  ].filter(Boolean).join(' | ')||'Not available';
}

let requestDriverSyncRunning=false;
async function syncTemporaryRequestDrivers(){
  if(!oracleConfigured||!databaseReady||requestDriverSyncRunning)return {skipped:true};
  requestDriverSyncRunning=true;
  let updated=0;
  try{
    const {rows}=await pool.query(`SELECT reference,door_number,equipment_name,site,
      to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS lookup_date,
      to_char(started_at AT TIME ZONE 'Asia/Kolkata','HH24:MI:SS') AS lookup_time
      FROM maintenance_requests
      WHERE lower(driver_name_source) IN ('demo','manual')
      ORDER BY created_at ASC LIMIT 500`);
    for(const row of rows){
      try{
        const result=await oracleDriverLookup({
          date:row.lookup_date,
          time:row.lookup_time,
          location:row.site,
          equipmentNo:row.door_number||row.equipment_name
        });
        const actualName=String(result?.driverName||'').trim();
        if(!result?.found||!actualName)continue;
        const source=`Oracle${result.source?` - ${result.source}`:''}`.slice(0,200);
        const response=await pool.query(`UPDATE maintenance_requests SET driver_name=$1,driver_name_source=$2,driver_synced_at=NOW()
          WHERE reference=$3 AND lower(driver_name_source) IN ('demo','manual')`,[actualName,source,row.reference]);
        updated+=response.rowCount;
      }catch(error){console.error(`Oracle driver sync failed for ${row.reference}.`,error)}
    }
    return {checked:rows.length,updated};
  }finally{requestDriverSyncRunning=false}
}

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
    let scopedSite=null,scopedManagerSites=null;
    if(req.session.role==='normal'&&req.session.assignedRole==='MIS User'){
      const misUser=await currentUserRecord(req.session);
      scopedSite=String(misUser.site||misUser.location||'').trim();
    }
    if(req.session.role==='super'&&req.session.permissions?.adminLevel==='Manager'){
      const manager=await currentUserRecord(req.session);
      scopedManagerSites=managerReportScope(manager).sites;
    }
    const {rows}=await pool.query(query);
    const visibleRows=scopedManagerSites!==null
      ? rows.filter((row)=>reportScopeIncludesSite({sites:scopedManagerSites},row.site))
      : scopedSite===null
      ? rows
      : scopedSite
        ? rows.filter((row)=>canonicalSiteName(row.site)===canonicalSiteName(scopedSite))
        : [];
    res.json(await attachDailyRemarks(visibleRows));
  }catch(error){next(error)}
});

app.post('/api/requests/:reference/daily-remarks',requireSession,requirePermission('closeRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const remark=String(req.body?.remark||'').trim();
    const delayReason=String(req.body?.delayReason||'').trim();
    if(!remark||!delayReason)return res.status(400).json({error:'Enter today’s update and the reason for delay.'});
    const eligible=await pool.query(`SELECT reference,site,requester_login FROM maintenance_requests WHERE reference=$1 AND status NOT IN ('Closed','Idle','Ideal')`,[reference]);
    if(!eligible.rows.length)return res.status(409).json({error:'Daily remarks are available only while the request is open.'});
    const existingToday=await pool.query(`SELECT id FROM maintenance_daily_remarks WHERE request_reference=$1
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date LIMIT 1`,[reference]);
    if(existingToday.rows.length)return res.status(409).json({error:'Today’s update is already saved. Previous daily updates are read-only.'});
    await pool.query(`INSERT INTO maintenance_daily_remarks (request_reference,remark,delay_reason,author_login,author_name) VALUES ($1,$2,$3,$4,$5)`,
      [reference,remark,delayReason,String(req.session.login||'').trim().toLowerCase(),req.session.name||'Maintenance User']);
    const {rows:userRows}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
    const recipients=[String(eligible.rows[0].requester_login||'').trim().toLowerCase()];
    for(const row of userRows){const user=row.record_data||{};const login=String(user.login||'').trim().toLowerCase();if(!login)continue;
      const profile=resolveMobileAccess({user});const userSite=canonicalSiteName(user.site||user.location||user.currentLocation);const siteMatches=!userSite||userSite===canonicalSiteName(eligible.rows[0].site);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Admin')recipients.push(login);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&profile.permissions.managerRoles.some((role)=>['Maintenance Manager','Production Manager'].includes(role))&&userManagesSite(user,eligible.rows[0].site))recipients.push(login);
    }
    await addTicketNotifications(pool,recipients,reference,`${req.session.name||'Maintenance User'} added a daily maintenance update for ${reference}.`,
      {templateKey:'dailyUpdate',parameters:[req.session.name||'Maintenance User',reference]},{whatsapp:false});
    const {rows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
    res.status(201).json((await attachDailyRemarks(rows))[0]);
  }catch(error){next(error)}
});

app.post('/api/requests',requireSession,requirePermission('createRequests'),async(req,res,next)=>{
  try{
    const {ref,equipment='',equipmentGroup='',door,reg='',chassis='',driverName='',driverNameSource='',site='Not assigned',category='Maintenance request',complaint,complaintAudio='',start,forceDuplicate=false}=req.body||{};
    if(!ref||!door||!complaint)return res.status(400).json({error:'Reference, door number and complaint are required.'});
    if(!String(chassis).trim())return res.status(400).json({error:'Chassis number is required. Contact the admin team to update the chassis number in Equipment Master.'});
    if(!validRequestAudioDataUrl(complaintAudio))return res.status(400).json({error:'Complaint audio must be a supported recording up to 3 MB.'});
    if(forceDuplicate!==true){
      const duplicate=await pool.query(`SELECT reference FROM maintenance_requests WHERE lower(trim(chassis_number))=lower(trim($1)) AND status<>'Closed' ORDER BY created_at DESC LIMIT 1`,[chassis]);
      if(duplicate.rows.length)return res.status(409).json({duplicate:true,existingReference:duplicate.rows[0].reference,error:`Request ${duplicate.rows[0].reference} already exists for this equipment. Do you still want to add another request?`});
    }
    const startedAt=parseIndiaRequestDateTime(start);
    const requester=await currentUserRecord(req.session);
    const superior=String(requester.superior||'').trim().slice(0,200);
    const storedDriverName=String(driverName).trim().slice(0,200)||'Demo Driver';
    const storedDriverSource=String(driverNameSource).trim().slice(0,200)||(storedDriverName==='Demo Driver'?'Demo':'Manual');
    const {rows}=await pool.query(`INSERT INTO maintenance_requests
      (reference,equipment_name,equipment_group,door_number,registration_number,chassis_number,driver_name,driver_name_source,superior_name,site,category,complaint,complaint_audio,started_at,status,owner_name,requester_login)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Open',$15,$16)
      RETURNING ${requestProjection}`,
      [ref,equipment,String(equipmentGroup).trim().slice(0,200),door,reg,chassis,storedDriverName,storedDriverSource,String(superior).trim().slice(0,200),site,category,complaint,complaintAudio,startedAt,req.session.name||'Mobile User',String(req.session.login||'').trim().toLowerCase()]);
    const recipients=await requestStakeholderLogins(pool,{site:rows[0].site,requesterLogin:rows[0].requesterLogin});
    const equipmentDetails=requestEquipmentNotificationDetails(rows[0]);
    const openedAt=requestNotificationTime(startedAt);
    const openedBy=req.session.name||'Production User';
    await addTicketNotifications(pool,recipients,rows[0].ref,`Request ${rows[0].ref} opened for ${equipmentDetails}. Breakdown: ${rows[0].category}. Date & time: ${openedAt}. Location: ${rows[0].site}. User: ${openedBy}.`,
      {templateKey:'requestOpened',parameters:[rows[0].ref,equipmentDetails,rows[0].category,openedAt,rows[0].site,openedBy]},{whatsapp:false});
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
      site=$5,category=$6,complaint=$7,started_at=$8 WHERE reference=$9 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL
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
    const ideal=req.body?.ideal===true||String(req.body?.ideal||'').toLowerCase()==='true';
    const idleReason=String(req.body?.idleReason||'').trim();
    const closedAt=requestDateTimeValue(closingDate,closingTime);
    if(!closedAt)return res.status(400).json({error:'Enter a valid closing date and time in HH:MM:SS format.'});
    if(!maintenanceWork)return res.status(400).json({error:'Describe the maintenance work completed.'});
    if(ideal&&!['No driver','No work'].includes(idleReason))return res.status(400).json({error:'Choose an Idle reason: No driver or No work.'});
    if(!validRequestAudioDataUrl(maintenanceAudio))return res.status(400).json({error:'Maintenance audio must be a supported recording up to 3 MB.'});
    if(!ideal&&!REQUEST_CLOSE_STATUSES.includes(status))return res.status(400).json({error:'Choose a valid maintenance status.'});
    const {rows}=ideal
      ? await pool.query(`UPDATE maintenance_requests SET closed_at=NULL,closed_by='',maintenance_work=$1,maintenance_audio=$2,status='Idle',idle_reason=$3,
          ideal_requested_at=NOW(),ideal_requested_by=$4,ideal_approved_at=NULL,ideal_approved_by=''
          WHERE reference=$5 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL RETURNING ${requestProjection}`,
          [maintenanceWork,maintenanceAudio,idleReason,req.session.name||'Maintenance User',reference])
      : await pool.query(`UPDATE maintenance_requests SET closed_at=$1,closed_by=$2,maintenance_work=$3,maintenance_audio=$4,status=$5
          WHERE reference=$6 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL RETURNING ${requestProjection}`,
          [closedAt,req.session.name||'Maintenance User',maintenanceWork,maintenanceAudio,status,reference]);
    if(!rows.length)return res.status(409).json({error:'This request has already been verified or no longer exists.'});
    if(ideal){
      const {rows:userRows}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
      const recipients=[];
      for(const row of userRows){const user=row.record_data||{};const login=String(user.login||'').trim().toLowerCase();if(!login)continue;const profile=resolveMobileAccess({user});if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&profile.permissions.managerRoles.includes('Maintenance Manager')&&userManagesSite(user,rows[0].site))recipients.push(login)}
      await addTicketNotifications(pool,recipients,rows[0].ref,`Request ${rows[0].ref} was marked Idle (${rows[0].idleReason}) by ${req.session.name||'Maintenance User'}. Review it and approve Make on road.`,
        {templateKey:'requestIdle',parameters:[rows[0].ref,req.session.name||'Maintenance User',rows[0].idleReason]},{whatsapp:false});
    }else{
      const recipients=await requestStakeholderLogins(pool,{site:rows[0].site,requesterLogin:rows[0].requesterLogin});
      const equipmentDetails=requestEquipmentNotificationDetails(rows[0]);
      const closedAtLabel=requestNotificationTime(closedAt);
      const closedBy=req.session.name||'Maintenance User';
      await addTicketNotifications(pool,recipients,rows[0].ref,`Request ${rows[0].ref} closed for ${equipmentDetails}. Breakdown: ${rows[0].category}. Closing date & time: ${closedAtLabel}. Maintenance work: ${rows[0].maintenanceWork}. Closed by: ${closedBy}.`,
        {templateKey:'requestClosed',parameters:[rows[0].ref,equipmentDetails,rows[0].category,closedAtLabel,rows[0].maintenanceWork,closedBy]},{whatsapp:false});
    }
    res.json(rows[0]);
  }catch(error){next(error)}
});

app.patch('/api/requests/:reference/ideal-onroad',requireSession,async(req,res,next)=>{
  try{
    if(req.session.role!=='super'||req.session.permissions?.adminLevel!=='Manager'||!managerRoleSelection(req.session.permissions?.managerRoles?.length?req.session.permissions.managerRoles:req.session.permissions?.managerRole).includes('Maintenance Manager'))
      return res.status(403).json({error:'Only the assigned Maintenance Manager can approve an Idle request.'});
    const manager=await currentUserRecord(req.session);
    const reference=String(req.params.reference||'').trim();
    const eligible=await pool.query(`SELECT site FROM maintenance_requests WHERE reference=$1 AND status IN ('Idle','Ideal') AND verified_at IS NULL`,[reference]);
    if(!eligible.rows.length||!userManagesSite(manager,eligible.rows[0].site))return res.status(409).json({error:'This Idle request is no longer awaiting your approval or is outside your assigned sites.'});
    const {rows}=await pool.query(`UPDATE maintenance_requests SET status='Closed',closed_at=NOW(),closed_by=$1,
      ideal_approved_at=NOW(),ideal_approved_by=$1 WHERE reference=$2 AND status IN ('Idle','Ideal') AND verified_at IS NULL
      RETURNING ${requestProjection}`,[req.session.name||'Maintenance Manager',reference]);
    if(!rows.length)return res.status(409).json({error:'This Idle request is no longer awaiting your approval.'});
    const recipients=await requestStakeholderLogins(pool,{site:rows[0].site,requesterLogin:rows[0].requesterLogin});
    const approvedAt=requestNotificationTime(new Date());
    await addTicketNotifications(pool,recipients,rows[0].ref,`Request ${rows[0].ref} was approved on road and closed at ${approvedAt} by ${req.session.name||'Maintenance Manager'}. It is now awaiting MIS verification.`,
      {templateKey:'requestOnRoad',parameters:[rows[0].ref,approvedAt,req.session.name||'Maintenance Manager']},{whatsapp:false});
    res.json(rows[0]);
  }catch(error){next(error)}
});

app.delete('/api/requests/:reference',requireSession,requirePermission('deleteRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const result=await pool.query(`DELETE FROM maintenance_requests WHERE reference=$1 AND verified_at IS NULL AND status NOT IN ('Idle','Ideal')`,[reference]);
    if(!result.rowCount)return res.status(409).json({error:'Verified or Idle requests cannot be deleted, or the request no longer exists.'});
    res.status(204).end();
  }catch(error){next(error)}
});

app.patch('/api/requests/:reference/verify',requireSession,requirePermission('verifyRequests',{role:'MIS User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const firstTripDone=req.body?.firstTripDone===true||String(req.body?.firstTripDone||'').toLowerCase()==='true';
    const firstTripAt=firstTripDone?requestDateTimeValue(req.body?.firstTripDate,req.body?.firstTripTime):null;
    const firstTripCardImage=String(req.body?.firstTripCardImage||'');
    if(firstTripDone&&!firstTripAt)return res.status(400).json({error:'Enter a valid first-trip date and time in HH:MM:SS format.'});
    if(!validTripCardImageDataUrl(firstTripCardImage))return res.status(400).json({error:'Upload a JPEG, PNG, or WebP trip-card image up to 5 MB.'});
    const misUser=await currentUserRecord(req.session);
    const misSite=String(misUser.site||misUser.location||'').trim();
    if(!misSite)return res.status(403).json({error:'A location must be assigned before this MIS user can verify requests.'});
    const eligible=await pool.query(`SELECT site FROM maintenance_requests WHERE reference=$1 AND status='Closed' AND verified_at IS NULL`,[reference]);
    if(!eligible.rows.length)return res.status(409).json({error:'Only unverified closed requests can be verified.'});
    if(canonicalSiteName(eligible.rows[0].site)!==canonicalSiteName(misSite))return res.status(403).json({error:'This request belongs to a different location.'});
    const {rows}=await pool.query(`UPDATE maintenance_requests SET verification_status='Verified',verified_at=NOW(),verified_by=$1,
      first_trip_done=$2,first_trip_at=$3,first_trip_by=$4,first_trip_card_image=$5 WHERE reference=$6 AND status='Closed' AND verified_at IS NULL
      RETURNING ${requestProjection}`,[req.session.name||'MIS User',firstTripDone,firstTripAt,firstTripDone?(req.session.name||'MIS User'):'',firstTripCardImage,reference]);
    if(!rows.length)return res.status(409).json({error:'Only unverified closed requests can be verified.'});
    const recipients=await requestStakeholderLogins(pool,{site:rows[0].site,requesterLogin:rows[0].requesterLogin});
    await addTicketNotifications(pool,recipients,rows[0].ref,`Request ${rows[0].ref} was verified by ${req.session.name||'MIS User'}${firstTripDone?' and its first trip was completed':' with its first trip still pending'}.`,
      {templateKey:'requestVerified',parameters:[rows[0].ref,req.session.name||'MIS User',firstTripDone?'Completed':'Pending']},{whatsapp:false});
    res.json(rows[0]);
  }catch(error){next(error)}
});

app.get('/api/requests/:reference/trip-card',requireSession,requirePermission('verifyRequests',{role:'MIS User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const misUser=await currentUserRecord(req.session);
    const misSite=String(misUser.site||misUser.location||'').trim();
    if(!misSite)return res.status(403).json({error:'A location must be assigned before this MIS user can view trip cards.'});
    const {rows}=await pool.query(`SELECT site,first_trip_card_image AS image FROM maintenance_requests
      WHERE reference=$1 AND status='Closed' AND verified_at IS NOT NULL`,[reference]);
    if(!rows.length)return res.status(404).json({error:'Verified closed request not found.'});
    if(canonicalSiteName(rows[0].site)!==canonicalSiteName(misSite))return res.status(403).json({error:'This request belongs to a different location.'});
    if(!validTripCardImageDataUrl(rows[0].image))return res.status(404).json({error:'Trip-card image is not available.'});
    res.json({image:rows[0].image});
  }catch(error){next(error)}
});

app.get('/api/masters',requireSession,async(req,res,next)=>{
  try{
    const superCanView=(master)=>req.session.role==='super'&&(accessAllows(req.session.permissions?.masterAccess,master)||accessAllows(req.session.permissions?.mobileMasterAccess,master));
    const canViewEquipment=superCanView('Equipment master')||req.session.permissions?.viewEquipment===true;
    const canViewRepairTypes=superCanView('Repair type master')||req.session.permissions?.viewRepairTypes===true;
    if(!canViewEquipment&&!canViewRepairTypes)
      return res.status(403).json({error:'Your assigned role is not authorized to view master records.'});
    const managerRecord=req.session.role==='super'&&req.session.permissions?.adminLevel==='Manager'?await currentUserRecord(req.session):null;
    const managerScope=managerRecord?managerReportScope(managerRecord):null;
    const {rows}=await pool.query('SELECT id, master_name, record_data FROM master_records ORDER BY created_at ASC');
    const grouped={},privilegesByUsername=new Map();
    for(const row of rows){
      if(req.session.role==='super'){
        if(!accessAllows(req.session.permissions?.masterAccess,row.master_name)&&!accessAllows(req.session.permissions?.mobileMasterAccess,row.master_name))continue;
      }else{
        if(row.master_name==='Equipment master'&&!canViewEquipment)continue;
        if(row.master_name==='Repair type master'&&!canViewRepairTypes)continue;
        if(row.master_name!=='Equipment master'&&row.master_name!=='Repair type master')continue;
      }
      const record=row.master_name==='Users & employees'?publicUserRecord(row.record_data):row.record_data;
      if(managerRecord&&row.master_name==='Equipment master'){
        const equipmentSite=canonicalSiteName(record.currentLocation||record.site||record.location||'');
        if(!reportScopeIncludesSite(managerScope,equipmentSite))continue;
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
    if(master==='Users & employees'&&records.some(record=>isTrueSuperAdmin(record))&&!isTrueSuperAdmin(req.session.permissions))
      return res.status(403).json({error:'Only a Super Admin can create another Super Admin account.'});
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
      if((isTrueSuperAdmin(record)||isTrueSuperAdmin(existing.rows[0].record_data))&&!isTrueSuperAdmin(req.session.permissions))
        return res.status(403).json({error:'Only a Super Admin can manage Super Admin accounts.'});
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
    if(master==='Users & employees')return res.status(403).json({error:'User accounts cannot be deleted in bulk.'});
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
    if(master==='Users & employees'){
      const existing=await pool.query('SELECT record_data FROM master_records WHERE id=$1 AND master_name=$2',[id,master]);
      if(isTrueSuperAdmin(existing.rows[0]?.record_data)&&!isTrueSuperAdmin(req.session.permissions))return res.status(403).json({error:'Only a Super Admin can delete Super Admin accounts.'});
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
    if(oracleConfigured)void syncOracleEquipmentTransfers()
      .then(result=>console.log('Oracle equipment-transfer sync completed.',result))
      .catch(error=>console.error('Oracle equipment-transfer startup sync failed.',error));
    if(oracleConfigured)void syncTemporaryRequestDrivers()
      .then(result=>console.log('Oracle request-driver sync completed.',result))
      .catch(error=>console.error('Oracle request-driver startup sync failed.',error));
    void sendScheduledConsolidatedWhatsAppReports()
      .then(result=>console.log('Scheduled consolidated WhatsApp report check completed.',result))
      .catch(error=>console.error('Scheduled consolidated WhatsApp report check failed.',error));
    void sendScheduledConsolidatedTicketReports()
      .then(result=>console.log('Scheduled consolidated CRM WhatsApp report check completed.',result))
      .catch(error=>console.error('Scheduled consolidated CRM WhatsApp report check failed.',error));
    void auditAdminLockIncidents().catch(error=>console.error('CRM admin-lock audit failed.',error));
    if(process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID)void submitMetaWhatsAppTemplates()
      .then(result=>console.log('Meta WhatsApp template synchronization completed.',result))
      .catch(error=>console.error('Meta WhatsApp template synchronization failed.',error));
  }catch(error){
    databaseReady=false;
    databaseError=error instanceof Error?error.message:'Database initialization failed.';
    console.error('Database initialization failed; retrying in 30 seconds.',error);
    setTimeout(initializeDatabase,30000);
  }
}

void initializeDatabase();
const requestDriverSyncTimer=setInterval(()=>{
  void syncTemporaryRequestDrivers()
    .then(result=>console.log('Scheduled Oracle request-driver sync completed.',result))
    .catch(error=>console.error('Scheduled Oracle request-driver sync failed.',error));
},driverSyncIntervalMs);
requestDriverSyncTimer.unref?.();
const consolidatedWhatsAppTimer=setInterval(()=>{
  void sendScheduledConsolidatedWhatsAppReports()
    .then(result=>{if(!result?.skipped)console.log('Scheduled consolidated WhatsApp report check completed.',result)})
    .catch(error=>console.error('Scheduled consolidated WhatsApp report check failed.',error));
},60*1000);
consolidatedWhatsAppTimer.unref?.();
const consolidatedTicketWhatsAppTimer=setInterval(()=>{
  void sendScheduledConsolidatedTicketReports()
    .then(result=>{if(!result?.skipped)console.log('Scheduled consolidated CRM WhatsApp report check completed.',result)})
    .catch(error=>console.error('Scheduled consolidated CRM WhatsApp report check failed.',error));
},60*1000);
consolidatedTicketWhatsAppTimer.unref?.();
const adminLockAuditTimer=setInterval(()=>void auditAdminLockIncidents().catch(error=>console.error('Scheduled CRM admin-lock audit failed.',error)),60*1000);
adminLockAuditTimer.unref?.();
