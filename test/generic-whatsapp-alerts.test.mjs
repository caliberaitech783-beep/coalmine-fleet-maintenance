import * as siteAccess from '../region-scope.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {defaultWhatsAppReportSettings,whatsappPurposeEnabled} from '../whatsapp-report-settings.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {assignedUserSiteName,canonicalSiteName} from '../site-location.mjs';
import {isExcludedWorkflowWhatsAppRecipient,isWorkflowWhatsAppRecipient,isWhatsAppAllAlertRecipient,isWhatsAppReportsOnlyRecipient} from '../whatsapp-workflow-policy.mjs';
import {reportTemplateFallback} from '../whatsapp-template-runtime.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const normalizeLogin=value=>String(value||'').trim().toLowerCase();
const sorted=values=>[...values].sort();
const adminLogins=['admin','super','implicit-admin'];
const siteUserLogins=['creator','production','maintenance','mis','location-only'];
const reportsOnlyLogins=['manager','multi-manager','project-manager','admin-manager','director','named-director','duplicate-mobile','duplicate-admin'];
const mobile=(login,assignedRole='Production User',site='Sasti OB',extra={})=>({login,userType:'Mobile User',assignedRole,site,...extra});
const admin=(login,adminLevel='Admin',extra={})=>({login,userType:'Super User',adminLevel,...extra});

function fixtureUsers(){
  return [
    mobile('creator'),mobile('production'),mobile('maintenance','Maintenance User'),mobile('mis','MIS User'),
    mobile('location-only','MIS User',' ',{location:'Sasti OB'}),
    mobile('other-site','Maintenance User','Majri OB',{managerRegion:'All',managerSites:'Sasti OB',currentLocation:'Sasti OB'}),
    mobile('unassigned','MIS User',''),mobile('unknown-role','Other User'),
    admin('admin','Admin',{site:'Majri OB',managerSites:'Majri OB'}),
    admin('super','Super Admin',{designation:'Director',employee:'Mohit Chadda',site:'Jayant OB',managerRole:'Project Manager'}),
    {login:'implicit-admin',userType:'Super User'},
    admin('manager','Manager',{managerRole:'Production Manager',managerRegion:'All'}),
    admin('multi-manager','Manager',{managerRole:'Production Manager | Maintenance Manager | MIS Manager',site:'Sasti OB'}),
    admin('project-manager','Project Manager',{designation:'Project Manager',site:'Sasti OB'}),
    admin('admin-manager','Admin',{designation:'Maintenance Manager',site:'Sasti OB'}),
    admin('director','Admin',{designation:'Director',site:'Sasti OB'}),
    admin('named-director','Admin',{employee:'Manish Chadda'}),
    mobile('duplicate-mobile'),admin(' DUPLICATE-MOBILE ','Manager',{managerRole:'MIS Manager'}),
    admin('duplicate-admin'),admin(' DUPLICATE-ADMIN ','Admin',{designation:'Director'}),
    mobile(' CREATOR '),admin(''),
  ].map((user,index)=>({employee:user.login,phone:`900${String(index+1).padStart(7,'0')}`,...user}));
}

function sourceBetween(startMarker,endMarker,from=0){
  const start=server.indexOf(startMarker,from),end=server.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start,`Server snippet not found: ${startMarker}`);
  return server.slice(start,end);
}

