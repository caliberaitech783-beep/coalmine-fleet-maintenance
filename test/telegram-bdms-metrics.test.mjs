import test from 'node:test';
import assert from 'node:assert/strict';
import {bdmsChatDateRange,bdmsChatMetricsReply} from '../telegram-bdms-metrics.mjs';
import {bdmsChatConversation} from '../telegram-bdms-conversation.mjs';
test('inclusive calendar periods reject invalid, reversed and future dates',()=>{
 assert.deepEqual(bdmsChatDateRange('Last 7 days','2026-10-08'),{from:'2026-10-02',to:'2026-10-08'});
 for(const text of ['/bd 2026-02-30 2026-10-08','/bd 2026-10-08 2026-10-01','/bd 2026-10-01 2026-10-09'])assert.equal(bdmsChatDateRange(text,'2026-10-08'),null);
});
test('today counts requests separately from vehicles and excludes idle entries',()=>{
 const requests=[{start:'2026-10-08',site:'A',door:'V1',status:'Open'},{start:'2026-10-08',site:'A',door:'V1',status:'Running BD'},{start:'2026-10-08',door:'V2',status:'Closed',vehicleIdle:true},{start:'2026-10-07',door:'V3',status:'Open'}];
 const reply=bdmsChatMetricsReply({text:'Total BD today',today:'2026-10-08',requests});
 assert.match(reply,/Total requests: 2/);assert.match(reply,/Distinct vehicle identities: 1/);assert.match(reply,/Running BD: 1/);
});
test('availability uses registered fleet snapshot and separates equipment',()=>{
 const fleetRecords=[{category:'Vehicle',dashboardRoadStatus:'onroad'},{category:'Vehicle',dashboardRoadStatus:'offroad'},{category:'Equipment',dashboardRoadStatus:'idle'},{category:'Equipment',dashboardRoadStatus:'unknown'}];
 const reply=bdmsChatMetricsReply({text:'Vehicle availability',fleetRecords});
 assert.match(reply,/Total vehicles and equipment: 4/);assert.match(reply,/Vehicles only: 2/);assert.match(reply,/Status unconfirmed: 1/);
 assert.match(bdmsChatMetricsReply({text:'Vehicle availability'}),/permissions/);
});
test('production totals remain own requests and transfer details remain restricted',()=>{
 const session={role:'normal',assignedRole:'Production User',login:'prod'};
 const reply=bdmsChatConversation({session,text:'Total BD today',today:'2026-10-08',requests:[{requesterLogin:'other',start:'2026-10-08',door:'SECRET',status:'Open'}]});
 assert.match(reply.text,/Total requests: 0/);
 assert.match(bdmsChatConversation({session,text:'Transfer 1',transfers:[{id:1,door:'SECRET'}]}).text,/does not permit/);
 const mis={role:'normal',assignedRole:'MIS User'};
 assert.match(bdmsChatConversation({session:mis,text:'Transfer 1',transfers:[{id:1,destinationMisVerifiedBy:'Verifier'}]}).text,/Verifier/);
 assert.match(bdmsChatConversation({session:mis,text:'Transfer 2',transfers:[]}).text,/permitted scope/);
});
