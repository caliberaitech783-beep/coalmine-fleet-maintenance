import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {hashPassword} from '../password-auth.mjs';
import {installTenderIdentity,tenderProfile} from '../tender-identity.mjs';
import {TENDER_ALL_PERMISSIONS} from '../tender-permissions.mjs';
const key='test-only-integration-key-32-characters-minimum';
const row={id:42,record_data:{login:'TENDERTEST',employee:'Tender Test',passwordHash:hashPassword('test-password'),tenderAccess:true,tenderRoles:'Bid Manager | Finance / Treasury'}};
test('Tender User defaults to full access, with independent per-user and view selections',()=>{
 const selected={...row,record_data:{...row.record_data,tenderAccess:false,userRoles:'Tender User'}};
 const profile=tenderProfile(selected,key);assert.deepEqual(profile.tenderPermissions.desktop,TENDER_ALL_PERMISSIONS.filter(k=>!k.startsWith('admin.')));assert.deepEqual(profile.tenderPermissions.mobile,TENDER_ALL_PERMISSIONS.filter(k=>!k.startsWith('admin.')));
 const customised=tenderProfile({...selected,record_data:{...selected.record_data,tenderDesktopAccess:'menu.pipeline | overview.read',tenderMobileAccess:''}},key);
 assert.deepEqual(customised.tenderPermissions.desktop,['menu.pipeline','overview.read']);assert.deepEqual(customised.tenderPermissions.mobile,[]);
 assert.deepEqual(tenderProfile(selected,key).tenderPermissions.desktop,TENDER_ALL_PERMISSIONS.filter(k=>!k.startsWith('admin.')));
 assert.equal(tenderProfile({...selected,record_data:{...selected.record_data,userRoles:'Production User',tenderAccess:false}},key),null);
});
test('Central administrators inherit Tender administration with the same identity',()=>{
 const admin=tenderProfile({...row,record_data:{...row.record_data,tenderAccess:false,userType:'Super Admin'}},key);assert.deepEqual(admin.roles,['System Administrator']);assert.equal(admin.tenderPermissions,null);assert.equal(tenderProfile({...row,record_data:{...row.record_data,tenderAccess:false,userType:'Super User',adminLevel:'Manager'}},key),null);
 for(const override of [{tenderRoles:''},{active:false},{status:'Inactive'},{mustChangePassword:true},{passwordHash:''}])assert.equal(tenderProfile({...row,record_data:{...row.record_data,...override}},key),null);
 const profile=tenderProfile(row,key);assert.equal(profile.id,'42');assert.deepEqual(profile.roles,['Bid Manager','Finance / Treasury']);assert.equal(profile.passwordHash,undefined);
 assert.notEqual(profile.credentialVersion,tenderProfile({...row,record_data:{...row.record_data,passwordHash:hashPassword('changed-password')}},key).credentialVersion);
});
test('Bridge requires service authentication and validates current account state',async()=>{
 let current=structuredClone(row);const app=express();app.use(express.json());
 installTenderIdentity(app,{query:async()=>({rows:current?[current]:[]})},{TENDER_IDENTITY_KEY:key});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/integrations/tender/`;
 const request=async(action,body,auth=key)=>{const r=await fetch(base+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 try{
  assert.equal((await request('authenticate',{username:'TENDERTEST',password:'test-password'},'invalid')).status,401);
  assert.equal((await request('authenticate',{username:'TENDERTEST',password:'wrong-password'})).status,401);
  const login=await request('authenticate',{username:'TENDERTEST',password:'test-password'});assert.equal(login.status,200);
  const session={id:'42',credentialVersion:login.data.credentialVersion,sessionId:login.data.sessionId};
  const directory=await request('directory',{});assert.equal(directory.status,200);assert.equal(directory.data[0].id,'42');assert.equal(directory.data[0].credentialVersion,undefined);assert.equal(directory.data[0].passwordHash,undefined);
  assert.equal((await request('validate',session)).status,200);
  current.record_data.tenderRoles='Technical';assert.deepEqual((await request('validate',session)).data.roles,['Technical']);
  current.record_data.tenderAccess=false;assert.equal((await request('validate',session)).status,403);
  assert.deepEqual((await request('directory',{})).data,[]);
  current.record_data.tenderAccess=true;current.record_data.passwordHash=hashPassword('changed-password');assert.equal((await request('validate',session)).status,401);
  current=null;assert.equal((await request('validate',session)).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
