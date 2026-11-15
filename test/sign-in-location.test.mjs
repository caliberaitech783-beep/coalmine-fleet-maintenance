import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSignInLocation,SIGN_IN_LOCATION_UPDATE_SQL,SIGN_IN_LOCATION_STATUS_SQL,signInLocationBlocks,signInLocationRequiredFor,createSignInLocationGuard,signInLocationAccepted,signInLocationRequired,signInLocationExceptions,requestRoute,SIGN_IN_LOCATION_REQUIRED_CODE} from '../sign-in-location.mjs';
import {registerSignInLocationRoute,initializeLoginHistory} from '../user-login-history.mjs';
import {recordSignInLocation,readPosition,nearestPlaceLabel,formatAccuracy,signInLocationCell,sessionMark,signInLocationDone} from '../src/sign-in-location.mjs';
import {auditShouldRecord} from '../audit-trail.mjs';

// The rule is on hold unless SIGN_IN_LOCATION_REQUIRED=1; these tests switch it on.
const ON=Object.freeze({SIGN_IN_LOCATION_REQUIRED:'1'});
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('server accepts only a known status and real coordinates',()=>{
  assert.deepEqual(parseSignInLocation({status:'shared',latitude:19.781234567,longitude:79.33,accuracy:31.6}),{status:'shared',latitude:19.781235,longitude:79.33,accuracy:32});
  assert.deepEqual(parseSignInLocation({status:'Refused',latitude:1,longitude:2}),{status:'refused',latitude:null,longitude:null,accuracy:null},'refusal keeps no coordinates');
  assert.deepEqual(parseSignInLocation({status:'unavailable'}),{status:'unavailable',latitude:null,longitude:null,accuracy:null});
  for(const body of [{},{status:'maybe'},{status:'shared'},{status:'shared',latitude:'19',longitude:'79'},{status:'shared',latitude:91,longitude:79},{status:'shared',latitude:19,longitude:-181},{status:'shared',latitude:null,longitude:null}])
    assert.ok(parseSignInLocation(body).error,JSON.stringify(body));
  assert.equal(parseSignInLocation({status:'shared',latitude:19,longitude:79,accuracy:-5}).accuracy,null);
});

test('owner rule: Block keeps the app closed, a device that cannot find a location is let in',()=>{
  const env=ON;
  const user={login:'Ramesh',locationStatus:''};
  assert.equal(signInLocationBlocks(user,{route:'/api/requests',env}),true,'no answer yet: closed');
  assert.equal(signInLocationBlocks({...user,locationStatus:'refused'},{route:'/api/requests',env}),true,'Block: closed');
  assert.equal(signInLocationBlocks({...user,locationStatus:'shared'},{route:'/api/requests',env}),false);
  assert.equal(signInLocationBlocks({...user,locationStatus:'unavailable'},{route:'/api/requests',env}),false,'cannot find a location: open');
  for(const route of ['/api/session-location','/api/logout','/api/session-heartbeat','/api/session-status','/api/session-messages'])
    assert.equal(signInLocationBlocks(user,{route,env}),false,route);
  assert.equal(signInLocationBlocks(user,{route:'/api/requests',env,machine:true}),false,'scanner connector has no browser');
  assert.equal(signInLocationBlocks({login:'MIS_SYNC_SERVICE'},{route:'/api/masters',env}),false,'machine login');
  assert.equal(signInLocationBlocks(user,{route:'/api/requests',env:{...ON,SIGN_IN_LOCATION_EXCEPTIONS:' ramesh , x'}}),false,'exception list');
  assert.equal(signInLocationBlocks(user,{route:'/api/requests',env:{SIGN_IN_LOCATION_REQUIRED:'0'}}),false,'switch off');
  assert.equal(signInLocationRequired({}),false,'on hold by default (owner, 15 Nov 2026)');
  assert.equal(signInLocationRequired({SIGN_IN_LOCATION_REQUIRED:' 1 '}),true);assert.equal(signInLocationRequired({SIGN_IN_LOCATION_REQUIRED:'0'}),false);
  assert.equal(signInLocationBlocks(user,{route:'/api/requests',env:{}}),false,'on hold: nobody is held');
  assert.equal(signInLocationAccepted('refused',user,{}),true,'on hold: a refusal still opens the app');
  assert.deepEqual([...signInLocationExceptions({})],['mis_sync_service','mohitchadda']);
  assert.equal(signInLocationBlocks({login:' MohitChadda '},{route:'/api/requests',env:ON}),false,'mohitchadda is never held');
  assert.equal(signInLocationRequiredFor({login:'mohitchadda'},ON),false);
  assert.equal(signInLocationRequiredFor(user,ON),true);assert.equal(signInLocationRequiredFor(user,{}),false);
  assert.equal(signInLocationAccepted('refused',user,env),false);
  assert.equal(signInLocationAccepted('unavailable',user,env),true);
  assert.equal(signInLocationAccepted('shared',user,env),true);
  assert.equal(signInLocationAccepted('refused',user,{SIGN_IN_LOCATION_REQUIRED:'0'}),true);
  assert.equal(requestRoute({originalUrl:'/api/session-location/?x=1'}),'/api/session-location');
});

