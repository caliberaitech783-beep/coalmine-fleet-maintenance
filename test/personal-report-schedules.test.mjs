import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultPersonalReportSchedules, normalizePersonalReportSchedules, personalScheduleValidationError, personalReportsDue, personalReportSourceData} from '../personal-report-schedules.mjs';
import {personalReportsForUser, reportCategoryIdsForUser, PERSONAL_REPORT_CATALOG} from '../report-access.mjs';
import {createPersonalReportDelivery} from '../personal-report-delivery.mjs';
import {applyHierarchyDeliveryRule, defaultHierarchyReportScheduleSettings} from '../hierarchy-report-flow.mjs';
import {buildDirectorReportTables} from '../director-report-bundle.mjs';

const general = 'Recent Breakdown Cases', maintenance = 'Open Off road Cases';
const slot = (overrides = {}) => ({key:'mine', enabled:true, cadence:'daily', weekday:1, times:['19:00'], reports:[general], ...overrides});
const config = (...schedules) => ({enabled:true, schedules:schedules.length ? schedules : [slot()]});
const now = new Date('2026-09-08T19:02:00+05:30');

test('personal schedules are opt-in and never auto-add reports or organisation settings', () => {
  assert.deepEqual(defaultPersonalReportSchedules(), {enabled:false, schedules:[]});
  assert.deepEqual(normalizePersonalReportSchedules({},[general]), defaultPersonalReportSchedules());
  const result = normalizePersonalReportSchedules({...config(slot({reports:[general,maintenance,general]})),designations:{director:{enabled:true}},recipientLogins:['someone-else']},[general]);
  assert.deepEqual(result.schedules[0].reports,[general]);
  assert.deepEqual(Object.keys(result),['enabled','schedules']);
  assert.deepEqual(normalizePersonalReportSchedules(config(slot({reports:[]})),[general]).schedules[0].reports,[]);
});

test('personal report access matches the Reports catalogue and is independent of hierarchy delivery choices', () => {
  assert.deepEqual(reportCategoryIdsForUser({}, {role:'normal',assignedRole:'Maintenance User'}), ['general','maintenance']);
  const manager = {role:'super', permissions:{adminLevel:'Manager',managerRoles:['Production Manager','MIS Manager']}};
  const allowed = personalReportsForUser(manager);
  assert.ok(allowed.includes(general));
  assert.ok(allowed.includes('Total Request Submitted Report'));
  assert.ok(allowed.includes('Unverified Cases'));
  assert.ok(!allowed.includes(maintenance));
  assert.deepEqual(personalReportsForUser({...manager,permissions:{...manager.permissions,tabAccess:[],mobileTabAccess:[]}}),[]);
  assert.deepEqual(personalReportsForUser({role:'normal',assignedRole:''}),[]);
  const built = new Set(buildDirectorReportTables({now}).map(table => table.title));
  assert.ok(PERSONAL_REPORT_CATALOG.every(report => built.has(report.title)));
});

test('save validation rejects inaccessible reports, invalid times, missing reports and event schedules', () => {
  for (const invalid of [slot({reports:[maintenance]}),slot({reports:[]}),slot({times:[]}),slot({times:['25:00']}),slot({cadence:'event'}),slot({cadence:'weekly',weekday:7}),slot({key:undefined}),slot({enabled:'true'})]) {
    assert.ok(personalScheduleValidationError(config(invalid),[general]));
  }
  assert.ok(personalScheduleValidationError(config(slot(),slot()),[general]));
  assert.equal(personalScheduleValidationError(config(),[general]),'');
  assert.equal(personalScheduleValidationError(defaultPersonalReportSchedules(),[]),'');
  assert.equal(personalScheduleValidationError({enabled:false,schedules:[slot({reports:[]})]},[]),'');
  assert.ok(personalScheduleValidationError({enabled:true,schedules:[]},[general]));
});

test('IST slots deduplicate overlapping schedules, handle midnight and start only after saving', () => {
  const settings = config(slot({times:['19:00','19:01']}),slot({key:'weekly',cadence:'weekly',weekday:2,reports:[maintenance]}));
  const due = personalReportsDue(settings,now);
  assert.deepEqual(due.map(group=>group.slotKey),['2026-09-08-1900','2026-09-08-1901']);
  assert.deepEqual(due[0].reports,[general,maintenance]);
  assert.equal(personalReportsDue(settings,now,new Date('2026-09-08T19:01:30+05:30')).length,0);
  assert.equal(personalReportsDue(settings,new Date('2026-09-08T18:59:00+05:30')).length,0);
  assert.equal(personalReportsDue(settings,new Date('2026-09-08T19:22:00+05:30')).length,0);
  assert.equal(personalReportsDue({...settings,enabled:false},now).length,0);
  assert.equal(personalReportsDue(config(slot({cadence:'weekly',weekday:1})),now).length,0);
  assert.equal(personalReportsDue(config(slot({cadence:'weekly',weekday:2,times:['23:59']})),new Date('2026-09-09T00:02:00+05:30'))[0].slotKey,'2026-09-08-2359');
});