function harness({users=fixtureUsers(),settings=defaultWhatsAppReportSettings(),now=new Date('2026-09-15T09:15:00+05:30'),templateError=null,templateGate=null,beforeRecipientLookup}={}){
  const templates=[],texts=[],templateAttempts=[],history=[],inApp=[],queries=[],errors=[];
  const client={query:async(sql,args=[])=>{
    queries.push({sql,args:structuredClone(args)});
    if(sql.includes("master_name='Users & employees'")){
      const selected=sql.includes('ANY($1::text[])')?new Set(args[0]):null;
      if(selected)beforeRecipientLookup?.(users);
      return {rows:users.filter(user=>!selected||selected.has(normalizeLogin(user.login))).map(record_data=>({record_data:structuredClone(record_data)}))};
    }
    if(sql.includes('INSERT INTO crm_notifications'))inApp.push(args);
    else if(sql.includes('INSERT INTO whatsapp_alert_history'))history.push(args);
    else assert.fail(`Unexpected SQL: ${sql}`);
    return {rows:[],rowCount:1};
  }};
  const bindings={pool:client,storedWhatsAppReportSettings:async()=>settings,
    whatsappPurposeEnabled:(value,purpose)=>whatsappPurposeEnabled(value,purpose,now),
    ...siteAccess,resolveMobileAccess,assignedUserSiteName,canonicalSiteName,isExcludedWorkflowWhatsAppRecipient,isWorkflowWhatsAppRecipient,
    isWhatsAppAllAlertRecipient,isWhatsAppReportsOnlyRecipient,reportTemplateFallback,
    metaWhatsAppRuntimeEnv:async()=>({WHATSAPP_REPORT_SETTINGS:settings}),
    sendMetaWhatsAppTemplate:async(args)=>{templateAttempts.push(args);if(templateGate)await templateGate;if(templateError)throw templateError;templates.push(args);},
    sendMetaWhatsAppText:async(args)=>{texts.push(args);},console:{error:(...args)=>errors.push(args)},
  };
  // Execute the real server selection, delivery and best-effort functions
  // together; only I/O and the clock are replaced.
  const snippet=sourceBetween('async function sendWhatsAppNotifications(','let consolidatedReportRunning=false;');
  const api=new Function(...Object.keys(bindings),`${snippet};return {sendWhatsAppNotifications,genericWhatsAppAlertLogins,addTicketNotifications,sendGenericWhatsAppAlertBestEffort};`)(...Object.values(bindings));
  const sentLogins=()=>templates.concat(texts).map(({to})=>normalizeLogin(users.find(user=>String(user.phone||user.phoneNo||user.phoneNumber)===to)?.login));
  return {...api,client,users,settings,templates,texts,templateAttempts,history,inApp,queries,errors,sentLogins};
}

// Run the actual call in each ticket route, including its independently chosen
// in-app and WhatsApp audiences. This catches regressions in caller wiring too.
async function notifyFromTicketRoute(api,purpose,{creatorLogin='creator',commitError=null,awaitDelivery=true,timeline=[]}={}){
  const marker=purpose==='ticketCreated'?"app.post('/api/tickets',":"app.patch('/api/tickets/resolve',";
  const routeStart=server.indexOf(marker);assert.ok(routeStart>=0);
  const call=sourceBetween('    await addTicketNotifications(','  }catch(error)',routeStart);
  const pending=[],responses=[];
  const transactionClient={query:async(sql,args)=>{
    if(sql==='COMMIT'){timeline.push('commit');if(commitError)throw commitError;return {rows:[]};}
    timeline.push('in-app');return api.client.query(sql,args);
  }};
  const ticket={reference:'TIC/1',creatorLogin,site:'Sasti OB'};
  const res={status(){return this;},json(value){timeline.push('response');responses.push(value);}};
  const bindings={publicBaseUrl:()=>"https://bdms.cmll.in/",addTicketNotifications:api.addTicketNotifications,client:transactionClient,
    sendGenericWhatsAppAlertBestEffort:(...args)=>{
      timeline.push('whatsapp');const delivery=api.sendGenericWhatsAppAlertBestEffort(...args);pending.push(delivery);return delivery;
    },res,rows:[ticket],normalizeOperationalSiteFields:value=>value,sendTicketRaisedEmail:async()=>{},
    recipients:{adminLogins:['admin','director'],managerLogins:['manager','multi-manager']},
    creatorLogin,reference:'TIC/1',site:'Sasti OB',req:{session:{name:'Ticket author'}},
    ticket,
  };
  await new Function(...Object.keys(bindings),`return (async()=>{${call}})();`)(...Object.values(bindings));
  if(awaitDelivery)await Promise.all(pending);
  return {timeline,pending,responses};
}