test('a share is never undone; until then the latest answer is kept, and the guard reads the history row',()=>{
  assert.match(SIGN_IN_LOCATION_UPDATE_SQL,/WHERE session_id=\$1 AND location_status<>'shared'$/);
  assert.equal(SIGN_IN_LOCATION_STATUS_SQL,'SELECT location_status AS status FROM user_login_history WHERE session_id=$1');
});

test('location route reads the bearer session, saves on the history and tells the browser whether to open',async()=>{
  let path,handler;const queries=[];let stored={rowCount:1,rows:[]};
  const sessions={good:{sessionId:'abc',login:'a'},old:{login:'a'}};
  let getHandler;
  registerSignInLocationRoute({get(p,h){assert.equal(p,'/api/session-location');getHandler=h;},post(p,h){path=p;handler=h;}},{pool:{async query(sql,params){queries.push({sql,params});return /^SELECT/.test(sql)?{rows:stored.rows}:{rowCount:stored.rowCount};}},readSession:async token=>sessions[token]||null,env:ON});
  assert.equal(path,'/api/session-location');
  const reply=()=>({code:200,body:null,status(c){this.code=c;return this;},json(b){this.body=b;return this;}});
  const call=async(body,token='good')=>{const req={headers:{authorization:'Bearer '+token},body},res=reply();await handler(req,res,error=>{throw error;});return {req,res};};
  const first=await call({status:'shared',latitude:24.17,longitude:82.66,accuracy:12});
  assert.deepEqual(first.res.body,{recorded:true,accepted:true});assert.equal(first.req.audit,false);
  assert.equal(queries.length,1);assert.match(queries[0].sql,/UPDATE user_login_history/);assert.deepEqual(queries[0].params,['abc','shared',24.17,82.66,12]);
  assert.doesNotMatch(queries.map(q=>q.sql).join(),/auth_sessions/,'the session table is never changed');
  assert.deepEqual((await call({status:'refused'})).res.body,{recorded:true,accepted:false});
  stored={rowCount:0,rows:[{status:'shared'}]};
  assert.equal((await call({status:'refused'})).res.body.accepted,true,'already shared on this sign-in');
  stored={rowCount:1,rows:[]};
  assert.equal((await call({status:'unavailable'})).res.body.accepted,true);
  const before=queries.length;
  assert.equal((await call({status:'refused'},'expired')).res.code,401);
  assert.equal((await call({status:'shared'})).res.code,400);
  assert.deepEqual((await call({status:'refused'},'old')).res.body,{recorded:false,accepted:false});
  assert.equal(queries.length,before);
  const required=async(token,login)=>{const res={code:200,body:null,set(){},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};if(login)sessions[token]={sessionId:'s',login};await getHandler({headers:{authorization:'Bearer '+token}},res,error=>{throw error;});return res;};
  assert.deepEqual((await required('r1','ramesh')).body,{required:true});
  assert.deepEqual((await required('r2','mohitchadda')).body,{required:false});
  assert.equal((await required('nobody')).code,401);
});

