import {gzipSync} from 'node:zlib';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createTicketMailer} from './ticket-email.mjs';

export const SESSION_RETENTION_DAYS=7;
export const SESSION_BACKUP_RECIPIENT='anoop.p@cmll.in';
const DAY=86400000;
// An exclusive database lock coordinates this job across App Service instances.
export async function runSessionRetention({pool,storageRoot,now=new Date(),mailer=createTicketMailer,save=async(file,content)=>{
  await mkdir(path.dirname(file),{recursive:true});await writeFile(file,content,{mode:0o600});
}}){
  const client=await pool.connect();let locked=false;
  try{
    const {rows}=await client.query("SELECT pg_try_advisory_lock(hashtext('pulse_session_retention')) AS locked");
    locked=Boolean(rows[0]?.locked);if(!locked)return {skipped:true,reason:'already running'};
    const {rows:state}=await client.query("SELECT value FROM app_metadata WHERE key='session_retention_last_run'");
    if(state[0]?.value && now-new Date(state[0].value)<5*DAY)return {skipped:true,reason:'five-day backup cycle'};
    const cutoff=new Date(now.getTime()-7*DAY).toISOString();
    // Never export bearer tokens, permissions, passwords, or credential versions.
    const {rows:sessions}=await client.query(`SELECT session_public_id,login_name,employee_name,role,created_at,last_seen_at,device_id,ip_address,user_agent FROM auth_sessions WHERE created_at<=$1`,[cutoff]);
    const {rows:history}=await client.query('SELECT * FROM user_login_history WHERE started_at<=$1',[cutoff]);
    const {rows:activity}=await client.query('SELECT * FROM user_session_activity WHERE started_at<=$1',[cutoff]);
    const filename=`session-retention-${now.toISOString().replaceAll(':','-')}.json.gz`;
    const content=gzipSync(JSON.stringify({format:'Pulse session metadata backup',version:1,createdAt:now.toISOString(),cutoff,sessions,history,activity}));
    await save(path.join(storageRoot,'session-retention',filename),content);
    const {config,transporter}=mailer();
    if(!transporter)throw new Error('Session cleanup paused: configure SMTP/GMAIL_APP_PASSWORD to email the backup.');
    const sent=await transporter.sendMail({from:config.user,to:SESSION_BACKUP_RECIPIENT,
      subject:'Caliber Pulse: five-day session backup before seven-day cleanup',
      text:`Attached is the session and device metadata backup before cleanup. Records started on or before ${cutoff} will be removed. Passwords and login tokens are excluded.`,
      attachments:[{filename,content,contentType:'application/gzip'}]});
    if(!sent.accepted?.some(value=>String(value).toLowerCase()===SESSION_BACKUP_RECIPIENT))throw new Error('Session cleanup paused: backup recipient was not accepted.');
    await client.query('BEGIN');
    try{
      // Delete only the exported identifiers, never rows created after the snapshot.
      const removed={};
      for(const [table,key,records] of [['auth_sessions','session_public_id',sessions],['user_login_history','session_id',history],['user_session_activity','session_id',activity]]){
        const result=await client.query(`DELETE FROM ${table} WHERE ${key}=ANY($1::text[]) AND ${table==='auth_sessions'?'created_at':'started_at'}<=$2`,[records.map(row=>row[key]),cutoff]);
        removed[table]=result.rowCount||0;
      }
      await client.query("INSERT INTO app_metadata(key,value,updated_at) VALUES('session_retention_last_run',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",[now.toISOString()]);
      await client.query('COMMIT');return {removed,filename,recipient:SESSION_BACKUP_RECIPIENT};
    }catch(error){await client.query('ROLLBACK');throw error;}
  }finally{
    if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('pulse_session_retention'))").catch(()=>{});
    client.release();
  }
}