test('personal data cannot expand beyond assigned sites; transfers match the Reports page', () => {
  const data = {requests:[{site:'Sasti OB'},{site:'Jayant OB'}],equipmentRecords:[{currentLocation:'Sasti OB'},{currentLocation:'Jayant OB'}],transferRecords:[{source:'Sasti OB',destination:'Jayant OB'},{source:'Jayant OB',destination:'Lalpeth OB'}]};
  const scoped = personalReportSourceData(data,{restrictToScope:true,allowedSites:['sasti ob']});
  assert.equal(scoped.requests.length,1); assert.equal(scoped.equipmentRecords.length,1); assert.equal(scoped.transferRecords.length,1);
  assert.throws(()=>personalReportSourceData(data,{restrictToScope:true,allowedSites:[]}));
  assert.throws(()=>personalReportSourceData(data,null));
  assert.deepEqual(personalReportSourceData(data,{restrictToScope:false}),data);
});

test('delivery rechecks each account, sends only to its current phone, isolates slots and records failures', async () => {
  const claims = new Set(), messages = [], published = [], statuses = [];
  const saved = [1,2,3,4,5].map(userId=>({userId,settings:config(slot({reports:[general,maintenance]})),updatedAt:new Date('2026-09-01')}));
  const runner = createPersonalReportDelivery({
    listSchedules:async()=>saved,
    resolveContext:async row=> row.userId === 3 ? null : {userId:row.userId === 5 ? 9 : row.userId,phone:row.userId === 4 ? '' : `own-phone-${row.userId}`,allowedReports:row.userId === 2 ? [maintenance] : [general],scope:{restrictToScope:true,allowedSites:['sasti ob']}},
    claim:async(id,key)=>{const claim=`${id}/${key}`;if(claims.has(claim))return null;claims.add(claim);return claim;},
    publish:async args=>{published.push(args);return {message:'report'};},
    deliver:async args=>{messages.push(args);if(args.to === 'own-phone-2')throw Error('Provider rejected');},
    finish:async args=>statuses.push(args),
  });
  assert.deepEqual(await runner(now),{sent:1,failed:1,skipped:3});
  assert.deepEqual(messages.map(message=>message.to),['own-phone-1','own-phone-2']);
  assert.deepEqual(published.map(item=>item.slot.reports),[[general],[maintenance]]);
  assert.equal(statuses[1].status,'Failed - Provider rejected');
  await runner(now); assert.equal(messages.length,2);
});

test('organisation recipient controls move to hierarchy while old disabled settings stay disabled', () => {
  const original = defaultHierarchyReportScheduleSettings();
  original.designations.director.enabled=false;
  original.designations.director.allRecipients=false;
  assert.equal(applyHierarchyDeliveryRule(original,'director',{}).designations.director.enabled,false);
  const edited=applyHierarchyDeliveryRule(original,'director',{deliveryEnabled:true,deliveryAllRecipients:false,deliveryRecipientLogins:[' Alice ','ALICE']});
  assert.equal(edited.designations.director.enabled,true);
  assert.deepEqual(edited.designations.director.recipientLogins,['alice']);
  assert.equal(original.designations.director.enabled,false);
});

function apiHarness() {
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const routes=new Map(),stored=new Map();
  const app={get:(url,_guard,handler)=>routes.set(`GET ${url}`,handler),put:(url,_guard,handler)=>routes.set(`PUT ${url}`,handler)};
  const dependencies={app,requireSession:()=>{},personalReportContext:async session=>session.login==='deleted'?null:{userId:session.login==='alice'?1:2,allowedReports:[general],name:session.login,phone:'registered-phone'},
    normalizePersonalReportSchedules,defaultPersonalReportSchedules,personalScheduleValidationError,
    pool:{query:async(sql,args)=>{
      assert.ok(sql.includes('personal_report_schedules'));
      if(sql.startsWith('SELECT'))return {rows:stored.has(args[0])?[{settings:stored.get(args[0])}]:[]};
      stored.set(args[0],JSON.parse(args[1]));return {rows:[]};
    }},
  };
  const snippet=server.slice(server.indexOf("app.get('/api/me/report-schedules'"),server.indexOf("app.get('/api/whatsapp-alert-history'"));
  new Function(...Object.keys(dependencies),snippet)(...Object.values(dependencies));
  async function request(method,login,body) {
    const response={statusCode:200,set:()=>{},vary:()=>{},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    await routes.get(`${method} /api/me/report-schedules`)({session:{login},body},response,error=>{throw error;});
    return response;
  }
  return {request,stored};
}

test('actual personal API saves by session identity and ignores forged owner, phone and designation fields', async () => {
  const {request,stored}=apiHarness();
  const original=config();
  assert.equal((await request('PUT','alice',{...original,userId:2,phone:'attacker',login:'bob',designations:{director:{enabled:false}}})).statusCode,200);
  assert.deepEqual(stored.get(1),normalizePersonalReportSchedules(original,[general]));
  assert.equal(stored.has(2),false);
  assert.deepEqual((await request('GET','bob')).body.settings,defaultPersonalReportSchedules());
  assert.equal((await request('PUT','bob',config(slot({reports:[maintenance]})))).statusCode,400);
  assert.equal(stored.has(2),false);
  assert.equal((await request('GET','deleted')).statusCode,401);
  assert.equal((await request('PUT','deleted',original)).statusCode,401);
  await request('PUT','alice',defaultPersonalReportSchedules());
  assert.deepEqual((await request('GET','alice')).body.settings,defaultPersonalReportSchedules());
});