test('schema adds the location columns; the session table and session read stay as they were',()=>{
  const source=initializeLoginHistory.toString();
  for(const column of ['location_status','location_latitude','location_longitude','location_accuracy_m','location_at'])
    assert.match(source,new RegExp('ALTER TABLE user_login_history ADD COLUMN IF NOT EXISTS '+column+' '));
  assert.doesNotMatch(source,/ALTER TABLE auth_sessions/);
  assert.match(read('user-login-history.mjs'),/h\.location_status AS "locationStatus"/);
  // A session read that names a missing column fails every login (see the auth-session-schema tests).
  assert.doesNotMatch(read('auth-session.mjs'),/location/);
});

test('both session guards answer 428 (not 401, which signs the user out) until the location is in',()=>{
  const server=read('server.mjs');
  assert.match(server,/registerSignInLocationRoute\(app,\{pool:authPool,readSession:token=>authSessionStore\.get\(token\)\}\)/);
  assert.match(server,/const signInLocationGuard=createSignInLocationGuard\(authPool\);/);
  const guard=name=>server.slice(server.indexOf('async function '+name+'(req,res,next){'),server.indexOf('async function '+name+'(req,res,next){')+900);
  assert.match(guard('requireSession'),/if\(typeof signInLocationGuard==='function'&&await signInLocationGuard\(req,res,session\)\)return;/);
  assert.match(guard('requireSuper'),/if\(typeof signInLocationGuard==='function'&&await signInLocationGuard\(req,res,session\)\)return;/);
  assert.equal(SIGN_IN_LOCATION_REQUIRED_CODE,'SIGN_IN_LOCATION_REQUIRED');
  assert.equal(auditShouldRecord('POST','/api/session-location',{statusCode:200}),false);
});

test('guard reads each sign-in once, remembers an open one, holds a refusal and never locks anyone out on a lookup failure',async()=>{
  const statuses={a:'',b:'refused',c:'shared',d:'unavailable'};let reads=0,broken=false;
  const pool={async query(sql,[id]){reads++;if(broken)throw new Error('database down');assert.equal(sql,SIGN_IN_LOCATION_STATUS_SQL);return {rows:id in statuses?[{status:statuses[id]}]:[]};}};
  const guard=createSignInLocationGuard(pool,{env:ON,log:{error(){}}});
  const reply=()=>({code:200,body:null,status(c){this.code=c;return this;},json(b){this.body=b;return this;}});
  const check=async(sessionId,{route='/api/requests',login='u',machine=false}={})=>{const res=reply();const stopped=await guard({originalUrl:route},res,{sessionId,login},{machine});return {stopped,res};};
  const r=await check('a');assert.equal(r.stopped,true);assert.equal(r.res.code,428);assert.equal(r.res.body.code,'SIGN_IN_LOCATION_REQUIRED');
  assert.equal((await check('b')).stopped,true,'Block');
  assert.equal((await check('c')).stopped,false);assert.equal((await check('d')).stopped,false,'no position on this device');
  const after=reads;assert.equal((await check('c')).stopped,false);assert.equal(reads,after,'an open sign-in is remembered');
  assert.equal((await check('b')).stopped,true);assert.equal(reads,after+1,'a held sign-in is read again, so Try again works');
  statuses.b='shared';assert.equal((await check('b')).stopped,false);
  assert.equal((await check('missing')).stopped,false,'no history row: not held');
  const quiet=reads;
  assert.equal((await check('a',{route:'/api/logout'})).stopped,false);
  assert.equal((await check('a',{machine:true})).stopped,false);
  assert.equal((await check('a',{login:'mis_sync_service'})).stopped,false);
  assert.equal(reads,quiet,'open routes, machines and exceptions cost no read');
  broken=true;assert.equal((await check('a')).stopped,false,'a lookup failure lets the request through');
  const off=createSignInLocationGuard({query(){assert.fail('switched off: no read');}},{env:{SIGN_IN_LOCATION_REQUIRED:'0'}});
  assert.equal(await off({originalUrl:'/api/requests'},reply(),{sessionId:'a',login:'u'}),false);
});

