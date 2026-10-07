import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TELEGRAM_SITES,telegramSiteName,telegramUserHasSite,normalizeTelegramSiteGroups} from '../telegram-site-groups.mjs';
import {parseTelegramUpdate,telegramSiteGroupDetails,createTelegramJoinRequestLink} from '../telegram.mjs';

test('site groups use all eight sites and recognize legacy and short labels',()=>{
  assert.equal(TELEGRAM_SITES.length,8);
  assert.equal(telegramSiteName('Dhoptala OC'),'Dhoptala OC (2nd)');
  assert.equal(telegramSiteName('Gauri Pauni OB'),'Gauri Pauni OC (2nd)');
  assert.equal(telegramSiteName('Jayant OB 2nd'),'Jayant OC');
  assert.equal(telegramSiteName('unknown'),'');
});
test('site eligibility uses explicit current assignments without widening by role or region',()=>{
  const user={site:'Dudhichua OC | Dudhichua East OC',managerRegion:'All'};
  assert.equal(telegramUserHasSite(user,'Dudhichua OC'),true);
  assert.equal(telegramUserHasSite(user,'Dudhichua East OC'),true);
  assert.equal(telegramUserHasSite(user,'Jayant OC'),false);
  assert.equal(telegramUserHasSite({adminLevel:'Super Admin',managerRegion:'All'},'Sasti OC'),false);
  assert.equal(telegramUserHasSite({location:'Sasti OB'},'Sasti OC'),true);
  assert.equal(telegramUserHasSite({site:'--'},'Sasti OC'),false);
  assert.equal(telegramUserHasSite({site:'Jayant OC'},'unknown'),false);
});
test('group mappings reject private chats, unknown sites and duplicate site/chat bindings',()=>{
  assert.deepEqual(normalizeTelegramSiteGroups([
    {site:'Sasti OB',chatId:'-123',title:'Caliber Pulse Sasti'},
    {site:'Sasti OC',chatId:'-456'},
    {site:'Majri OC',chatId:'-123'},
    {site:'Majri OC',chatId:'789'},
    {site:'unknown',chatId:'-999'},
    {site:'Jayant OC',chatId:'-100999',inviteLink:'https://t.me/+example'},
  ]),[{site:'Sasti OC',chatId:'-123',title:'Caliber Pulse Sasti',inviteLink:''},
    {site:'Jayant OC',chatId:'-100999',title:'',inviteLink:'https://t.me/+example'}]);
});
test('registration commands preserve multiword site names and reject anonymous messages',()=>{
  const message={chat:{type:'supergroup',id:-100},from:{id:123},text:'/bdms_site@CALIBERBDMSBOT Dudhichua East OC'};
  assert.deepEqual(parseTelegramUpdate({message}),{kind:'registerSite',groupChatId:'-100',userId:'123',site:'Dudhichua East OC'});
  assert.equal(parseTelegramUpdate({message:{...message,sender_chat:{id:-100}}}).kind,'ignored');
  assert.equal(parseTelegramUpdate({message:{...message,chat:{type:'private',id:123}}}).kind,'text');
  assert.equal(parseTelegramUpdate({message:{...message,text:'ordinary conversation'}}).kind,'ignored');
});
const env={TELEGRAM_BOT_TOKEN:'test-token'};
function apiFetch(results,calls=[]){return async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,result:results.shift()})}}}
test('site registration requires a group and bot invitation administrator rights',async()=>{
  await assert.rejects(telegramSiteGroupDetails('-123',{env,fetchImpl:apiFetch([{id:1},{type:'private'}])}),/Choose a Telegram group/);
  await assert.rejects(telegramSiteGroupDetails('-123',{env,fetchImpl:apiFetch([{id:1},{type:'group'},{status:'member'}])}),/administrator/);
  await assert.rejects(telegramSiteGroupDetails('-123',{env,fetchImpl:apiFetch([{id:1},{type:'group'},{status:'administrator',can_invite_users:false}])}),/invite users/);
  assert.deepEqual(await telegramSiteGroupDetails('-123',{env,fetchImpl:apiFetch([{id:1},{type:'supergroup',title:'Sasti'},{status:'administrator',can_invite_users:true}])}),{title:'Sasti'});
});
test('site invitation always requires approval and keeps site label within Telegram limits',async()=>{
  const calls=[];
  assert.equal(await createTelegramJoinRequestLink('-123',{env,name:'Caliber Pulse Gauri Pauni OC (2nd)',fetchImpl:apiFetch([{invite_link:'https://t.me/+example'}],calls)}),'https://t.me/+example');
  assert.equal(calls[0].creates_join_request,true);
  assert.equal(calls[0].chat_id,'-123');
  assert.ok(calls[0].name.length<=32);
});

