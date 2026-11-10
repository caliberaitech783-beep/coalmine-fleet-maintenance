// Shared PostgreSQL pool load during a scanning shift (10 Nov 2026): the live Dashboard
// authorization, the 60-second report jobs, the request-feed windows, the backup lock holder
// and the warm sign-in connections. Each test pins one hot path in server.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {currentDashboardUserCandidate,dashboardSessionFromProfile} from '../dashboard-equipment-access.mjs';
import {resolveMobileAccess,userLoginCandidates} from '../mobile-access.mjs';
import {mergePrivilegeRecords} from '../privilege-record.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const slice=(from,to)=>{const start=server.indexOf(from);const end=server.indexOf(to,start);assert.ok(start>=0&&end>start,`${from} … ${to}`);return server.slice(start,end);};

const privilegeForUser=new Function('mergePrivilegeRecords',`${slice('function privilegeForUser(','function loginPayload(')};return privilegeForUser;`)(mergePrivilegeRecords);

function authorizationHarness(client){
  const dashboardAuthorizations=new Map();
  const bindings={pool:client,dashboardReadPool:{query:client.query},dashboardAuthorizations,currentDashboardUserCandidate,userLoginCandidates,privilegeForUser,resolveMobileAccess,dashboardSessionFromProfile};
  const authorize=new Function(...Object.keys(bindings),`${slice('async function currentDashboardAuthorization(','function ticketProjection(')};return currentDashboardAuthorization;`)(...Object.values(bindings));
  return {authorize,dashboardAuthorizations};
}

