import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as scope from '../region-scope.mjs';
import {recordsForSite,canonicalSiteName} from '../site-location.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {createFeedCache} from '../request-feed-cache.mjs';
import {dashboardEquipmentScope,scopeDashboardEquipmentRecords} from '../dashboard-equipment-access.mjs';
import {hierarchyRecipientReportScope} from '../hierarchy-report-scope.mjs';
import {infoPulseRequestScope,scopeInfoPulseRequests} from '../info-pulse-scope.mjs';
import {isWorkflowWhatsAppRecipient} from '../whatsapp-workflow-policy.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const evaluate=(source,deps)=>new Function(...Object.keys(deps),source)(...Object.values(deps));
const user={userType:'Mobile User',userGroup:'General User',site:'SASTI II | Jayant OC',managerRegion:'All',managerSites:'Majri OC'};
const rows=[{ref:'S',site:'Sasti OC'},{ref:'J',site:'Jayant OC'},{ref:'M',site:'Majri OC'},{ref:'X',site:''}];
const sessionFor=(role='General User')=>{
  const menuAccess=role==='General User'?{desktopUserMenuAccess:'Dashboard',mobileUserMenuAccess:'Dashboard'}:{};
  const profile=resolveMobileAccess({user:{...user,...menuAccess,userGroup:role}});
  return {...profile,role:profile.sessionRole,login:'test'};
};
async function invoke(method,path,{record=user,session=sessionFor(),query={},body={},dependencies={}}={}){
  let handler,result={status:200};
  const start=server.indexOf(`app.${method}('${path}',`);
  assert.ok(start>=0);
  evaluate(server.slice(start,server.indexOf('\napp.',start+1)),{
    ...scope,canonicalSiteName,app:{[method]:(_path,...handlers)=>{handler=handlers.at(-1);}},requireSession(){},requirePermission:()=>()=>{},requireMaintenanceUpdatePermission:()=>()=>{},maintenanceManagerSession:()=>false,
    currentUserRecord:async()=>record,...dependencies,
  });
  await handler({session,query,body,params:{reference:'TEST'}},{set(){},status(code){result.status=code;return this;},json(body){result.body=body;}},error=>{throw error;});
  return result;
}

