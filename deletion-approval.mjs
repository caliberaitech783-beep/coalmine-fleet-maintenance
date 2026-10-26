import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash, randomUUID} from 'node:crypto';
import {createDeletionWhatsApp, DELETION_PHONE_MASKED} from './deletion-sms.mjs';

const context = new AsyncLocalStorage();
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const fail = (status, message) => {throw Object.assign(new Error(message), {status});};
const quote = value => `"${String(value).replaceAll('"','""')}"`;
export const DELETION_SCHEMA = `CREATE TABLE IF NOT EXISTS deletion_approvals (
 id UUID PRIMARY KEY, session_hash TEXT NOT NULL, request_hash TEXT NOT NULL,
 operation TEXT NOT NULL, snapshot_hash TEXT NOT NULL, preview JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'preview', provider_sid TEXT NOT NULL DEFAULT '',
 attempts INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '10 minutes', reason TEXT NOT NULL DEFAULT '',
 sent_at TIMESTAMPTZ, verified_at TIMESTAMPTZ, used_at TIMESTAMPTZ, outcome TEXT NOT NULL DEFAULT ''
); ALTER TABLE deletion_approvals ADD COLUMN IF NOT EXISTS otp_hash TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS deletion_approvals_session_created ON deletion_approvals(session_hash,created_at);`;

// Authentication token expiry/revocation is deliberately independent of deletion approval.
const SECURITY_TABLES = new Set(['auth_sessions','password_change_sessions','password_reset_sessions',
 'telegram_link_tokens','hr_credential_attempts','hr_credential_grants','mis_credential_attempts',
 'mis_credential_grants','application_login_attempts','application_identity_grants',
 'mis_login_codes','mis_sso_codes','mis_sso_grants','mis_sso_pending']);
