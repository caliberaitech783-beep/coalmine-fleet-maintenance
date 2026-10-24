import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHourlyBreakdownPreview,buildAllSitesHourlyBreakdownPreview,registerHourlyBreakdownPreview,HOURLY_PREVIEW_COLUMNS} from '../hourly-breakdown-preview.mjs';

test('preview follows existing global retirement and owner visibility rules',()=>{
 const base={site:'Sasti OC',start:'2026-09-01 10:00:00'};
 const result=buildHourlyBreakdownPreview([
  {...base,ref:'REQ-1788930790041'},
  {...base,ref:'hidden',owner:'Stupal Moon',createdAt:'2026-09-09 10:00:00'},
  {...base,ref:'current',owner:'Stupal Moon',createdAt:'2026-09-10 10:00:00'},
 ],'2026-10-23T12:00:00+05:30');
 assert.equal(result.counts['Opening BD'],1);
 assert.equal(result.rows.length,1);
});

test('site preview separates period activity, continuing BD, first trip and idle without OEM columns',()=>{
 const cutoff='2026-10-23T12:00:00+05:30';
 const base={site:'Sasti OC',equipmentGroup:'Tipper',category:'Electrical'};
 const source=[
  {...base,ref:'old',door:'A',start:'2026-10-20 10:00:00'},
  {...base,ref:'new',door:'B',start:'2026-10-23 10:30:00'},
  {...base,ref:'closed',door:'C',start:'2026-10-23 08:00:00',closedAt:'2026-10-23 11:00:00',idealRequestedAt:'2026-10-23 11:00:00',openingMeterReadings:{KMR:'100',HMR:'20'},closingMeterReadings:{KMR:'104',HMR:'22'}},
  {...base,ref:'out',door:'D',start:'2026-10-23 07:00:00',closedAt:'2026-10-23 09:00:00',productionFirstTripAt:'2026-10-23 11:30:00'},
  {...base,ref:'other',door:'E',site:'Majri OC',start:'2026-10-23 10:30:00'},
  {...base,ref:'future',door:'F',start:'2026-10-23 12:00:01'},
 ];
 const result=buildHourlyBreakdownPreview(source,cutoff);
 assert.deepEqual(result.counts,{'Opening BD':2,'New BD':1,'Closing BD':1,'Previous BD':1,'Previous Close':1,'Total Idle Now':1});
 assert.deepEqual(result.rows.map(row=>row[0]),['🔴 IN','🔴 Continuing BD','🟢 CLOSED','🟢 OUT','🟠 IDLE']);
 assert.equal(result.rows.find(row=>row[0]==='🟢 CLOSED')[6],'4');
 assert.equal(result.rows.find(row=>row[0]==='🟢 CLOSED')[7],'2');
 assert.equal(result.rows.find(row=>row[0]==='🔴 IN')[6],'Pending closing reading');
 assert.equal(result.rows.length,5);
 assert.ok(!HOURLY_PREVIEW_COLUMNS.some(label=>/OEM|Opening [KH]MR|Closing [KH]MR/.test(label)));
});

test('window end is exclusive and later remarks and closures do not leak into the snapshot',()=>{
 const result=buildHourlyBreakdownPreview([{site:'Sasti OB',door:'A',start:'2026-10-23 09:00:00',closedAt:'2026-10-23 12:00:00',dailyRemarks:[{createdAt:'2026-10-23 11:30:00',remark:'Current work'},{createdAt:'2026-10-23 12:00:00',remark:'Next window'}]}],'2026-10-23T12:00:00+05:30');
 assert.equal(result.counts['Closing BD'],0);
 assert.equal(result.rows[0][9],'Pending');
 assert.match(result.rows[0][5],/Current work/);
 assert.doesNotMatch(result.rows[0][5],/Next window/);
});

test('manual site preview is an authenticated administrator GET and uses a read-only snapshot',()=>{
 let route;const session=()=>{},admin=()=>{};
 registerHourlyBreakdownPreview({get:(...args)=>route=args},{pool:{},requireSession:session,requireAdministrator:admin});
 assert.equal(route[0],'/api/reports/hourly-breakdown-preview');assert.equal(route[1],session);assert.equal(route[2],admin);
});