test('multi-site assignments normalize aliases, arrays and legacy fallbacks without inheriting manager scope',()=>{
  assert.deepEqual(scope.userSiteSelection(user),['Sasti OC','Jayant OC']);
  assert.deepEqual(scope.userSiteSelection({site:'',location:'Sasti II'}),['Sasti OC']);
  assert.deepEqual(scope.normalizeUserSiteFields({site:['sasti','JAYANT','Sasti OC']}),{site:'Sasti OC | Jayant OC'});
  assert.deepEqual(scope.userSiteScope({managerRegion:'All',managerSites:'Sasti OC'}).sites,[]);
  assert.equal(scope.reportScopeIncludesSite(scope.userSiteScope(user),'Majri OC'),false);
});
test('All sites saves explicit assignments and deselecting a site removes its access',()=>{
  const sites=scope.REGION_DATA.flatMap(region=>region.sites);
  const saved=scope.normalizeUserSiteFields({site:sites.join(' | ')});
  assert.deepEqual(scope.userSiteSelection(saved),sites);
  for(const site of sites)assert.equal(scope.reportScopeIncludesSite(scope.userSiteScope(saved),site),true);
  saved.site=sites.filter(site=>site!=='Majri OC').join(' | ');
  assert.equal(scope.reportScopeIncludesSite(scope.userSiteScope(saved),'Majri II'),false);
  assert.equal(scope.reportScopeIncludesSite(scope.userSiteScope(saved),'Future site'),false);
});
test('equipment, dashboard, Info Pulse and scheduled reports agree on both assigned sites',()=>{
  for(const role of ['General User','Production User','Maintenance User','MIS User']){
    const session=sessionFor(role),profile={sessionRole:'normal'};
    assert.deepEqual(dashboardEquipmentScope(session,user).allowedSites,['sasti ob','jayant ob']);
    assert.deepEqual(scopeDashboardEquipmentRecords(rows,session,user),rows.slice(0,2));
    assert.deepEqual(recordsForSite(rows,user.site),rows.slice(0,2));
    assert.deepEqual(scopeInfoPulseRequests(rows,infoPulseRequestScope(session,user)),rows.slice(0,2));
    assert.deepEqual(hierarchyRecipientReportScope(user,profile).sites,['sasti ob','jayant ob']);
    assert.deepEqual(hierarchyRecipientReportScope(user,profile,'Jayant OC | Majri OC').sites,['jayant ob']);
  }
  assert.deepEqual(infoPulseRequestScope({role:'normal',location:'Sasti OC'},{}).sites,[]);
  assert.equal(isWorkflowWhatsAppRecipient({...user,userGroup:'Maintenance User'},'opened','Jayant OC'),true);
  assert.equal(isWorkflowWhatsAppRecipient({...user,userGroup:'Maintenance User'},'opened','Majri OC'),false);
});
test('request APIs apply selected sites to every Team User feed, including a changed assignment',async()=>{
  for(const role of ['General User','Production User','Maintenance User','MIS User'])for(const selected of [user,{site:'Majri OC'},{}]){
    const result=await invoke('get','/api/requests',{record:selected,session:sessionFor(role),query:{scope:'dashboard'},dependencies:{
      pool:{query:async()=>({rows})},requestProjection:'*',requestsVisibleToSession:rows=>rows,attachDailyRemarks:async rows=>rows,requestFeedCache:createFeedCache({ttlMs:0}),
    }});
    assert.equal(result.status,200);
    assert.deepEqual(result.body,selected===user?rows.slice(0,2):selected.site?[rows[2]]:[]);
  }
});
test('Team User equipment and tickets cannot use stale manager fields to broaden access',async()=>{
  const result=await invoke('get','/api/masters',{dependencies:{pool:{query:async()=>({rows:rows.map(row=>({id:row.ref,master_name:'Equipment master',record_data:row}))})}}});
  assert.deepEqual(result.body['Equipment master'].map(row=>row.ref),['S','J']);
  const tickets=await invoke('get','/api/tickets',{dependencies:{TICKET_CATEGORIES:[],ticketProjection:()=>'*',pool:{query:async(sql,values)=>{
    assert.match(sql,/lower\(creator_login\)=\$1/);assert.deepEqual(values,['test']);return {rows};
  }}}});
  assert.deepEqual(tickets.body,rows.slice(0,2));
});
test('MIS evidence and vehicle transfer actions accept the second site and exclude other sites',async()=>{
  for(const site of ['Jayant OC','Majri OC']){
    const result=await invoke('get','/api/requests/:reference/trip-card',{session:sessionFor('MIS User'),dependencies:{
      pool:{query:async()=>({rows:[{site,image:'fixture'}]})},validTripCardImageDataUrl:()=>true,
    }});
    assert.equal(result.status,site==='Jayant OC'?200:403);
  }
  const start=server.indexOf('function transferVisibleToContext('),end=server.indexOf('async function vehicleTransferPmLogins(');
  const helpers=evaluate(`${server.slice(start,end)};return {transferVisibleToContext,transferMisVerificationAllowed};`,scope);
  const context={misUser:true,scope:scope.userSiteScope(user)};
  assert.equal(helpers.transferVisibleToContext({source:'Jayant OC',destination:'New Yard'},context),true);
  assert.equal(helpers.transferVisibleToContext({source:'Majri OC',destination:'New Yard'},context),false);
  assert.equal(helpers.transferMisVerificationAllowed(context,'Jayant OC'),true);
  assert.equal(helpers.transferMisVerificationAllowed(context,'Majri OC'),false);
});
test('tickets require a single permitted site rather than a combined assignment string',async()=>{
  for(const site of ['Jayant OC','Majri OC','Sasti OC | Jayant OC','']){
    const writes=[];
    const result=await invoke('post','/api/tickets',{body:{site,message:'Help',priority:'Medium'},dependencies:{
      pool:{connect:async()=>({query:async(sql,values)=>{if(sql.startsWith('INSERT'))writes.push(values[3]);return {rows:[{id:1,created_at:new Date(),site}]};},release(){}})},
      managerRoleSelection:()=>[],TICKET_CATEGORIES:['General'],validTicketMediaDataUrl:()=>true,ticketReference:()=> 'T1',ticketProjection:()=>'*',
      ticketSuperRecipients:async()=>({adminLogins:[],managerLogins:[]}),addTicketNotifications:async()=>{},sendTicketRaisedEmail:async()=>{},
      publicBaseUrl:()=>'',sendGenericWhatsAppAlertBestEffort:async()=>{},
    }});
    assert.equal(result.status,site==='Jayant OC'?201:403);
    assert.deepEqual(writes,site==='Jayant OC'?[site]:[]);
  }
});
