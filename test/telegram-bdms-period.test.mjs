import test from 'node:test';
import assert from 'node:assert/strict';
import {bdmsChatConversation as answer} from '../telegram-bdms-conversation.mjs';
import {bdmsResolvePeriod,bdmsPeriodSelection,bdmsRecordDay,bdmsEffectiveReport} from '../telegram-bdms-period.mjs';
const base={session:{role:'super'},today:'2026-10-09',requests:[{ref:'REQ-1',site:'Sasti OC',status:'Open',start:'2026-10-09'},{ref:'REQ-2',site:'Majri OC',status:'Open',start:'2026-10-08'},{ref:'REQ-3',site:'Sasti OC',status:'Closed',start:'2026-10-01',closedAt:'2026-10-09',verifiedAt:'2026-10-08'}]};
test('report menus default to today, show weekday and retain selected period through details',()=>{
 const today=answer({...base,text:'Open breakdowns'});assert.match(today.text,/Friday, 09 Oct 2026/);assert.match(today.text,/Matching requests: 1/);assert.doesNotMatch(today.text,/REQ-2 ·/);
 const yesterday=answer({...base,text:'Yesterday',context:today.context});assert.match(yesterday.text,/Thursday, 08 Oct 2026/);assert.match(yesterday.text,/REQ-2 ·/);
 const selected=answer({...base,text:'REQ-2',context:yesterday.context});
 const detail=answer({...base,text:'Request timeline',context:selected.context});
 const back=answer({...base,text:'Back to results',context:detail.context});assert.match(back.text,/Thursday, 08 Oct 2026/);assert.match(back.text,/REQ-2 ·/);assert.doesNotMatch(back.text,/REQ-1 ·/);
});
test('closures and verifications use their own event dates, with current status labels',()=>{
 assert.match(answer({...base,text:'Closed requests'}).text,/REQ-3 ·/);
 const verified=answer({...base,text:'Verified requests'});assert.match(verified.text,/Matching requests: 0/);
 assert.match(answer({...base,text:'Yesterday',context:verified.context}).text,/REQ-3 ·/);
});
test('custom ranges and day choices are valid and future / reversed dates keep previous context',()=>{
 const report=answer({...base,text:'Open breakdowns'});
 const custom=answer({...base,text:'/period 2026-10-08 2026-10-09',context:report.context});assert.match(custom.text,/Matching requests: 2/);
 for(const text of ['/period 2026-10-09 2026-10-08','/date 2026-02-30','/date 2026-10-10']){const result=answer({...base,text,context:custom.context});assert.deepEqual(result.context.period,custom.context.period);assert.doesNotMatch(result.text,/REQ-1/);}
 assert.deepEqual(bdmsPeriodSelection('Monday',base.today).period,{preset:'custom',from:'2026-10-05',to:'2026-10-05'});
 assert.equal(bdmsPeriodSelection('शुक्रवार',base.today).period.from,'2026-10-09');
 assert.equal(bdmsEffectiveReport('Today',{reportQuery:'Vehicle transfer details'}),'Vehicle transfer details');
});
test('preset Today rolls over with IST midnight; dates normalize timestamps to IST',()=>{
 assert.equal(bdmsResolvePeriod({preset:'today',from:'2026-10-08'},'2026-10-09').from,'2026-10-09');
 assert.deepEqual(bdmsResolvePeriod({preset:'7'},base.today),{preset:'7',from:'2026-10-03',to:'2026-10-09'});
 assert.equal(bdmsRecordDay('2026-10-08T19:00:00Z'),'2026-10-09');assert.equal(bdmsRecordDay('2026-10-08 23:00:00'),'2026-10-08');
});
test('dates filter transfers / support tickets; fleet remains a labelled live snapshot',()=>{
 const transfers=answer({...base,text:'Vehicle transfer details',transfers:[{id:1,source:'Sasti OC',transferDate:'2026-10-09'},{id:2,source:'Majri OC',transferDate:'2026-10-08'}]});assert.match(transfers.text,/Total transfers: 1/);
 const tickets=answer({...base,text:'Ticket close status',tickets:[{reference:'TKT-1',site:'Sasti OC',createdAt:'2026-10-01',resolvedAt:'2026-10-09'}]});assert.match(tickets.text,/TKT-1/);
 const fleet=answer({...base,text:'Vehicle availability',fleetRecords:[{site:'Sasti OC',category:'Vehicle',dashboardRoadStatus:'onroad'}],context:{period:{preset:'custom',from:'2026-10-08',to:'2026-10-08'}}});assert.match(fleet.text,/current live snapshot/);assert.match(fleet.text,/Total vehicles and equipment: 1/);
});
test('chosen periods keep Production ownership restrictions and BD totals follow the active period',()=>{
 const opts={...base,session:{role:'normal',assignedRole:'Production User',login:'prod'},requests:base.requests.map((r,i)=>({...r,requesterLogin:i===1?'other':'prod'}))};
 const reply=answer({...opts,text:'/period 2026-10-01 2026-10-09',context:{reportQuery:'Open breakdowns'}});assert.doesNotMatch(reply.text,/REQ-2/);
 const bd=answer({...base,text:'Total BD today'});assert.match(bd.text,/Total requests: 1/);
 assert.match(answer({...base,text:'Last 7 days',context:bd.context}).text,/Total requests: 2/);
});
