import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMobileAccess,loginRecordCandidates,userLoginCandidates} from '../mobile-access.mjs';
import {assignedUserRoles,hasAccountRole,accountPrivileges,ACCOUNT_PRIVILEGES} from '../account-role-access.mjs';
import {ibossAccountsEligible,ibossAccountsAllowed,accountSectionAllowed} from '../iboss-access.mjs';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const session=profile=>({...profile,role:profile.sessionRole});
test('a dual-role ID receives only the selected portal and fleet role authority',()=>{
 const user={userType:'Mobile User',userGroup:'Production User',userRoles:'Production User | Maintenance User | Account User',accountAccess:'Masters | Transactions'};
 assert.equal(assignedUserRoles(user).length,3);
 const accounts=session(resolveMobileAccess({user,portal:'accounts'}));
 assert.equal(accounts.userType,'Account User');
 assert.equal(accounts.permissions.editRequests,false);
 assert.equal(accountSectionAllowed(accounts,'Masters'),true);
 assert.equal(accountSectionAllowed(accounts,'Transactions'),true);
 assert.equal(accountSectionAllowed(accounts,'Dashboard'),false);
 assert.equal(accountSectionAllowed(accounts,'Report Merge'),false);
 const production=resolveMobileAccess({user,portal:'operations',selectedRole:'Production User'});
 assert.equal(production.assignedRole,'Production User');assert.equal(production.permissions.editRequests,false);
 const maintenance=resolveMobileAccess({user,portal:'operations',selectedRole:'Maintenance User'});
 assert.equal(maintenance.assignedRole,'Maintenance User');assert.equal(maintenance.permissions.editRequests,true);
 assert.equal(resolveMobileAccess({user,selectedRole:'MIS User'}).userType,'');
 assert.equal(resolveMobileAccess({user:{userType:'Mobile User',userGroup:'Production User'},portal:'accounts'}).userType,'');
});
test('explicit Accounts assignment works for Admin and Non Admin without promoting authority',()=>{
 for(const adminLevel of ['Admin','Manager']){
  const user={userType:'Super Admin',adminLevel,userRoles:'Account User',accountAccess:'Dashboard'};
  assert.equal(ibossAccountsEligible(user),true);
  const fleet=session(resolveMobileAccess({user}));
  assert.equal(fleet.permissions.adminLevel,adminLevel);
  assert.equal(accountSectionAllowed(fleet,'Dashboard'),true);
  assert.equal(accountSectionAllowed(fleet,'Masters'),false);
  const accounts=session(resolveMobileAccess({user,portal:'accounts'}));
  assert.equal(accounts.role,'normal');assert.equal(accounts.permissions.adminLevel,undefined);
 }
});
test('explicit empty privileges deny every section; legacy accounts retain defaults',()=>{
 assert.equal(resolveMobileAccess({user:{userType:'Mobile User',userRoles:'',accessType:'Super User'}}).userType,'');
 assert.equal(ibossAccountsEligible({userType:'Super Admin',adminLevel:'Admin',userRoles:''}),false);
 assert.deepEqual(accountPrivileges({accountAccess:''}),[]);
 assert.deepEqual(accountPrivileges({}),ACCOUNT_PRIVILEGES);
 assert.deepEqual(accountPrivileges({accountAccess:'Dashboard | unknown | Dashboard'}),['Dashboard']);
});
test('real login handler selects assigned fleet roles and isolates the Accounts session',async()=>{
 const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const route=server.slice(server.indexOf("app.post('/api/login',"),server.indexOf('const passwordResetRequestMessage='));
 const user={login:'multi',employee:'Multi Test',phone:'fixture-only',userType:'Mobile User',userRoles:'Production User | Maintenance User | Account User',accountAccess:'Masters'};
 const issued=[];let handler;
 const context={app:{post:(_path,callback)=>handler=callback},pool:{query:async sql=>({rows:sql.includes("master_name='Users & employees'")?[{id:1,record_data:user}]:[]})},assignedUserRoles,hasAccountRole,resolveMobileAccess,loginRecordCandidates,userLoginCandidates,ibossAccountsAllowed,privilegeForUser:()=>({}),ADMIN_LOCK_POLICY_PAUSED:true,randomUUID:()=> 'fixture-token',sessionStore:{create:async value=>issued.push(value)},loginPayload:({profile})=>profile};
 runInNewContext(route,context);
 const call=async body=>{const res={statusCode:200,status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};await handler({body:{username:'multi',password:'fixture-only',...body}},res,error=>{throw error;});return res;};
 assert.equal((await call({portal:'operations',password:'wrong'})).statusCode,401);
 const choose=await call({portal:'operations'});
 assert.equal(choose.body.requiresRoleSelection,true);assert.equal(issued.length,0);
 assert.deepEqual(Array.from(choose.body.roles),['Production User','Maintenance User']);
 assert.equal((await call({portal:'operations',selectedRole:'MIS User'})).statusCode,403);
 const fleet=await call({portal:'operations',selectedRole:'Maintenance User'});
 assert.equal(fleet.body.assignedRole,'Maintenance User');assert.equal(fleet.body.permissions.editRequests,true);
 const accounts=await call({portal:'accounts'});
 assert.equal(accounts.body.userType,'Account User');assert.equal(accounts.body.permissions.editRequests,false);
 assert.deepEqual(Array.from(accounts.body.permissions.accountAccess),['Masters']);
 assert.equal(issued.length,2);
});
