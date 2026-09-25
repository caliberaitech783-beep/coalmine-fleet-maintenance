import * as siteAccess from '../region-scope.mjs';
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {createFeedCache} from '../request-feed-cache.mjs';
import {
  GENERAL_USER_ROLE, GENERAL_USER_MENU_OPTIONS, MOBILE_USER_ROLES,
  generalUserCanAccessMenu, generalUserMenuSelection, normalizeMobileUserRole, resolveMobileAccess,
} from "../mobile-access.mjs";
import {ADMIN_SUBMENU_OPTIONS} from "../admin-access.mjs";
import {canReadDashboardEquipment,dashboardEquipmentScope,scopeDashboardEquipmentRecords} from "../dashboard-equipment-access.mjs";

const user = {userType:"Mobile User",userGroup:GENERAL_USER_ROLE,site:"Sasti OB"};
const sessionFor = (overrides={}) => {
  const profile=resolveMobileAccess({user:{...user,...overrides}});
  return {...profile,role:profile.sessionRole};
};
const server=readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
const client=readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
const middlewareSource=server.slice(server.indexOf("async function requireSession("),server.indexOf("async function requireSuper("));
async function authorize(session,path,{method="GET",query={}}={}){
  const context=vm.createContext({readSession:async()=>session,GENERAL_USER_ROLE,generalUserCanAccessMenu});
  vm.runInContext(middlewareSource,context);
  const result={status:200,passed:false};
  const res={status(code){result.status=code;return this;},json(body){result.body=body;return this;}};
  await context.requireSession({path,method,query},res,(error)=>{if(error)throw error;result.passed=true;});
  return result;
}

test("General User is a recognized Team User with every menu available and none selected by default",()=>{
  assert.ok(MOBILE_USER_ROLES.includes(GENERAL_USER_ROLE));
  assert.deepEqual(GENERAL_USER_MENU_OPTIONS,["Dashboard","Masters","WhatsApp Integration","Requests","Reports","Audit Trail","Tickets"]);
  for(const name of ["General User"," general ","general_user"])assert.equal(normalizeMobileUserRole(name),GENERAL_USER_ROLE);
  const profile=sessionFor();
  assert.equal(profile.role,"normal");
  assert.equal(profile.assignedRole,GENERAL_USER_ROLE);
  for(const view of ["desktop","mobile"]){
    assert.deepEqual(profile.permissions[`${view}UserMenuAccess`],[]);
    assert.deepEqual(profile.permissions[`${view}UserRequestAccess`],[]);
  }
  assert.equal(profile.permissions.viewDashboardRequests,false);
  assert.equal(profile.permissions.readRequests,false);
  assert.equal(profile.permissions.viewEquipment,false);
});

test("General User keeps independent saved menus and explicit empty selections",()=>{
  const profile=sessionFor({desktopUserMenuAccess:"Dashboard | Reports",mobileUserMenuAccess:"Tickets"});
  assert.deepEqual(profile.permissions.desktopUserMenuAccess,["Dashboard","Reports"]);
  assert.deepEqual(profile.permissions.mobileUserMenuAccess,["Tickets"]);
  const empty=sessionFor({desktopUserMenuAccess:"",mobileUserMenuAccess:""});
  assert.deepEqual(empty.permissions.desktopUserMenuAccess,[]);
  assert.deepEqual(empty.permissions.mobileUserMenuAccess,[]);
  assert.equal(empty.permissions.viewEquipment,false);
  assert.equal(empty.permissions.viewDashboardRequests,false);
  assert.equal(empty.permissions.readRequests,false);
});

test("missing mobile settings inherit desktop; invalid menus never grant access",()=>{
  const profile=sessionFor({desktopUserMenuAccess:["Requests","Requests","Masters","Reports","Unknown"]});
  assert.deepEqual(profile.permissions.desktopUserMenuAccess,["Requests","Masters","Reports"]);
  assert.deepEqual(profile.permissions.mobileUserMenuAccess,["Requests","Masters","Reports"]);
  assert.deepEqual(profile.permissions.desktopUserRequestAccess,["View requests","Closed history"]);
  assert.equal(profile.permissions.readRequests,true);
  assert.equal(generalUserCanAccessMenu(profile,"Masters"),true);
  assert.equal(generalUserCanAccessMenu(profile,"Unknown"),false);
});

test("additional menu grants never add maintenance authority, even with stale privilege flags",()=>{
  const profile=resolveMobileAccess({user:{...user,desktopUserMenuAccess:GENERAL_USER_MENU_OPTIONS,edit:true,delete:true,verify:true,adminLevel:"Admin"},privilege:{userGroup:"MIS User",edit:true,delete:true,verify:true}});
  for(const flag of ["createRequests","editRequests","deleteRequests","closeRequests","verifyRequests"])assert.equal(profile.permissions[flag],false,flag);
  assert.equal(profile.permissions.adminLevel,undefined);
  const restricted=sessionFor({desktopUserMenuAccess:"Requests",desktopUserRequestAccess:"Create request | MIS verification | Closed history",mobileUserRequestAccess:""});
  assert.deepEqual(restricted.permissions.desktopUserRequestAccess,["Closed history"]);
  assert.deepEqual(restricted.permissions.mobileUserRequestAccess,[]);
});

