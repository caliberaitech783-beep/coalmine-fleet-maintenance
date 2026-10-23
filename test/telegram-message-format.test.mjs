import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {telegramNotificationText,telegramShiftLines,telegramReportText} from '../telegram-message-format.mjs';
const shifts=[{site:'Gauri Pauni OC (2nd)',shiftName:'Site custom day',startTime:'13:00:00',endTime:'21:00:00'},{site:'Gauri Pauni OC (2nd)',shiftName:'Night',startTime:'21:00:00',endTime:'05:00:00'}];
const request={ref:'REQ-TEST',site:shifts[0].site,start:'2026-10-21 15:10:14',closedAt:'2026-10-22 18:10:14',door:'LDM7 - 1157',category:'PREVENTIVE',maintenanceWork:'New cylinder fitted',closedBy:'Maintenance user',owner:'Production user'};
test('opening uses a leading red dot and saved site shift, with no duplicated notification title',()=>{
 const text=telegramNotificationText({purpose:'requestOpened',request,shifts});
 assert.deepEqual(text.split('\n').slice(0,3),[`SITE: ${request.site}`,'🔴 P to M','Shift: Site custom day']);assert.match(text,/01:00:00 PM to 09:00:00 PM IST/);assert.match(text,/Opened by: Production user/);assert.doesNotMatch(text,/Caliber Pulse notification|Chassis:/);
});
test('closure uses leading green dot, its own event shift and elapsed opening-to-closing duration',()=>{
 const text=telegramNotificationText({purpose:'requestClosed',request,shifts});
 assert.deepEqual(text.split('\n').slice(0,3),[`SITE: ${request.site}`,'🟢 M to P','Shift: Site custom day']);assert.match(text,/22-10-26 \(06:10:14 PM\)/);assert.match(text,/BD duration: 1 day 3 hrs/);assert.match(text,/Door: LDM7 - 1157/);assert.match(text,/Maintenance work: New cylinder fitted/);assert.ok(text.endsWith('Request REQ-TEST'));
 const night=telegramNotificationText({purpose:'requestClosed',request:{...request,closedAt:'2026-10-22 23:00:00'},shifts});assert.match(night,/Shift: Night/);
});
test('shift boundaries, effective dates, inactive records and missing configuration are respected',()=>{
 assert.match(telegramShiftLines(request.site,'2026-10-23 21:00:00',shifts)[0],/Night/);
 assert.match(telegramShiftLines(request.site,'2026-10-23 02:00:00',shifts)[0],/Night/);
 assert.match(telegramShiftLines('Another site','2026-10-23 18:00:00',shifts)[0],/Not recorded/);
 assert.match(telegramShiftLines(request.site,'2026-10-23 18:00:00',shifts.map(s=>({...s,effectiveTo:'2026-10-01'})))[0],/Not recorded/);
 assert.match(telegramShiftLines(request.site,'2026-10-23 18:00:00',shifts.map(s=>({...s,status:'Inactive'})))[0],/Not recorded/);
});
test('UTC instants and local India timestamps produce the same shift',()=>{
 assert.deepEqual(telegramShiftLines(request.site,new Date('2026-10-22T12:40:14Z'),shifts),telegramShiftLines(request.site,request.closedAt,shifts));
});
test('missing or invalid duration is not invented',()=>{
 for(const start of [undefined,'not-a-date','2026-10-23 18:00:00'])assert.match(telegramNotificationText({purpose:'requestClosed',request:{...request,start},shifts}),/BD duration: Not recorded/);
});
test('running BD and first trip pending do not falsely announce completed closure',()=>{
 for(const message of ['Request REQ-TEST marked Running BD by Jane at noon','First trip entry pending for REQ-TEST']){
 const text=telegramNotificationText({purpose:'requestClosed',message,request:{...request,runningBdAt:request.closedAt},shifts});assert.doesNotMatch(text,/M to P|P to M/);assert.match(text,/Running BD|First trip entry pending/);}
});
test('reminders, daily remarks and verification use their own event time',()=>{
 for(const purpose of ['offRoadEscalation','idleReminder','dailyUpdate','requestVerified']){
 const text=telegramNotificationText({purpose,request:{...request,verifiedAt:request.closedAt,verifiedBy:'MIS user',firstTripDone:true,idealRequestedAt:request.closedAt},context:{updatedAt:request.closedAt,authorName:'Jane'},shifts});assert.match(text,/Shift: Site custom day/);assert.doesNotMatch(text,/Caliber Pulse notification/);}
});
test('reports preserve site-labelled downloads and use all shifts with effective site timings',()=>{
 const text=telegramReportText({kind:'CRM',window:{start:'2026-10-22 00:00:00',end:'2026-10-23 00:00:00'},reports:[{site:request.site,summary:'3 tickets with activity',pdfUrl:'https://pulse.cmll.in/r/pdf',xlsxUrl:'https://pulse.cmll.in/r/xlsx'}],shifts:[...shifts,{...shifts[0],shiftName:'Old',effectiveTo:'2025-01-01'}]});
 assert.match(text,/Shift: All shifts/);assert.match(text,/Site custom day/);assert.match(text,/Night/);assert.doesNotMatch(text,/Old/);assert.match(text,/PDF: https:\/\/pulse.cmll.in\/r\/pdf/);assert.match(text,/Excel: https:\/\/pulse.cmll.in\/r\/xlsx/);
});
test('server applies Telegram-only formatting and private template tests use the current account',()=>{
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');assert.match(source,/const telegramText=await telegramAlertMessage/);assert.match(source,/app.post\('\/api\/telegram\/test-templates',requireSuper,requireWhatsAppAdministrator/);assert.match(source,/linkedTelegramChat\(req.session.login\)/);assert.match(source,/TEST ONLY/);
});

