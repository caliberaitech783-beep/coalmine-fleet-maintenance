import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import * as policy from '../admin-lock-policy.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const extract=(start,end)=>{
  const from=server.indexOf(start),to=server.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,`Missing source boundary: ${start}`);
  return server.slice(from,to);
};
const lockFunctions=extract('async function auditAdminLockIncidents(', 'function requireTrueSuperAdmin(');
const loginSource=extract("app.post('/api/login',",'const passwordResetRequestMessage=');
const lockRoutes=extract("app.get('/api/admin-locks',","app.put('/api/navigation-settings',");
const existingIncident={ticketReference:'CRM-OVERDUE',ticketCreatedAt:'2026-08-29T01:00:00Z',lockedAt:'2026-09-01T01:00:00Z'};
const plain=value=>JSON.parse(JSON.stringify(value));
const response=()=>({statusCode:200,headers:{},set(name,value){this.headers[name]=value;return this;},status(code){this.statusCode=code;return this;},json(body){this.body=plain(body);return this;}});

// Execute only the extracted functions/routes. Importing server.mjs would start
// a real server and background jobs, which this regression test must never do.
function lockHarness(paused){
  const queries=[],incidents=[structuredClone(existingIncident)];
  const pool={async query(sql,values){
    queries.push({sql,values});
    return {rows:sql.includes('SELECT ticket_reference')?structuredClone(incidents):[],rowCount:0};
  }};
  const context={pool,ADMIN_LOCK_POLICY_PAUSED:paused,ADMIN_LOCK_TICKET_CUTOFF:policy.ADMIN_LOCK_TICKET_CUTOFF,ADMIN_LOCK_HOURS:policy.ADMIN_LOCK_HOURS};
  runInNewContext(lockFunctions,context);
  return {context,pool,queries,incidents};
}

test('CRM account locking is explicitly paused without changing its saved 72-hour policy',()=>{
  assert.equal(policy.ADMIN_LOCK_POLICY_PAUSED,true);
  assert.equal(policy.ADMIN_LOCK_HOURS,72);
  assert.equal(policy.ADMIN_LOCK_TICKET_CUTOFF,'2026-08-28T00:00:00+05:30');
  assert.match(server,/import\s*\{[^}]*ADMIN_LOCK_POLICY_PAUSED[^}]*\}\s*from\s*['"]\.\/admin-lock-policy\.mjs['"]/);
  assert.match(server,/crmAdminLockPolicyPaused:\s*ADMIN_LOCK_POLICY_PAUSED/);
});

test('paused audits and active-lock reads perform no SQL even when incidents already exist',async()=>{
  const app=lockHarness(true),before=structuredClone(app.incidents);
  await app.context.auditAdminLockIncidents();
  await app.context.auditAdminLockIncidents(app.pool);
  assert.deepEqual(plain(await app.context.activeAdminLockIncidents()),[]);
  assert.deepEqual(plain(await app.context.activeAdminLockIncidents(app.pool)),[]);
  assert.equal(app.queries.length,0);
  assert.deepEqual(app.incidents,before);
});

test('resuming the policy restores the original overdue-ticket audit and active incident read',async()=>{
  const app=lockHarness(false);
  assert.deepEqual(plain(await app.context.activeAdminLockIncidents()),[existingIncident]);
  assert.equal(app.queries.length,2);
  const [audit,active]=app.queries;
  assert.match(audit.sql,/INSERT INTO admin_lock_incidents/);
  assert.match(audit.sql,/created_at >= \$1::timestamptz/);
  assert.match(audit.sql,/created_at <= NOW\(\)-INTERVAL '72 hours'/);
  assert.match(audit.sql,/lower\(status\) NOT IN \('resolved','closed'\)/);
  assert.match(audit.sql,/ON CONFLICT \(ticket_reference\) DO NOTHING/);
  assert.deepEqual(Array.from(audit.values),[policy.ADMIN_LOCK_TICKET_CUTOFF]);
  assert.match(active.sql,/FROM admin_lock_incidents WHERE unlocked_at IS NULL/);
  assert.equal(app.incidents.length,1);
});

function loginHarness({paused=true,level='Admin',mustChangePassword=false}={}){
  const queries=[],passwordChecks=[],sessions=[];
  let handler,incidentReads=0;
  const employee={login:'test.admin',employee:'Test Admin',passwordHash:'test-password-hash',phone:'1234567890',mustChangePassword};
  const context={
    ADMIN_LOCK_POLICY_PAUSED:paused,
    app:{post(path,callback){assert.equal(path,'/api/login');handler=callback;}},
    pool:{async query(sql,values){
      queries.push({sql,values});
      if(sql.includes("master_name='Users & employees'"))return {rows:[{id:'test-user',record_data:employee}]};
      if(sql.includes("master_name='Privilege'"))return {rows:[]};
      if(sql.includes('INSERT INTO password_change_sessions'))return {rows:[],rowCount:1};
      throw new Error(`Unexpected login SQL: ${sql}`);
    }},
    loginRecordCandidates:(rows,username)=>rows.filter(row=>row.record_data.login===username),
    userLoginCandidates:record=>[record.login],
    verifyPassword:(password,hash)=>{passwordChecks.push({password,hash});return password==='correct-test-password'&&hash==='test-password-hash';},
    privilegeForUser:()=>({}),
    resolveMobileAccess:()=>({sessionRole:'super',userType:'Super User',assignedRole:null,permissions:{adminLevel:level}}),
    isLockableAdmin:policy.isLockableAdmin,
    activeAdminLockIncidents:async()=>{incidentReads++;return [structuredClone(existingIncident)];},
    randomUUID:()=>`test-token-${sessions.length+1}`,
    sessionStore:{async create(session){sessions.push(session);}},
    loginPayload:({token,profile,employee:record,login})=>({token,role:profile.sessionRole,name:record.employee,login}),
  };
  runInNewContext(loginSource,context);
  return {queries,passwordChecks,sessions,get incidentReads(){return incidentReads;},async call(body={username:'test.admin',password:'correct-test-password'}){
    const req={body},res=response();
    await handler(req,res,error=>{if(error)throw error;});
    return res;
  }};
}