test('daily update precedes differences calculated as closing minus opening',()=>{
 const report=buildHourlyBreakdownPreview([{site:'Sasti OC',door:'A',equipmentGroup:'Tipper',start:'2026-10-23 09:00:00',openingMeterReadings:{KMR:'100.25',HMR:'20.5'},closingMeterReadings:{KMR:'104.75',HMR:'22.75'},dailyRemarks:[{createdAt:'2026-10-23 11:00:00',remark:'Repair ongoing'}]}],'2026-10-23T12:00:00+05:30');
 assert.deepEqual(report.columns.slice(5,8),['Daily Update','Diff KMR','Diff. HMR']);
 assert.match(report.rows[0][5],/Repair ongoing/);
 assert.deepEqual(report.rows[0].slice(6,8),['4.5','2.25']);
 assert.equal(report.rows[0].length,report.columns.length);
});

test('all sites report keeps canonical site groups, empty sites and meter columns',()=>{
 const cutoff='2026-10-23T12:00:00+05:30';
 const base={start:'2026-10-23 10:30:00',equipmentGroup:'Tipper',openingMeterReadings:{KMR:'100',HMR:'10'},closingMeterReadings:{KMR:'112.5',HMR:'13'}};
 const report=buildAllSitesHourlyBreakdownPreview([
  {...base,site:'Sasti OB',door:'A'},
  {...base,site:'Majri OC',door:'B'},
  {...base,site:'Dudhichua East OC',door:'C'},
 ],cutoff);
 assert.equal(report.site,'All sites');
 assert.equal(report.sites.length,8);
 assert.equal(report.sites.filter(site=>site.site==='Sasti OC').length,1);
 for(const [site,door] of [['Sasti OC','A'],['Majri OC','B'],['Dudhichua East OC','C']]){
  const group=report.sites.find(row=>row.site===site);
  assert.equal(group.rows.length,1);
  assert.equal(group.rows[0][1],door);
  assert.equal(group.rows[0][0],'🔴 IN');
  assert.deepEqual(group.rows[0].slice(6,8),['12.5','3']);
  assert.equal(group.counts['New BD'],1);
 }
 assert.equal(report.sites.find(site=>site.site==='Lalpeth OC').rows.length,0);
 assert.ok(report.sites.every(site=>site.end===report.end&&site.start===report.start));
});

test('all sites API removes only the site predicate and keeps one read-only snapshot',async()=>{
 let route;const calls=[];
 const client={query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql==='SELECT NOW() AS cutoff')return {rows:[{cutoff:'2026-10-23T12:00:00+05:30'}]};
  if(sql.includes('FROM maintenance_requests WHERE'))return {rows:[{ref:'M1',site:'Majri OC',door:'B',start:'2026-10-23 11:00:00'}]};
  return {rows:[]};
 },release(){}};
 registerHourlyBreakdownPreview({get:(...args)=>route=args},{pool:{connect:async()=>client},requireSession(){},requireAdministrator(){}});
 let result;
 await route.at(-1)({query:{site:'all'}},{set(){},json(value){result=value;}},error=>{throw error;});
 assert.equal(calls.find(call=>call.sql.includes('FROM maintenance_requests WHERE')).params[0],null);
 assert.equal(calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.equal(calls.at(-1).sql,'COMMIT');
 assert.equal(result.sites.find(site=>site.site==='Majri OC').rows.length,1);
});

test('today report covers midnight IST through cutoff, including morning Jayant closures',()=>{
 const base={site:'Jayant OC',door:'J1',start:'2026-10-23 23:00:00'};
 const report=buildAllSitesHourlyBreakdownPreview([
  {...base,closedAt:'2026-10-24 08:00:00'},
  {...base,door:'J2',start:'2026-10-24 00:00:00'},
  {...base,door:'J3',closedAt:'2026-10-23 23:59:59'},
 ],'2026-10-24T18:00:00+05:30','today');
 assert.equal(report.start,'2026-10-23T18:30:00.000Z');
 const jayant=report.sites.find(site=>site.site==='Jayant OC');
 assert.equal(jayant.counts['New BD'],1);
 assert.equal(jayant.counts['Closing BD'],1);
 assert.equal(jayant.counts['Opening BD'],1);
 assert.ok(jayant.rows.some(row=>row[0]==='🟢 CLOSED'&&row[1]==='J1'));
 assert.ok(!jayant.rows.some(row=>row[1]==='J3'));
});