async function previewRoute(chatId){
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const start=source.indexOf("app.post('/api/telegram/test-templates'");
 const body=source.slice(source.indexOf('  req.audit=',start),source.indexOf("\n});",start));
 const sent=[],req={session:{login:'anoop',name:'ANOOP PAUL'}};
 let status=200,result;
 const res={status(value){status=value;return this},json(value){result=value;return this}};
 const run=new Function('req','res','linkedTelegramChat','telegramAlertShifts','pool','telegramNotificationText','sendTelegramText',`return (async()=>{${body}})()`);
 await run(req,res,async login=>{assert.equal(login,'anoop');return chatId},async()=>shifts,{},telegramNotificationText,async options=>{sent.push(options);return {sent:true,messageId:sent.length}});
 return {sent,status,result};
}
test('template test route sends both formats only to the signed-in private account without creating requests',async()=>{
 const {sent,status,result}=await previewRoute('12345');assert.equal(status,201);assert.equal(result.count,2);assert.equal(sent.length,2);
 assert.ok(sent.every(s=>s.chatId==='12345'&&s.message.startsWith('TEST ONLY\n')));assert.match(sent[0].message,/🔴 P to M/);assert.match(sent[1].message,/🟢 M to P/);
});
test('template tests reject missing links and group addresses before sending',async()=>{
 for(const chatId of ['','-12345']){const r=await previewRoute(chatId);assert.equal(r.status,400);assert.equal(r.sent.length,0);}
});

async function sitePreviewRoute(site){
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const start=source.indexOf("app.post('/api/telegram/site-groups/test'");
 const body=source.slice(source.indexOf('  try{',start),source.indexOf('\n});',start));
 const sent=[],req={body:{site},session:{login:'anoop',name:'ANOOP PAUL'}};
 let status=200,result;
 const res={status(value){status=value;return this},json(value){result=value;return this}};
 const run=new Function('req','res','next','telegramSiteGroups','telegramSiteName','telegramAlertShifts','pool','telegramNotificationText','sendTelegramText',`return (async()=>{${body}})()`);
 await run(req,res,e=>{throw e},async()=>[{site:shifts[0].site,chatId:'-12345'}],s=>s,async()=>shifts,{},telegramNotificationText,async options=>{sent.push(options);return {sent:true}});
 return {sent,status,result};
}
test('site test sends both leading-dot templates only to the selected registered group',async()=>{
 const r=await sitePreviewRoute(shifts[0].site);assert.equal(r.status,200);assert.equal(r.result.count,2);assert.equal(r.sent.length,2);
 assert.ok(r.sent.every(s=>s.chatId==='-12345'&&s.message.startsWith('TEST ONLY\n')&&s.message.includes(`SITE: ${shifts[0].site}`)&&s.message.includes('Shift timing:')));
 assert.match(r.sent[0].message,/🔴 P to M/);assert.match(r.sent[1].message,/🟢 M to P/);
});
test('site test never falls back to a default or another group for an unknown site',async()=>{
 const r=await sitePreviewRoute('Unknown');assert.equal(r.status,409);assert.equal(r.sent.length,0);
});
