import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMembershipChecker,membershipOnboardingPath,REQUIRED_SITE_LINKS,requiredTelegramSites} from '../telegram-membership.mjs';
import {telegramCampaignRecipients,telegramCampaignBatch} from '../telegram-site-campaign.mjs';

const groups=[{site:'Sasti OC',chatId:'-1'},{site:'Majri OC',chatId:'-2'}];
test('every allocated site needs real membership, including restricted is_member semantics',async()=>{
  for(const [member,joined] of [[{status:'member'},true],[{status:'creator'},true],[{status:'administrator'},true],[{status:'restricted',is_member:true},true],[{status:'restricted',is_member:false},false],[{status:'left'},false],[{status:'kicked'},false]]){
    const check=createMembershipChecker({checkGroup:async()=>{},checkMember:async()=>member});
    const result=await check({user:{site:'Sasti OC | Majri OC'},groups,chatId:'123'});
    assert.equal(result.allowed,joined);assert.equal(result.groups.length,2);
    assert.equal(result.groups[0].inviteLink,REQUIRED_SITE_LINKS['Sasti OC']);
  }
});
test('office accounts require all eight groups; managers follow configured managed sites and regions',async()=>{
  assert.equal(requiredTelegramSites({site:'Nagpur'}).length,8);
  assert.equal(requiredTelegramSites({}).length,8);
  const manager={userType:'Super User',adminLevel:'Manager',managerSites:'Majri OC | Sasti OC',site:'Nagpur'};
  assert.deepEqual(requiredTelegramSites(manager),['Sasti OC','Majri OC']);
  assert.deepEqual(requiredTelegramSites({...manager,managerSites:'',managerRegion:'NCL'}),['Jayant OC','Dudhichua OC','Dudhichua East OC']);
  assert.equal(requiredTelegramSites({...manager,managerSites:'',managerRegion:'All'}).length,8);
  const allGroups=Object.keys(REQUIRED_SITE_LINKS).map((site,index)=>({site,chatId:String(-index-1)}));
  let missing='Jayant OC';
  const check=createMembershipChecker({checkGroup:async()=>{},checkMember:async chatId=>({status:allGroups.find(group=>group.chatId===chatId).site===missing?'left':'member'})});
  const input={user:{site:'Nagpur'},groups:allGroups,chatId:'123',force:true};
  assert.equal((await check(input)).allowed,false);missing='';assert.equal((await check(input)).allowed,true);
});
test('unlinked and unconfigured accounts cannot gain access; roles and exemptions cannot bypass',async()=>{
  const check=createMembershipChecker({checkGroup:async()=>{},checkMember:async()=>({status:'member'})});
  for(const input of [{user:{site:'Sasti OC'},groups},{user:{site:'Nagpur',adminLevel:'Super Admin'},groups,chatId:'123'},{user:{site:'Sasti OC',exempt:true},groups:[],chatId:'123'}])assert.equal((await check(input)).allowed,false);
  const result=await check({user:{site:'Sasti OC | Majri OC'},groups:[groups[0]],chatId:'123'});
  assert.equal(result.allowed,false);assert.equal(result.groups[1].status,'Group not configured');
});
test('temporary failures never fabricate membership and group bot administration is verified',async()=>{
  let checked=0;
  const check=createMembershipChecker({checkGroup:async()=>{throw new Error('Bot not admin');},checkMember:async()=>{checked++;return {status:'member'};}});
  const result=await check({user:{site:'Sasti OC'},groups,chatId:'123'});
  assert.equal(result.allowed,false);assert.equal(result.groups[0].status,'Verification unavailable');assert.equal(checked,0);
});
test('concurrent application requests share one Telegram membership check',async()=>{
  let memberCalls=0,groupCalls=0;
  const check=createMembershipChecker({checkGroup:async()=>{groupCalls++;},checkMember:async()=>{memberCalls++;await new Promise(resolve=>setTimeout(resolve,5));return {status:'member'};}});
  const results=await Promise.all(Array.from({length:20},()=>check({user:{site:'Sasti OC'},groups,chatId:'123'})));
  assert.ok(results.every(result=>result.allowed));assert.equal(memberCalls,1);assert.equal(groupCalls,1);
});
test('verification expires after one minute, manual verification bypasses cache, site and identity changes recheck',async()=>{
  let time=0,calls=0,member=true;
  const check=createMembershipChecker({now:()=>time,checkGroup:async()=>{},checkMember:async()=>{calls++;return {status:member?'member':'left'};}});
  const input={user:{site:'Sasti OC'},groups,chatId:'123'};
  assert.equal((await check(input)).allowed,true);member=false;
  assert.equal((await check(input)).allowed,true);assert.equal(calls,1);
  assert.equal((await check({...input,force:true})).allowed,false);assert.equal(calls,2);
  time=60001;await check(input);assert.equal(calls,3);
  await check({...input,user:{site:'Majri OC'}});assert.equal(calls,4);
  await check({...input,chatId:'456'});assert.equal(calls,5);
});
test('all eight supplied links are exact and only onboarding routes bypass membership',()=>{
  assert.equal(Object.keys(REQUIRED_SITE_LINKS).length,8);
  assert.equal(REQUIRED_SITE_LINKS['Jayant OC'],'https://t.me/+_UoCyKUxIbwyMzE1');
  for(const path of ['/api/telegram/me','/api/telegram/link','/api/logout'])assert.equal(membershipOnboardingPath(path),true);
  for(const path of ['/api/requests','/api/masters','/api/telegram/settings','/api/telegram/me/other'])assert.equal(membershipOnboardingPath(path),false);
});
test('real shared session reader blocks normal and privileged APIs while allowing onboarding and authorized remediation',async()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const snippet=source.slice(source.indexOf('async function readSession(req)'),source.indexOf('\nfunction sessionActivityDetails'));
  for(const session of [{login:'a',role:'normal'},{login:'a',role:'super',permissions:{adminLevel:'Manager'}},{login:'a',role:'super',permissions:{adminLevel:'Super Admin'}}]){
    const read=new Function('sessionStore','membershipOnboardingPath','telegramMembershipFor',`${snippet};return readSession;`)({get:async()=>session},membershipOnboardingPath,async()=>({allowed:false}));
    await assert.rejects(read({headers:{},path:'/api/requests'}),error=>error.status===403&&error.code==='TELEGRAM_MEMBERSHIP_REQUIRED');
    assert.equal(await read({headers:{},path:'/api/telegram/link'}),session);
    if(session.permissions?.adminLevel==='Super Admin')assert.equal(await read({headers:{},path:'/api/telegram/site-groups/membership'}),session);
    else await assert.rejects(read({headers:{},path:'/api/telegram/site-groups/membership'}));
  }
  const serviceSession={login:'MIS_SYNC_SERVICE',role:'super',permissions:{adminLevel:'Super Admin'}};
  const serviceRead=new Function('sessionStore','membershipOnboardingPath','telegramMembershipFor',`${snippet};return readSession;`)({get:async()=>serviceSession},membershipOnboardingPath,async()=>({allowed:false}));
  assert.equal(await serviceRead({headers:{},path:'/api/masters'}),serviceSession);
});
test('expected membership denials return onboarding status without generating repeated error audits',()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const start=source.indexOf('app.use((error,req,res,next)=>{');
  let handler;new Function('app','auditSafeError',source.slice(start,source.indexOf('\n});',start)+4))({use:value=>{handler=value;}},()=>{throw Error('Onboarding was treated as a server error');});
  const req={};let status,body;
  handler({code:'TELEGRAM_MEMBERSHIP_REQUIRED',message:'Join first'},req,{status:value=>{status=value;return {json:value=>{body=value;}};}},()=>{throw Error('Unexpected error logging');});
  assert.equal(status,403);assert.equal(body.code,'TELEGRAM_MEMBERSHIP_REQUIRED');assert.equal(req.audit,false);
});

