import test from 'node:test';
import assert from 'node:assert/strict';
import {TELEGRAM_SITE_CAMPAIGN,TELEGRAM_SITE_RESEND_CAMPAIGN,telegramSiteCampaignId,telegramSiteExport,telegramCampaignRecipients,telegramCampaignMessage,telegramCampaignBatch} from '../telegram-site-campaign.mjs';
const groups=[{site:'Jayant OC',inviteLink:'https://t.me/+jayant'},{site:'Sasti OC',inviteLink:'https://t.me/+sasti'}];
const users=[{login:'worker',chatId:'1',user:{employee:'Worker',designation:'Mechanic',site:'Jayant OC | Sasti OC'}},{login:'manager',chatId:'2',user:{employee:'Manager',region:'NCL'}}];
test('export preserves explicit multi-site assignments, designation, and unassigned review rows',()=>{
  const rows=telegramSiteExport(users,groups);assert.equal(rows.length,3);
  assert.equal(rows.find(row=>row.site==='Jayant OC').designation,'Mechanic');
  assert.equal(rows.find(row=>row.login==='manager').invitationLink,'');
});
test('one message per account, no region widening, consolidated assigned links',()=>{
  const recipients=telegramCampaignRecipients([...users,users[0]],groups);assert.equal(recipients.length,1);assert.equal(recipients[0].links.length,2);
  const message=telegramCampaignMessage(recipients[0]);assert.match(message,/jayant/);assert.match(message,/sasti/);
});
test('durable claims stop duplicate and uncertain sends and expose safe outcomes',async()=>{
  const recipients=telegramCampaignRecipients(users,groups),records=new Map();let sends=0;
  const options={recipients,read:async()=>records,claim:async value=>{if(records.has(value.chatId))return false;records.set(value.chatId,{status:'Sending'});return true},send:async()=>{sends++;throw new Error('secret token and numeric chat id')},finish:async(value,result)=>records.set(value.chatId,result)};
  await Promise.all([telegramCampaignBatch(options),telegramCampaignBatch(options)]);
  const result=await telegramCampaignBatch(options);assert.equal(sends,1);assert.equal(result.uncertain,1);assert.equal(result.pending,0);assert.doesNotMatch(JSON.stringify(result),/secret token|chatId/);
});
test('definitive Telegram rejection is failed and never automatically retried',async()=>{
  const recipients=telegramCampaignRecipients(users,groups),records=new Map();let sends=0;
  const options={recipients,read:async()=>records,claim:async value=>{records.set(value.chatId,{status:'Sending'});return true},send:async()=>{sends++;throw Object.assign(new Error('blocked'),{status:403})},finish:async(value,result)=>records.set(value.chatId,result)};
  assert.equal((await telegramCampaignBatch(options)).failed,1);await telegramCampaignBatch(options);assert.equal(sends,1);
});
test('only the original and explicitly requested resend identities are accepted',()=>{
  assert.equal(telegramSiteCampaignId(undefined),TELEGRAM_SITE_CAMPAIGN);
  assert.equal(telegramSiteCampaignId(TELEGRAM_SITE_RESEND_CAMPAIGN),TELEGRAM_SITE_RESEND_CAMPAIGN);
  for(const value of ['',null,{},'new-id',`${TELEGRAM_SITE_RESEND_CAMPAIGN}:arbitrary`])assert.equal(telegramSiteCampaignId(value),'');
});
test('requested resend has separate durable claims, preserves original outcomes, and sends exactly once',async()=>{
  const recipients=['Sent','Failed','Uncertain'].map((status,index)=>({chatId:String(index+1),login:`user${index}`,name:`User ${index}`,links:[{site:'Sasti OC',invitationLink:'https://t.me/+sasti'}]}));
  const original=new Map(recipients.map((user,index)=>[user.chatId,{status:['Sent','Failed','Uncertain'][index]}])),savedOriginal=JSON.stringify([...original]);
  const resend=new Map(),sent=[];
  const options={campaign:TELEGRAM_SITE_RESEND_CAMPAIGN,recipients,read:async()=>resend,
    claim:async user=>{if(resend.has(user.chatId))return false;resend.set(user.chatId,{status:'Sending'});return true},
    send:async user=>{sent.push(user.login)},finish:async(user,value)=>resend.set(user.chatId,value)};
  await Promise.all([telegramCampaignBatch(options),telegramCampaignBatch(options)]);
  const result=await telegramCampaignBatch(options);
  assert.equal(result.campaign,TELEGRAM_SITE_RESEND_CAMPAIGN);assert.equal(result.sent,3);assert.equal(result.pending,0);assert.equal(sent.length,3);
  assert.equal(JSON.stringify([...original]),savedOriginal);
});
