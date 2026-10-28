import test from 'node:test';
import assert from 'node:assert/strict';
import {siteFleetPlans,createSiteFleetTelegramDelivery} from '../telegram-site-fleet-delivery.mjs';
import {defaultHierarchyReportScheduleSettings} from '../hierarchy-report-flow.mjs';
import {TELEGRAM_SITES} from '../telegram-site-groups.mjs';
import {telegramPurposeEnabled,sendTelegramText,sendTelegramDocument} from '../telegram.mjs';
import {normalizeWhatsAppReportSettings} from '../whatsapp-report-settings.mjs';

const now=new Date('2026-10-28T19:05:00+05:30');
const user={login:'manishchadda',employee:'MANISH CHADDA',userType:'Super Admin',adminLevel:'Manager',managerRole:'Production Manager',managerRegion:'WCL | NCL',managerSites:TELEGRAM_SITES.join(' | '),site:TELEGRAM_SITES.join(' | ')};
const plans=users=>siteFleetPlans({users,scheduleSettings:defaultHierarchyReportScheduleSettings(),now});

test('saved manager timetable produces all eight scoped group plans including Lalpeth; duplicate recipients do not duplicate reports',()=>{
  const one=plans([user]);
  assert.equal(one.length,8);
  assert.deepEqual(new Set(one.map(row=>row.site)),new Set(TELEGRAM_SITES));
  assert.deepEqual(plans([user,{...user,login:'another-manager'}]),one);
  assert.equal(plans([user]).every(plan=>plan.reports.length>0),true);
  assert.equal(siteFleetPlans({users:[user],scheduleSettings:defaultHierarchyReportScheduleSettings(),now:new Date('2026-10-28T04:00:00+05:30')}).length,0);
});

test('narrow assignments cannot publish other sites; disabled timetable produces no delivery',()=>{
  const rows=plans([{...user,managerRegion:'WCL',managerSites:'Majri OC',site:'Majri OC'}]);
  assert.deepEqual(rows.map(row=>row.site),['Majri OC']);
  const settings=defaultHierarchyReportScheduleSettings();
  Object.values(settings.designations).forEach(role=>role.schedules.forEach(schedule=>schedule.enabled=false));
  assert.equal(siteFleetPlans({users:[user],scheduleSettings:settings,now}).length,0);
});

test('group fleet purpose rejects private/invalid destinations and retains global/channel pauses',async()=>{
  const env={TELEGRAM_BOT_TOKEN:'test',TELEGRAM_DEFAULT_CHAT_ID:'-100'};
  const settings=normalizeWhatsAppReportSettings(),calls=[];
  const fetchImpl=async(url,options)=>{calls.push(options);return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:1}})};};
  for(const chatId of ['42','0','bad',''])assert.equal(telegramPurposeEnabled(settings,'siteFleetReport',now,chatId),false);
  assert.equal(telegramPurposeEnabled(settings,'siteFleetReport',now,'-100'),true);
  assert.equal(telegramPurposeEnabled({...settings,enabled:false},'siteFleetReport',now,'-100'),true);
  assert.equal(telegramPurposeEnabled({...settings,channels:{...settings.channels,hierarchyReports:false}},'siteFleetReport',now,'-100'),false);
  await assert.rejects(sendTelegramText({chatId:'42',purpose:'siteFleetReport',message:'fleet'},{env,fetchImpl}),{code:'TELEGRAM_POLICY_PAUSED'});
  await assert.rejects(sendTelegramDocument({chatId:'42',purpose:'siteFleetReport',buffer:Buffer.from('pdf')},{env,fetchImpl}),{code:'TELEGRAM_POLICY_PAUSED'});
  await assert.rejects(sendTelegramText({chatId:'-100',purpose:'siteFleetReport',message:'fleet'},{env:{...env,TELEGRAM_DELIVERY_PAUSED:'true'},fetchImpl}),{code:'TELEGRAM_POLICY_PAUSED'});
  await assert.rejects(sendTelegramText({chatId:'42',purpose:'consolidatedRequestReport',message:'fleet'},{env,fetchImpl}),{code:'TELEGRAM_POLICY_PAUSED'});
  await sendTelegramText({chatId:'-100',purpose:'siteFleetReport',message:'fleet',settings},{env,fetchImpl});
  assert.equal(calls.length,1);
});

function harness({groups=TELEGRAM_SITES.map((site,i)=>({site,chatId:String(-100-i)})),sendText=async()=>({sent:true})}={}){
  const claims=new Map(),sent=[],published=[],updates=[];
  let currentPlans=plans([user]);
  const pool={query:async(sql,args)=>{
    if(sql.startsWith('INSERT')){
      const key=args.join('|');if(claims.has(key))return {rowCount:0,rows:[]};
      const id=claims.size+1;claims.set(key,id);return {rowCount:1,rows:[{id}]};
    }
    updates.push({sql,args});return {rowCount:1,rows:[]};
  }};
  const deliver=createSiteFleetTelegramDelivery({pool,loadPlans:async()=>currentPlans,loadGroups:async()=>groups,loadSettings:async()=>({}),allowed:()=>true,
    checkGroup:async()=>{},loadSource:async()=>({requests:[]}),publish:async plan=>{published.push(plan);return {message:plan.site};},
    sendText:async args=>{sent.push(args);return sendText(args);}});
  return {deliver,sent,published,updates,setPlans:value=>{currentPlans=value;}};
}

test('eight groups receive site-only bundles once, with no private fallbacks and per-title durable claims',async()=>{
  const h=harness();
  assert.equal((await h.deliver(now)).sent,8);
  assert.equal(h.sent.length,8);
  h.sent.forEach((message,i)=>{assert.equal(message.chatId,String(-100-i));assert.equal(message.message,TELEGRAM_SITES[i]);assert.equal(message.purpose,'siteFleetReport');});
  assert.equal((await h.deliver(now)).sent,0);
  // A newly contributed title sends only that addition, not the original titles.
  const plan=plans([user])[0];h.setPlans([{...plan,reports:[...plan.reports,'Added report']}]);
  assert.equal((await h.deliver(now)).sent,1);
  assert.deepEqual(h.published.at(-1).reportTitles,['Added report']);
});

test('missing, private and ambiguous mappings never fall back; uncertain sends are not retried',async()=>{
  const h=harness({groups:[{site:TELEGRAM_SITES[0],chatId:'42'},{site:TELEGRAM_SITES[1],chatId:'-1'},{site:TELEGRAM_SITES[1],chatId:'-2'}]});
  assert.equal((await h.deliver(now)).failed,8);assert.equal(h.sent.length,0);
  const failed=harness({sendText:async()=>{throw new Error('response interrupted');}});
  assert.equal((await failed.deliver(now)).failed,8);
  assert.equal((await failed.deliver(now)).sent,0);
  assert.equal(failed.sent.length,8);
  assert.ok(failed.updates.every(row=>row.sql.includes('Failed - review Telegram')));
});
