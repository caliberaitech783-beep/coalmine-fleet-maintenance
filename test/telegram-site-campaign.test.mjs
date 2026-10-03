import test from 'node:test';
import assert from 'node:assert/strict';
import {telegramSiteExport,telegramCampaignRecipients,telegramCampaignMessage,telegramCampaignBatch} from '../telegram-site-campaign.mjs';
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