const memoryStorage=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),values:()=>[...map.values()]};};
const position=(latitude,longitude,accuracy)=>({getCurrentPosition:(ok)=>ok({coords:{latitude,longitude,accuracy}})});
const answer=accepted=>async()=>({ok:true,status:200,json:async()=>({recorded:true,accepted})});

test('browser asks once per sign-in, opens only when the server accepts, and asks again after a new sign-in',async()=>{
  const storage=memoryStorage();const posts=[];
  const fetchImpl=async(url,options)=>{posts.push({url,options});return {ok:true,status:200,json:async()=>({accepted:true})};};
  const result=await recordSignInLocation('token-1',{fetchImpl,storage,geolocation:position(19.78,79.33,25)});
  assert.deepEqual(result,{status:'shared',latitude:19.78,longitude:79.33,accuracy:25,accepted:true});
  assert.equal(posts[0].url,'/api/session-location');
  assert.equal(posts[0].options.headers.Authorization,'Bearer token-1');
  assert.equal(signInLocationDone('token-1',storage),true);
  assert.deepEqual(await recordSignInLocation('token-1',{fetchImpl,storage,geolocation:position(1,1,1)}),{status:'done',accepted:true});
  assert.equal(posts.length,1,'same sign-in: no second prompt');
  await recordSignInLocation('token-2',{fetchImpl,storage,geolocation:position(1,1,1)});
  assert.equal(posts.length,2);
  assert.notEqual(sessionMark('token-1'),sessionMark('token-2'));
  assert.ok(!storage.values().some(value=>value.includes('token')),'the token itself is never stored');
});

test('Block keeps the screen up and asks again on Try again; a device without a position opens',async()=>{
  assert.deepEqual(await readPosition({geolocation:{getCurrentPosition:(_ok,fail)=>fail({code:1})}}),{status:'refused'});
  assert.deepEqual(await readPosition({geolocation:{getCurrentPosition:(_ok,fail)=>fail({code:2})}}),{status:'unavailable'});
  assert.deepEqual(await readPosition({geolocation:{getCurrentPosition:(_ok,fail)=>fail({code:3})}}),{status:'unavailable'});
  assert.deepEqual(await readPosition({geolocation:undefined}),{status:'unavailable'});
  assert.deepEqual(await readPosition({geolocation:{getCurrentPosition(){throw new Error('insecure');}}}),{status:'unavailable'});
  const storage=memoryStorage();
  const refused=await recordSignInLocation('t',{fetchImpl:answer(false),storage,geolocation:{getCurrentPosition:(_ok,fail)=>fail({code:1})}});
  assert.deepEqual(refused,{status:'refused',accepted:false});
  assert.equal(signInLocationDone('t',storage),false,'a refusal is asked again');
  const none=await recordSignInLocation('t',{fetchImpl:answer(true),storage,geolocation:undefined});
  assert.deepEqual(none,{status:'unavailable',accepted:true});
  assert.equal(signInLocationDone('t',storage),true);
  const offline=await recordSignInLocation('u',{fetchImpl:async()=>{throw new Error('offline');},storage,geolocation:undefined});
  assert.equal(offline.accepted,null);assert.equal(signInLocationDone('u',storage),false);
  const expired=await recordSignInLocation('v',{fetchImpl:async()=>({ok:false,status:401}),storage,geolocation:undefined});
  assert.equal(expired.accepted,null);assert.equal(signInLocationDone('v',storage),false);
});

