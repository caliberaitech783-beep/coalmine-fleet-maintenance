import assert from 'node:assert/strict';
import test from 'node:test';
import {assignedUserRoles} from '../account-role-access.mjs';
import {resolveMobileAccess,normalizeMobileUserRole,MOBILE_USER_ROLES} from '../mobile-access.mjs';
import {masterAccessAllows} from '../admin-access.mjs';
import {cdirViewerContext,maskHRContactMasters,isProtectedDirectoryContact} from '../cdir-access.mjs';
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
 assert.equal(cdirViewerContext({session:{role:'normal',assignedRole:'HR User'},user}).canViewAContacts,false);
});
test('HR contact master masks protected A numbers and identifies edits to protected rows',()=>{
 const directory={matrix:{'office|A':[{name:'Director',empId:'ID1',cat:'A'}]}};
 const grouped={'C-Dir Contact master':[{name:'Director',empId:'ID1',contact:'1234567890',whatsapp:'1234567890'},{name:'Engineer',contact:'5555555555'}]};
 assert.equal(isProtectedDirectoryContact(grouped['C-Dir Contact master'][0],directory),true);
 maskHRContactMasters(grouped,directory);
 assert.equal(grouped['C-Dir Contact master'][0].contact,'**********');
 assert.equal(grouped['C-Dir Contact master'][1].contact,'5555555555');
});

test('HR master API permits C-Dir only and denies protected category A contact edits',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function requireSuper('),end=source.indexOf("app.post('/api/session-heartbeat'",start);
 const directory={matrix:{'office|A':[{cat:'A',name:'Director',empId:'A1'}]}};
 const requireSuper=vm.runInNewContext(source.slice(start,end)+'\nrequireSuper',{
 readSession:async()=>({role:'normal',assignedRole:'HR User'}),
 isCdirMaster:name=>name.startsWith('C-Dir '),CDIR_MASTERS:{contact:'C-Dir Contact master',employee:'C-Dir Employee master'},
 cdirDirectory:async()=>directory,isProtectedDirectoryContact,
 pool:{query:async()=>({rows:[{record_data:{name:'Director',empId:'A1'}}]})},console,
 });
 for(const [master,body,expected] of [['C-Dir Employee master',{},true],['Users & employees',{},false],['C-Dir Contact master',{name:'Director',empId:'A1',contact:'5555555555'},false]]){
 let allowed=false,status=200;const req={params:{master},body,method:'POST'};
 const res={status:code=>{status=code;return res;},json:()=>{}};
 await requireSuper(req,res,()=>{allowed=true;});
 assert.equal(allowed,expected);if(!expected)assert.equal(status,403);
 }
});
