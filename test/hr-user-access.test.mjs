import assert from 'node:assert/strict';
import test from 'node:test';
import {assignedUserRoles} from '../account-role-access.mjs';
import {resolveMobileAccess,normalizeMobileUserRole,MOBILE_USER_ROLES} from '../mobile-access.mjs';
import {masterAccessAllows,accessAllows,navigationPermissionsForView} from '../admin-access.mjs';
import {CDIR_MASTERS} from '../cdir-masters.mjs';
import {cdirViewerContext} from '../cdir-access.mjs';
import {canReadDashboardEquipment} from '../dashboard-equipment-access.mjs';

test('existing HR sessions read the shared breakdown feed using current account permissions',async()=>{
 const {readFileSync}=await import('node:fs');
 const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const route=source.slice(source.indexOf("app.get('/api/requests',requireSession"));
 const guard=route.slice(route.indexOf("if(req.session.assignedRole==='HR User')"),route.indexOf('    const requesterLogin='));
 const profile=resolveMobileAccess({user:{userType:'Mobile User',userRoles:'HR User'},selectedRole:'HR User'});
 for(const current of [profile,null,{sessionRole:'normal',assignedRole:'Unknown',permissions:{}}]){
  const authorize=runInNewContext('(async(req,res)=>{'+guard+'return true;})',{
   currentDashboardAuthorization:async()=>current?{session:{role:current.sessionRole,assignedRole:current.assignedRole,permissions:current.permissions}}:null,
  });
  const req={session:{role:'normal',assignedRole:'HR User',login:'hr',permissions:{readRequests:false}}};
  let status=200;const res={status(code){status=code;return this;},json(){return false;}};
  const allowed=await authorize(req,res);
  assert.equal(allowed,current===profile);
  assert.equal(status,current===profile?200:current===null?401:403);
  if(allowed){assert.equal(req.session.login,'hr');assert.equal(req.session.permissions.createRequests,false);}
 }
});

test('HR User has the requested header menus and read-only fleet data',()=>{
 const access=resolveMobileAccess({user:{userType:'Mobile User',userRoles:'HR User'},selectedRole:'HR User'});
 assert.deepEqual(access.permissions.tabAccess,['Dashboard','Reports','CD','Tickets','Masters']);
 assert.deepEqual(access.permissions.mobileTabAccess,access.permissions.tabAccess);
 assert.equal(canReadDashboardEquipment({role:access.sessionRole,assignedRole:access.assignedRole,permissions:access.permissions}),true);
 assert.equal(access.permissions.readRequests,true);
 for(const key of ['createRequests','editRequests','deleteRequests','closeRequests','verifyRequests'])assert.equal(access.permissions[key],false);
});

test('HR User can open every directory master on desktop and mobile without other masters',()=>{
 const {permissions}=resolveMobileAccess({user:{userType:'Mobile User',userRoles:'HR User'},selectedRole:'HR User'});
 for(const mobile of [false,true]){
  const view=navigationPermissionsForView(permissions,mobile);
  assert.equal(accessAllows(view.tabAccess,'Masters'),true);
  for(const name of Object.values(CDIR_MASTERS))assert.equal(masterAccessAllows(view,name),true,name);
  for(const name of ['Users & employees','Equipment master','Breakdown master'])assert.equal(masterAccessAllows(view,name),false,name);
 }
});

test('HR header hides operational workspaces and allows the requested pages',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(source.includes('permissions.adminLevel !== "Manager" && ![\'HR User\',\'HR Manager\'].includes(session?.assignedRole)'));
 assert.ok(source.includes("if(session?.assignedRole==='HR User')return ['Dashboard','Reports','Tickets','CD'"));
 assert.ok(source.includes('<AnnouncementHistoryButton token={authToken} />'));
});
test('HR checkbox round-trips and produces only directory master permissions',()=>{
 assert.ok(MOBILE_USER_ROLES.includes('HR User'));
 assert.equal(normalizeMobileUserRole('HR User'),'HR User');
 const user={userType:'Mobile User',userRoles:'HR User'};
 assert.deepEqual(assignedUserRoles(user),['HR User']);
 const access=resolveMobileAccess({user,selectedRole:'HR User'});
 assert.equal(access.assignedRole,'HR User');
 assert.equal(access.sessionRole,'normal');
 assert.equal(masterAccessAllows(access.permissions,'C-Dir Employee master'),true);
 assert.equal(masterAccessAllows(access.permissions,'Users & employees'),false);
 assert.equal(access.permissions.createRequests,false);
 assert.equal(cdirViewerContext({session:{role:'normal',assignedRole:'HR User'},user}).canViewAContacts,true);
});
test('HR master API permits all C-Dir employee/contact edits and denies unrelated masters',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function requireSuper('),end=source.indexOf("app.post('/api/session-heartbeat'",start);
 const directory={matrix:{'office|A':[{cat:'A',name:'Director',empId:'A1'}]}};
 const requireSuper=vm.runInNewContext(source.slice(start,end)+'\nrequireSuper',{
 readSession:async()=>({role:'normal',assignedRole:'HR User'}),
 isCdirMaster:name=>name.startsWith('C-Dir '),CDIR_MASTERS:{contact:'C-Dir Contact master',employee:'C-Dir Employee master'},
 cdirDirectory:async()=>directory,
 pool:{query:async()=>({rows:[{record_data:{name:'Director',empId:'A1'}}]})},console,
 });
 for(const [master,body,expected] of [['C-Dir Employee master',{},true],['Users & employees',{},false],['C-Dir Contact master',{name:'Director',empId:'A1',contact:'5555555555'},true]]){
 let allowed=false,status=200;const req={params:{master},body,method:'POST'};
 const res={status:code=>{status=code;return res;},json:()=>{}};
 await requireSuper(req,res,()=>{allowed=true;});
 assert.equal(allowed,expected);if(!expected)assert.equal(status,403);
 }
});