for(const purpose of ['ticketCreated','ticketResolved']){
  test(`${purpose}: generic selection keeps the selected operational creator and excludes leadership`,async()=>{
    const api=harness();
    const audience=await api.genericWhatsAppAlertLogins(api.client,[' CREATOR ','creator',...reportsOnlyLogins,'missing',''],{purpose,site:'Sasti OB'});
    assert.deepEqual(audience,['creator']);
    assert.equal(api.templates.length,0);
    assert.equal(api.inApp.length,0);
    // Ticket ownership still allows the creator after their assigned site changes.
    api.users.find(user=>user.login==='other-site').site='Jayant OB';
    assert.deepEqual(await api.genericWhatsAppAlertLogins(api.client,['other-site'],{purpose,site:'Sasti OB'}),['other-site']);
  });

  test(`${purpose}: the real route sends only to the creator and preserves in-app recipients`,async()=>{
    const api=harness(),route=await notifyFromTicketRoute(api,purpose);
    assert.deepEqual(api.sentLogins(),['creator']);
    assert.deepEqual(api.inApp.map(args=>args[0]),purpose==='ticketCreated'?['admin','director','manager','multi-manager']:['creator','manager','multi-manager']);
    assert.ok(api.inApp.every(args=>args[1]==='TIC/1'));
    assert.ok(api.templates.every(message=>message.templateKey===purpose&&message.purpose===purpose&&message.parameters[0]==='TIC/1'));
    assert.equal(api.history.length,1);
    assert.ok(api.history.every(args=>args[1]==='TIC/1'&&args[5]==='Sent'));
    assert.deepEqual(route.timeline,[...api.inApp.map(()=> 'in-app'),'commit','response','whatsapp']);
    assert.equal(route.responses.length,1);
    assert.equal(route.pending.length,1);
  });

  test(`${purpose}: the response completes while WhatsApp transport is still pending`,async()=>{
    let release;const templateGate=new Promise(resolve=>{release=resolve;});
    const api=harness({templateGate}),timeline=[];
    let completed=false;
    const routePromise=notifyFromTicketRoute(api,purpose,{awaitDelivery:false,timeline}).then(route=>{completed=true;return route;});
    try{
      await nextTurn();
      assert.equal(completed,true,'The route must not await WhatsApp network delivery');
      assert.deepEqual(timeline.slice(-3),['commit','response','whatsapp']);
      assert.equal(api.templateAttempts.length,1);
      assert.equal(api.templates.length,0);
      assert.equal(api.history.length,0);
    }finally{
      release();const route=await routePromise;await Promise.all(route.pending);
    }
    assert.deepEqual(api.sentLogins(),['creator']);
  });

  test(`${purpose}: a failed commit starts no WhatsApp follow-up`,async()=>{
    const api=harness(),timeline=[];
    await assert.rejects(notifyFromTicketRoute(api,purpose,{commitError:new Error('Commit failed'),timeline}),/Commit failed/);
    assert.equal(timeline.at(-1),'commit');
    assert.ok(!timeline.includes('response')&&!timeline.includes('whatsapp'));
    assert.equal(api.templateAttempts.length,0);
    assert.equal(api.queries.filter(({sql})=>sql.includes('FROM master_records')).length,0);
  });

  test(`${purpose}: manager / Director creators and their duplicate logins receive no immediate alert`,async()=>{
    for(const creatorLogin of reportsOnlyLogins){
      const api=harness();await notifyFromTicketRoute(api,purpose,{creatorLogin});
      assert.deepEqual(api.sentLogins(),[],creatorLogin);
      if(purpose==='ticketResolved')assert.equal(api.inApp[0][0],creatorLogin);
    }
  });
}

test('dailyUpdate sends to operational users at the exact assigned site and excludes leadership',async()=>{
  const api=harness(),inApp=[' CREATOR ','manager','director','creator','other-site',''];
  await api.addTicketNotifications(api.client,inApp,'REQ/1','Daily update',{templateKey:'dailyUpdate',parameters:['Maintenance author','REQ/1']},{site:'SASTI II'});
  assert.deepEqual(sorted(api.sentLogins()),sorted(siteUserLogins));
  assert.deepEqual(api.inApp.map(args=>args[0]),['creator','manager','director','other-site']);
  assert.ok(api.templates.every(message=>message.purpose==='dailyUpdate'));
  assert.equal(api.history.length,siteUserLogins.length);
});

test('dailyUpdate with no site has no audience and mobile manager scope fields never grant cross-site access',async()=>{
  const api=harness();
  for(const site of ['', 'Unknown site']){
    assert.deepEqual(await api.genericWhatsAppAlertLogins(api.client,siteUserLogins,{purpose:'dailyUpdate',site}),[]);
  }
  assert.deepEqual(await api.genericWhatsAppAlertLogins(api.client,['creator'],{purpose:'dailyUpdate',site:'Majri OB'}),['other-site']);
});