test('an unanswered prompt keeps waiting and is never saved as Not available',async()=>{
  let allow;const posts=[];
  const pending=recordSignInLocation('t',{fetchImpl:async(_url,options)=>{posts.push(JSON.parse(options.body).status);return {ok:true,status:200,json:async()=>({accepted:true})};},
    storage:memoryStorage(),geolocation:{getCurrentPosition:(ok)=>{allow=ok;}}});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.deepEqual(posts,[]);
  allow({coords:{latitude:20,longitude:79,accuracy:40}});
  assert.equal((await pending).accepted,true);assert.deepEqual(posts,['shared']);
});

test('history cell names the nearest site, the accuracy and a map link',()=>{
  assert.equal(nearestPlaceLabel(19.785,79.335),'Near Sasti site (0.8 km)');
  assert.equal(nearestPlaceLabel(21.15,79.09),'Near Nagpur office (0.0 km)');
  assert.match(nearestPlaceLabel(28.61,77.2),/^\d+ km from .+ (site|office)$/);
  assert.equal(formatAccuracy(31.4),'±31 m');assert.equal(formatAccuracy(1500),'±1.5 km');assert.equal(formatAccuracy(25000),'±25 km');assert.equal(formatAccuracy(undefined),'');
  assert.deepEqual(signInLocationCell({locationStatus:'shared',latitude:24.17,longitude:82.66,accuracy:12}),{tone:'shared',text:'Near Dudhichua site (0.0 km) · ±12 m',href:'https://www.google.com/maps?q=24.17,82.66'});
  assert.equal(signInLocationCell({locationStatus:'refused'}).text,'Refused by user');
  assert.equal(signInLocationCell({locationStatus:'unavailable'}).text,'Not available on this device');
  assert.equal(signInLocationCell({}).text,'Not recorded');
});

test('the app stays on the location screen until it opens, and the sign-in screen says so',()=>{
  const main=read('src/main.jsx');
  assert.match(main,/const locationGate=useSignInLocationGate\(session\?\.token\);/);
  assert.match(main,/return <Login onLogin=\{completeLogin\} theme=\{theme\} toggleTheme=\{toggleTheme\} \/>;\s*if \(locationGate\.phase!=='open'\) return <SignInLocationScreen gate=\{locationGate\} onSignOut=\{logout\}\/>;/);
  assert.doesNotMatch(main,/recordSignInLocation/);
  assert.match(main,/\{SIGN_IN_LOCATION_NOTICE\}/);
  assert.match(read('src/user-login-history.jsx'),/<th>Location at sign-in<\/th>/);
  const gate=read('src/sign-in-location-gate.jsx');
  assert.match(gate,/Try again/);assert.match(gate,/Location is blocked/);
  // On hold: the app opens at once when the server says the location is not required.
  assert.match(gate,/if\(required===true\)\{void ask\(\);return;\}/);
  assert.match(gate,/setState\(\{token,phase:'open'\}\);\s*void recordSignInLocation\(token\);/);
});