test('Telegram BD report is fresh, site-specific and sent only to the current private link',async()=>{
 let route,recipient,pdfInput,committed=false,released=false;
 const client={query:async sql=>{
  if(sql==='SELECT NOW() AS cutoff')return {rows:[{cutoff:'2026-10-24T18:00:00+05:30'}]};
  if(sql==='COMMIT')committed=true;
  if(sql.includes('FROM maintenance_requests WHERE'))return {rows:[{ref:'J1',site:'Jayant OC',start:'2026-10-24 17:00:00'},{ref:'S1',site:'Sasti OC',start:'2026-10-24 17:00:00'}]};
  return {rows:[]};
 },release(){released=true;}};
 const session=()=>{},admin=()=>{};
 registerHourlyBreakdownPreview({get(){},post:(...args)=>route=args},{pool:{connect:async()=>client},requireSession:session,requireAdministrator:admin,
  linkedTelegramChat:async login=>{assert.equal(login,'my-login');return '123456';},
  buildTableExportPdf:async input=>{pdfInput=input;return Buffer.from('pdf');},
  sendTelegramDocument:async input=>{assert.ok(committed&&released);recipient=input;return {sent:true,messageId:42};},
 });
 assert.equal(route[1],session);assert.equal(route[2],admin);
 let result,status;
 await route.at(-1)({session:{login:'my-login'},body:{site:'Jayant OC',period:'two-hour',chatId:'999999'}},{status(value){status=value;return this;},json(value){result=value;}},error=>{throw error;});
 assert.equal(status,201);assert.equal(result.messageId,42);
 assert.equal(recipient.chatId,'123456');
 assert.match(recipient.caption,/Jayant OC.*Consolidated BD/s);
 assert.match(recipient.caption,/04:00:00 PM to .*06:00:00 PM/);
 assert.equal(pdfInput.rows.length,1);
 assert.equal(pdfInput.pageSize,'A3');
});

test('Telegram BD report rejects missing or group links and invalid periods before loading records',async()=>{
 for(const [body,link] of [[{site:'Jayant OC',period:'two-hour'},''],[{site:'Jayant OC',period:'two-hour'},'-123'],[{site:'Jayant OC',period:'last-year'},'123'],[{site:'Unknown',period:'two-hour'},'123']]){
  let route,status;
  registerHourlyBreakdownPreview({get(){},post:(...args)=>route=args},{pool:{connect(){assert.fail('Must not load records');}},requireSession(){},requireAdministrator(){},linkedTelegramChat:async()=>link});
  await route.at(-1)({session:{login:'me'},body},{status(value){status=value;return this;},json(){}},error=>{throw error;});
  assert.equal(status,400);
 }
});

test('each hourly selection uses its exact elapsed window',()=>{
 for(let hours=1;hours<=8;hours++){
  const report=buildHourlyBreakdownPreview([], '2026-10-24T23:00:00+05:30','Sasti OC',`${hours}-hour`);
  assert.equal(Date.parse(report.end)-Date.parse(report.start),hours*3600000);
 }
});

test('missing closing readings become differences after readings are saved, including zero',()=>{
 const row={site:'Majri OC',door:'V164',equipmentGroup:'VOLVO TIPPERS',meterType:'KMR',start:'2026-10-24 20:14:27',openingMeterReadings:{KMR:'235099',HMR:'15755'},closingMeterReadings:{}};
 const values=()=>buildHourlyBreakdownPreview([row],'2026-10-25T00:11:35+05:30','Majri OC','4-hour').rows[0].slice(6,8);
 assert.deepEqual(values(),['Pending closing reading','Pending closing reading']);
 row.closingMeterReadings={KMR:'235104.5',HMR:'15756.25'};
 assert.deepEqual(values(),['5.5','1.25']);
 row.openingMeterReadings={KMR:'0',HMR:'0'};row.closingMeterReadings={KMR:'0',HMR:'0'};
 assert.deepEqual(values(),['0','0']);
});
