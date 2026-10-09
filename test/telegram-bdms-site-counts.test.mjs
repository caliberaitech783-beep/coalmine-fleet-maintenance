import test from 'node:test';
import assert from 'node:assert/strict';
import {bdmsChatAnswer} from '../telegram-bdms-chatbot.mjs';
import {bdmsChatConversation} from '../telegram-bdms-conversation.mjs';
import {bdmsChatMetricsReply} from '../telegram-bdms-metrics.mjs';
import {bdmsSiteCounts} from '../telegram-bdms-site-counts.mjs';
const session={role:'super'},requests=Array.from({length:12},(_,i)=>({ref:`REQ-${i}`,site:i<9?'Sasti OC':'Majri OC',status:'Running BD',start:'2026-10-09',requesterLogin:i===0?'prod':'other'}));
test('site counts cover every matching request before bounded detail display',()=>{
 const reply=bdmsChatAnswer({session,requests,text:'Running BD'});
 assert.match(reply,/Matching requests: 12/);assert.match(reply,/Sasti OC: Count: 9/);assert.match(reply,/Majri OC: Count: 3/);assert.doesNotMatch(reply,/REQ-11 ·/);
 const summary=bdmsChatAnswer({session,requests,text:'show site wise count'});
 assert.match(summary,/Sasti OC: Open: 9 · Running BD: 9 · Closed: 0/);
 assert.match(bdmsChatAnswer({session,requests,text:'Site summary',language:'hi'}),/साइट के अनुसार संख्या/);
});
test('production site counts remain restricted to own visible records',()=>{
 const reply=bdmsChatAnswer({session:{role:'normal',assignedRole:'Production User',login:'prod'},requests,text:'Running BD'});
 assert.match(reply,/Sasti OC: Count: 1/);assert.doesNotMatch(reply,/Majri OC/);
});
test('site aliases merge, and fleet uses current location after transfer',()=>{
 assert.match(bdmsSiteCounts([{site:'Sasti OC'},{site:'Sasti OB'}]),/Sasti OC: Count: 2/);
 const reply=bdmsChatMetricsReply({text:'Vehicle availability',fleetRecords:[{site:'Sasti OC',location:'Sasti OC',currentLocation:'Majri OC',dashboardRoadStatus:'onroad'}]});
 assert.match(reply,/Majri OC: Total: 1/);assert.doesNotMatch(reply,/Sasti OC:/);
});
test('date and fleet totals include site status breakdowns',()=>{
 const bd=bdmsChatMetricsReply({text:'Total BD today',requests,today:'2026-10-09'});
 assert.match(bd,/Majri OC: Requests: 3 · Open: 3 · Closed: 0 · Running BD: 3/);
 const fleet=bdmsChatMetricsReply({text:'Vehicle availability',fleetRecords:[{location:'Sasti OC',dashboardRoadStatus:'onroad'},{site:'Majri OC',dashboardRoadStatus:'idle'}]});
 assert.match(fleet,/Sasti OC: Total: 1 · On road: 1/);assert.match(fleet,/Majri OC: Total: 1 · On road: 0 · Off road: 0 · Idle: 1/);
});
test('transfers and support tickets count all permitted records',()=>{
 const transfers=Array.from({length:10},(_,id)=>({id,source:'Sasti OC',destination:'Majri OC',transferDate:'2026-10-09'}));
 assert.match(bdmsChatConversation({session,text:'Vehicle transfer details',transfers,today:'2026-10-09'}).text,/Sasti OC: Transfers: 10/);
 const tickets=Array.from({length:10},(_,i)=>({reference:`TKT-${i}`,site:'Majri OC',status:'Open',createdAt:'2026-10-09'}));
 assert.match(bdmsChatConversation({session,text:'Ticket close status',tickets,today:'2026-10-09'}).text,/Majri OC: Tickets: 10/);
});