export function destructiveTables(sql) {
  const clean = String(sql).replace(/\/\*[\s\S]*?\*\//g,' ').replace(/--[^\n]*/g,' ');
  const tables = [...clean.matchAll(/\bDELETE\s+FROM\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)].map(match=>match[1].toLowerCase());
  if (/\bTRUNCATE\b/i.test(clean)) {
    const statement = clean.match(/\bTRUNCATE\s+(?:TABLE\s+)?([\s\S]*?)(?:\bRESTART\b|\bCONTINUE\b|\bCASCADE\b|\bRESTRICT\b|;|$)/i)?.[1] || '';
    for (const part of statement.split(',')) {
      const name = part.trim().replace(/^ONLY\s+/i,'').replace(/^public\./i,'').replaceAll('"','');
      if (!/^[a-z_][a-z0-9_]*$/i.test(name)) fail(403,'Unrecognized destructive SQL is blocked.');
      tables.push(name.toLowerCase());
    }
  }
  return [...new Set(tables)];
}
export function assertDeletionSql(sql) {
  const state = context.getStore();
  for (const table of destructiveTables(sql)) {
    if (SECURITY_TABLES.has(table) || table === 'app_metadata') continue;
    if (!state?.client || !state.tables.has(table)) fail(403,`Deletion of ${table} is blocked until its exact selection receives WhatsApp OTP approval.`);
  }
  if (/\bDROP\s+(?:TABLE|SCHEMA|DATABASE)\b/i.test(String(sql))) fail(403,'Dropping application data is blocked.');
  if (clearsRequestMedia(sql) && (!state?.client || !state.tables.has('maintenance_requests'))) fail(403,'Removing request media requires WhatsApp OTP approval.');
}
const clearsRequestMedia=sql=>/^\s*UPDATE\s+maintenance_requests\s+SET\s+complaint_audio\s*=\s*''/i.test(String(sql));

async function checkDeletionSelection(client, sql, values) {
  const state=context.getStore();
  if(!state?.client)return;
  if(clearsRequestMedia(sql)){
    const where=String(sql).match(/\bWHERE\b([\s\S]*)$/i)?.[1];
    if(!where)fail(403,'Media deletion requires an exact selection.');
    const {rows}=await client.query(`SELECT md5(to_jsonb(maintenance_requests)::text) AS revision FROM maintenance_requests WHERE ${where}`,values);
    if(rows.some(row=>!state.revisions.get('maintenance_requests')?.has(row.revision)))fail(409,'The media selection changed. Review and obtain a new OTP.');
    return;
  }
  const tables=destructiveTables(sql).filter(table=>!SECURITY_TABLES.has(table)&&table!=='app_metadata');
  if(!tables.length)return;
  if(/^\s*TRUNCATE\b/i.test(sql)) {
    for(const table of tables){
      const {rows}=await client.query(`SELECT md5(to_jsonb(target)::text) AS revision FROM ${quote(table)} target`);
      if(rows.some(row=>!state.revisions.get(table)?.has(row.revision)))fail(409,'The deletion selection changed. Review it again.');
    }
    return;
  }
  // Only ordinary parameterized DELETEs are allowed inside an approved route.
  // CTEs/multiple statements/USING need their own exact preview adapter.
  if(tables.length!==1 || !/^\s*DELETE\s+FROM\s+(?:public\.)?"?[a-z_][a-z0-9_]*"?\s*(?:WHERE\b|RETURNING\b|;?\s*$)/i.test(sql))fail(403,'This deletion statement requires an exact preview adapter.');
  const table=tables[0];
  const select=String(sql).replace(/^\s*DELETE\s+FROM\b/i,`SELECT md5(to_jsonb(${quote(table)})::text) AS revision FROM`).replace(/\s+RETURNING\b[\s\S]*$/i,'');
  const {rows}=await client.query(select,values);
  if(rows.some(row=>!state.revisions.get(table)?.has(row.revision)))fail(409,'Affected records changed after approval. Review and obtain a new OTP.');
}

function guardedUnapprovedQuery(target,args) {
  const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
  try {assertDeletionSql(sql);return target.query(...args);}
  catch(error) {
    // Legacy workflows issue unconditional DELETEs even when nothing exists.
    // A read-only empty check may report zero affected rows; never execute the
    // unapproved DELETE itself, including if a matching row arrives afterward.
    if(!/^\s*DELETE\s+FROM\s+(?:public\.)?"?[a-z_][a-z0-9_]*"?\s*(?:WHERE\b|RETURNING\b|;?\s*$)/i.test(sql || ''))throw error;
    const select=String(sql).replace(/^\s*DELETE\s+FROM\b/i,'SELECT 1 FROM').replace(/\s+RETURNING\b[\s\S]*$/i,'').replace(/;\s*$/,'')+' LIMIT 1';
    return target.query(select,args[1] || args[0]?.values || []).then(result=>{if(result.rows.length)throw error;return {rows:[],rowCount:0,command:'DELETE'};});
  }
}

export const deletionApproved = () => Boolean(context.getStore()?.client);
export const approvedDeletionTime = () => context.getStore()?.executionTime;
export function afterDeletionCommit(action) {
  const state=context.getStore();
  if (!state) fail(403,'A deletion approval transaction is required.');
  state.onCommit.push(action);
}
export function afterDeletionRollback(action) {
  const state=context.getStore();
  if (!state) fail(403,'A deletion approval transaction is required.');
  state.onRollback.push(action);
}

// Existing route transactions join the approval transaction, so their COMMIT cannot
// release record locks or commit a deletion before its approval is consumed.
export function protectDeletionPool(rawPool) {
  function clientProxy(client, scoped = false) {
    return new Proxy(client, {get(target,key) {
      if (key === 'release' && scoped) return () => {};
      if (key !== 'query') {const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;}
      return (...args) => {
        const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
        if (scoped && (/^\s*BEGIN\b/i.test(sql || '') || /^\s*(COMMIT|ROLLBACK)\s*;?\s*$/i.test(sql || ''))) {
          if (/ROLLBACK/i.test(sql)) context.getStore().rollback = true;
          return Promise.resolve({rows:[],rowCount:0});
        }
        if(!scoped)return guardedUnapprovedQuery(target,args);
        assertDeletionSql(sql);
        if(scoped && (destructiveTables(sql).length || clearsRequestMedia(sql))) return checkDeletionSelection(target,sql,args[1] || args[0]?.values || []).then(()=>target.query(...args));
        return target.query(...args);
      };
    }});
  }
  return new Proxy(rawPool, {get(target,key) {
    if(key==='deletionProtectionEnabled')return true;
    if (key === 'query') return (...args) => {
      const state = context.getStore();
      if (state?.client) return clientProxy(state.client,true).query(...args);
      return guardedUnapprovedQuery(target,args);
    };
    if (key === 'connect') return async () => {
      const state = context.getStore();
      return state?.client ? clientProxy(state.client,true) : clientProxy(await target.connect());
    };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  }});
}

export function deletionOperation(method, route, req = {}) {
  if (method === 'delete') return true;
  if (method === 'patch' && route === '/api/requests/:reference/close') return true;
  if (method === 'patch' && route === '/api/cdir/deletion-requests/:id/:action') return req.params?.action === 'approve';
  return method === 'post' && ['/api/requests/bulk-delete','/api/data-housekeeping/purge',
    '/api/log-retention/run','/api/backups/import/restore','/api/oracle/equipment/sync',
    '/api/oracle/equipment-transfers/sync'].includes(route);
}

export async function resolveDeletionSelection(req, route, client, {
 savedReportKey, housekeeping, retention, cutoff, pcKeySetting = 'pc_backup_keys', restoreTables,
 authorizeCdir = async()=>false, authorizeCorrection = async()=>false,
} = {}) {
  const queries=[],extraItems=[],executionTime=Date.now();
  const add=(table,where='',values=[])=>queries.push({table,where,values});
  const requests=(where,values)=>{
    add('maintenance_requests',where,values);
    const related=`request_reference IN (SELECT reference FROM maintenance_requests ${where?`WHERE ${where}`:''})`;
    for(const table of ['maintenance_daily_remarks','production_first_trip_acceptances','request_corrections','whatsapp_workflow_dispatches'])add(table,related,values);
  };
  if(route==='/api/requests/:reference/close'){
    add('maintenance_requests','reference=$1',[req.params.reference]);
    add('production_first_trip_acceptances','request_reference=$1',[req.params.reference]);
  }else if(route==='/api/requests/:reference')requests('reference=$1',[req.params.reference]);
  else if(route==='/api/requests/bulk-delete'){
    const references=Array.isArray(req.body?.references)?req.body.references:[];
    if(!references.length || references.length>200)fail(400,'Select between 1 and 200 requests.');
    requests('reference=ANY($1::text[])',[references]);
  }else if(route.startsWith('/api/masters/')){
    const master=req.params.master;
    if(route.endsWith('/all')){
      add('master_records','master_name=$1',[master]);
      if(master==='Breakdown master')requests('',[]);
    }else if(route.endsWith('/selected'))add('master_records','master_name=$1 AND id=ANY($2::bigint[])',[master,req.body?.ids || []]);
    else {
      if(master==='Privilege')add('master_records',`master_name=$1 AND (id=$2 OR lower(trim(record_data->>'username'))=(SELECT lower(trim(record_data->>'username')) FROM master_records WHERE master_name=$1 AND id=$2))`,[master,req.params.id]);
      else add('master_records','master_name=$1 AND id=$2',[master,req.params.id]);
    }
    // Password/session cascades are security operations, never reveal their tokens.
  }else if(route==='/api/cdir/deletion-requests/:id/:action'){
    if(!await authorizeCdir(req,client))fail(403,'Only the assigned location approver may review this deletion.');
    add('cdir_deletion_requests','id=$1',[req.params.id]);
    add('master_records',`master_name=(SELECT record_data->>'master' FROM cdir_deletion_requests WHERE id=$1) AND id=(SELECT (record_data->>'recordId')::bigint FROM cdir_deletion_requests WHERE id=$1)`,[req.params.id]);
  }else if(route==='/api/request-corrections/:id'){
    if(!await authorizeCorrection(req,client))fail(403,'Only the assigned site approver may delete this correction.');
    add('request_corrections','id=$1',[req.params.id]);
  }else if(route==='/api/saved-reports/:reportId')add('saved_table_reports','id=$1 AND user_key=$2',[req.params.reportId,savedReportKey(req.session)]);
  else if(route==='/api/backups/:backupId'){
    add('backup_runs','id=$1',[req.params.backupId]);
    const {rows:[backup]}=await client.query('SELECT storage_path,file_name FROM backup_runs WHERE id=$1',[req.params.backupId]);
    if(backup?.storage_path)extraItems.push({table:'Recovery file',id:backup.storage_path,label:backup.file_name});
  }else if(route==='/api/backups/pc-keys/:keyId'){
    add('app_settings','setting_key=$1',[pcKeySetting]);
    const {rows:[settings]}=await client.query('SELECT setting_value FROM app_settings WHERE setting_key=$1',[pcKeySetting]);
    const key=settings?.setting_value?.keys?.find(item=>item.id===req.params.keyId);
    if(!key)fail(404,'PC backup key not found.');
    extraItems.push({table:'PC backup key',id:key.id,label:key.label || ''});
  }
  else if(route==='/api/user-sessions/:sessionId')add('auth_sessions','session_public_id=$1',[req.params.sessionId]);
  else if(route==='/api/telegram/link')add('telegram_user_links','login=$1',[String(req.session.login || '').trim().toLowerCase()]);
  else if(route==='/api/audit-events' || route==='/api/user-login-history'){
    const window=cutoff({...req.body,...req.query});if(window.error)fail(400,window.error);
    if(route==='/api/audit-events')add('audit_events','occurred_at<$1',[window.cutoff.toISOString()]);
    else for(const table of ['user_login_history','user_session_activity'])add(table,'last_seen_at<$1',[window.cutoff.toISOString()]);
  }else if(route==='/api/data-housekeeping/purge'){
    const category=housekeeping(req.body?.category);if(!category)fail(400,'Select a valid purge category.');
    const window=cutoff(req.body);if(window.error)fail(400,window.error);
    for(const statement of category.purge){
      const match=statement.match(/^DELETE FROM ([a-z_]+) WHERE ([\s\S]+)$/) || statement.match(/^UPDATE ([a-z_]+) SET [\s\S]*?\bWHERE ([\s\S]+)$/);
      if(!match)fail(403,'This purge requires an exact preview.');
      add(match[1],match[2],[window.cutoff.toISOString()]);
    }
  }else if(route==='/api/log-retention/run'){
    const settings=await retention();const instant=executionTime;
    const specs=[['auditDays','audit_events','occurred_at'],['whatsappDays','whatsapp_alert_history','created_at'],['notificationDays','crm_notifications','created_at'],['notificationDays','session_messages','created_at']];
    for(const [key,table,column]of specs)if(settings[key])add(table,`${column}<$1${table==='session_messages'?' AND dismissed_at IS NOT NULL':''}`,[new Date(instant-settings[key]*86400000).toISOString()]);
    if(settings.mediaDays)add('maintenance_requests',`verified_at IS NOT NULL AND verified_at<$1 AND (complaint_audio<>'' OR complaint_media<>'[]'::jsonb OR maintenance_audio<>'' OR first_trip_card_image<>'')`,[new Date(instant-settings.mediaDays*86400000).toISOString()]);
    add('app_settings',"setting_key='log_retention'");
  }else if(route==='/api/oracle/equipment/sync' || route==='/api/oracle/equipment-transfers/sync'){
    // External Oracle results can change after a preview; retain a snapshot of
    // every existing row eligible for replacement. SQL checks enforce this bound.
    add('master_records',"master_name=ANY($1::text[])",[['Equipment master','Vehicle transfers']]);
  }else if(route==='/api/backups/import/restore'){
    if(!restoreTables)fail(403,'Inspect the restore archive before approval.');
    for(const table of await restoreTables(req,client))if(!['deletion_approvals','backup_runs','full_backup_runs'].includes(table))add(table);
  }else fail(403,'This deletion has no exact preview adapter and is blocked.');
  return {queries,extraItems,executionTime,impact:route.endsWith('/:reference/close')?'This workflow resets first-trip evidence and removes its acceptance entry. The maintenance request is retained.':route.includes('restore')?'Restore replaces the listed current records with the inspected backup. Approval history and live backup registries are retained. A pre-restore safety backup will be created as part of this approved operation.':undefined};
}

function requestHash(req) {
  return digest({method:req.method,path:req.originalUrl,body:req.body || {},reason:req.get('X-Audit-Reason') || ''});
}
function sessionHash(req) {return digest(req.get('Authorization') || '');}

export function installDeletionApproval(app, {pool, rawPool, requireSession, resolveSelection,
 sms = createDeletionWhatsApp(), now = () => Date.now(), skipApproval = ()=>false} = {}) {
  // Called during startup after the normal schema exists; never lazily run DDL on restore.
  let initialized;
  const ready = () => initialized ||= rawPool.query(DELETION_SCHEMA).catch(error=>{initialized=null;throw error;});
  async function load(req,client,lock=false) {
    const {rows} = await client.query(`SELECT * FROM deletion_approvals WHERE id=$1 AND session_hash=$2${lock?' FOR UPDATE':''}`, [req.params.id,sessionHash(req)]);
    const row = rows[0];
    if (!row || Date.parse(row.expires_at) <= now() || ['used','superseded'].includes(row.status)) fail(410,'This deletion approval expired or was already used. Review the deletion again.');
    return row;
  }
  const endpoint = handler => async (req,res,next) => {
    res.set('Cache-Control','no-store'); req.audit=false;
    try {await ready(); if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) fail(400,'Invalid deletion approval.'); await handler(req,res);}
    catch(error) {next(error);}
  };
  app.post('/api/deletion-approvals/:id/send', requireSession, endpoint(async(req,res)=>{
    if (req.body?.confirmation !== 'Approve deletion of the listed items') fail(400,'Confirm the exact deletion preview first.');
    if (!String(req.body?.reason || '').trim()) fail(400,'Enter a reason for deletion.');
    const client=await rawPool.connect();
    try {
      await client.query('BEGIN');
      // Serialize sends for the owner's phone and supersede prior approvals.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('deletion-sms-owner'))");
      const row=await load(req,client,true);
      if (row.status !== 'preview') fail(409,'An OTP was already requested. Review again to request another.');
      const {rows:[limits]}=await client.query(`SELECT COUNT(*) FILTER (WHERE session_hash=$1)::int AS own,COUNT(*)::int AS total FROM deletion_approvals WHERE sent_at>NOW()-INTERVAL '1 hour'`,[sessionHash(req)]);
      if (limits.own>=5 || limits.total>=20) fail(429,'Too many deletion OTP requests. Try again later.');
      const {rows:recent}=await client.query("SELECT id FROM deletion_approvals WHERE sent_at>NOW()-INTERVAL '60 seconds' LIMIT 1");
      if (recent.length) fail(429,'Wait 60 seconds before requesting another deletion OTP.');
      await client.query("UPDATE deletion_approvals SET status='superseded' WHERE status IN ('sent','verified')");
      // Commit the attempt before the external call, including failures/timeouts in limits.
      await client.query("UPDATE deletion_approvals SET status='sending',sent_at=NOW(),reason=$2,outcome='WhatsApp OTP requested' WHERE id=$1",[row.id,String(req.body.reason).trim().slice(0,500)]);
      await client.query('COMMIT');
      let delivery;
      try {delivery=await sms.send();}
      catch(error) {await client.query("UPDATE deletion_approvals SET status='failed' WHERE id=$1",[row.id]);throw error;}
      if(!/^fast2sms-whatsapp:wamid\.[a-zA-Z0-9._~+/=-]{1,500}$/.test(String(delivery?.id || '')) || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(String(delivery?.otpHash || ''))){await client.query("UPDATE deletion_approvals SET status='failed' WHERE id=$1",[row.id]);fail(503,'The WhatsApp provider returned no approval-bound verification. Deletion remains blocked.');}
      await client.query("UPDATE deletion_approvals SET status='sent',provider_sid=$2,otp_hash=$3,expires_at=NOW()+INTERVAL '10 minutes' WHERE id=$1 AND status='sending'",[row.id,delivery.id,delivery.otpHash]);
      res.json({phone:DELETION_PHONE_MASKED,channel:'WhatsApp',message:'Enter the WhatsApp code to authorize only the listed items.'});
    } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;} finally {client.release();}
  }));
  app.post('/api/deletion-approvals/:id/verify',requireSession,endpoint(async(req,res)=>{
    const client=await rawPool.connect();
    try {
      await client.query('BEGIN'); const row=await load(req,client,true);
      if (row.status !== 'sent' || row.attempts>=5) fail(409,'This approval cannot accept another OTP. Review the deletion again.');
      const attempts=Number(row.attempts)+1;
      await client.query('UPDATE deletion_approvals SET attempts=$2 WHERE id=$1',[row.id,attempts]);
      let valid=false;
      try {valid=await sms.check(row.provider_sid,String(req.body?.otp || ''),row.otp_hash);}
      catch(error) {await client.query('COMMIT');throw error;}
      await client.query("UPDATE deletion_approvals SET status=$2,verified_at=CASE WHEN $2='verified' THEN NOW() ELSE NULL END WHERE id=$1",[row.id,valid?'verified':attempts>=5?'failed':'sent']);
      await client.query('COMMIT');
      if (!valid) fail(400,'Incorrect or expired WhatsApp code. No deletion was authorized.');
      res.json({approved:true});
    } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;} finally {client.release();}
  }));

  function gate(route) {return async(req,res,next)=>{
    let client;
    try {
      await ready();
      if (!req.session) fail(401,'Sign in before requesting deletion.');
      client=await rawPool.connect(); await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='120s'");
      const selection=await resolveSelection(req,route,client);
      if (!selection?.queries?.length) fail(403,'This destructive operation has no approved preview and is blocked.');
      const tables=[...new Set(selection.queries.map(query=>query.table))].sort();
      // Prevent phantoms and concurrent edits between snapshot validation and commit.
      for (const table of tables) await client.query(`LOCK TABLE ${quote(table)} IN SHARE ROW EXCLUSIVE MODE`);
      const snapshots=[]; const items=[...(selection.extraItems || [])];
      for (const query of selection.queries) {
        const {rows}=await client.query(`SELECT md5(to_jsonb(target)::text) AS revision,
          COALESCE(to_jsonb(target)->>'id',to_jsonb(target)->>'reference',to_jsonb(target)->>'setting_key',to_jsonb(target)->>'session_id',to_jsonb(target)->>'session_public_id',to_jsonb(target)->>'request_reference',to_jsonb(target)->>'login',md5(to_jsonb(target)::text)) AS id,
          COALESCE(to_jsonb(target)->>'name',to_jsonb(target)->>'file_name',to_jsonb(target)->>'reference',to_jsonb(target)->'record_data'->>'name',to_jsonb(target)->'record_data'->>'login','') AS label
          FROM ${quote(query.table)} AS target ${query.where ? `WHERE ${query.where}`:''} ORDER BY id,revision`,query.values || []);
        snapshots.push({table:query.table,rows}); items.push(...rows.map(row=>({table:query.table,id:row.id,label:row.label})));
      }
      const snapshotHash=digest(snapshots), fingerprint=requestHash(req);
      const approvalId=req.get('X-Deletion-Approval');
      if (!approvalId) {
        if (items.length>10000) fail(413,'This selection exceeds 10,000 records. Select a smaller batch for an exact deletion preview.');
        const preview={title:'Approval required: Delete items',operation:`${req.method} ${req.path}`,items,
          impact:selection.impact || 'The listed records and their linked data may be permanently removed.',
          recovery:selection.recovery || 'No recovery is guaranteed. Verify an existing backup before approving.',phone:DELETION_PHONE_MASKED,
          channel:'WhatsApp',deliveryConfigured:await sms.configured()};
        const id=randomUUID();
        await client.query(`INSERT INTO deletion_approvals(id,session_hash,request_hash,operation,snapshot_hash,preview) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[id,sessionHash(req),fingerprint,preview.operation,snapshotHash,JSON.stringify(preview)]);
        await client.query('COMMIT'); client.release(); client=null;
        // The durable preview is its audit record. Do not change audit tables
        // after a restore/cleanup snapshot merely to record the blocked attempt.
        req.audit=false;
        return res.status(428).json({error:'Deletion requires your explicit approval and WhatsApp OTP.',deletionApproval:{id,...preview}});
      }
      if (!/^[0-9a-f-]{36}$/i.test(approvalId)) fail(400,'Invalid deletion approval.');
      const {rows:[approval]}=await client.query('SELECT * FROM deletion_approvals WHERE id=$1 AND session_hash=$2 FOR UPDATE',[approvalId,sessionHash(req)]);
      if (!approval || approval.status!=='verified' || Date.parse(approval.expires_at)<=now()
        || !/^fast2sms-whatsapp:wamid\.[a-zA-Z0-9._~+/=-]{1,500}$/.test(approval.provider_sid)
        || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(approval.otp_hash || '')) fail(403,'A valid, unused Fast2SMS WhatsApp approval is required.');
      if (approval.request_hash!==fingerprint || approval.snapshot_hash!==snapshotHash) fail(409,'The request or affected records changed. Review again and obtain a new OTP.');
      await client.query("UPDATE deletion_approvals SET status='used',used_at=NOW(),outcome='Executing approved deletion' WHERE id=$1",[approvalId]);
      const activeClient=client; client=null;
      const revisions=new Map();
      for(const snapshot of snapshots){if(!revisions.has(snapshot.table))revisions.set(snapshot.table,new Set());for(const row of snapshot.rows)revisions.get(snapshot.table).add(row.revision);}
      const state={client:activeClient,tables:new Set(tables),revisions,executionTime:selection.executionTime,rollback:false,onCommit:[],onRollback:[]};
      const originalEnd=res.end.bind(res); let ended=false;
      const finish=async(args)=>{
        if(ended)return;ended=true;
        try {
          if (res.statusCode>=400 || state.rollback) {
            await activeClient.query('ROLLBACK');
            for(const action of state.onRollback)await action();
          }
          else {
            await activeClient.query("UPDATE deletion_approvals SET outcome='Completed' WHERE id=$1",[approvalId]);
            await activeClient.query('COMMIT');
            for(const action of state.onCommit)await action();
          }
          if(res.statusCode<400&&!state.rollback)req.audit={...(req.audit||{}),reason:req.audit?.reason||approval.reason,
            changedFields:[...(req.audit?.changedFields||[]),{field:'WhatsApp deletion approval',before:'',after:approvalId}]};
          // Finish listeners and async work spawned by the handler must use a
          // fresh pool lease, never inherit a committed/released client or grant.
          state.client=null;state.tables.clear();state.revisions.clear();
          originalEnd(...args);
        } catch(error) {
          await activeClient.query('ROLLBACK').catch(()=>{});
          for(const action of state.onRollback)await action().catch(()=>{});
          res.removeHeader('Content-Length');res.statusCode=500;res.setHeader('Content-Type','application/json');
          originalEnd(JSON.stringify({error:'The deletion transaction could not be committed. Refresh and check the approval history before retrying.'}));
        } finally {state.client=null;state.tables.clear();state.revisions.clear();activeClient.release();}
      };
      res.end=(...args)=>{void finish(args);return res;};
      res.on('close',()=>{if(!ended){ended=true;void activeClient.query('ROLLBACK').then(async()=>{for(const action of state.onRollback)await action();}).finally(()=>{state.client=null;state.tables.clear();state.revisions.clear();activeClient.release();});}});
      context.run(state,()=>next());
    } catch(error) {if(client){await client.query('ROLLBACK').catch(()=>{});client.release();}next(error);}
  };}

  // Preserve existing authentication/role middleware; insert immediately before the
  // final route handler. All DELETE routes, including future ones, fail closed.
  for (const method of ['delete','post','patch']) {
    const register=app[method].bind(app);
    app[method]=(route,...handlers)=>{
      const possible=method==='delete' || deletionOperation(method,route,{params:{action:'approve'}});
      if (!possible) return register(route,...handlers);
      const last=handlers.pop();
      return register(route,...handlers,async(req,res,next)=>deletionOperation(method,route,req)&&!(await skipApproval(req,route))?gate(route)(req,res,next):next(),last);
    };
  }
  return {ready};
}