test('dashboard authorization reads only the session\'s own rows once a minute instead of two whole masters per request',async()=>{
  const users=[{login:'mis-a',employee:'MIS A',userType:'Mobile User',userGroup:'MIS User',site:'Sasti OB'}];
  const privileges=[{username:'mis-a',ibossAccounts:'Yes'}];
  const queries=[];
  const client={query:async(sql,params)=>{
    queries.push({sql,params});
    if(sql.includes("master_name='Users & employees'")){
      assert.match(sql,/lower\(trim\(record_data->>'login'\)\)=\$1/,'the login lookup uses the indexed expression');
      assert.doesNotMatch(sql,/WHERE master_name='Users & employees'\s*`/,'the whole master is never read');
      return {rows:users.map(record_data=>({record_data}))};
    }
    if(sql.includes("master_name='Privilege'")){
      assert.match(sql,/=ANY\(\$1::text\[\]\)/);
      return {rows:privileges.map(record_data=>({record_data}))};
    }
    throw new Error(`unexpected query ${sql}`);
  }};
  const {authorize,dashboardAuthorizations}=authorizationHarness(client);
  const session={login:'MIS-A',name:'MIS A',role:'normal',assignedRole:'MIS User'};
  const first=await authorize(session);
  assert.equal(first.user.login,'mis-a');
  assert.deepEqual(first.session,{role:'normal',assignedRole:'MIS User',permissions:first.session.permissions});
  assert.deepEqual(queries.map(({params})=>params),[['mis-a','mis a'],[['mis-a','mis']]],'one lookup by login and name, one privilege read for that user\'s identifiers');
  for(let request=0;request<50;request+=1)assert.equal(await authorize({...session},client),first,'polls inside the window share the answer');
  assert.equal(queries.length,2);
  assert.equal(await authorize({...session,assignedRole:'Production User'}),(await authorize({...session,assignedRole:'Production User'})));
  assert.equal(queries.length,4,'a different selected role is a different answer');
  dashboardAuthorizations.clear();
  const refreshed=await authorize(session);
  assert.equal(queries.length,6,'a master write (clearMisReadWindows) makes the next request read again');
  assert.equal(await authorize({login:'nobody',name:'No One'}),null);
  assert.equal(await authorize({login:'nobody',name:'No One'}),null);
  assert.equal(queries.length,7,'an unknown account costs one lookup, not a privilege read, and is remembered');
  const transaction={query:client.query};
  const inTransaction=await authorize(session,transaction);
  assert.notEqual(inTransaction,refreshed);assert.deepEqual(inTransaction,refreshed);
  await authorize(session,transaction);
  assert.equal(queries.length,11,'a transaction client reads its own writes every time and never shares its snapshot');
  assert.equal(await authorize(session),refreshed,'and leaves the shared answer untouched');
  assert.equal(queries.length,11);
});

test('the narrowed lookup chooses the same record as the whole-master candidate rule, on real SQL',async()=>{
  const db=new PGlite();
  await db.exec('CREATE TABLE master_records(id SERIAL PRIMARY KEY,master_name TEXT NOT NULL,record_data JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const users=[
    {login:'mis-a',employee:'MIS A',userType:'Mobile User',userGroup:'MIS User',site:'Sasti OB'},
    {login:'Admin',employee:'Admin User',userType:'Super User',adminLevel:'Admin'},
    {login:'',employee:'Ravi Kumar',userType:'Mobile User',userGroup:'Production User',site:'Majri OB'},
    {employee:'Ravi Sharma',userType:'Mobile User',userGroup:'Production User',site:'Majri OB'},
    {login:'  ',employee:'Suresh Patil',userType:'Mobile User',userGroup:'Maintenance User',site:'Sasti OB'},
    {login:'ravi.k',employee:'Ravi Kulkarni',userType:'Mobile User',userGroup:'MIS User',site:'Sasti OB'},
  ];
  for(const user of users)await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1::jsonb)",[JSON.stringify(user)]);
  for(const privilege of [{username:'mis-a',ibossAccounts:'Yes'},{username:' MIS ',ibossAccounts:'No',extra:'first name'},{username:'admin',ibossAccounts:'Yes'},{username:'ravi',ibossAccounts:'Yes'}])
    await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Privilege',$1::jsonb)",[JSON.stringify(privilege)]);
  await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Equipment master',$1::jsonb)",[JSON.stringify({login:'mis-a',employee:'MIS A',equipmentName:'EX-1'})]);
  const reads=[];
  const client={query:async(sql,params)=>{
    const result=await db.query(sql,params.map(value=>Array.isArray(value)?`{${value.map(item=>`"${item}"`).join(',')}}`:value));
    reads.push({sql,rows:result.rows.length});
    return result;
  }};
  const {authorize,dashboardAuthorizations}=authorizationHarness(client);
  // The answer the earlier code computed from both whole masters in memory.
  const privileges=(await db.query("SELECT record_data FROM master_records WHERE master_name='Privilege'")).rows;
  const wholeMaster=session=>{
    const user=currentDashboardUserCandidate(users,session);
    if(!user)return null;
    const identifiers=new Set([...userLoginCandidates(user),String(session?.login||'').trim().toLowerCase()].filter(Boolean));
    const profile=resolveMobileAccess({user,privilege:privilegeForUser(privileges,identifiers),portal:session.userType==='Account User'?'accounts':undefined,selectedRole:session.role==='normal'&&session.assignedRole!=='Account User'?session.assignedRole:undefined});
    return {user,session:dashboardSessionFromProfile(profile)};
  };
  const cases=[
    [{login:'mis-a',name:'MIS A'},'the record with this login'],
    [{login:'MIS-A',name:''},'login matching is case-insensitive and needs no name'],
    [{login:'admin',name:'Admin User'},'a stored login with capitals'],
    [{login:'ravi',name:''},'two legacy records without a login share the first name Ravi: ambiguous, so null'],
    [{login:'suresh',name:'Suresh Patil'},'a legacy record whose login is only spaces matches by first name'],
    [{login:'suresh',name:'Someone Else'},'but not under another employee name'],
    [{login:'',name:'Ravi Kumar'},'no login at all: the record with this employee name'],
    [{login:'',name:'Ravi'},'no login and a name that is only a first name: nothing'],
    [{login:'ravi.k',name:'Ravi Kulkarni'},'a login containing a dot'],
    [{login:'ravi.k',name:'Ravi Kulkarni',role:'normal',assignedRole:'MIS User'},'the selected role still shapes the session'],
    [{login:'mis-a',name:'MIS A',role:'normal',assignedRole:'MIS User'},'privileges for the login and the first name are merged as before'],
    [{login:'admin',name:'Admin User',role:'super'},'an administrator'],
    [{login:'nobody',name:'No One'},'unknown account'],
  ];
  for(const [session,why] of cases){
    dashboardAuthorizations.clear();
    assert.deepEqual(await authorize(session),wholeMaster(session),why);
  }
  dashboardAuthorizations.clear();reads.length=0;
  await authorize({login:'mis-a',name:'MIS A',role:'normal',assignedRole:'MIS User'});
  assert.equal(reads[0].rows,1,'only MIS A\'s own row is read');
  assert.equal(reads[1].rows,2,'privileges for the login and the first name only');
  dashboardAuthorizations.clear();reads.length=0;
  await authorize({login:'ravi',name:''});
  assert.equal(reads[0].rows,2,'both legacy Ravi rows reach the candidate rule so the ambiguity is still seen');
  await db.close();
});

test('one reminder tick reads the Users master and the report settings once, not once per overdue request',async()=>{
  const reads={users:0,settings:0},dispatched=[];
  const users=[{login:'sasti-mis',site:'Sasti OB'},{login:'majri-mis',site:'Majri OB'},{login:'sasti-prod',site:'Sasti OB'}];
  const overdue=[{ref:'REQ/1',site:'Sasti OB',status:'Open',startedAtRaw:'2026-11-10T01:00:00Z'},{ref:'REQ/2',site:'Majri OB',status:'Open',startedAtRaw:'2026-11-10T01:00:00Z'},{ref:'REQ/3',site:'Sasti OB',status:'Idle',idleAtRaw:'2026-11-10T02:00:00Z'}];
  const settings={enabled:true,reminders:{offRoad:{enabled:true,hours:4},idle:{enabled:true,hours:2}},events:{}};
  const bindings={
    databaseReady:true,storedWhatsAppReportSettings:async()=>{reads.settings++;return settings;},
    telegramConfiguration:()=>({botToken:'token'}),whatsappPurposeEnabled:()=>true,
    pool:{query:async(sql)=>{
      if(sql.includes("master_name='Users & employees'")){reads.users++;return {rows:users.map(record_data=>({record_data}))};}
      if(sql.includes('FROM maintenance_requests'))return {rows:overdue};
      if(sql.startsWith('INSERT INTO whatsapp_workflow_dispatches'))return {rows:[{id:dispatched.length+1}]};
      if(sql.startsWith('UPDATE whatsapp_workflow_dispatches'))return {rows:[]};
      throw new Error(`unexpected query ${sql}`);
    }},
    workflowReminderSlot:()=>'slot',routingReportSettings:value=>value,
    workflowWhatsAppRecipientLogins:(rows,{site})=>rows.map(row=>row.record_data).filter(user=>user.site===site).map(user=>user.login),
    requestEquipmentNotificationDetails:()=>'EX-1',requestNotificationTime:()=>'10:00',workflowRequestLink:()=>'link',publicBaseUrl:()=>'https://pulse.example',
    sendWhatsAppNotifications:async(_client,logins,reference)=>{dispatched.push(...logins.map(login=>`${reference}:${login}`));return logins.map(()=>({status:'Sent'}));},
  };
  const api=new Function(...Object.keys(bindings),`${slice('async function requestWorkflowWhatsAppLogins(',"app.get('/api/info-pulse/birthdays'")};return {requestWorkflowWhatsAppLogins,requestWorkflowWhatsAppLoginsOnce,sendScheduledWorkflowWhatsAppReminders};`)(...Object.values(bindings));
  assert.deepEqual(await api.sendScheduledWorkflowWhatsAppReminders(new Date('2026-11-10T06:00:00Z')),{sent:5,failed:0,skipped:0});
  assert.deepEqual(dispatched,['REQ/1:sasti-mis','REQ/1:sasti-prod','REQ/2:majri-mis','REQ/3:sasti-mis','REQ/3:sasti-prod'],'every overdue request still reaches its own site\'s recipients');
  assert.deepEqual(reads,{users:1,settings:1});
  assert.deepEqual(await api.requestWorkflowWhatsAppLogins(bindings.pool,{eventType:'opened',site:'Majri OB'}),['majri-mis'],'a single workflow event still reads for itself');
  assert.deepEqual(reads,{users:2,settings:2});
  const once=api.requestWorkflowWhatsAppLoginsOnce(bindings.pool,settings);
  const [first,second]=await Promise.all([once({eventType:'opened',site:'Sasti OB'}),once({eventType:'idle',site:'Majri OB'})]);
  assert.deepEqual([first,second],[['sasti-mis','sasti-prod'],['majri-mis']]);
  assert.deepEqual(reads,{users:3,settings:2},'overlapping lookups in one pass share one read');
  const overdueQuiet=overdue.splice(0);
  assert.deepEqual(await api.sendScheduledWorkflowWhatsAppReminders(new Date('2026-11-10T06:01:00Z')),{sent:0,failed:0,skipped:0});
  assert.deepEqual(reads,{users:3,settings:3},'a tick with nothing overdue never reads the Users master');
  overdue.push(...overdueQuiet);
});

test('a stored backup exports on a connection of its own and frees it before measuring and checksumming the file',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pulse-backup-'));
  const events=[],updates=[];
  let lockGranted=true,exportFails=false;
  class Client{
    constructor(options){events.push(`client ${options.connectionString}`);}
    async connect(){events.push('connect');}
    async query(sql){
      if(sql.includes('pg_try_advisory_lock')){events.push('lock');return {rows:[{locked:lockGranted}]};}
      if(sql.includes('pg_advisory_unlock')){events.push('unlock');return {rows:[]};}
      throw new Error(`unexpected export connection query ${sql}`);
    }
    async end(){events.push('end');}
  }
  const bindings={
    readBackupSettings:async()=>({settings:{retentionDays:7}}),backupFolder:()=>directory,backupStorageRoot:directory,path,
    fs:{mkdir:fs.mkdir,rm:fs.rm,stat:async file=>{events.push('stat');return fs.stat(file);}},
    backupFileName:()=>'pulse.backup',
    pool:{query:async(sql,params)=>{if(sql.startsWith('INSERT INTO backup_runs'))return {rowCount:1,rows:[{id:'run-1'}]};updates.push({sql,params});return {rowCount:1,rows:[]};},connect:async()=>{throw new Error('the shared pool must not hold the backup lock');}},
    pg:{Client},connectionString:'postgres://pulse',databaseSsl:false,
    exportDatabase:async({client,output})=>{assert.ok(client instanceof Client);events.push('export');if(exportFails)throw new Error('disk full');await fs.writeFile(output,'backup data');return {tables:{maintenance_requests:3}};},
    sha256File:async()=>{events.push('sha256');return 'checksum';},
  };
  const createStoredBackup=new Function(...Object.keys(bindings),`${slice('async function createStoredBackup(','async function pruneStoredBackups(')};return createStoredBackup;`)(...Object.values(bindings));
  try{
    const result=await createStoredBackup({triggerType:'Scheduled',scheduleSlot:'slot'});
    assert.equal(result.status,'Completed');assert.equal(result.sizeBytes,11);
    assert.deepEqual(events,['client postgres://pulse','connect','lock','export','unlock','end','stat','sha256'],'the lock and the connection are gone before the file work starts');
    assert.match(updates[0].sql,/status='Completed'/);
    events.length=0;updates.length=0;exportFails=true;
    await assert.rejects(createStoredBackup({triggerType:'Manual'}),/disk full/);
    assert.deepEqual(events,['client postgres://pulse','connect','lock','export','unlock','end']);
    assert.match(updates[0].sql,/status='Failed'/);
    await assert.rejects(fs.access(path.join(directory,'pulse.backup')),'a failed export leaves no file behind');
    events.length=0;exportFails=false;lockGranted=false;
    await assert.rejects(createStoredBackup({triggerType:'Manual'}),{status:409});
    assert.deepEqual(events,['client postgres://pulse','connect','lock','end'],'a refused lock still closes the extra connection');
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('the report jobs read the timetables first and the masters only once a time is due',()=>{
  const crm=slice('async function sendScheduledConsolidatedTicketReports(','async function directorReportSourceData');
  assert.ok(crm.indexOf('crmReportsPossiblyDue({now,crmSettings:reportSettings.crm')<crm.indexOf("master_name='Users & employees'"));
  assert.ok(crm.indexOf('crmReportsPossiblyDue(')<crm.indexOf("master_name='Equipment master'"));
  assert.ok(crm.indexOf("master_name='Hierarchy master'")<crm.indexOf('crmReportsPossiblyDue('));
  const hierarchy=slice('async function sendScheduledHierarchyReportBundles(',"app.post('/api/reports/director/send-test'");
  assert.ok(hierarchy.indexOf("master_name='Hierarchy master'")<hierarchy.indexOf('hierarchyReportsPossiblyDue({now,scheduleSettings,hierarchyRows,userScheduleOverrides})'));
  assert.ok(hierarchy.indexOf('hierarchyReportsPossiblyDue({now,scheduleSettings,hierarchyRows,userScheduleOverrides})')<hierarchy.indexOf('const [{rows:userRows}]=await readReportScheduleMasters();'));
  assert.doesNotMatch(hierarchy,/master_name='Users & employees'/,'the Users master comes from the revision-keyed snapshot, never a direct read');
  const plans=slice('loadPlans:async now=>{','const siteFleetTimer=');
  assert.ok(plans.indexOf('hierarchyReportsPossiblyDue({now,scheduleSettings,hierarchyRows:hierarchyRecords,userScheduleOverrides})')<plans.indexOf('const [{rows:users}]=await readReportScheduleMasters();'));
  assert.doesNotMatch(plans,/master_name='Users & employees'/);
  assert.match(plans,/return \[\];/);
  const snapshot=slice('function readReportScheduleMasters(','function ticketProjection(');
  assert.match(snapshot,/readCurrentMasterSnapshot\('report-schedule'/);
  assert.match(server,/import \{crmReportsPossiblyDue,hierarchyReportsPossiblyDue\} from '\.\/scheduled-report-due\.mjs';/);
});

test('the shared read windows close on feed-changing writes, on the bridge verification, and hold the dashboard authorization',()=>{
  const guard=slice('const requestFeedCache=createFeedCache(','const port=Number(');
  assert.match(guard,/const membershipUserRecords=new Map\(\),dashboardAuthorizations=new Map\(\);/);
  assert.match(guard,/const clearMisReadWindows=\(\)=>\{[^\n]*dashboardAuthorizations\.clear\(\);\};/);
  assert.match(guard,/function closeFeedWindows\(res\)\{\n\s*requestFeedCache\.clear\(\);clearMisReadWindows\(\);\n\s*res\.on\('finish',\(\)=>requestFeedCache\.clear\(\)\);res\.on\('finish',clearMisReadWindows\);\n\}/);
  assert.match(guard,/if\(requestFeedWriteInvalidates\(req\)\)\{closeFeedWindows\(res\);\}/);
  assert.match(server,/verifyRequest:\(req,res,next\)=>\{closeFeedWindows\(res\);return verifyMisTripCard\(req,res,next\);\},/,'the Pulse-II verification is the bridge\'s one write');
  assert.match(server,/CREATE TRIGGER production_first_trip_acceptances_revision_trigger\n\s*AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON production_first_trip_acceptances\n\s*FOR EACH STATEMENT EXECUTE FUNCTION bump_data_revision\('request-feed'\);/,
    'first-trip acceptances appear in the feed, so their changes bump the feed revision like requests and remarks');
});

test('sign-in and Dashboard connections stay warm for ten minutes with TCP keepalives',()=>{
  assert.match(server,/const warmPoolOptions=\{idleTimeoutMillis:600000,keepAlive:true,keepAliveInitialDelayMillis:30000\};/);
  assert.match(server,/const authPool=protectDeletionPool\(new Pool\(\{connectionString:connectionString\|\|undefined,ssl:databaseSsl,max:3,connectionTimeoutMillis:10000,\.\.\.warmPoolOptions\}\)\);/);
  const dashboard=slice('const dashboardReadPool=protectDeletionPool(new Pool({','}));');
  assert.match(dashboard,/max:3,/);assert.match(dashboard,/\.\.\.warmPoolOptions,/);assert.doesNotMatch(dashboard,/idleTimeoutMillis:30000/);
  assert.match(server,/const rawPool=new Pool\(\{\n\s*connectionString:connectionString\|\|undefined,\n\s*ssl:databaseSsl,\n\s*max:10,/,'the shared pool size is unchanged');
});
