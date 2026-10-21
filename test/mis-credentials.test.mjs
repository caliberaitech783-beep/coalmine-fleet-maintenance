import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {prepareMisCredentials} from '../mis-credentials.mjs';
import {misCredentialProfile,installMisCredentialIdentity} from '../mis-credential-identity.mjs';
import {publicUserRecord,verifyPassword} from '../password-auth.mjs';
import {createSessionStore} from '../auth-session.mjs';
import {MIS_ALL_PERMISSIONS,normalizedMisSelection} from '../mis-permissions.mjs';

test('MIS password is independent, hashed, preserved on blank edits, and excluded from public records',()=>{
 const user=prepareMisCredentials({login:'PULSEUSER',misAccess:true,misLogin:'MIS.ONE',misPassword:'different-secret-123',misDesktopAccess:['Employee master','unknown'],passwordHash:'existing-pulse-hash'});
 assert.equal(user.misLogin,'mis.one');assert.ok(verifyPassword('different-secret-123',user.misPasswordHash));assert.equal(user.passwordHash,'existing-pulse-hash');assert.equal(user.misPassword,undefined);
 const edited=prepareMisCredentials({...publicUserRecord(user),misPassword:''},user);assert.equal(edited.misPasswordHash,user.misPasswordHash);
 const publicRecord=publicUserRecord({...user,misPassword:'oops'});assert.equal(publicRecord.misPasswordHash,undefined);assert.equal(publicRecord.misPassword,undefined);assert.equal(publicRecord.passwordHash,undefined);
 assert.deepEqual(user.misDesktopAccess,['Employee master']);
});
test('MIS access requires valid separate credentials and unknown permissions cannot grant access',()=>{
 assert.throws(()=>prepareMisCredentials({misAccess:true,misLogin:'valid'}),/password/);
 assert.throws(()=>prepareMisCredentials({misAccess:true,misLogin:'!',misPassword:'sufficient-secret'}),/username/);
 assert.deepEqual(normalizedMisSelection(['all','Admin','Dashboard','Dashboard']),['Dashboard']);
 assert.equal(misCredentialProfile({record_data:{misAccess:false,misPasswordHash:'x'}}),null);
});
test('real embedded PostgreSQL: separate sign-in, credential revocation, permission refresh, logout and rate limit',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE TABLE master_records(id BIGSERIAL PRIMARY KEY,master_name TEXT,record_data JSONB);CREATE TABLE auth_sessions(token UUID PRIMARY KEY,role TEXT,employee_name TEXT,login_name TEXT,user_type TEXT,assigned_role TEXT,permissions JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen_at TIMESTAMPTZ DEFAULT NOW(),session_public_id TEXT DEFAULT gen_random_uuid()::text);`);
 const pool={query:(sql,params)=>sql.split(';').filter(x=>x.trim()).length>1?db.exec(sql):db.query(sql,params)};
 const routes=new Map();const identity=installMisCredentialIdentity({post:(url,handler)=>routes.set(url,handler)},{pool,sessionStore:createSessionStore(pool)});await identity.initialize();
 let user=prepareMisCredentials({login:'PULSEUSER',employee:'Person',misAccess:true,misLogin:'mis.one',misPassword:'different-secret-123',misDesktopAccess:MIS_ALL_PERMISSIONS,misMobileAccess:['Dashboard']});
 await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Users & employees',$1)",[JSON.stringify(user)]);
 const call=async(action,body)=>{let status=200,value;await routes.get('/api/integrations/mis/'+action)({body,ip:'127.0.0.1'},{set(){},status(code){status=code;return this},json(data){value=data}},e=>{throw e});return {status,value};};
 assert.equal((await call('authenticate',{username:'mis.one',password:'wrong'})).status,401);
 const signed=await call('authenticate',{username:'mis.one',password:'different-secret-123'});assert.equal(signed.status,200);assert.equal(signed.value.profile.permissions.application,'MIS');
 const token=(await db.query('SELECT token FROM auth_sessions')).rows[0].token;
 assert.equal(await createSessionStore(db).get(token),null,'MIS tokens must not authorize the Pulse application');
 const grant=signed.value.grant;assert.equal((await call('validate',{grant})).status,200);
 user.misDesktopAccess=['Dashboard'];await db.query('UPDATE master_records SET record_data=$1',[JSON.stringify(user)]);assert.deepEqual((await call('validate',{grant})).value.profile.permissions.misDesktopAccess,['Dashboard']);
 user=prepareMisCredentials({...user,misPassword:'replacement-secret-456'},user);await db.query('UPDATE master_records SET record_data=$1',[JSON.stringify(user)]);assert.equal((await call('validate',{grant})).status,401);
 const signedAgain=await call('authenticate',{username:'mis.one',password:'replacement-secret-456'});await call('logout',{grant:signedAgain.value.grant});assert.equal((await call('validate',{grant:signedAgain.value.grant})).status,401);
 for(let i=0;i<10;i++)await call('authenticate',{username:'missing',password:'bad'});assert.equal((await call('authenticate',{username:'missing',password:'bad'})).status,429);
 }finally{await db.close();}
});