test("saving General User defaults and all-unchecked menus matches the form",()=>{
  const source=client.slice(client.indexOf("function applyUserRoleDefaults("),client.indexOf("function missingViewSubmenu("));
  const context=vm.createContext({
    GENERAL_USER_ROLE,generalUserMenuSelection,mobileUserRoleOptions:MOBILE_USER_ROLES,
    ...siteAccess,privilegeSelectionValue:value=>value,displaySiteName:value=>value,ADMIN_SUBMENU_OPTIONS,
    mobileAccessKey:key=>`mobile${key[0].toUpperCase()}${key.slice(1)}`,
    operationalRequestOptions:{[GENERAL_USER_ROLE]:["View requests","Closed history"]},
  });
  vm.runInContext(source,context);
  const defaults=context.applyUserRoleDefaults({...user});
  assert.equal(defaults.desktopUserMenuAccess,"");
  assert.equal(defaults.mobileUserMenuAccess,"");
  const saved=context.applyUserRoleDefaults({...user,desktopUserMenuAccess:"",mobileUserMenuAccess:"Tickets",desktopUserRequestAccess:"",mobileUserRequestAccess:"",edit:true});
  assert.equal(saved.desktopUserMenuAccess,"");
  assert.equal(saved.mobileUserMenuAccess,"Tickets");
  assert.equal(saved.edit,false);
  assert.equal(saved.userType,"Mobile User");
});

test("API rejects every unchecked General User menu by default",async()=>{
  const session=sessionFor();
  for(const [path,options] of [
    ["/api/requests",{query:{scope:"dashboard"}}],
    ["/api/tickets",{}],
    ["/api/tickets",{method:"POST"}],
    ["/api/requests",{}],
    ["/api/requests/REQ1/meter-file",{}],
    ["/api/report-schedule-settings",{}],
    ["/api/oracle/driver",{}],
  ]){
    assert.equal((await authorize(session,path,options)).status,403,path);
  }
  assert.equal((await authorize(session,"/api/requests",{query:{scope:"reports"}})).status,403);
});

test("API honors opt-in menus and rejects removed dashboard and ticket access",async()=>{
  const session=sessionFor({desktopUserMenuAccess:"Requests",mobileUserMenuAccess:"Reports"});
  assert.equal((await authorize(session,"/api/requests")).passed,true);
  assert.equal((await authorize(session,"/api/requests",{query:{scope:"reports"}})).passed,true);
  assert.equal((await authorize(session,"/api/report-schedule-settings")).passed,true);
  assert.equal((await authorize(session,"/api/requests",{query:{scope:"dashboard"}})).status,403);
  assert.equal((await authorize(session,"/api/tickets")).status,403);
});

test("General User cannot pass request mutation permission checks",()=>{
  const context=vm.createContext({});
  vm.runInContext(middlewareSource,context);
  for(const permission of ["createRequests","editRequests","deleteRequests","closeRequests","verifyRequests"]){
    let status;
    const res={status(code){status=code;return this;},json(){}};
    context.requirePermission(permission)({session:sessionFor()},res,()=>assert.fail(`${permission} allowed`));
    assert.equal(status,403);
  }
});

test("existing Team User roles retain their existing API access",async()=>{
  for(const userGroup of ["Production User","Maintenance User","MIS User"]){
    const session=sessionFor({userGroup});
    assert.equal((await authorize(session,"/api/requests")).passed,true);
    assert.equal((await authorize(session,"/api/report-schedule-settings")).passed,true);
  }
});

test("General User dashboard fleet access follows the menu grant and assigned site",()=>{
  const dashboardSession=sessionFor({desktopUserMenuAccess:"Dashboard"});
  assert.equal(canReadDashboardEquipment(dashboardSession),true);
  assert.equal(canReadDashboardEquipment(sessionFor({desktopUserMenuAccess:"Tickets",mobileUserMenuAccess:"Tickets"})),false);
  const scope=dashboardEquipmentScope(dashboardSession,user);
  assert.equal(scope.restrictToScope,true);
  const rows=[{door:"IN-SCOPE",currentLocation:"Sasti OB"},{door:"OTHER",currentLocation:"Ghugus"}];
  assert.deepEqual(scopeDashboardEquipmentRecords(rows,dashboardSession,user),[rows[0]]);
});

test("General User request feeds keep dashboard, optional Requests, and Reports site-scoped",async()=>{
  const source=server.slice(server.indexOf("app.get('/api/requests',"),server.indexOf("const requestTimelineProjection="));
  for(const scope of ["dashboard","requests","reports"]){
    const session=sessionFor({desktopUserMenuAccess:GENERAL_USER_MENU_OPTIONS});
    let handler,body;
    const rows=[{ref:"VISIBLE",site:"Sasti OB"},{ref:"OTHER",site:"Ghugus"}];
    const context=vm.createContext({
      app:{get(_path,_guard,callback){handler=callback;}},requireSession(){},GENERAL_USER_ROLE,
      ...siteAccess,currentUserRecord:async()=>user,assignedUserSiteName:value=>value.site,requestProjection:"*",
      pool:{query:async()=>({rows})},canonicalSiteName:value=>value,
      requestsVisibleToSession:value=>value,attachDailyRemarks:async value=>value,requestFeedCache:createFeedCache({ttlMs:0}),
    });
    vm.runInContext(source,context);
    const res={set(){},json(value){body=value;},status(code){assert.fail(`Unexpected status ${code}`);}};
    await handler({session,query:{scope}},res,error=>{throw error;});
    assert.deepEqual(body,[rows[0]],scope);
  }
});
