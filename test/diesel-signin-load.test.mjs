import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { registerDieselSharedSignIn } from '../diesel-shared-signin.mjs';
import { protectDeletionPool } from '../deletion-approval.mjs';
import { membershipOnboardingPath } from '../telegram-membership.mjs';

const serverSource=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const sessionReader=serverSource.slice(serverSource.indexOf('async function readSession(req)'),serverSource.indexOf('\nfunction sessionActivityDetails'));
const sessionGuard=serverSource.slice(serverSource.indexOf('async function requireSession(req,res,next)'),serverSource.indexOf('\nfunction requirePermission'));

test('Diesel browser handoff, exchange, validation and revocation work while the shared pool is saturated',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  const authPool=protectDeletionPool(db);
  const sessionToken='59bdc66b-7078-4e0b-8a3b-b60ead7e6691';
  const profile={login:'operator',name:'Operator',role:'normal'};
  let active=true,blockedLocation=false,membershipAllowed=true,authReads=0;
  const overloaded=()=>{throw Error('Shared pool is saturated');};
  const authSessionStore={get:async token=>{authReads++;return active&&token===sessionToken?profile:null;}};
  const membership=async(_login,_force,client)=>{
    assert.equal(client,authPool,'the protected master feed also checks membership on the sign-in pool');
    return {allowed:membershipAllowed};
  };
  const readSession=new Function('sessionStore','authSessionStore','authPool','membershipOnboardingPath','telegramMembershipFor',sessionReader+';return readSession;')(
    {get:overloaded},authSessionStore,authPool,membershipOnboardingPath,membership);
  const checkLocation=async(_req,res)=>{
    if(!blockedLocation)return false;
    res.status(428).json({error:'Confirm your sign-in location.'});return true;
  };
  const requireSession=new Function('readSession','signInLocationGuard','touchUserSessionActivity',sessionGuard+';return requireSession;')(
    readSession,checkLocation,async()=>{});
  const app=express();app.use(express.json());
  const secret='s'.repeat(43),state='t'.repeat(43),verifier='v'.repeat(43);
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const issuer=registerDieselSharedSignIn(app,{pool:authPool,requireSession,readSession,checkLocation,secret,enabled:'1',
    readMasters:async()=>({masters:{},erpDrivers:true})});
  await issuer.initialize();
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const post=(path,body,token=secret)=>fetch(`http://127.0.0.1:${server.address().port}/api/diesel-sso/${path}`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  const start=await post('continue',{state,challenge},sessionToken);
  assert.equal(start.status,200);
  const {redirectUrl}=await start.json();
  const code=new URL(redirectUrl).searchParams.get('code');
  const exchange=await post('exchange',{code,state,verifier});
  assert.equal(exchange.status,200);
  const {grant}=await exchange.json();
  const checks=await Promise.all(Array.from({length:25},()=>post('validate',{grant})));
  for(const response of checks){assert.equal(response.status,200);assert.deepEqual(await response.json(),{profile:{login:'operator',name:'Operator'}});}
  const before=authReads;
  const req={path:'/api/diesel-sso/validate',headers:{authorization:'Bearer '+sessionToken}};
  assert.equal(await readSession(req),profile);assert.equal(await readSession(req),profile);
  assert.equal(authReads,before+1,'session lookups are still coalesced within one request');
  assert.equal((await post('masters',{grant})).status,200);
  membershipAllowed=false;
  assert.equal((await post('masters',{grant})).status,403);
  assert.equal((await post('validate',{grant})).status,200,'the existing Diesel enrollment policy is retained');
  blockedLocation=true;
  assert.equal((await post('continue',{state,challenge},sessionToken)).status,428);
  blockedLocation=false;active=false;
  assert.equal((await post('continue',{state,challenge},sessionToken)).status,401);
  assert.equal((await post('validate',{grant})).status,401);
  active=true;
  assert.equal((await post('revoke',{grant})).status,204);
  assert.equal((await post('validate',{grant})).status,401);
  await assert.rejects(readSession({path:'/api/requests',headers:{}}),/Shared pool is saturated/);
});