const connectionString=process.env.AUTH_SESSION_TEST_DATABASE_URL;
test('PostgreSQL: the history follows the answers, a share is final, and the guard opens and holds on real rows',{skip:!connectionString},async()=>{
  const {default:pg}=await import('pg');const {randomUUID}=await import('node:crypto');
  const pool=new pg.Pool({connectionString,ssl:process.env.AUTH_SESSION_TEST_DATABASE_SSL==='false'?false:{rejectUnauthorized:false},max:1});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const schema='location_test_'+randomUUID().replaceAll('-','');
    await client.query('CREATE SCHEMA '+schema);
    await client.query('SET LOCAL search_path TO '+schema);
    await client.query(`CREATE TABLE auth_sessions (session_public_id TEXT PRIMARY KEY,login_name TEXT,employee_name TEXT,permissions JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),device_id TEXT DEFAULT '',ip_address TEXT DEFAULT '',user_agent TEXT DEFAULT '');
      CREATE TABLE user_session_activity (session_id TEXT,actor_login TEXT,actor_name TEXT,started_at TIMESTAMPTZ,last_seen_at TIMESTAMPTZ,active_seconds BIGINT DEFAULT 0,device_id TEXT,ip_address TEXT,user_agent TEXT);
      CREATE TABLE maintenance_requests (requester_login TEXT,created_at TIMESTAMPTZ);
      CREATE TABLE maintenance_daily_remarks (author_login TEXT,created_at TIMESTAMPTZ);
      CREATE TABLE production_first_trip_acceptances (production_first_trip_login TEXT,created_at TIMESTAMPTZ);
      CREATE TABLE audit_events (actor_login TEXT,occurred_at TIMESTAMPTZ,outcome TEXT,session_id TEXT,event_type TEXT);
      CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE master_records (id TEXT,master_name TEXT,record_data JSONB);`);
    await initializeLoginHistory(client);
    await client.query("INSERT INTO auth_sessions(session_public_id,login_name,employee_name) VALUES ('one','alice','Alice'),('two','bob','Bob')");
    const save=body=>id=>{const l=parseSignInLocation(body);return client.query(SIGN_IN_LOCATION_UPDATE_SQL,[id,l.status,l.latitude,l.longitude,l.accuracy]);};
    const row=async id=>(await client.query('SELECT location_status AS s,location_latitude AS lat,location_longitude AS lng,location_accuracy_m AS acc FROM user_login_history WHERE session_id=$1',[id])).rows[0];
    const guard=createSignInLocationGuard(client,{env:ON});
    const held=async id=>{let code=200;await guard({originalUrl:'/api/requests'},{status(c){code=c;return this;},json(){return this;}},{sessionId:id,login:'x'});return code===428;};
    assert.equal(await held('two'),true,'existing sign-ins start held');
    await save({status:'refused'})('one');
    assert.deepEqual(await row('one'),{s:'refused',lat:null,lng:null,acc:null});
    assert.equal(await held('one'),true);
    await save({status:'shared',latitude:19.78,longitude:79.33,accuracy:20})('one');
    assert.deepEqual(await row('one'),{s:'shared',lat:19.78,lng:79.33,acc:20},'Try again after allowing');
    assert.equal(await held('one'),false);
    assert.equal((await save({status:'refused'})('one')).rowCount,0);
    assert.equal((await save({status:'shared',latitude:1,longitude:1,accuracy:1})('one')).rowCount,0,'first position kept');
    await client.query("UPDATE auth_sessions SET device_id='phone',last_seen_at=NOW() WHERE session_public_id='one'");
    await initializeLoginHistory(client);
    assert.deepEqual(await row('one'),{s:'shared',lat:19.78,lng:79.33,acc:20});
    await save({status:'refused'})('two');await save({status:'unavailable'})('two');
    assert.equal((await row('two')).s,'unavailable','a device that cannot find a location replaces an earlier refusal');
    assert.equal(await held('two'),false);
    assert.equal(await held('no-such-session'),false);
  }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});

test('browser asks the server whether the location is required and treats no answer as not required',async()=>{
  const {fetchSignInLocationRequired}=await import('../src/sign-in-location.mjs');
  let seen;
  assert.equal(await fetchSignInLocationRequired('t',{fetchImpl:async(url,options)=>{seen={url,options};return {ok:true,json:async()=>({required:true})};}}),true);
  assert.equal(seen.url,'/api/session-location');assert.equal(seen.options.headers.Authorization,'Bearer t');assert.equal(seen.options.method,undefined);
  assert.equal(await fetchSignInLocationRequired('t',{fetchImpl:async()=>({ok:true,json:async()=>({required:false})})}),false);
  assert.equal(await fetchSignInLocationRequired('t',{fetchImpl:async()=>({ok:false})}),null);
  assert.equal(await fetchSignInLocationRequired('t',{fetchImpl:async()=>{throw new Error('offline');}}),null);
  assert.equal(await fetchSignInLocationRequired('',{fetchImpl:async()=>assert.fail('no token, no call')}),null);
});