test('paused Admin and Manager logins skip the 423 lock path but still verify passwords',async()=>{
  for(const level of ['Admin','Manager']){
    const app=loginHarness({level});
    const res=await app.call();
    assert.equal(res.statusCode,200);
    assert.ok(res.body.token);
    assert.equal(app.passwordChecks.length,1);
    assert.equal(app.incidentReads,0);
    assert.equal(app.sessions.length,1);
    assert.ok(app.queries.every(({sql})=>sql.startsWith('SELECT ')));
  }
  assert.match(loginSource,/if\(!ADMIN_LOCK_POLICY_PAUSED\s*&&\s*profile\.sessionRole==='super'\s*&&\s*isLockableAdmin\(profile\.permissions\)\)/);
  assert.ok(loginSource.indexOf('verifyPassword(')<loginSource.indexOf('res.status(423)'));
});

test('the pause does not bypass missing or wrong credentials or forced password changes',async()=>{
  for(const body of [{username:'test.admin',password:''},{username:'',password:'correct-test-password'}]){
    const app=loginHarness();
    assert.equal((await app.call(body)).statusCode,400);
    assert.equal(app.queries.length,0);
    assert.equal(app.sessions.length,0);
  }
  for(const password of ['wrong-test-password','1234567890']){
    const app=loginHarness();
    assert.equal((await app.call({username:'test.admin',password})).statusCode,401);
    assert.equal(app.passwordChecks.length,1);
    assert.equal(app.incidentReads,0);
    assert.equal(app.sessions.length,0);
  }
  const app=loginHarness({mustChangePassword:true}),res=await app.call();
  assert.equal(res.statusCode,200);
  assert.equal(res.body.requiresPasswordChange,true);
  assert.ok(res.body.changeToken);
  assert.equal(app.sessions.length,0);
  assert.equal(app.passwordChecks.length,1);
  assert.equal(app.incidentReads,0);
  assert.match(app.queries.at(-1).sql,/INSERT INTO password_change_sessions/);
});

test('resumed locking still returns 423 for overdue Admin and Manager accounts only',async()=>{
  for(const level of ['Admin','Manager']){
    const app=loginHarness({paused:false,level}),res=await app.call();
    assert.equal(res.statusCode,423);
    assert.match(res.body.error,/CRM-OVERDUE/);
    assert.match(res.body.error,/72 hours/);
    assert.equal(app.passwordChecks.length,1);
    assert.equal(app.incidentReads,1);
    assert.equal(app.sessions.length,0);
  }
  const superAdmin=loginHarness({paused:false,level:'Super Admin'});
  assert.equal((await superAdmin.call()).statusCode,200);
  assert.equal(superAdmin.incidentReads,0);
});

test('paused lock status and unlock routes leave incident and account records untouched',async()=>{
  const app=lockHarness(true),routes=new Map(),before=structuredClone(app.incidents);
  const middleware=(_req,_res,next)=>next();
  Object.assign(app.context,{
    app:{get(path,...handlers){routes.set(path,handlers);},post(path,...handlers){routes.set(path,handlers);}},
    requireSuper:middleware,requireTrueSuperAdmin:middleware,
    publicUserRecord:value=>value,isLockableAdmin:policy.isLockableAdmin,
  });
  runInNewContext(lockRoutes,app.context);
  for(const path of ['/api/admin-locks','/api/admin-locks/unlock']){
    const handlers=routes.get(path),res=response();
    assert.equal(handlers.length,3,'Both administrator authorization middlewares remain installed');
    await handlers.at(-1)({session:{name:'Test Super Admin'}},res,error=>{if(error)throw error;});
    if(path.endsWith('/unlock')){
      assert.equal(res.statusCode,409);
      assert.equal(res.body.error,'Automatic ticket-based account locking is paused. Existing incidents are preserved and do not block login.');
    }else{
      assert.equal(res.statusCode,200);
      assert.equal(res.headers['Cache-Control'],'no-store');
      assert.deepEqual(res.body,{paused:true,locked:false,incidents:[],accounts:[]});
    }
  }
  assert.equal(app.queries.length,0);
  assert.deepEqual(app.incidents,before);
  assert.match(lockRoutes,/app\.get\('\/api\/admin-locks',requireSuper,requireTrueSuperAdmin/);
  assert.match(lockRoutes,/app\.post\('\/api\/admin-locks\/unlock',requireSuper,requireTrueSuperAdmin/);
});
