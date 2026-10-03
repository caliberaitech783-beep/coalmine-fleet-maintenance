import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {telegramInvitationBatch,telegramInvitationSummary} from '../telegram-site-invitations.mjs';
import {telegramSiteName,telegramUserHasSite} from '../telegram-site-groups.mjs';

function harness(ids){
  const records=new Map(),sent=[];
  const options={chatIds:ids,read:async()=>new Map(records),claim:async id=>{
    if(records.has(id))return false;
    records.set(id,'Sending');return true;
  },send:async id=>{sent.push(id);return 'Invited'},finish:async(id,status)=>{records.set(id,status)}};
  return {records,sent,options};
}
test('large site invitations use bounded batches and never repeat recorded recipients',async()=>{
  const api=harness(['1','2','3','4','5','6','7','1']);
  assert.deepEqual(await telegramInvitationBatch(api.options),{invited:5,alreadyMember:0,failed:0,uncertain:0,pending:2});
  assert.equal(api.sent.length,5);
  assert.equal((await telegramInvitationBatch(api.options)).pending,0);
  await telegramInvitationBatch(api.options);
  assert.deepEqual(api.sent,['1','2','3','4','5','6','7']);
});
test('concurrent batches atomically claim recipients before sending',async()=>{
  const api=harness(['1','2','3']);
  await Promise.all([telegramInvitationBatch(api.options),telegramInvitationBatch(api.options)]);
  assert.equal(api.sent.length,3);assert.equal(new Set(api.sent).size,3);
});
test('explicit rejections and uncertain deliveries stay visible and are never retried',async()=>{
  const api=harness(['1','2','3','4']);api.records.set('4','Sending');
  api.options.send=async id=>{
    api.sent.push(id);
    if(id==='1')throw Object.assign(new Error('blocked'),{status:403});
    if(id==='2')throw new Error('connection lost');
    return 'Already in the group';
  };
  assert.deepEqual(await telegramInvitationBatch(api.options),{invited:0,alreadyMember:1,failed:1,uncertain:2,pending:0});
  await telegramInvitationBatch(api.options);assert.equal(api.sent.length,3);
});
test('failed result persistence leaves an uncertain claim rather than resending',async()=>{
  const api=harness(['1']);api.options.finish=async()=>{throw new Error('DB unavailable')};
  await assert.rejects(telegramInvitationBatch(api.options),/DB unavailable/);
  assert.equal((await telegramInvitationBatch(api.options)).uncertain,1);
  assert.deepEqual(api.sent,['1']);
});
test('summaries include only current assigned users and deduplicate chat ids',()=>{
  assert.deepEqual(telegramInvitationSummary(['1','1','2'],new Map([['1','Invited'],['3','Failed']])),
    {invited:1,alreadyMember:0,failed:0,uncertain:0,pending:1});
});
test('actual invitation endpoint retains administrator guards and only sends to assigned site users',async()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const snippet=source.slice(source.indexOf("app.post('/api/telegram/site-groups/invite',"),source.indexOf("app.post('/api/telegram/site-groups/test',"));
  const records=new Map(),sent=[];let handler;const guards=[()=>{},()=>{}];
  const bindings={app:{post:(path,...functions)=>{
    assert.equal(path,'/api/telegram/site-groups/invite');assert.deepEqual(functions.slice(0,2),guards);handler=functions.at(-1);
  }},requireSuper:guards[0],requireWhatsAppAdministrator:guards[1],telegramSiteName,telegramUserHasSite,telegramInvitationBatch,
  telegramSiteGroups:async()=>[{site:'Sasti OC',chatId:'-100'}],telegramSiteGroupDetails:async()=>{},
  telegramLinkedSiteUsers:async()=>[
    ...Array.from({length:7},(_,i)=>({chatId:String(i+1),user:{site:'Sasti OC'}})),
    {chatId:'999',user:{site:'Majri OC'}},{chatId:'998',user:{adminLevel:'Admin',managerRegion:'All'}},
  ],telegramInvitationRecords:async()=>new Map([['-100',new Map(records)]]),
  inviteUserToTelegramSite:async(group,id)=>{assert.equal(group.chatId,'-100');sent.push(id);return 'Invited'},
  pool:{query:async(sql,params)=>{
    const id=params[0].split(':').at(-1);
    if(sql.startsWith('INSERT')){
      assert.match(sql,/ON CONFLICT \(setting_key\) DO NOTHING/);
      if(records.has(id))return {rowCount:0};records.set(id,'Sending');return {rowCount:1};
    }
    assert.match(sql,/UPDATE app_settings/);records.set(id,JSON.parse(params[1]).status);return {rowCount:1};
  }}};
  new Function(...Object.keys(bindings),snippet)(...Object.values(bindings));
  const run=async site=>{let body,status=200;await handler({body:{site}},{status(code){status=code;return this},json(value){body=value}},error=>{throw error});return {body,status}};
  assert.equal((await run('Sasti OC')).body.pending,2);
  assert.equal((await run('Sasti OC')).body.invited,7);
  await run('Sasti OC');assert.equal(sent.length,7);
  assert.equal((await run('Majri OC')).status,409);assert.equal(sent.length,7);
});
