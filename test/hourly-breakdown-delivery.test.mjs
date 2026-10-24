import test from 'node:test';
import assert from 'node:assert/strict';
import {hourlyTelegramSlots,createHourlyTelegramDelivery} from '../hourly-breakdown-delivery.mjs';
const shift=(site='Majri OC',startTime='05:00:00')=>({site,shiftName:'Shift A',startTime,endTime:'13:00:00',status:'Active'});
test('first slot follows two full hours and last slot stops at midnight IST',()=>{
 assert.equal(hourlyTelegramSlots([shift()],'2026-10-25T05:00:00+05:30').length,0);
 assert.equal(hourlyTelegramSlots([shift()],'2026-10-25T07:00:00+05:30').length,1);
 assert.equal(hourlyTelegramSlots([shift()],'2026-10-25T23:00:00+05:30').length,1);
 assert.equal(hourlyTelegramSlots([shift()],'2026-10-26T01:00:00+05:30').length,0);
 assert.equal(hourlyTelegramSlots([shift('Jayant OC','04:00:00')],'2026-10-26T00:00:00+05:30')[0].cutoff.toISOString(),'2026-10-25T18:30:00.000Z');
});
test('ten minute grace, effective dates, duplicate shifts and closed site fail safely',()=>{
 assert.equal(hourlyTelegramSlots([shift()],'2026-10-25T07:09:59+05:30').length,1);
 assert.equal(hourlyTelegramSlots([shift()],'2026-10-25T07:10:00+05:30').length,0);
 assert.equal(hourlyTelegramSlots([shift(),shift()],'2026-10-25T07:00:00+05:30').length,0);
 assert.equal(hourlyTelegramSlots([{...shift(),effectiveFrom:'2026-10-26'}],'2026-10-25T07:00:00+05:30').length,0);
 assert.equal(hourlyTelegramSlots([shift('Lalpeth OC')],'2026-10-25T07:00:00+05:30').length,0);
});
function harness(sendDocument=async()=>({sent:true})){
 const claims=new Set(),updates=[],sent=[];
 const pool={query:async(sql,args)=>{
  if(sql.includes("master_name='Shift Master'"))return {rows:[{record_data:shift()}]};
  if(sql.startsWith('INSERT')){const key=args.join('|');if(claims.has(key))return {rows:[],rowCount:0};claims.add(key);return {rows:[{id:claims.size}],rowCount:1};}
  updates.push(sql);return {rows:[],rowCount:1};
 }};
 const deliver=createHourlyTelegramDelivery({pool,loadRecipients:async()=>[
 {login:'pm',chatId:'123',sites:['Majri OC']},{login:'same-chat',chatId:'123',sites:null},
 {login:'other-site',chatId:'456',sites:['Sasti OC']},{login:'unassigned',chatId:'789',sites:[]},
 {login:'group',chatId:'-123',sites:null}],loadSource:async()=>({requests:[],equipmentRecords:[]}),buildPdf:async()=>Buffer.from('pdf'),sendDocument:async args=>{sent.push(args);return sendDocument(args);}});
 return {deliver,updates,sent};
}
test('site scope, private chats and durable claims prevent duplicate delivery',async()=>{
 const h=harness();assert.deepEqual(await h.deliver('2026-10-25T07:00:00+05:30'),{sent:1,failed:0});
 await h.deliver('2026-10-25T07:01:00+05:30');assert.equal(h.sent.length,1);
 assert.equal(h.sent[0].chatId,'123');assert.match(h.sent[0].filename,/\.pdf$/);
 assert.match(h.sent[0].caption,/Majri OC/);assert.match(h.updates[0],/Sent by Telegram/);
});
test('ambiguous failure is recorded and is not blindly retried',async()=>{
 const h=harness(async()=>{throw Error('timeout')});
 assert.deepEqual(await h.deliver('2026-10-25T07:00:00+05:30'),{sent:0,failed:1});
 await h.deliver('2026-10-25T07:01:00+05:30');assert.equal(h.sent.length,1);assert.match(h.updates[0],/Failed - review/);
});
