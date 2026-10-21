import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {randomBytes,randomUUID} from 'node:crypto';
import {registerMisSharedSignIn,misSignInAllowed} from '../mis-shared-signin.mjs';
const cookieName='__Host-pulse_mis_signin';
const random=()=>randomBytes(32).toString('base64url');
const profile={login:'synthetic-mis-user',name:'Synthetic MIS User',role:'normal',userType:'Mobile User',assignedRole:'MIS User',permissions:{verifyRequests:true}};
test('MIS authorization permits assigned MIS roles and administrators, excludes HR and other portals',()=>{
  assert.equal(misSignInAllowed(profile),true);
  for(const role of ['HR User','HR Manager','Account User','Tender User','Production User','Maintenance User'])assert.equal(misSignInAllowed({...profile,assignedRole:role}),false);
  assert.equal(misSignInAllowed({...profile,role:'super',assignedRole:''}),true);
  assert.equal(misSignInAllowed({...profile,role:'super',assignedRole:'HR Manager'}),false);
});

test('separate databases share sign-in through state-bound single-use PKCE codes and revocation checks',async()=>{
  const databases=[],servers=[];
  async function application(mode){
    const pool=new PGlite();databases.push(pool);await pool.query('CREATE TABLE auth_sessions(token UUID PRIMARY KEY)');
    const records=new Map();
    const sessionStore={get:async token=>records.get(token)||null,create:async record=>{await pool.query('INSERT INTO auth_sessions(token) VALUES($1)',[record.token]);records.set(record.token,record);}};
    const app=express();app.use(express.json());
    const requireSession=async(req,res,next)=>{req.session=await sessionStore.get(String(req.headers.authorization||'').replace(/^Bearer /,''));if(!req.session)return res.status(401).json({error:'Expired'});next();};
    const sso=registerMisSharedSignIn(app,{pool,sessionStore,requireSession,mode,fetcher:(url,options)=>fetch(url.replace('https://pulse.cmll.in',issuer.base),options)});
    await sso.initialize();
    const server=await new Promise(resolve=>{const current=app.listen(0,'127.0.0.1',()=>resolve(current));});servers.push(server);
    return {pool,records,sessionStore,sso,base:`http://127.0.0.1:${server.address().port}`};
  }
  let issuer;
  try{
    issuer=await application('issuer');const client=await application('client');
    const pulseToken=randomUUID();await issuer.sessionStore.create({token:pulseToken,...profile});
    const start=await fetch(client.base+'/api/mis-sso/start',{redirect:'manual'});
    assert.match(start.headers.get('set-cookie'),/HttpOnly/);assert.match(start.headers.get('set-cookie'),/Secure/);
    const stateCookie=start.headers.get('set-cookie').split(';')[0];
    const auth=new URL(start.headers.get('location'));auth.host=new URL(issuer.base).host;auth.protocol='http:';
    const authorize=await fetch(auth,{headers:{Cookie:`${cookieName}=${pulseToken}`},redirect:'manual'});
    assert.equal(authorize.status,303);const callback=new URL(authorize.headers.get('location'));callback.host=new URL(client.base).host;callback.protocol='http:';
    assert.equal((await fetch(callback,{headers:{Cookie:'__Host-mis_signin_state='+random()},redirect:'manual'})).status,400);
    const wrongProof=await fetch(issuer.base+'/api/mis-sso/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:callback.searchParams.get('code'),verifier:random()})});assert.equal(wrongProof.status,401);
    const completed=await fetch(callback,{headers:{Cookie:stateCookie},redirect:'manual'});assert.equal(completed.status,303);
    assert.equal(completed.headers.get('location'),'https://pulseii.cmll.in/?misSsoReady=1');
    assert.equal((await fetch(callback,{headers:{Cookie:stateCookie},redirect:'manual'})).status,400);
    const handoff=completed.headers.getSetCookie().find(value=>value.startsWith('__Host-mis_signin_ready=')).split(';')[0];
    const ready=await fetch(client.base+'/api/mis-sso/session',{headers:{Cookie:handoff}});assert.equal(ready.status,200);
    const result=await ready.json();assert.equal(result.login,profile.login);assert.notEqual(result.token,pulseToken);assert.equal(result.grant,undefined);
    assert.equal((await client.pool.query('SELECT COUNT(*)::int AS count FROM auth_sessions')).rows[0].count,1);
    const session=await client.sessionStore.get(result.token);assert.equal((await client.sso.validateSession(result.token,session)).login,profile.login);
    issuer.records.delete(pulseToken);assert.equal(await client.sso.validateSession(result.token,session),null);
    assert.equal(await client.sso.validateSession(randomUUID(),profile),null);
  }finally{await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));await Promise.all(databases.map(db=>db.close()));}
});