test('membership report includes never-signed-in accounts and returns bounded progress with missing groups',async()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const start=source.indexOf("app.get('/api/telegram/site-groups/membership',");
  const snippet=source.slice(start,source.indexOf('\n});',start)+4);
  const records=Array.from({length:6},(_,index)=>({record_data:{login:`user${index}`,employee:`User ${index}`,site:index===5?'Majri OC':'Sasti OC'}}));
  let handler;
  const bindings={app:{get:(_path,...handlers)=>{handler=handlers.at(-1);}},requireSuper(){},requireWhatsAppAdministrator(){},
    pool:{query:async sql=>({rows:sql.includes('telegram_user_links')?[{login:'user0',chat_id:'123'}]:records})},
    telegramSiteGroups:async()=>[groups[0]],membershipChecker:createMembershipChecker({checkGroup:async()=>{},checkMember:async()=>({status:'member'})})};
  new Function(...Object.keys(bindings),snippet)(...Object.values(bindings));
  let result;const res={set(){},json(value){result=value;}};
  await handler({query:{}},res,error=>{throw error;});
  assert.equal(result.total,6);assert.equal(result.users.length,5);assert.equal(result.nextOffset,5);
  assert.equal(result.users[0].allowed,true);assert.equal(result.users[1].groups[0].status,'Not connected');
  await handler({query:{offset:'5'}},res,error=>{throw error;});
  assert.equal(result.users.length,1);assert.equal(result.nextOffset,null);assert.equal(result.users[0].allowed,false);
});

test('mandatory background invitations send only allocated links, continue batches, and never repeat claimed deliveries',async()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const start=source.indexOf('let mandatoryInvitationsRunning=false;');
  const snippet=source.slice(start,source.indexOf("const TELEGRAM_REQUIREMENT_SETTING_KEY",start));
  const saved=new Map(),sent=[];
  const bindings={databaseReady:true,telegramConfiguration:()=>({botToken:'test'}),
    telegramLinkedSiteUsers:async()=>Array.from({length:6},(_,index)=>({login:`user${index}`,chatId:String(index+1),user:{site:'Majri OC'}})),
    telegramCampaignRecipients,telegramCampaignBatch,REQUIRED_SITE_LINKS,requiredTelegramSites,
    pool:{query:async(sql,params)=>{
      const key=params[0];
      if(sql.startsWith('SELECT'))return {rows:[...saved].map(([setting_key,setting_value])=>({setting_key,setting_value}))};
      if(sql.startsWith('INSERT')){if(saved.has(key))return {rowCount:0};saved.set(key,{status:'Sending'});return {rowCount:1};}
      saved.set(key,JSON.parse(params[1]));return {rowCount:1};
    }},sendTelegramText:async value=>{sent.push(value);}};
  const run=new Function(...Object.keys(bindings),`${snippet};return sendMandatorySiteInvitations;`)(...Object.values(bindings));
  assert.equal((await run()).sent,5);assert.equal(sent.length,5);
  assert.equal((await run()).sent,6);await run();assert.equal(sent.length,6);
  for(const message of sent){assert.ok(message.message.includes(REQUIRED_SITE_LINKS['Majri OC']));assert.ok(!message.message.includes(REQUIRED_SITE_LINKS['Sasti OC']));}
});
