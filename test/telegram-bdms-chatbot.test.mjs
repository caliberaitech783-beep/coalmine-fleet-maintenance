import test from 'node:test';
import assert from 'node:assert/strict';
import {bdmsChatAnswer,bdmsChatIntent,bdmsChatCanRead,bdmsChatFlow,bdmsChatKeyboard} from '../telegram-bdms-chatbot.mjs';
import {scopeInfoPulseRequests} from '../info-pulse-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';
import {TELEGRAM_SITES} from '../telegram-site-groups.mjs';
const session={role:'normal',assignedRole:'Maintenance User'};
const requests=[{ref:'REQ-123',door:'V160',site:'Jayant OC',status:'Running BD',complaint:'Hydraulic leak'}, {ref:'REQ-456',door:'V200',site:'Sasti OC',status:'Closed',firstTripDone:true}, {ref:'REQ-789',door:'V300',site:'Jayant OC',status:'Open',archivedAt:'2026-01-01'}];
test('language must be selected before queries; switching resets menu',()=>{
 assert.equal(bdmsChatFlow('Open breakdowns','').welcome,true);
 assert.equal(bdmsChatFlow('हिंदी','').language,'hi');
 assert.equal(bdmsChatFlow('खुले ब्रेकडाउन','hi').query,true);
 assert.equal(bdmsChatFlow('Change language','en').language,'');
 assert.equal(bdmsChatFlow('/start','hi').welcome,true);
});
test('expanded menu results and Hindi reply headings',()=>{
 const options={session:{role:'super'},requests};
 assert.match(bdmsChatAnswer({...options,text:'Site summary'}),/Open: 1/);
 assert.match(bdmsChatAnswer({...options,text:'MIS pending'}),/REQ-456/);
 assert.doesNotMatch(bdmsChatAnswer({...options,text:'First trip pending'}),/REQ-456/);
 assert.match(bdmsChatAnswer({...options,text:'साइट सारांश',language:'hi'}),/साइट सारांश/);
 assert.doesNotMatch(bdmsChatAnswer({...options,text:'साइट सारांश',language:'hi'}),/Matching requests|Scope:/);
});
test('each role gets relevant menus and typed queries cannot bypass them',()=>{
 const production={role:'normal',assignedRole:'Production User',login:'prod'};
 const maintenance={role:'normal',assignedRole:'Maintenance User'};
 const mis={role:'normal',assignedRole:'MIS User'};
 assert.ok(bdmsChatKeyboard('en',production).keyboard.flat().includes('First trip pending'));
 assert.ok(!bdmsChatKeyboard('en',production).keyboard.flat().includes('MIS pending'));
 assert.ok(bdmsChatKeyboard('en',maintenance).keyboard.flat().includes('Repair updates'));
 assert.ok(!bdmsChatKeyboard('en',mis).keyboard.flat().includes('Repair updates'));
 assert.match(bdmsChatAnswer({text:'MIS pending',session:production,requests}),/not available/);
 assert.match(bdmsChatAnswer({text:'मरम्मत अपडेट',language:'hi',session:mis,requests}),/उपलब्ध नहीं/);
 const own=[{...requests[0],requesterLogin:'prod'},{...requests[0],ref:'REQ-999',requesterLogin:'other'}];
 assert.doesNotMatch(bdmsChatAnswer({text:'My requests',session:production,requests:own}),/REQ-999/);
});
test('every BDMS site isolates lookups and counts, unassigned scope denies all rows',()=>{
 const all=TELEGRAM_SITES.map((site,index)=>({site,ref:`REQ-${index}`,door:`DOOR-${index}`,status:'Open'}));
 for(const [index,site] of TELEGRAM_SITES.entries()){
  const visible=scopeInfoPulseRequests(all,{restrictToScope:true,sites:[canonicalSiteName(site)]});
  assert.equal(visible.length,1);
  assert.equal(visible[0].site,site);
  assert.match(bdmsChatAnswer({text:'open',session,requests:visible}),/Matching requests: 1/);
  assert.doesNotMatch(bdmsChatAnswer({text:`/find DOOR-${(index+1)%all.length}`,session,requests:visible}),/Matching requests: 1/);
 }
 assert.equal(scopeInfoPulseRequests(all,{restrictToScope:true,sites:[]}).length,0);
});
test('English and Hindi intents and excluded accounts',()=>{
 assert.equal(bdmsChatIntent('खुले ब्रेकडाउन').kind,'open');
 assert.equal(bdmsChatIntent('Running BD').kind,'running');
 assert.equal(bdmsChatIntent('payment advice').kind,'excluded');
 assert.equal(bdmsChatIntent('/find V160').search,'V160');
 assert.equal(bdmsChatIntent('REQ-123').kind,'find');
});
test('accounts and HR roles denied even with read flag',()=>{
 for(const role of ['Account User','HR User','Tender User'])assert.equal(bdmsChatCanRead({assignedRole:role,permissions:{readRequests:true}}),false);
 assert.equal(bdmsChatCanRead({}),false);
});
test('site scope before search; archives excluded',()=>{
 const visible=scopeInfoPulseRequests(requests,{restrictToScope:true,sites:[canonicalSiteName('Jayant OC')]});
 const reply=bdmsChatAnswer({text:'open',session,requests:visible});
 assert.match(reply,/Matching requests: 1/);assert.doesNotMatch(reply,/Sasti|REQ-789/);
 assert.doesNotMatch(bdmsChatAnswer({text:'/find V200',session,requests:visible}),/REQ-456/);
 assert.match(bdmsChatAnswer({text:'/find V160',session,requests:visible}),/Hydraulic leak/);
});
test('production pending and bounded replies',()=>{
 assert.doesNotMatch(bdmsChatAnswer({text:'pending',session:{role:'normal',assignedRole:'Production User'},requests}),/REQ-456/);
 const many=Array.from({length:100},(_,i)=>({...requests[0],ref:`REQ-${i}`}));
 const reply=bdmsChatAnswer({text:'open',session,requests:many});
 assert.match(reply,/Matching requests: 100/);assert.ok(reply.length<=4000);assert.doesNotMatch(reply,/REQ-99/);
});
