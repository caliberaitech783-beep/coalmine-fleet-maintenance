import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const authSource=server.slice(server.indexOf('async function requireSession('),server.indexOf('async function requireSuper('));
const guardSource=server.slice(server.indexOf('const arrivalDelaySql='),server.indexOf("app.post('/api/requests/:reference/daily-remarks'"));
const routes={
  edit:server.slice(server.indexOf("app.patch('/api/requests/:reference',"),server.indexOf("app.patch('/api/requests/:reference/close',")),
  close:server.slice(server.indexOf("app.patch('/api/requests/:reference/close',"),server.indexOf("app.patch('/api/requests/:reference/ideal-onroad',")),
  daily:server.slice(server.indexOf("app.post('/api/requests/:reference/daily-remarks',"),server.indexOf("app.patch('/api/requests/:reference/arrival-flag',")),
};
const now=Date.parse('2026-09-08T13:00:00Z');
const waiting={ref:'REQ-GATE',site:'Sasti OB',status:'Open',acceptanceRequired:true,start:'2026-09-08T11:00:00Z',acceptedAt:null,arrivalFlaggedAt:null,arrivalFlagRemark:'',opening_meter_reading:'100',meter_type:'HMR',expected_completion_at:null};
const acceptedLate={...waiting,acceptedAt:'2026-09-08T12:00:01Z'};
const allowed={role:'normal',assignedRole:'Maintenance User',name:'Maintenance inspector',permissions:{editRequests:true,closeRequests:true}};
const active=row=>row&&!['Closed','Idle','Ideal'].includes(row.status)&&!row.verifiedAt;
const needsFlag=row=>((row.acceptanceRequired&&!row.acceptedAt&&Date.parse(row.start)<=now-3600000)||(row.acceptedAt&&Date.parse(row.acceptedAt)-Date.parse(row.start)>3600000))&&!(row.arrivalFlaggedAt&&row.arrivalFlagRemark.trim());