test('duplicate-login exclusions in generic routing and the sender are independent of row order and casing',async()=>{
  for(const purpose of ['ticketCreated','ticketResolved','dailyUpdate'])for(const reverse of [false,true]){
    const users=fixtureUsers();if(reverse)users.reverse();
    const api=harness({users}),selected=['duplicate-mobile',' DUPLICATE-ADMIN ',...reportsOnlyLogins,...adminLogins];
    const audience=await api.genericWhatsAppAlertLogins(api.client,selected,{purpose,site:'Sasti OB'});
    assert.ok(!audience.includes('duplicate-mobile')&&!audience.includes('duplicate-admin'));
    const result=await api.sendWhatsAppNotifications(api.client,selected,'REF/1','Message',{templateKey:purpose,parameters:[]},{site:'Sasti OB'});
    assert.deepEqual(api.sentLogins(),[]);
    assert.deepEqual(result,[]);
    assert.equal(api.history.length,0);
  }
});

test('the sender rechecks reports-only records introduced after generic audience selection',async()=>{
  const api=harness({beforeRecipientLookup:users=>users.push(admin(' CREATOR ','Admin',{designation:'Director',phone:'9009999999'}))});
  const audience=await api.genericWhatsAppAlertLogins(api.client,['creator'],{purpose:'ticketCreated',site:'Sasti OB'});
  assert.ok(audience.includes('creator'));
  const result=await api.sendWhatsAppNotifications(api.client,audience,'TIC/1','Created',{templateKey:'ticketCreated',parameters:[]});
  assert.deepEqual(api.sentLogins(),[]);
  assert.ok(!result.some(item=>item.login==='creator'));
});

test('legacy request template calls exclude all leadership job titles',async()=>{
  const api=harness();
  await api.sendWhatsAppNotifications(api.client,['super','admin','director','manager'],'REQ/1','Opened',{templateKey:'requestOpened',parameters:[]});
  assert.deepEqual(api.sentLogins(),[]);
});

for(const purpose of ['ticketCreated','ticketResolved','dailyUpdate']){
  test(`${purpose}: master, purpose and quiet-hour pauses stop the sender and keep in-app notifications`,async()=>{
    for(const pause of ['master','purpose','quietHours']){
      const api=harness({now:new Date('2026-09-15T23:00:00+05:30')});
      if(pause==='master')api.settings.enabled=false;
      if(pause==='purpose')api.settings.channels[purpose]=false;
      if(pause==='quietHours')api.settings.quietHours.enabled=true;
      const result=await api.sendWhatsAppNotifications(api.client,['creator','super'],'REF/1','Message',{templateKey:purpose,parameters:[]});
      assert.deepEqual(result,[{login:'creator',status:'Skipped - paused by Report settings'},{login:'super',status:'Skipped - paused by Report settings'}]);
      assert.equal(api.queries.length,0);
      if(purpose==='dailyUpdate'){
        await api.addTicketNotifications(api.client,['creator','manager'],'REF/1','Message',{templateKey:purpose,parameters:[]},{site:'Sasti OB'});
        assert.deepEqual(api.inApp.map(args=>args[0]),['creator','manager']);
      }else{
        const route=await notifyFromTicketRoute(api,purpose);
        assert.deepEqual(api.inApp.map(args=>args[0]),purpose==='ticketCreated'?['admin','director','manager','multi-manager']:['creator','manager','multi-manager']);
        assert.deepEqual(route.timeline.slice(-3),['commit','response','whatsapp']);
      }
      assert.equal(api.templateAttempts.length,0);
      assert.equal(api.texts.length,0);
      assert.equal(api.history.length,0);
    }
  });
}

test('pausing one generic purpose leaves the other generic purposes active for operational users',async()=>{
  for(const paused of ['ticketCreated','ticketResolved','dailyUpdate']){
    const api=harness();api.settings.channels[paused]=false;
    for(const purpose of ['ticketCreated','ticketResolved','dailyUpdate']){
      await api.sendWhatsAppNotifications(api.client,['creator'],'REF/1','Message',{templateKey:purpose,parameters:[]});
    }
    assert.deepEqual(api.templates.map(message=>message.purpose),['ticketCreated','ticketResolved','dailyUpdate'].filter(purpose=>purpose!==paused));
  }
});

