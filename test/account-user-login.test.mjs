import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {ibossAccountsAllowed,ibossAccountsEligible} from '../iboss-access.mjs';
import {ADMIN_SUBMENU_OPTIONS} from '../admin-access.mjs';
test('Account User retains Accounts access after the profile refresh',()=>{
  const user={userType:'Account User',userGroup:'Account User',adminLevel:''};
  const profile=resolveMobileAccess({user});
  const session={...profile,role:profile.sessionRole};
  assert.equal(ibossAccountsEligible(user),true);
  assert.equal(ibossAccountsAllowed({...session,permissions:{...session.permissions,ibossAccounts:ibossAccountsEligible(user)}}),true);
  assert.equal(ibossAccountsEligible({userType:'Mobile User',userGroup:'General User'}),false);
  assert.equal(ibossAccountsEligible({...user,adminLevel:'Manager'}),false);
});
test('Account User has only Accounts authority, never administrator or fleet write access',()=>{
  const profile=resolveMobileAccess({user:{userType:'Account User',adminLevel:'Super Admin',tabAccess:'Masters',userGroup:'Account User'}});
  const session={...profile,role:profile.sessionRole};
  assert.equal(session.role,'normal');
  assert.equal(ibossAccountsAllowed(session),true);
  for(const permission of ['readRequests','viewDashboardRequests','viewEquipment','createRequests','editRequests','deleteRequests','closeRequests','verifyRequests'])assert.equal(profile.permissions[permission],false);
  assert.equal(profile.permissions.adminLevel,undefined);
  assert.equal(ibossAccountsAllowed({...session,permissions:{}}),false);
  for(const role of ['Production User','Maintenance User','MIS User','General User']){
    const other=resolveMobileAccess({user:{userType:'Mobile User',userGroup:role}});
    assert.equal(ibossAccountsAllowed({...other,role:other.sessionRole}),false);
  }
});
test('Accounts login checks server authority before issuing a session or password-change token',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const check=server.indexOf("req.body.portal==='accounts'");
  assert.ok(check>0);
  assert.ok(check<server.indexOf('if(employee.mustChangePassword===true)',check));
  assert.match(server.slice(check,check+400),/status\(403\)/);
  const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(client,/MOBILE_USER_ROLES,"Account User"/);
  assert.match(client,/if \(session.userType === "Account User"\) return/);
  assert.match(client,/ibossAccountsAllowed\(session\)\?<IbossAccounts/);
});
test('selected login portal rejects cross-portal IDs before login, including missing portal',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const start=server.indexOf("    if(req.body.portal==='accounts'");
  const end=server.indexOf('    if(!profile.userType)',start);
  const guard=new Function('req','profile','res','ibossAccountsAllowed',server.slice(start,end)+';return null;');
  const account=resolveMobileAccess({user:{userType:'Account User'}});
  const fleetProfiles=[resolveMobileAccess({user:{userType:'Super Admin',adminLevel:'Admin'}}),...['Production User','Maintenance User','MIS User','General User'].map(userGroup=>resolveMobileAccess({user:{userType:'Mobile User',userGroup}}))];
  const check=(profile,portal)=>guard({body:{portal}},profile,{status(code){return {json(body){return {code,...body};}};}},ibossAccountsAllowed);
  assert.equal(check(account,'accounts'),null);
  for(const portal of ['operations',undefined,'fleet','invalid'])assert.equal(check(account,portal).code,403);
  for(const profile of fleetProfiles){
    assert.equal(check(profile,'accounts').code,403);
    assert.equal(check(profile,'operations'),null);
    assert.equal(check(profile,undefined),null);
  }
});
test('saving Account User clears inherited administrative and operational selections',()=>{
  const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const source=client.match(/function applyUserRoleDefaults\(record\) \{[\s\S]*?\n\}/)[0];
  const scope={privilegeSelectionValue:value=>value,mobileUserRoleOptions:['Account User'],displaySiteSelection:()=>[],ADMIN_SUBMENU_OPTIONS,mobileAccessKey:key=>'mobile'+key,GENERAL_USER_ROLE:'General User'};
  const apply=new Function(...Object.keys(scope),`${source};return applyUserRoleDefaults;`)(...Object.values(scope));
  const saved=apply({userGroup:'Account User',adminLevel:'Super Admin',desktopUserMenuAccess:'Requests',mobileUserMenuAccess:'Masters',read:true,edit:true});
  assert.equal(saved.userType,'Account User');
  assert.equal(saved.adminLevel,'');
  assert.equal(saved.desktopUserMenuAccess,'');
  assert.equal(saved.mobileUserMenuAccess,'');
  assert.equal(saved.edit,false);
  assert.equal(saved.read,false);
});
