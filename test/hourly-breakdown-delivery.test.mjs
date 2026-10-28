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
test('ten minute grace, effective dates and duplicate shifts fail safely; Lalpeth participates',()=>{
 assert.equal(hourlyTelegramSlots([shift()],'2026-10-25T07:09:59+05:30').length,1);
 assert.equal(hourlyTelegramSlots([shift()],'2026-10-25T07:10:00+05:30').length,0);
 assert.equal(hourlyTelegramSlots([shift(),shift()],'2026-10-25T07:00:00+05:30').length,0);
 assert.equal(hourlyTelegramSlots([{...shift(),effectiveFrom:'2026-10-26'}],'2026-10-25T07:00:00+05:30').length,0);
 assert.equal(hourlyTelegramSlots([shift('Lalpeth OC')],'2026-10-25T07:00:00+05:30').length,1);
});
function harness(sendDocument=async()=>({sent:true}),groups=[{site:'Majri OC',chatId:'-123'},{site:'Majri OC',chatId:'-123'},{site:'Sasti OC',chatId:'-456'},{site:'Majri OC',chatId:'789'}]){
 const claims=new Set(),updates=[],sent=[];
 const pool={query:async(sql,args)=>{
  if(sql.includes("master_name='Shift Master'"))return {rows:[{record_data:shift()}]};
  if(sql.startsWith('INSERT')){const key=args.join('|');if(claims.has(key))return {rows:[],rowCount:0};claims.add(key);return {rows:[{id:claims.size}],rowCount:1};}
  updates.push(sql);return {rows:[],rowCount:1};
 }};
 const deliver=createHourlyTelegramDelivery({pool,loadGroups:async()=>groups,loadSource:async()=>({requests:[],equipmentRecords:[]}),buildPdf:async()=>Buffer.from('pdf'),sendDocument:async args=>{sent.push(args);return sendDocument(args);}});
 return {deliver,updates,sent};
}
test('only the matching site group receives the PDF and durable claims prevent duplicate delivery',async()=>{
 const h=harness();assert.deepEqual(await h.deliver('2026-10-25T07:00:00+05:30'),{sent:1,failed:0});
 await h.deliver('2026-10-25T07:01:00+05:30');assert.equal(h.sent.length,1);
 assert.equal(h.sent[0].chatId,'-123');assert.match(h.sent[0].filename,/\.pdf$/);
 assert.match(h.sent[0].caption,/Majri OC/);assert.match(h.updates[0],/Sent by Telegram/);
});
test('missing, private and ambiguous mappings never fall back to a personal or central chat',async()=>{
 for(const groups of [[],[{site:'Sasti OC',chatId:'-123'}],[{site:'Majri OC',chatId:'123'}],[{site:'Majri OC',chatId:'-1'},{site:'Majri OC',chatId:'-2'}]]){
  const h=harness(undefined,groups);assert.deepEqual(await h.deliver('2026-10-25T07:00:00+05:30'),{sent:0,failed:1});assert.equal(h.sent.length,0);
 }
});
test('ambiguous failure is recorded and is not blindly retried',async()=>{
 const h=harness(async()=>{throw Error('timeout')});
 assert.deepEqual(await h.deliver('2026-10-25T07:00:00+05:30'),{sent:0,failed:1});
 await h.deliver('2026-10-25T07:01:00+05:30');assert.equal(h.sent.length,1);assert.match(h.updates[0],/Failed - review/);
});
test('simultaneous site slots deliver different PDFs to their own groups without mixing records',async()=>{
 const sent=[];let id=0;
 const pool={query:async sql=>sql.includes("master_name='Shift Master'")?{rows:[{record_data:shift('Majri OC')},{record_data:shift('Sasti OC')}]}:sql.startsWith('INSERT')?{rowCount:1,rows:[{id:++id}]}:{rowCount:1,rows:[]}};
 const deliver=createHourlyTelegramDelivery({pool,loadGroups:async()=>[{site:'Majri OC',chatId:'-101'},{site:'Sasti OC',chatId:'-202'}],
  loadSource:async()=>({equipmentRecords:[],requests:[{ref:'M1',site:'Majri OC',start:'2026-10-25T06:00:00+05:30',complaint:'MAJRI-ONLY'},{ref:'S1',site:'Sasti OC',start:'2026-10-25T06:00:00+05:30',complaint:'SASTI-ONLY'}]}),
  buildPdf:async report=>Buffer.from(JSON.stringify(report.rows)),sendDocument:async input=>{sent.push(input);return {sent:true};}});
 assert.deepEqual(await deliver('2026-10-25T07:00:00+05:30'),{sent:2,failed:0});
 for(const [chat,own,other] of [['-101','MAJRI-ONLY','SASTI-ONLY'],['-202','SASTI-ONLY','MAJRI-ONLY']]){
  const report=sent.find(row=>row.chatId===chat);assert.ok(report);assert.ok(report.buffer.toString().includes(own));assert.ok(!report.buffer.toString().includes(other));
 }
});