function harness(kind,{row=waiting,user={site:'Sasti OB'},failFinalWrite=false}={}){
  let saved=structuredClone(row),snapshot,chain,inTransaction=false,released=false,committed=false;
  const queries=[];
  const client={
    async query(sql,values){
      queries.push({sql,values,inTransaction});
      if(sql==='BEGIN'){inTransaction=true;snapshot=structuredClone(saved);return {rows:[]};}
      if(sql==='COMMIT'){inTransaction=false;committed=true;return {rows:[]};}
      if(sql==='ROLLBACK'){saved=snapshot;inTransaction=false;return {rows:[]};}
      if(sql.includes('FOR UPDATE')){
        assert.ok(inTransaction);
        assert.match(sql,/accepted_at IS NOT NULL AND accepted_at>started_at\+INTERVAL '1 hour'/);
        assert.match(sql,/accepted_at IS NULL AND started_at<=NOW\(\)-INTERVAL '1 hour'/);
        assert.match(sql,/arrival_flagged_at IS NOT NULL AND length\(btrim\(arrival_flag_remark,E'[^']*'\)\)>0/);
        return {rows:active(saved)?[{site:saved.site,arrival_flag_ready:!needsFlag(saved)}]:[]};
      }
      if(sql.startsWith('SELECT * FROM maintenance_requests'))return {rows:saved?[structuredClone(saved)]:[]};
      if(sql.startsWith('SELECT meter_type'))return {rows:active(saved)&&!needsFlag(saved)?[structuredClone(saved)]:[]};
      if(sql.startsWith('SELECT reference,site,requester_login'))return {rows:active(saved)&&!needsFlag(saved)?[structuredClone(saved)]:[]};
      if(sql.startsWith('SELECT id FROM maintenance_daily_remarks'))return {rows:[]};
      if(sql.startsWith('SELECT record_data'))return {rows:[]};
      if(sql.startsWith('UPDATE maintenance_requests')){
        assert.ok(inTransaction,'every maintenance write is inside its request lock transaction');
        assert.match(sql,/AND \(NOT \(\(acceptance_required=TRUE/,'mutation repeats the authoritative SQL guard');
        if(!active(saved)||needsFlag(saved))return {rows:[],rowCount:0};
        if(sql.includes("SET meter_type=CASE"))saved.opening_meter_reading=values[1];
        else if(failFinalWrite)throw new Error('Simulated write failure');
        else if(sql.includes('SET category='))saved={...saved,complaint:values[1],acceptedAt:saved.acceptanceRequired?(saved.acceptedAt||new Date(now).toISOString()):saved.acceptedAt};
        else saved={...saved,status:sql.includes("status='Closed'")?'Closed':sql.includes("status='Idle'")?'Idle':values[2]};
        return {rows:[structuredClone(saved)],rowCount:1};
      }
      if(sql.startsWith('INSERT INTO maintenance_daily_remarks')){assert.ok(inTransaction);return {rows:[],rowCount:1};}
      throw new Error(`Unexpected query: ${sql}`);
    },
    release(){released=true;},
  };
  const register=(_path,...handlers)=>{chain=handlers;};
  const context={
    app:{patch:register,post:register},pool:{connect:async()=>client,query:client.query},
    readSession:async req=>req.testSession,currentUserRecord:async()=>user,
    canonicalSiteName:value=>String(value||'').trim().toLowerCase(),requestProjection:'*',
    validMeterReading:()=>true,validMeterEvidenceDataUrl:()=>true,validRequestAudioDataUrl:()=>true,
    requestDateTimeValue:()=>new Date(now),delayedReasonRequired:()=>false,REQUEST_CLOSE_STATUSES:['Closed','In progress','Open'],
    attachDailyRemarks:async rows=>rows,addTicketNotifications:async()=>{},addTicketNotificationsBestEffort:async()=>{},
    sendRequestEventReports:async()=>{},requestStakeholderLogins:async()=>[],requestWorkflowWhatsAppLogins:async()=>[],
    requestEquipmentNotificationDetails:()=>'',requestNotificationTime:()=>'',workflowRequestLink:()=>'',publicBaseUrl:()=>'',console,
  };
  runInNewContext(`${authSource}\n${guardSource}\n${routes[kind]}`,context);
  return {
    queries,get saved(){return saved;},get released(){return released;},get committed(){return committed;},
    async call({session=allowed,body={}}={}){
      const defaults=kind==='edit'?{complaint:'Repair',expectedCompletionAt:'2026-09-08T20:00',meterType:'HMR'}:kind==='daily'?{remark:'Work update',delayReason:'Parts unavailable'}:{closingDate:'2026-09-08',closingTime:'18:30:00',maintenanceWork:'Repair work',status:'In progress'};
      const req={params:{reference:'REQ-GATE'},body:{...defaults,...body},testSession:session};
      const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
      for(const handler of chain){
        let advanced=false,error;
        await handler(req,res,value=>{advanced=true;error=value;});
        if(error)throw error;
        if(!advanced)break;
      }
      return {status:res.statusCode,body:res.body};
    },
  };
}

test('acceptance, editing, daily updates and closure are blocked until a delayed arrival has its reason',async()=>{
  for(const kind of ['edit','daily','close'])for(const row of [waiting,acceptedLate,{...acceptedLate,arrivalFlaggedAt:'2026-09-08T12:30:00Z',arrivalFlagRemark:' \t\n\r '}]){
    const app=harness(kind,{row});
    const response=await app.call();
    assert.equal(response.status,409,kind);
    assert.equal(response.body.code,'ARRIVAL_RED_FLAG_REQUIRED');
    assert.equal(app.queries.filter(({sql})=>sql.startsWith('UPDATE ')||sql.startsWith('INSERT ')).length,0);
    assert.ok(app.released);
    assert.ok(!app.committed);
  }
});

test('on-time vehicles and properly flagged delayed vehicles continue through all maintenance workflows',async()=>{
  for(const kind of ['edit','daily','close'])for(const row of [
    {...waiting,start:'2026-09-08T12:00:01Z'},
    {...waiting,acceptedAt:'2026-09-08T12:00:00Z'},
    {...waiting,acceptanceRequired:false},
    {...acceptedLate,arrivalFlaggedAt:'2026-09-08T12:30:00Z',arrivalFlagRemark:'Waiting for the recovery crane'},
  ]){
    const app=harness(kind,{row});
    assert.equal((await app.call()).status,kind==='daily'?201:200,kind);
    assert.ok(app.committed);
    assert.ok(app.released);
  }
});

test('the waiting threshold is inclusive but already-accepted late arrival is strictly more than one hour',async()=>{
  const due=harness('edit',{row:{...waiting,start:new Date(now-3600000).toISOString()}});
  assert.equal((await due.call()).body.code,'ARRIVAL_RED_FLAG_REQUIRED');
  assert.equal((await harness('edit',{row:{...waiting,acceptedAt:'2026-09-08T12:00:00Z'}}).call()).status,200);
  assert.equal((await harness('edit',{row:acceptedLate}).call()).body.code,'ARRIVAL_RED_FLAG_REQUIRED');
  assert.match(routes.edit,/COALESCE\(accepted_at,NOW\(\)\)/);
  assert.match(server,/to_char\(accepted_at AT TIME ZONE 'Asia\/Kolkata','YYYY-MM-DD HH24:MI:SS'\)/);
});

test('wrong roles and other-site users cannot bypass maintenance write guards',async()=>{
  for(const kind of ['edit','daily','close']){
    const app=harness(kind,{user:{site:'Majri OB'}});
    assert.equal((await app.call()).status,403);
    assert.equal(app.queries.filter(({sql})=>sql.startsWith('UPDATE ')||sql.startsWith('INSERT ')).length,0);
    const forbidden=harness(kind);
    assert.equal((await forbidden.call({session:{...allowed,assignedRole:'MIS User'}})).status,403);
    assert.equal(forbidden.queries.length,0);
  }
});

test('close validation and failed status updates roll back meter evidence in the same transaction',async()=>{
  const app=harness('close',{row:{...acceptedLate,arrivalFlaggedAt:'2026-09-08T12:30:00Z',arrivalFlagRemark:'Documented delay'},failFinalWrite:true});
  await assert.rejects(app.call({body:{openingMeterReading:'250',meterType:'HMR'}}),/Simulated write failure/);
  assert.equal(app.saved.opening_meter_reading,'100');
  assert.equal(app.saved.status,'Open');
  assert.ok(app.queries.some(({sql})=>sql==='ROLLBACK'));
  assert.ok(app.released);
});

test('already closed history is returned without a new arrival flag requirement or data rewrite',async()=>{
  const app=harness('close',{row:{...acceptedLate,status:'Closed'}});
  const result=await app.call({body:{status:'Closed'}});
  assert.equal(result.status,200);
  assert.equal(result.body.status,'Closed');
  assert.equal(app.queries.filter(({sql})=>sql.startsWith('UPDATE ')||sql.startsWith('INSERT ')||sql==='BEGIN').length,0);
});
