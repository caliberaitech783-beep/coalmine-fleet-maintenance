import test from 'node:test';
import assert from 'node:assert/strict';
import {bdmsChatConversation} from '../telegram-bdms-conversation.mjs';
const session={role:'normal',assignedRole:'Production User',login:'prod'};
const requests=[{ref:'REQ-101',requesterLogin:'prod',site:'Jayant OC',door:'V160',status:'Open',maintenanceWork:'Pump repair',acceptedBy:'Demo technician',start:'2026-10-08',linkedRequestReferences:['REQ-102','REQ-SECRET']},{ref:'REQ-102',requesterLogin:'prod',site:'Jayant OC',door:'V160',status:'Running BD',start:'2026-10-08'},{ref:'REQ-SECRET',requesterLogin:'other',site:'Jayant OC',door:'V160',status:'Open',maintenanceWork:'Confidential'}];
const opts={session,requests,scopeLabel:'Jayant OC',today:'2026-10-08'};
test('open results lead to request, maintenance details, timeline and back navigation',()=>{
 const list=bdmsChatConversation({...opts,text:'Open breakdowns'});
 assert.match(list.text,/What would you like to see next/);
 assert.ok(list.keyboard.keyboard.flat().includes('REQ-101'));
 assert.doesNotMatch(list.text,/REQ-SECRET/);
 const selected=bdmsChatConversation({...opts,text:'REQ-101',context:list.context});
 assert.ok(selected.keyboard.keyboard.flat().includes('Maintenance details'));
 const detail=bdmsChatConversation({...opts,text:'Maintenance details',context:selected.context});
 assert.match(detail.text,/Pump repair/);assert.match(detail.text,/Demo technician/);
 assert.match(bdmsChatConversation({...opts,text:'Request timeline',context:detail.context}).text,/2026-10-08/);
 assert.match(bdmsChatConversation({...opts,text:'Back to results',context:detail.context}).text,/Matching requests: 2/);
});
test('forged/stale context and linked records cannot reveal another user records',()=>{
 const denied=bdmsChatConversation({...opts,text:'Maintenance details',context:{selectedRef:'REQ-SECRET'}});
 assert.doesNotMatch(denied.text,/Confidential/);assert.equal(denied.context.selectedRef,undefined);
 const linked=bdmsChatConversation({...opts,text:'Linked requests',context:{selectedRef:'REQ-101'}});
 assert.match(linked.text,/REQ-102/);assert.doesNotMatch(linked.text,/REQ-SECRET/);
 assert.doesNotMatch(bdmsChatConversation({...opts,requests:[],text:'Maintenance details',context:{selectedRef:'REQ-101'}}).text,/Pump repair/);
});
test('Hindi follow-ups and main menu clear selected request',()=>{
 const selected=bdmsChatConversation({...opts,language:'hi',text:'REQ-101'});
 assert.ok(selected.keyboard.keyboard.flat().includes('मेंटेनेंस विवरण'));
 assert.match(bdmsChatConversation({...opts,language:'hi',text:'मेंटेनेंस विवरण',context:selected.context}).text,/मरम्मत कार्य/);
 assert.equal(bdmsChatConversation({...opts,language:'hi',text:'मुख्य मेनू',context:selected.context}).context.selectedRef,undefined);
});
