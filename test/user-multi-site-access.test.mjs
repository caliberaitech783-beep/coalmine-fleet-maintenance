import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as scope from '../region-scope.mjs';
import {recordsForSite,canonicalSiteName} from '../site-location.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {dashboardEquipmentScope,scopeDashboardEquipmentRecords} from '../dashboard-equipment-access.mjs';
import {hierarchyRecipientReportScope} from '../hierarchy-report-scope.mjs';
import {infoPulseRequestScope,scopeInfoPulseRequests} from '../info-pulse-scope.mjs';
import {isWorkflowWhatsAppRecipient} from '../whatsapp-workflow-policy.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const evaluate=(source,deps)=>new Function(...Object.keys(deps),source)(...Object.values(deps));
const user={userType:'Mobile User',userGroup:'General User',site:'SASTI II | Jayant OB',managerRegion:'All',managerSites:'Majri OB'};
const rows=[{ref:'S',site:'Sasti OB'},{ref:'J',site:'Jayant OB'},{ref:'M',site:'Majri OB'},{ref:'X',site:''}];
const sessionFor=(role='General User')=>{const profile=resolveMobileAccess({user:{...user,userGroup:role}});return {...profile,role:profile.sessionRole,login:'test'};};
async function invoke(method,path,{record=user,session=sessionFor(),query={},body={},dependencies={}}={}){
  let handler,result={status:200};
  const start=server.indexOf(`app.${method}('${path}',`);
  assert.ok(start>=0);
  evaluate(server.slice(start,server.indexOf('\napp.',start+1)),{
    ...scope,canonicalSiteName,app:{[method]:(_path,...handlers)=>{handler=handlers.at(-1);}},requireSession(){},requirePermission:()=>()=>{},
    currentUserRecord:async()=>record,...dependencies,
  });
  await handler({session,query,body,params:{reference:'TEST'}},{set(){},status(code){result.status=code;return this;},json(body){result.body=body;}},error=>{throw error;});
  return result;
}

test('multi-site assignments normalize aliases, arrays and legacy fallbacks without inheriting manager scope',()=>{
  assert.deepEqual(scope.userSiteSelection(user),['Sasti OB','Jayant OB']);
  assert.deepEqual(scope.userSiteSelection({site:'',location:'Sasti II'}),['Sasti OB']);
  assert.deepEqual(scope.normalizeUserSiteFields({site:['sasti','JAYANT','Sasti OB']}),{site:'Sasti OB | Jayant OB'});
  assert.deepEqual(scope.userSiteScope({managerRegion:'All',managerSites:'Sasti OB'}).sites,[]);
  assert.equal(scope.reportScopeIncludesSite(scope.userSiteScope(user),'Majri OB'),false);
});
test('All sites saves explicit assignments and deselecting a site removes its access',()=>{
  const sites=scope.REGION_DATA.flatMap(region=>region.sites);
  const saved=scope.normalizeUserSiteFields({site:sites.join(' | ')});
  assert.deepEqual(scope.userSiteSelection(saved),sites);
  for(const site of sites)assert.equal(scope.reportScopeIncludesSite(scope.userSiteScope(saved),site),true);
  saved.site=sites.filter(site=>site!=='Majri OB').join(' | ');
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
    assert.deepEqual(hierarchyRecipientReportScope(user,profile,'Jayant OB | Majri OB').sites,['jayant ob']);
  }
  assert.deepEqual(infoPulseRequestScope({role:'normal',location:'Sasti OB'},{}).sites,[]);
  assert.equal(isWorkflowWhatsAppRecipient({...user,userGroup:'Maintenance User'},'opened','Jayant OB'),true);
  assert.equal(isWorkflowWhatsAppRecipient({...user,userGroup:'Maintenance User'},'opened','Majri OB'),false);
});
test('request APIs apply selected sites to every Team User feed, including a changed assignment',async()=>{
  for(const role of ['General User','Production User','Maintenance User','MIS User'])for(const selected of [user,{site:'Majri OB'},{}]){
    const result=await invoke('get','/api/requests',{record:selected,session:sessionFor(role),query:{scope:'dashboard'},dependencies:{
      pool:{query:async()=>({rows})},requestProjection:'*',requestsVisibleToSession:rows=>rows,attachDailyRemarks:async rows=>rows,
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
  for(const site of ['Jayant OB','Majri OB']){
    const result=await invoke('get','/api/requests/:reference/trip-card',{session:sessionFor('MIS User'),dependencies:{
      pool:{query:async()=>({rows:[{site,image:'fixture'}]})},validTripCardImageDataUrl:()=>true,
    }});
    assert.equal(result.status,site==='Jayant OB'?200:403);
  }
  const start=server.indexOf('function transferVisibleToContext('),end=server.indexOf('async function vehicleTransferPmLogins(');
  const helpers=evaluate(`${server.slice(start,end)};return {transferVisibleToContext,transferMisVerificationAllowed};`,scope);
  const context={misUser:true,scope:scope.userSiteScope(user)};
  assert.equal(helpers.transferVisibleToContext({source:'Jayant OB',destination:'New Yard'},context),true);
  assert.equal(helpers.transferVisibleToContext({source:'Majri OB',destination:'New Yard'},context),false);
  assert.equal(helpers.transferMisVerificationAllowed(context,'Jayant OB'),true);
  assert.equal(helpers.transferMisVerificationAllowed(context,'Majri OB'),false);
});
test('tickets require a single permitted site rather than a combined assignment string',async()=>{
  for(const site of ['Jayant OB','Majri OB','Sasti OB | Jayant OB','']){
    const writes=[];
    const result=await invoke('post','/api/tickets',{body:{site,message:'Help',priority:'Medium'},dependencies:{
      pool:{connect:async()=>({query:async(sql,values)=>{if(sql.startsWith('INSERT'))writes.push(values[3]);return {rows:[{id:1,created_at:new Date(),site}]};},release(){}})},
      managerRoleSelection:()=>[],TICKET_CATEGORIES:['General'],validTicketMediaDataUrl:()=>true,ticketReference:()=> 'T1',ticketProjection:()=>'*',
      ticketSuperRecipients:async()=>({adminLogins:[],managerLogins:[]}),addTicketNotifications:async()=>{},sendTicketRaisedEmail:async()=>{},
      publicBaseUrl:()=>'',sendGenericWhatsAppAlertBestEffort:async()=>{},
    }});
    assert.equal(result.status,site==='Jayant OB'?201:403);
    assert.deepEqual(writes,site==='Jayant OB'?[site]:[]);
  }
});