function webhookHarness(user){
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const snippet=source.slice(source.indexOf("app.post('/api/telegram/webhook',"),source.indexOf('// ---------- C-Dir'));
  let handler;const decisions=[],messages=[],registered=[];
  const bindings={app:{post:(_path,fn)=>{handler=fn}},telegramWebhookSecret:()=> 'secret',parseTelegramUpdate,
    sendTelegramText:async message=>{messages.push(message)},pool:{query:async()=>({rows:user?[{login:'user'}]:[]})},
    bdmsUserRecord:async()=>user,telegramSiteGroups:async()=>[{site:'Sasti OC',chatId:'-100'}],
    telegramGroupSettings:async()=>({chatId:'-999'}),telegramUserHasSite,telegramSiteName,TELEGRAM_SITES,
    answerTelegramJoinRequest:async(...args)=>{decisions.push(args)},appendBackendProcessAudit:async()=>{},
    isBdmsAdministrator:value=>value.adminLevel==='Admin',telegramChatMemberStatus:async()=> 'creator',
    telegramSiteGroupDetails:async()=>({title:'Caliber Pulse Sasti'}),createTelegramJoinRequestLink:async()=> 'invite',
    registerTelegramSiteGroup:async group=>{registered.push(group)},console:{error:()=>{}}};
  new Function(...Object.keys(bindings),snippet)(...Object.values(bindings));
  return {decisions,messages,registered,run:async(body,secret='secret')=>{
    const response={status:null,sendStatus(code){this.status=code}};
    await handler({body,get:()=>secret},response);return response.status;
  }};
}
test('actual webhook admits only connected users assigned to the requested site',async()=>{
  for(const [user,allowed] of [[{site:'Sasti OC'},true],[{site:'Majri OC'},false],[{site:'Sasti OC | Majri OC'},true],[{adminLevel:'Admin'},false],[null,false]]){
    const api=webhookHarness(user);
    assert.equal(await api.run({chat_join_request:{chat:{id:-100},from:{id:123},user_chat_id:123}}),200);
    assert.deepEqual(api.decisions,[['-100','123',allowed]]);
  }
  const api=webhookHarness({site:'Sasti OC'});
  assert.equal(await api.run({chat_join_request:{chat:{id:-100},from:{id:123}}},'wrong-secret'),401);
  assert.equal(api.decisions.length,0);
  await api.run({chat_join_request:{chat:{id:-200},from:{id:123}}});
  assert.equal(api.decisions.length,0);
});
test('actual webhook registers site mappings only for a connected Caliber Pulse administrator',async()=>{
  const message={chat:{type:'group',id:-100},from:{id:123},text:'/bdms_site Sasti OC'};
  const denied=webhookHarness({site:'Sasti OC'});await denied.run({message});
  assert.equal(denied.registered.length,0);
  const allowed=webhookHarness({adminLevel:'Admin'});await allowed.run({message});
  assert.deepEqual(allowed.registered,[{site:'Sasti OC',chatId:'-100',title:'Caliber Pulse Sasti',inviteLink:'invite'}]);
  await allowed.run({message:{...message,chat:{type:'group',id:-999}}});
  assert.equal(allowed.registered.length,1);
});
