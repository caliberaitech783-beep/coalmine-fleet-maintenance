import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const routeSource=server.slice(server.indexOf("app.patch('/api/requests/:reference/arrival-flag'"),server.indexOf('async function activeRequestConflict'));
const authSource=server.slice(server.indexOf('async function requireSession('),server.indexOf('async function requireSuper('));
const guardSource=server.slice(server.indexOf('const arrivalDelaySql='),server.indexOf("app.post('/api/requests/:reference/daily-remarks'"));
const now=Date.parse('2026-09-08T07:30:00Z');
const eligible={ref:'REQ-ARRIVAL-1',site:'Sasti OB',status:'Open',acceptanceRequired:true,acceptedAt:null,start:'2026-09-08T06:00:00Z',arrivalFlaggedAt:null,arrivalFlagRemark:''};
const allowed={role:'normal',assignedRole:'Maintenance User',name:'Maintenance inspector',login:'maintenance.inspector',permissions:{editRequests:true}};

// Run the actual middleware and route against a guarded database stub. Importing
// server.mjs directly would start production-oriented background work.
function harness({row=eligible,user={site:'Sasti OB'},beforeUpdate}={}){
  let saved=row?structuredClone(row):null;
  let chain;
  const queries=[];
  const context={
    app:{patch(path,...handlers){assert.equal(path,'/api/requests/:reference/arrival-flag');chain=handlers;}},
    readSession:async req=>req.testSession,
    currentUserRecord:async()=>user,
    canonicalSiteName:value=>String(value||'').trim().toLowerCase(),
    requestProjection:'*',
    attachDailyRemarks:async rows=>rows.map(value=>({...value,dailyRemarks:[]})),
    pool:{async query(sql,values){
      queries.push({sql,values});
      if(sql.startsWith('SELECT '))return {rows:saved?[structuredClone(saved)]:[]};
      assert.match(sql,/SET arrival_flagged_at=COALESCE\(arrival_flagged_at,NOW\(\)\),arrival_flagged_by=CASE WHEN arrival_flagged_at IS NULL THEN \$1 ELSE arrival_flagged_by END,arrival_flag_remark=\$2/);
      assert.match(sql,/acceptance_required=TRUE AND accepted_at IS NULL AND started_at<=NOW\(\)-INTERVAL '1 hour'/);
      assert.match(sql,/accepted_at IS NOT NULL AND accepted_at>started_at\+INTERVAL '1 hour'/);
      assert.match(sql,/status NOT IN \('Closed','Idle','Ideal'\) AND verified_at IS NULL/);
      assert.match(sql,/length\(btrim\(arrival_flag_remark,E'[^']*'\)\)=0 AND site=\$4/);
      if(beforeUpdate)beforeUpdate(saved);
      const [actor,remark,reference,site]=values;
      const eligibleDelay=saved&&((saved.acceptanceRequired&&!saved.acceptedAt&&Date.parse(saved.start)<=now-3600000)||(saved.acceptedAt&&Date.parse(saved.acceptedAt)-Date.parse(saved.start)>3600000));
      if(!saved||saved.ref!==reference||!eligibleDelay||['Closed','Idle','Ideal'].includes(saved.status)||saved.verifiedAt||saved.arrivalFlagRemark.trim()||saved.site!==site)return {rows:[]};
      saved={...saved,arrivalFlaggedAt:saved.arrivalFlaggedAt||'2026-09-08 13:00:00',arrivalFlaggedBy:saved.arrivalFlaggedAt?saved.arrivalFlaggedBy:actor,arrivalFlagRemark:remark};
      return {rows:[structuredClone(saved)]};
    }},
  };
  runInNewContext(`${authSource}\n${guardSource}\n${routeSource}`,context);
  return {
    queries,
    get saved(){return saved;},
    async call({remark='Recovery vehicle has not arrived',session=allowed}={}){
      const req={params:{reference:'REQ-ARRIVAL-1'},body:{remark},testSession:session};
      const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
      for(const handler of chain){
        let advanced=false,error;
        await handler(req,res,value=>{advanced=true;error=value;});
        if(error)throw error;
        if(!advanced)break;
      }
      return {status:res.statusCode,body:res.body,audit:req.audit};
    },
  };
}

test('arrival flag requires an authorized maintenance user and assigned site',async()=>{
  for(const [session,expected] of [[null,401],[{...allowed,assignedRole:'MIS User'},403],[{...allowed,permissions:{editRequests:false}},403],[{...allowed,role:'super',permissions:{editRequests:true,adminLevel:'Manager'}},403]]){
    const app=harness();
    assert.equal((await app.call({session})).status,expected);
    assert.equal(app.queries.length,0);
  }
  for(const user of [{},{site:'Majri OB'}]){
    const app=harness({user});
    assert.equal((await app.call()).status,403);
    assert.equal(app.queries.filter(query=>query.sql.startsWith('UPDATE ')).length,0);
  }
  assert.equal((await harness({user:{location:' Sasti OB '}}).call()).status,200);
  assert.equal((await harness().call({session:{...allowed,permissions:{closeRequests:true}}})).status,200);
});

test('arrival flag remark must be a nonblank string of no more than 2,000 characters',async()=>{
  for(const remark of ['', '   ', null, 17, {text:'Issue'}, ['Issue'], 'x'.repeat(2001)]){
    const app=harness();
    assert.equal((await app.call({remark})).status,400);
    assert.equal(app.queries.length,0);
  }
  assert.equal((await harness().call({remark:'x'.repeat(2000)})).status,200);
});

test('arrival remark, original flag time and maintenance author are saved together and audited',async()=>{
  const app=harness();
  const result=await app.call({remark:'  Waiting for recovery crane.  '});
  assert.equal(result.status,200);
  assert.equal(result.body.arrivalFlagRemark,'Waiting for recovery crane.');
  assert.equal(result.body.arrivalFlaggedAt,'2026-09-08 13:00:00');
  assert.equal(result.body.arrivalFlaggedBy,'Maintenance inspector');
  assert.equal(result.body.acceptedAt,null);
  assert.equal(result.body.status,'Open');
  assert.equal(result.audit.reason,result.body.arrivalFlagRemark);
  assert.equal(result.audit.changedFields.length,3);
});

test('only an active overdue or accepted-late unverified request can be flagged',async()=>{
  for(const row of [{...eligible,acceptanceRequired:false},{...eligible,acceptedAt:'2026-09-08T07:00:00Z'},...['Closed','Idle','Ideal'].map(status=>({...eligible,status})),{...eligible,verifiedAt:'2026-09-08T07:30:00Z'},{...eligible,start:'2026-09-08T07:00:01Z'}]){
    const app=harness({row});
    assert.equal((await app.call()).status,409);
    assert.equal(app.saved.arrivalFlaggedAt,null);
  }
  assert.equal((await harness({row:null}).call()).status,404);
  assert.equal((await harness({row:{...eligible,start:new Date(now-3600000).toISOString()}}).call()).status,200);
  assert.equal((await harness({row:{...eligible,acceptedAt:'2026-09-08T07:00:01Z'}}).call()).status,200);
});

test('duplicate and concurrent arrival flags preserve the original remark and evidence',async()=>{
  const app=harness();
  const first=await app.call({remark:'Original issue'});
  const repeat=await app.call({remark:'Replacement issue'});
  assert.equal(repeat.status,200);
  assert.equal(repeat.body.arrivalFlagRemark,first.body.arrivalFlagRemark);
  assert.equal(repeat.body.arrivalFlaggedAt,first.body.arrivalFlaggedAt);
  assert.equal(repeat.audit,undefined);
  const legacy=harness({row:{...eligible,arrivalFlaggedAt:'2026-09-08 12:00:00',arrivalFlaggedBy:'Original inspector',arrivalFlagRemark:' \t\n\r '}});
  const completed=await legacy.call({remark:'Newly supplied original delay reason'});
  assert.equal(completed.audit.action,'Complete arrival red flag reason');
  assert.equal(legacy.saved.arrivalFlagRemark,'Newly supplied original delay reason');
  assert.equal(legacy.saved.arrivalFlaggedAt,'2026-09-08 12:00:00');
  assert.equal(legacy.saved.arrivalFlaggedBy,'Original inspector');
  await legacy.call({remark:'Replacement reason'});
  assert.equal(legacy.saved.arrivalFlagRemark,'Newly supplied original delay reason');
  const concurrent=harness();
  const results=await Promise.all([concurrent.call({remark:'First inspector'}),concurrent.call({remark:'Second inspector'})]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
  assert.equal(concurrent.saved.arrivalFlagRemark,results.find(result=>result.status===200).body.arrivalFlagRemark);
});

test('on-time acceptance, closure, verification and reassignment between read and write prevent a flag',async()=>{
  for(const beforeUpdate of [row=>{row.acceptedAt='2026-09-08T07:00:00Z';},row=>{row.status='Closed';},row=>{row.verifiedAt='2026-09-08T07:30:00Z';},row=>{row.site='Majri OB';}]){
    const app=harness({beforeUpdate});
    const result=await app.call();
    assert.equal(result.status,409);
    assert.equal(app.saved.arrivalFlaggedAt,null);
    assert.equal(result.audit,undefined);
  }
});
