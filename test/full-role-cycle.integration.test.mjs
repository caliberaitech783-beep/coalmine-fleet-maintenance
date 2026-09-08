import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {hashPassword} from '../password-auth.mjs';
import {visibleInMisRequests,visibleInMisHistory} from '../src/mis-history.mjs';
import {visibleInMaintenanceHistory} from '../src/maintenance-history.mjs';
import {visibleInProductionHistory} from '../src/production-history.mjs';
import {buildDepartmentReports} from '../department-reports.mjs';

// Opt-in real PostgreSQL + HTTP acceptance test. Never point this at production.
// Start server.mjs with a fresh local DB and DISABLE_SCHEDULED_JOBS=true first.
const base=process.env.BDMS_AUDIT_BASE_URL;
const databaseUrl=process.env.BDMS_AUDIT_DATABASE_URL;
const enabled=Boolean(base&&databaseUrl);
const password='Local-fixture-only-29!';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM9sAAAAASUVORK5CYII=';
const india=(offset=0)=>new Date(Date.now()+offset+19800000).toISOString().slice(0,19);

test('real database role cycles, queues, red flags, reports and permission boundaries', {skip:!enabled},async t=>{
  const appUrl=new URL(base),dbUrl=new URL(databaseUrl);
  for(const url of [appUrl,dbUrl])assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only an isolated loopback test environment is allowed');
  assert.match(dbUrl.pathname,/^\/bdms_audit_[a-z0-9_]+$/,'Dedicated audit database required');
  const health=await fetch(`${base}/api/health`).then(r=>r.json());
  assert.equal(health.database,'connected');
  assert.equal(health.scheduledJobsEnabled,false,'External scheduled work must be disabled');
  const pool=new pg.Pool({connectionString:databaseUrl});
  t.after(()=>pool.end());
  const run=Date.now().toString(36);
  const tokens={};
  const roles={
    production:['Stupal Moon','Production User'],
    maintenance:['Sanskar Manohare','Maintenance User'],
    mis:['Damini Rai','MIS User'],
    maintenanceManager:['MAIMaintenance Manager','Maintenance Manager'],
    productionManager:['Audit Production Manager','Production Manager'],
    projectManager:['Audit Project Manager','Project Manager'],
    misManager:['Audit MIS Manager','MIS Manager'],
    admin:['Audit Admin','Admin'],
    otherProduction:['Other production','Production User'],
    otherMaintenance:['Other maintenance','Maintenance User'],
    otherMis:['Other MIS','MIS User'],
    otherManager:['Other manager','Maintenance Manager'],
  };
  async function call(role,method,path,body,expected=200){
    const response=await fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json',...(tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text=await response.text();
    let result;try{result=JSON.parse(text)}catch{result=text}
    assert.equal(response.status,expected,`${role} ${method} ${path}: ${text.slice(0,300)}`);
    return result;
  }
  for(const [key,[employee,role]] of Object.entries(roles)){
    const manager=role.includes('Manager'),admin=role==='Admin';
    const user={login:`audit-${key.toLowerCase()}-${run}`,employee,site:key.startsWith('other')?'Jayant OB':'Sasti OB',location:key.startsWith('other')?'Jayant OB':'Sasti OB',userType:manager||admin?'Super User':'Mobile User',userGroup:manager||admin?'':role,adminLevel:manager?'Manager':admin?'Admin':'',managerRole:manager?role:'',phone:'',mail:'',passwordHash:hashPassword(password),mustChangePassword:false,desktopUserMenuAccess:'Requests | Tickets | Reports',mobileUserMenuAccess:'Requests | Tickets | Reports'};
    await pool.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1::jsonb)",[JSON.stringify(user)]);
    const session=await call(key,'POST','/api/login',{username:user.login,password});
    assert.ok(session.token,`${key} login token`);tokens[key]=session.token;
  }
  const equipment=[];
  for(let i=1;i<=12;i++){
    const item={door:`AUD-${run}-${i}`,chassis:`CH-${run}-${i}`,equipmentName:'Audit excavator',group:'EXCAVATOR',category:'Equipment',model:'Audit model',make:'Audit make',currentLocation:'Sasti OB',registration:`REG-${run}-${i}`};
    equipment.push(item);
    await pool.query("INSERT INTO master_records(master_name,record_data) VALUES('Equipment master',$1::jsonb)",[JSON.stringify(item)]);
  }
  let sequence=0;
  const refs=[];
  function requestBody({minutes=5}={}){
    const item=equipment[sequence++];
    assert.ok(item,'Isolated equipment fixtures must cover every request');
    return {ref:`REQ-AUDIT-${run}-${sequence}`,equipment:item.equipmentName,equipmentGroup:item.group,door:item.door,chassis:item.chassis,reg:item.registration,site:'Sasti OB',category:'Breakdown',complaint:'Isolated audit cycle',meterType:'HMR',start:india(-minutes*60000).replace('T',' · ')};
  }
  async function create({role='production',minutes=5}={}){
    const body=requestBody({minutes});
    const row=await call(role,'POST','/api/requests',body,201);refs.push(row.ref);
    assert.equal(row.status,'Open');assert.equal(row.driverName,'','Missing driver must not become fictitious Demo Driver');
    return row;
  }
  const change=(row,extra={})=>({category:row.category,complaint:row.complaint,expectedCompletionAt:india(3600000).slice(0,16),meterType:'HMR',...extra});
  const closeBody=(extra={})=>{const [closingDate,closingTime]=india().split('T');return {closingDate,closingTime,maintenanceWork:'Audit repair completed',...extra}};
  const verification=()=>({firstTripDone:false,firstTripCardImage:image,closingMeterReading:'200'});
  const rows=role=>call(role,'GET','/api/requests');
  const contains=(list,ref)=>list.some(r=>r.ref===ref);
  async function assertClosedQueues(row){
    assert.ok(contains((await rows('production')).filter(visibleInProductionHistory),row.ref));
    assert.ok(contains((await rows('maintenance')).filter(visibleInMaintenanceHistory),row.ref));
    assert.ok(contains((await rows('mis')).filter(visibleInMisRequests),row.ref));
    assert.ok(contains(await rows('maintenanceManager'),row.ref));
    assert.ok(contains(await rows('admin'),row.ref));
  }
  await t.test('late arrival → required red flag → accept → update → repair close → MIS flag and verify',async()=>{
    const row=await create({minutes:125});
    const blocked=await call('maintenance','PATCH',`/api/requests/${row.ref}`,change(row),409);
    assert.equal(blocked.code,'ARRIVAL_RED_FLAG_REQUIRED');
    await call('maintenance','PATCH',`/api/requests/${row.ref}/arrival-flag`,{remark:'   '},400);
    const flagged=await call('maintenance','PATCH',`/api/requests/${row.ref}/arrival-flag`,{remark:'Vehicle delayed in transit'});
    assert.equal(flagged.arrivalFlagRemark,'Vehicle delayed in transit');
    const accepted=await call('maintenance','PATCH',`/api/requests/${row.ref}`,change(row));
    assert.ok(accepted.acceptedAt);assert.equal(accepted.acceptedBy,'Sanskar Manohare');
    await call('maintenance','POST',`/api/requests/${row.ref}/daily-remarks`,{remark:'Inspection completed',delayReason:'Part being checked'},201);
    const updated=await call('maintenance','POST',`/api/requests/${row.ref}/daily-remarks`,{remark:'Inspection revised',delayReason:'Part available'});
    assert.equal(updated.dailyRemarks.length,1);assert.equal(updated.dailyRemarks[0].remark,'Inspection revised');
    const waiting=await call('maintenance','PATCH',`/api/requests/${row.ref}/close`,closeBody({status:'Awaiting parts'}));
    assert.equal(waiting.status,'Awaiting parts');
    const closed=await call('maintenance','PATCH',`/api/requests/${row.ref}/close`,closeBody({status:'Closed'}));
    await assertClosedQueues(closed);
    await call('production','PATCH',`/api/requests/${row.ref}/verify`,verification(),403);
    await call('otherMis','PATCH',`/api/requests/${row.ref}/verify`,verification(),403);
    await call('mis','PATCH',`/api/requests/${row.ref}/verify`,{closingMeterReading:'200'},400);
    await call('mis','PATCH',`/api/requests/${row.ref}/mis-flag`,{remark:''},400);
    await call('mis','PATCH',`/api/requests/${row.ref}/mis-flag`,{remark:'Trip record checked for discrepancy'});
    const verified=await call('mis','PATCH',`/api/requests/${row.ref}/verify`,verification());
    assert.equal(verified.verificationStatus,'Verified');assert.equal(verified.verifiedBy,'Damini Rai');
    assert.ok(contains((await rows('mis')).filter(visibleInMisHistory),row.ref));
    assert.ok(!contains((await rows('mis')).filter(visibleInMisRequests),row.ref));
    assert.ok(contains((await rows('production')).filter(visibleInProductionHistory),row.ref));
    assert.equal((await call('mis','PATCH',`/api/requests/${row.ref}/verify`,verification())).verifiedAt,verified.verifiedAt);
    await call('maintenance','PATCH',`/api/requests/${row.ref}`,change(row),409);
    const evidence=await fetch(`${base}/api/requests/${row.ref}/trip-card`,{headers:{Authorization:`Bearer ${tokens.mis}`}});
    assert.equal(evidence.status,200);assert.equal((await evidence.json()).image,image);
  });
  for(const role of ['maintenanceManager','productionManager','projectManager'])await t.test(`idle → ${role} approval → all closed queues → MIS first-trip verification`,async()=>{
    const row=await create();
    await call('maintenance','PATCH',`/api/requests/${row.ref}`,change(row));
    const idle=await call('maintenance','PATCH',`/api/requests/${row.ref}/close`,closeBody({ideal:true,idleReason:'No work'}));
    assert.equal(idle.status,'Idle');assert.ok(idle.idealRequestedAt);assert.equal(idle.closedAt,null);
    assert.ok(!contains((await rows('mis')).filter(visibleInMisRequests),row.ref));
    await call('production','PATCH',`/api/requests/${row.ref}/ideal-onroad`,{},403);
    await call('otherManager','PATCH',`/api/requests/${row.ref}/ideal-onroad`,{},409);
    const approved=await call(role,'PATCH',`/api/requests/${row.ref}/ideal-onroad`,{});
    assert.equal(approved.status,'Closed');assert.ok(approved.idealApprovedAt);assert.ok(approved.closedAt);
    await assertClosedQueues(approved);
    await call(role,'PATCH',`/api/requests/${row.ref}/ideal-onroad`,{},409);
    const [firstTripDate,firstTripTime]=india().split('T');
    const verified=await call('mis','PATCH',`/api/requests/${row.ref}/verify`,{...verification(),firstTripDone:true,firstTripDate,firstTripTime});
    assert.equal(verified.firstTripDone,true);assert.ok(verified.firstTripAt);
    assert.ok(contains((await rows('mis')).filter(visibleInMisHistory),row.ref));
  });
  await t.test('idle cancel returns to active maintenance without losing arrival history',async()=>{
    const row=await create();
    const accepted=await call('maintenance','PATCH',`/api/requests/${row.ref}`,change(row));
    await call('maintenance','PATCH',`/api/requests/${row.ref}/close`,closeBody({ideal:true,idleReason:'No driver'}));
    await call('productionManager','PATCH',`/api/requests/${row.ref}/idle-cancel`,{},403);
    const reopened=await call('maintenanceManager','PATCH',`/api/requests/${row.ref}/idle-cancel`,{});
    assert.equal(reopened.status,'In progress');assert.equal(reopened.idleReason,'');assert.equal(reopened.closedAt,null);assert.equal(reopened.acceptedAt,accepted.acceptedAt);
    await call('maintenanceManager','PATCH',`/api/requests/${row.ref}/idle-cancel`,{},409);
    await call('maintenance','POST',`/api/requests/${row.ref}/daily-remarks`,{remark:'Further repair needed',delayReason:'Parts inspection'},201);
  });
  await t.test('scope, duplicate protection, role permissions, and unsupported flags',async()=>{
    const row=await create();
    await call('production','PATCH',`/api/requests/${row.ref}`,change(row),403);
    await call('otherMaintenance','PATCH',`/api/requests/${row.ref}`,change(row),403);
    await call('maintenance','PATCH',`/api/requests/${row.ref}/arrival-flag`,{remark:'Not actually late'},409);
    await call('production','POST','/api/requests',{...row,ref:`${row.ref}-duplicate`,equipment:row.equipment,meterType:'HMR'},409);
    await call('otherProduction','POST','/api/requests',{...row,ref:`${row.ref}-crosssite`,door:'WRONG-SITE-AUDIT',chassis:'WRONG-SITE-AUDIT',meterType:'HMR'},403);
    for(const role of ['otherProduction','otherMaintenance','otherMis','otherManager'])assert.equal((await rows(role)).filter(r=>refs.includes(r.ref)).length,0,`${role} must not see other site data`);
    for(const role of ['production','maintenance','mis','maintenanceManager','productionManager','projectManager','misManager','admin']){
      const data=await call(role,'GET','/api/reports/master-data');assert.ok(Array.isArray(data.equipmentRecords));
      assert.ok(data.equipmentRecords.some(e=>e.door===equipment[0].door),`${role} report fleet is loaded`);
    }
  });
  await t.test('ticket created by production, seen and resolved by admin, notification links persist',async()=>{
    const ticket=await call('production','POST','/api/tickets',{priority:'Medium',message:'Isolated full cycle audit ticket'},201);
    assert.ok(ticket.reference);assert.ok((await call('admin','GET','/api/tickets')).some(r=>r.reference===ticket.reference));
    await call('production','PATCH','/api/tickets/resolve',{reference:ticket.reference,resolutionMessage:'Should not resolve'},403);
    const resolved=await call('admin','PATCH','/api/tickets/resolve',{reference:ticket.reference,resolutionMessage:'Checked and resolved locally'});
    assert.equal(resolved.status,'Resolved');
    assert.ok((await call('production','GET','/api/tickets')).some(r=>r.reference===ticket.reference&&r.status==='Resolved'));
    const notificationRows=await pool.query('SELECT ticket_reference FROM crm_notifications WHERE ticket_reference=ANY($1::text[])',[refs]);
    assert.ok(notificationRows.rows.length>0);
  });
  async function concurrentPost(role,body){
    const response=await fetch(`${base}/api/requests`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tokens[role]}`},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  }
  await t.test('concurrent HTTP creation allows only one active request per matching door or chassis',async()=>{
    for(const match of ['normalized identity','door','chassis']){
      const first=requestBody(),second={...first,ref:`${first.ref}-CONCURRENT`};
      if(match==='normalized identity'){second.door=` ${first.door.toLowerCase()} `;second.chassis=` ${first.chassis.toLowerCase()} `;}
      if(match==='door')second.chassis=`${first.chassis}-OTHER`;
      if(match==='chassis')second.door=`${first.door}-OTHER`;
      const results=await Promise.all([concurrentPost('production',first),concurrentPost('maintenance',second)]);
      assert.deepEqual(results.map(result=>result.status).sort(),[201,409],`${match}: ${JSON.stringify(results)}`);
      const winner=results.find(result=>result.status===201).body,conflict=results.find(result=>result.status===409).body;
      assert.equal(conflict.duplicate,true);
      assert.equal(conflict.existingReference,winner.ref);
      const stored=await pool.query('SELECT reference,status FROM maintenance_requests WHERE reference=ANY($1::text[])',[[first.ref,second.ref]]);
      assert.equal(stored.rows.length,1,`${match}: loser must not leave a persisted request`);
      assert.equal(stored.rows[0].reference,winner.ref);assert.equal(stored.rows[0].status,'Open');
      refs.push(winner.ref);
    }
  });
  await t.test('concurrent HTTP creation of distinct vehicles succeeds independently',async()=>{
    const first=requestBody(),second=requestBody();
    const results=await Promise.all([concurrentPost('production',first),concurrentPost('maintenance',second)]);
    assert.deepEqual(results.map(result=>result.status),[201,201],JSON.stringify(results));
    const stored=await pool.query('SELECT reference,status FROM maintenance_requests WHERE reference=ANY($1::text[])',[[first.ref,second.ref]]);
    assert.equal(stored.rows.length,2);
    assert.ok(stored.rows.every(row=>row.status==='Open'));
    refs.push(...results.map(result=>result.body.ref));
    const duplicateReference=await concurrentPost('production',{...requestBody(),ref:first.ref});
    assert.equal(duplicateReference.status,409);
    assert.equal(duplicateReference.body.code,'REQUEST_REFERENCE_CONFLICT');
    assert.match(duplicateReference.body.error,/[Rr]efresh/);
  });
  await t.test('all 15 department reports render finite cells from actual completed HTTP cycles',async()=>{
    const actual=(await rows('admin')).filter(row=>refs.includes(row.ref));
    const reports=buildDepartmentReports({requests:actual,equipmentRecords:equipment,from:india().slice(0,10),to:india().slice(0,10)});
    assert.equal(reports.length,15);
    for(const report of reports){
      assert.ok(report.title);assert.ok(Array.isArray(report.rows));assert.ok(report.columns.length);
      for(const row of report.rows)for(const column of report.columns){const value=column.value?column.value(row):row[column.key];assert.doesNotMatch(String(value),/NaN|Invalid Date|Infinity/,`${report.title}/${column.key}`)}
    }
    const flagReport=reports.find(r=>r.title==='Vehicle Arrival Red Flag Report');assert.ok(flagReport.rows.length>=1);
    const misFlagReport=reports.find(r=>r.title==='MIS Red Flag Report');assert.ok(misFlagReport.rows.length>=1);
    assert.equal(reports.find(r=>r.title==='Unverified Cases').rows.length,0);
  });
});
