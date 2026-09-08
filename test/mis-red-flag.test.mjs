import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const routeSource=server.slice(server.indexOf("app.patch('/api/requests/:reference/mis-flag'"),server.indexOf("app.patch('/api/requests/:reference/verify'"));
const authSource=server.slice(server.indexOf('async function requireSession('),server.indexOf('async function requireSuper('));
const eligible={ref:'REQ-MIS-1',site:'Sasti OB',status:'Closed',verifiedAt:null,misFlaggedAt:null};
const allowed={role:'normal',assignedRole:'MIS User',name:'MIS inspector',login:'mis.inspector',permissions:{verifyRequests:true}};

// Execute the real route and permission middleware without importing the server
// (which would start background jobs and connect to a database).
function harness({row=eligible,user={site:'Sasti OB'},beforeUpdate}={}){
  let saved=row?structuredClone(row):null;
  let chain;
  const queries=[];
  const context={
    app:{patch(path,...handlers){assert.equal(path,'/api/requests/:reference/mis-flag');chain=handlers;}},
    readSession:async req=>req.testSession,
    currentUserRecord:async()=>user,
    canonicalSiteName:value=>String(value||'').trim().toLowerCase(),
    requestProjection:'*',
    attachDailyRemarks:async rows=>rows.map(row=>({...row,dailyRemarks:[]})),
    pool:{async query(sql,values){
      queries.push({sql,values});
      if(sql.startsWith('SELECT '))return {rows:saved?[structuredClone(saved)]:[]};
      assert.match(sql,/SET mis_flagged_at=NOW\(\),mis_flagged_by=\$1,mis_flag_remark=\$2/);
      assert.match(sql,/WHERE reference=\$3 AND status='Closed' AND verified_at IS NULL AND mis_flagged_at IS NULL/);
      assert.match(sql,/AND site=\$4/);
      if(beforeUpdate)beforeUpdate(saved);
      const [actor,remark,reference,site]=values;
      if(!saved||saved.ref!==reference||saved.status!=='Closed'||saved.verifiedAt||saved.misFlaggedAt||saved.site!==site)return {rows:[]};
      saved={...saved,misFlaggedAt:'2026-09-08 12:01:02',misFlaggedBy:actor,misFlagRemark:remark};
      return {rows:[structuredClone(saved)]};
    }},
  };
  runInNewContext(`${authSource}\n${routeSource}`,context);
  return {
    queries,
    get saved(){return saved;},
    async call({remark='Wrong closing reading',session=allowed}={}){
      const req={params:{reference:'REQ-MIS-1'},body:{remark},testSession:session};
      const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
      for(const handler of chain){
        let advanced=false;
        let error;
        await handler(req,res,value=>{advanced=true;error=value;});
        if(error)throw error;
        if(!advanced)break;
      }
      return {status:res.statusCode,body:res.body,audit:req.audit};
    },
  };
}

test('MIS flag route requires a signed-in MIS user with verification permission',async()=>{
  for(const [session,expected] of [
    [null,401],
    [{...allowed,assignedRole:'Maintenance User'},403],
    [{...allowed,permissions:{verifyRequests:false}},403],
    [{...allowed,role:'super',permissions:{verifyRequests:true,adminLevel:'Manager'}},403],
  ]){
    const app=harness();
    assert.equal((await app.call({session})).status,expected);
    assert.equal(app.queries.length,0);
  }
});

test('MIS red flags require a nonblank string remark of at most 2,000 characters',async()=>{
  for(const remark of ['', '   ', 17, {text:'Wrong reading'}, ['Wrong reading'], 'x'.repeat(2001)]){
    const app=harness();
    assert.equal((await app.call({remark})).status,400);
    assert.equal(app.queries.length,0);
  }
  assert.equal((await harness().call({remark:'x'.repeat(2000)})).status,200);
});

test('MIS flags enforce assigned location before allowing a write',async()=>{
  for(const user of [{},{site:'Majri OB'}]){
    const app=harness({user});
    assert.equal((await app.call()).status,403);
    assert.equal(app.queries.filter(query=>query.sql.startsWith('UPDATE ')).length,0);
  }
  assert.equal((await harness({user:{location:' Sasti OB '}}).call()).status,200);
});

test('only an existing closed request awaiting verification can receive an MIS flag',async()=>{
  for(const [row,status] of [
    [null,404],
    [{...eligible,status:'Open'},409],
    [{...eligible,status:'Idle'},409],
    [{...eligible,verifiedAt:'2026-09-08 11:00:00'},409],
  ]){
    const app=harness({row});
    assert.equal((await app.call()).status,status);
    assert.equal(app.queries.filter(query=>query.sql.startsWith('UPDATE ')).length,0);
  }
});

test('MIS flag saves the trimmed remark, server time and actor with an audit entry',async()=>{
  const app=harness();
  const result=await app.call({remark:'  Closing reading does not match the trip card.  '});
  assert.equal(result.status,200);
  assert.equal(result.body.misFlagRemark,'Closing reading does not match the trip card.');
  assert.equal(result.body.misFlaggedBy,'MIS inspector');
  assert.equal(result.body.misFlaggedAt,'2026-09-08 12:01:02');
  assert.equal(result.body.status,'Closed');
  assert.equal(result.body.verifiedAt,null);
  assert.equal(result.audit.action,'Raise MIS red flag');
  assert.equal(result.audit.reason,result.body.misFlagRemark);
  assert.equal(result.audit.changedFields.length,3);
});

test('repeat and concurrent flags cannot overwrite the original MIS evidence',async()=>{
  const app=harness();
  const first=await app.call({remark:'Original issue'});
  for(const remark of ['Original issue','Replacement issue']){
    assert.equal((await app.call({remark})).status,409);
    assert.equal(app.saved.misFlagRemark,first.body.misFlagRemark);
    assert.equal(app.saved.misFlaggedAt,first.body.misFlaggedAt);
  }
  const concurrent=harness();
  const results=await Promise.all([concurrent.call({remark:'First inspector'}),concurrent.call({remark:'Second inspector'})]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
  assert.equal(concurrent.saved.misFlagRemark,results.find(result=>result.status===200).body.misFlagRemark);
});

test('verification, reopening or site reassignment between read and write prevents a flag',async()=>{
  for(const beforeUpdate of [
    row=>{row.verifiedAt='2026-09-08 12:01:01';},
    row=>{row.status='Open';},
    row=>{row.site='Majri OB';},
  ]){
    const app=harness({beforeUpdate});
    const result=await app.call();
    assert.equal(result.status,409);
    assert.equal(app.saved.misFlaggedAt,null);
    assert.equal(result.audit,undefined);
  }
});

test('MIS flag schema and projection are additive and verification retains flag history',()=>{
  for(const column of ['mis_flagged_at TIMESTAMPTZ',"mis_flagged_by TEXT NOT NULL DEFAULT ''","mis_flag_remark TEXT NOT NULL DEFAULT ''"]){
    assert.ok(server.includes(`ADD COLUMN IF NOT EXISTS ${column}`));
  }
  for(const field of ['misFlaggedAt','misFlaggedBy','misFlagRemark'])assert.ok(server.includes(`AS "${field}"`));
  const verificationRoute=server.slice(server.indexOf("app.patch('/api/requests/:reference/verify'"),server.indexOf("app.get('/api/requests/:reference/trip-card'"));
  assert.doesNotMatch(verificationRoute,/mis_flag(?:ged_at|ged_by|_remark)\s*=/);
});