test('the postcommit best-effort wrapper contains a recipient lookup failure without affecting the saved ticket response',async()=>{
  for(const purpose of ['ticketCreated','ticketResolved']){
    const api=harness({beforeRecipientLookup:()=>{throw new Error('Recipient lookup failed');}});
    const route=await notifyFromTicketRoute(api,purpose);
    assert.equal(route.responses[0].reference,'TIC/1');
    assert.deepEqual(await Promise.all(route.pending),[[]]);
    assert.equal(api.templateAttempts.length,0);
    assert.equal(api.texts.length,0);
    assert.equal(api.errors.length,1);
    assert.match(api.errors[0][0],/Saved TIC\/1, but WhatsApp follow-up failed/);
    assert.equal(api.errors[0][1],'Recipient lookup failed');
    assert.deepEqual(route.timeline.slice(-3),['commit','response','whatsapp']);
  }
});

test('whatsapp:false writes only the original in-app audience without looking up or sending WhatsApp recipients',async()=>{
  const api=harness();
  await api.addTicketNotifications(api.client,[' CREATOR ','manager','creator',''],'TIC/1','In-app only',{templateKey:'ticketCreated',parameters:[]},{whatsapp:false,whatsappRecipients:['super'],site:'Sasti OB'});
  assert.deepEqual(api.inApp,[['creator','TIC/1','In-app only'],['manager','TIC/1','In-app only']]);
  assert.equal(api.queries.length,2);
  assert.equal(api.templateAttempts.length,0);
});

test('workflow routing bypasses generic expansion and rechecks the saved event roles at the specified site',async()=>{
  const api=harness();api.settings.events.opened.recipientRoles=['maintenanceSupervisor'];
  await api.addTicketNotifications(api.client,['creator','manager'],'REQ/1','Opened',{templateKey:'requestOpened',parameters:[]},
    {workflowType:'opened',site:'Sasti OB',whatsappRecipients:['maintenance','super','other-site','manager']});
  assert.deepEqual(api.sentLogins(),['maintenance']);
  assert.deepEqual(api.inApp.map(args=>args[0]),['creator','manager']);
  const lookups=api.queries.filter(({sql})=>sql.includes('FROM master_records'));
  assert.equal(lookups.length,1);
  assert.ok(lookups[0].sql.includes('ANY($1::text[])'));
});

test('an explicit purpose overrides the template purpose and remains attached to text fallback',async()=>{
  const api=harness({templateError:new Error('Template unavailable')});
  api.settings.channels.ticketCreated=false;
  await api.sendWhatsAppNotifications(api.client,['creator'],'TIC/1','Resolved',{templateKey:'ticketCreated',parameters:['TIC/1','Creator']},{purpose:'ticketResolved'});
  assert.equal(api.templateAttempts.length,1);
  assert.equal(api.templateAttempts[0].purpose,'ticketResolved');
  assert.equal(api.texts.length,1);
  assert.equal(api.texts[0].purpose,'ticketResolved');
  assert.equal(api.history[0][5],'Sent');
});

test('provider policy pauses never trigger a text fallback and are recorded as skipped',async()=>{
  const api=harness({templateError:Object.assign(new Error('Delivery paused'),{code:'WHATSAPP_POLICY_PAUSED'})});
  const result=await api.sendWhatsAppNotifications(api.client,['creator'],'TIC/1','Created',{templateKey:'ticketCreated',parameters:[]});
  assert.equal(api.templateAttempts.length,1);
  assert.equal(api.texts.length,0);
  assert.deepEqual(result,[{login:'creator',status:'Skipped - Delivery paused'}]);
  assert.equal(api.history[0][5],'Skipped - Delivery paused');
});

test('missing phones are audited only for eligible existing logins and duplicate contacts send once',async()=>{
  const users=fixtureUsers();users.find(user=>user.login==='admin').phone='';
  const api=harness({users});
  const result=await api.sendWhatsAppNotifications(api.client,['admin','creator',' CREATOR ','missing','director','duplicate-mobile'],'TIC/1','Created',{templateKey:'ticketCreated',parameters:[]});
  assert.deepEqual(result,[{login:'creator',status:'Sent'}]);
  assert.deepEqual(api.sentLogins(),['creator']);
  assert.equal(api.history.length,1);
  assert.equal(api.history[0][3],'creator');
  assert.equal(api.history[0][5],'Sent');
});
