import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {applyHierarchyDeliveryRule,defaultHierarchyReportScheduleSettings,flowDesignationForUser,GENERAL_REPORT_TITLES,HIERARCHY_REPORT_DESIGNATIONS,hierarchyScheduleLabel,normalizeHierarchyReportScheduleSettings,reportsDueForDesignation,scheduledReportWindow} from '../hierarchy-report-flow.mjs';

test('Super Admin receives only the configurable consolidated schedule even when designated Director',()=>{
  const designation=flowDesignationForUser({adminLevel:' SUPER  ADMIN ',designation:'Director'});
  assert.equal(designation.key,'superAdmin');
  assert.deepEqual(reportsDueForDesignation('superAdmin',new Date('2026-09-01T13:35:00Z')).map(({scheduleKey})=>scheduleKey),['daily-19']);
});

test('Director receives one daily 7 PM group excluding weekly-only fleet reports on weekdays',()=>{
  const due=reportsDueForDesignation('director',new Date('2026-09-01T13:35:00Z'));
  assert.equal(due.length,1);
  assert.equal(due[0].scheduleKey,'daily-19');
  assert.equal(due[0].reports.length,12);
  assert.equal(due[0].reports.includes(DIRECTOR_REPORT_TITLES[4]),false);
  assert.equal(due[0].reports.includes(DIRECTOR_REPORT_TITLES[5]),false);
});

test('Director weekly fleet reports are due on Saturday at 7 PM with the daily group',()=>{
  const due=reportsDueForDesignation('director',new Date('2026-09-05T13:35:00Z'));
  assert.deepEqual(due.map((group)=>group.scheduleKey).sort(),['daily-19','weekly-sat-19']);
  assert.equal(new Set(due.flatMap((group)=>group.reports)).size,14);
});

test('Project manager receives common reports at 8 AM and operational reports at 7 PM',()=>{
  const morning=reportsDueForDesignation('projectManager',new Date('2026-09-01T02:35:00Z'));
  assert.deepEqual(morning.map((group)=>group.scheduleKey),['daily-08-18']);
  assert.deepEqual(morning[0].reports,DIRECTOR_REPORT_TITLES.slice(0,4));
  const evening=reportsDueForDesignation('projectManager',new Date('2026-09-01T13:35:00Z'));
  assert.deepEqual(evening.map((group)=>group.scheduleKey),['daily-19']);
  assert.deepEqual(evening[0].reports,DIRECTOR_REPORT_TITLES.slice(6,14));
});

test('department reports consolidate at timed slots including previously event-based titles',()=>{
  const production=flowDesignationForUser({managerRole:'Production Manager'},{permissions:{managerRoles:['Production Manager']}});
  assert.equal(production.key,'productionManager');
  const due=reportsDueForDesignation(production.key,new Date('2026-09-01T13:35:00Z'));
  assert.deepEqual(due.map((group)=>group.scheduleKey),['daily-19','general-daily-19']);
  assert.deepEqual(due[0].reports,DIRECTOR_REPORT_TITLES.slice(6,14));
  assert.deepEqual(due[1].reports,DIRECTOR_REPORT_TITLES.slice(4,6));
  const morning=reportsDueForDesignation(production.key,new Date('2026-09-01T02:35:00Z'));
  assert.deepEqual(morning[0].reports,DIRECTOR_REPORT_TITLES.slice(0,4));
  const supervisor=flowDesignationForUser({designation:'Production Incharge / Supervisor'});
  assert.equal(supervisor.key,'productionSupervisor');
  const supervisorDue=reportsDueForDesignation(supervisor.key,new Date('2026-09-01T13:35:00Z'));
  assert.equal(supervisorDue.length,1);
  assert.equal(supervisorDue[0].scheduleKey,'general-daily-19');
  assert.deepEqual(supervisorDue[0].reports,[...DIRECTOR_REPORT_TITLES.slice(0,3),...GENERAL_REPORT_TITLES]);
});

test('mobile operational profiles inherit their department report designation',()=>{
  assert.equal(flowDesignationForUser({}, {assignedRole:'Production User'}).key,'productionSupervisor');
  assert.equal(flowDesignationForUser({}, {assignedRole:'Maintenance User'}).key,'maintenanceSupervisor');
  assert.equal(flowDesignationForUser({}, {assignedRole:'MIS User'}).key,'misSupervisor');
});

test('every operational user schedule includes all General Reports',()=>{
  const settings=defaultHierarchyReportScheduleSettings();
  for(const key of ['productionManager','productionSupervisor','maintenanceManager','maintenanceSupervisor','misManager','misSupervisor']){
    const assigned=new Set(settings.designations[key].schedules.flatMap((schedule)=>schedule.reports));
    assert.equal(GENERAL_REPORT_TITLES.every((title)=>assigned.has(title)),true,key);
  }
});

test('event-only stored schedules move only their selected titles to the role timed default',()=>{
  const settings=normalizeHierarchyReportScheduleSettings({designations:{productionSupervisor:{
    enabled:true,allRecipients:true,recipientLogins:[],schedules:[{
      key:'every-event',cadence:'event',reports:DIRECTOR_REPORT_TITLES.slice(0,3),
    }],
  }}});
  const schedule=settings.designations.productionSupervisor.schedules.find((item)=>item.key==='general-daily-19');
  assert.deepEqual(schedule?.reports,DIRECTOR_REPORT_TITLES.slice(0,3));
  assert.deepEqual(schedule?.times,['19:00']);
});

test('OEM designations follow their day-cycle consolidate schedules',()=>{
  const area=flowDesignationForUser({designation:'Area Service engineer'});
  assert.equal(area.key,'oemAreaServiceEngineer');
  const due=reportsDueForDesignation(area.key,new Date('2026-09-03T13:35:00Z'));
  assert.equal(due.length,1);
  assert.deepEqual(due[0].reports,[DIRECTOR_REPORT_TITLES[1]]);
  assert.equal(reportsDueForDesignation(area.key,new Date('2026-09-04T13:35:00Z')).length,0);
});

test('saved schedules support custom minute slots, frequencies and report assignments',()=>{
  const settings=defaultHierarchyReportScheduleSettings();
  settings.designations.director.schedules=[{
    key:'custom-weekly',enabled:true,cadence:'weekly',weekday:2,times:['09:35'],reports:[DIRECTOR_REPORT_TITLES[4]],
  }];
  assert.equal(reportsDueForDesignation('director',new Date('2026-09-01T03:44:00Z'),20,settings).length,0);
  const due=reportsDueForDesignation('director',new Date('2026-09-01T04:10:00Z'),20,settings);
  assert.equal(due.length,1);
  assert.deepEqual(due[0].reports,[DIRECTOR_REPORT_TITLES[4]]);
  assert.match(due[0].slotKey,/custom-weekly-0935$/);
});

test('saved schedule settings sanitize recipients, times and unsupported report names',()=>{
  const settings=normalizeHierarchyReportScheduleSettings({designations:{director:{
    enabled:true,allRecipients:false,recipientLogins:[' Boss ','boss'],schedules:[{
      key:'custom',cadence:'interval',intervalDays:14,times:['07:15','99:00'],reports:[DIRECTOR_REPORT_TITLES[0],'Unknown report'],
    }],
  }}});
  assert.deepEqual(settings.designations.director.recipientLogins,['boss']);
  assert.deepEqual(settings.designations.director.schedules[0].times,['07:15']);
  assert.equal(settings.designations.director.schedules[0].intervalDays,14);
  assert.deepEqual(settings.designations.director.schedules[0].reports,[DIRECTOR_REPORT_TITLES[0]]);
});

test('saved schedules migrate legacy report names to the renamed catalogue',()=>{
  const settings=normalizeHierarchyReportScheduleSettings({designations:{director:{schedules:[{
    key:'legacy',cadence:'daily',times:['19:00'],reports:[
      'Location wise Open BD report with Category (Prod)',
      'Idle Verification v/s MIS First Trip verification',
    ],
  }]}}});
  assert.deepEqual(settings.designations.director.schedules[0].reports,[
    'Location wise opened BD',
    'On Road with first trip veri.',
  ]);
});

test('hierarchy weekday and time selections drive scheduled report delivery',()=>{
  const settings=applyHierarchyDeliveryRule(defaultHierarchyReportScheduleSettings(),'director',{
    scheduleDays:'Monday | Wednesday',
    scheduleTimes:'10:00 | 19:00',
    reportAccess:`${DIRECTOR_REPORT_TITLES[0]} | ${DIRECTOR_REPORT_TITLES[13]}`,
  });
  const monday=reportsDueForDesignation('director',new Date('2026-09-07T04:35:00Z'),20,settings);
  assert.equal(monday.length,1);
  assert.deepEqual(monday[0].reports,[DIRECTOR_REPORT_TITLES[0],DIRECTOR_REPORT_TITLES[13]]);
  assert.equal(reportsDueForDesignation('director',new Date('2026-09-08T04:35:00Z'),20,settings).length,0);
});

test('clearing hierarchy weekdays disables scheduled bundles without restoring defaults',()=>{
  const settings=applyHierarchyDeliveryRule(defaultHierarchyReportScheduleSettings(),'director',{
    scheduleDays:'',scheduleTimes:'19:00',reportAccess:DIRECTOR_REPORT_TITLES.join(' | '),
  });
  assert.equal(settings.designations.director.managedByHierarchy,true);
  assert.equal(reportsDueForDesignation('director',new Date('2026-09-07T13:35:00Z'),20,settings).length,0);
});

test('Admin and Super Admin defaults include the complete catalogue at 7 PM and the weekly bundle',()=>{
  const settings=defaultHierarchyReportScheduleSettings();
  assert.deepEqual(settings.designations.admin.schedules,settings.designations.superAdmin.schedules);
  for(const key of ['admin','superAdmin']){
    assert.deepEqual(reportsDueForDesignation(key,new Date('2026-09-01T13:35:00Z'))[0].reports,DIRECTOR_REPORT_TITLES);
    assert.deepEqual(reportsDueForDesignation(key,new Date('2026-09-05T13:35:00Z')).map((group)=>group.scheduleKey),['daily-19','weekly-sat-19']);
  }
  assert.equal(flowDesignationForUser({adminLevel:'Admin'}).key,'admin');
  assert.equal(flowDesignationForUser({designation:'Admin'}).key,'admin');
  assert.equal(flowDesignationForUser({}, {permissions:{adminLevel:'Admin'}}).key,'admin');
  for(const [designation,key] of [['Director','director'],['Production Manager','productionManager'],['Maintenance Manager','maintenanceManager'],['MIS Manager','misManager'],['Project Manager','projectManager']]){
    assert.equal(flowDesignationForUser({designation,adminLevel:'Admin'}).key,key);
  }
  assert.equal(flowDesignationForUser({adminLevel:'Manager'}).key,'projectManager');
  assert.equal(flowDesignationForUser({designation:'Manager',adminLevel:'Admin'}).key,'projectManager');
});

test('named director profiles use the same designation as the shared delivery policy',()=>{
  for(const employee of [' Mohit Chadda ','MANISH CHADDA','Rahul  Chadda']){
    assert.equal(flowDesignationForUser({employee,adminLevel:'Admin'}).key,'director');
    assert.equal(flowDesignationForUser({name:employee,adminLevel:'Admin'}).key,'director');
    assert.equal(flowDesignationForUser({employee,adminLevel:'Super Admin'}).key,'superAdmin');
  }
});

test('all default schedule choices are timed and legacy event labels normalize to daily',()=>{
  for(const designation of Object.values(HIERARCHY_REPORT_DESIGNATIONS)){
    assert.ok(designation.schedules.every((schedule)=>!schedule.eventBased&&schedule.cadence!=='event'));
  }
  for(const designation of Object.values(defaultHierarchyReportScheduleSettings().designations)){
    assert.ok(designation.schedules.every((schedule)=>['daily','weekly','interval'].includes(schedule.cadence)&&schedule.times.length));
  }
  assert.match(hierarchyScheduleLabel({cadence:'event'}),/^Daily @/);
  assert.doesNotMatch(hierarchyScheduleLabel({eventBased:true}),/event/i);
});

test('explicit cadence wins over stale UI weekday and interval fields',()=>{
  const schedules=[
    {key:'daily',cadence:'daily',weekday:1,intervalDays:7,times:['19:00'],reports:[DIRECTOR_REPORT_TITLES[0]]},
    {key:'weekly',cadence:'weekly',weekday:2,intervalDays:7,times:['19:00'],reports:[DIRECTOR_REPORT_TITLES[1]]},
    {key:'legacy-weekly',weekday:2,times:['19:00'],reports:[DIRECTOR_REPORT_TITLES[1]]},
    {key:'legacy-interval',intervalDays:3,times:['19:00'],reports:[DIRECTOR_REPORT_TITLES[1]]},
  ];
  const settings=normalizeHierarchyReportScheduleSettings({designations:{director:{schedules}}});
  assert.deepEqual(settings.designations.director.schedules.map(({cadence})=>cadence),['daily','weekly','weekly','interval']);
  assert.equal(settings.designations.director.schedules[0].weekday,null);
  assert.equal(settings.designations.director.schedules[0].intervalDays,null);
  assert.equal(settings.designations.director.schedules[1].intervalDays,null);
  const now=new Date('2026-09-01T13:35:00Z');
  assert.deepEqual(reportsDueForDesignation('director',now,20,settings).map(({scheduleKey})=>scheduleKey),['daily','weekly','legacy-weekly']);
  assert.equal(scheduledReportWindow(schedules[0],now).start.toISOString(),'2026-08-31T13:30:00.000Z');
  assert.equal(scheduledReportWindow(schedules[1],now).start.toISOString(),'2026-08-25T13:30:00.000Z');
});

test('shared report settings take precedence over legacy hierarchy timing and survive normalization',()=>{
  const original={designations:{director:{managedByReportSettings:true,enabled:true,schedules:[{
    key:'chosen',cadence:'daily',times:['07:17','19:43'],reports:[DIRECTOR_REPORT_TITLES[0]],
  }]}}};
  const normalized=normalizeHierarchyReportScheduleSettings(original);
  const ruled=applyHierarchyDeliveryRule(original,'director',{scheduleDays:'Monday',scheduleTimes:'09:00',reportAccess:DIRECTOR_REPORT_TITLES.join(' | ')});
  assert.deepEqual(ruled,normalized);
  assert.equal(ruled.designations.director.managedByReportSettings,true);
  assert.deepEqual(applyHierarchyDeliveryRule(ruled,'director',{scheduleDays:'',scheduleTimes:''}),normalized);
  assert.equal(reportsDueForDesignation('director',new Date('2026-09-01T01:50:00Z'),20,ruled).length,1);
});

test('legacy titles fold into an active timed schedule without changing any cadence or recipients',()=>{
  const schedules=[
    {key:'every-event',cadence:'event',reports:DIRECTOR_REPORT_TITLES.slice(0,3)},
    {key:'custom-weekly',cadence:'weekly',weekday:2,times:['07:17','19:43'],reports:[DIRECTOR_REPORT_TITLES[3]]},
    {key:'other',cadence:'interval',intervalDays:5,times:['08:02'],reports:[DIRECTOR_REPORT_TITLES[8]]},
  ];
  const input={designations:{productionManager:{enabled:true,allRecipients:false,recipientLogins:[' Selected '],schedules}}};
  const before=structuredClone(input);
  const normalized=normalizeHierarchyReportScheduleSettings(input);
  const role=normalized.designations.productionManager;
  assert.deepEqual(input,before);
  assert.deepEqual(role.recipientLogins,['selected']);
  assert.equal(role.allRecipients,false);
  assert.deepEqual(role.schedules.map(({key,cadence,weekday,intervalDays,times})=>({key,cadence,weekday,intervalDays,times})),[
    {key:'custom-weekly',cadence:'weekly',weekday:2,intervalDays:null,times:['07:17','19:43']},
    {key:'other',cadence:'interval',weekday:null,intervalDays:5,times:['08:02']},
  ]);
  assert.deepEqual(role.schedules[0].reports,[DIRECTOR_REPORT_TITLES[3],...DIRECTOR_REPORT_TITLES.slice(0,3)]);
  assert.deepEqual(normalizeHierarchyReportScheduleSettings(normalized),normalized);
});

test('existing general 7 PM slots absorb legacy event titles with their saved times intact',()=>{
  for(const key of ['productionSupervisor','maintenanceSupervisor','misSupervisor']){
    const settings=normalizeHierarchyReportScheduleSettings({designations:{[key]:{schedules:[
      {key:'every-event',eventBased:true,reports:[DIRECTOR_REPORT_TITLES[1]]},
      {key:'general-daily-19',cadence:'daily',times:['19:23'],reports:[DIRECTOR_REPORT_TITLES[13]]},
    ]}}});
    assert.equal(settings.designations[key].schedules.length,1);
    assert.equal(settings.designations[key].schedules[0].key,'general-daily-19');
    assert.deepEqual(settings.designations[key].schedules[0].times,['19:23']);
    assert.deepEqual(settings.designations[key].schedules[0].reports,[DIRECTOR_REPORT_TITLES[13],DIRECTOR_REPORT_TITLES[1]]);
  }
});

test('migration leaves disabled roles, disabled schedules and empty selections inactive',()=>{
  const events={key:'event',cadence:'event',reports:DIRECTOR_REPORT_TITLES.slice(0,3)};
  for(const schedules of [
    [],
    [{...events,enabled:false}],
    [events,{key:'paused',enabled:false,cadence:'daily',times:['19:00'],reports:[DIRECTOR_REPORT_TITLES[3]]}],
    [events,{key:'cleared',cadence:'daily',times:['19:00'],reports:[]}],
  ]){
    const settings=normalizeHierarchyReportScheduleSettings({designations:{productionManager:{schedules}}});
    assert.deepEqual(reportsDueForDesignation('productionManager',new Date('2026-09-01T13:35:00Z'),20,settings),[]);
    assert.ok(settings.designations.productionManager.schedules.every((schedule)=>schedule.cadence!=='event'));
  }
  const paused=normalizeHierarchyReportScheduleSettings({designations:{productionManager:{enabled:false,schedules:[events]}}});
  assert.equal(paused.designations.productionManager.enabled,false);
  assert.deepEqual(reportsDueForDesignation('productionManager',new Date('2026-09-01T02:35:00Z'),20,paused),[]);
});

test('disabled event titles and removed saved Admin choices are never restored',()=>{
  const settings=normalizeHierarchyReportScheduleSettings({designations:{admin:{schedules:[
    {key:'every-event',cadence:'event',enabled:false,reports:[DIRECTOR_REPORT_TITLES[0]]},
    {key:'mine',cadence:'daily',times:['19:00'],reports:[DIRECTOR_REPORT_TITLES[1]]},
  ]}}});
  const due=reportsDueForDesignation('admin',new Date('2026-09-01T13:35:00Z'),20,settings);
  assert.deepEqual(due.map(({reports})=>reports),[[DIRECTOR_REPORT_TITLES[1]]]);
  assert.equal(settings.designations.admin.schedules.find(({key})=>key==='every-event').enabled,false);
});

const isoWindow=(window)=>window&&{start:window.start.toISOString(),end:window.end.toISOString()};
function settingsForWindow(schedule){
  return {designations:{director:{schedules:[{key:'window',reports:[DIRECTOR_REPORT_TITLES[0]],...schedule}]}}};
}

test('daily minute windows span previous evening to morning and morning to evening',()=>{
  const schedule={cadence:'daily',times:['19:43','07:17']};
  assert.deepEqual(isoWindow(scheduledReportWindow(schedule,new Date('2026-09-15T01:50:00Z'))),{
    start:'2026-09-14T14:13:00.000Z',end:'2026-09-15T01:47:00.000Z',
  });
  assert.deepEqual(isoWindow(scheduledReportWindow(schedule,new Date('2026-09-15T14:20:00Z'))),{
    start:'2026-09-15T01:47:00.000Z',end:'2026-09-15T14:13:00.000Z',
  });
  assert.deepEqual(isoWindow(scheduledReportWindow({hours:[7,19]},new Date('2026-09-15T01:35:00Z'))),{
    start:'2026-09-14T13:30:00.000Z',end:'2026-09-15T01:30:00.000Z',
  });
});

test('coincident daily and weekly report groups share the previous actual delivery window',()=>{
  const due=reportsDueForDesignation('director',new Date('2026-09-05T13:35:00Z'));
  assert.deepEqual(due.map(({window})=>isoWindow(window)),[
    {start:'2026-09-04T13:30:00.000Z',end:'2026-09-05T13:30:00.000Z'},
    {start:'2026-09-04T13:30:00.000Z',end:'2026-09-05T13:30:00.000Z'},
  ]);
});

test('mixed schedule rows use the previous active delivery time and keep their own due titles',()=>{
  const settings={designations:{director:{schedules:[
    {key:'twice',cadence:'daily',times:['08:00','18:00'],reports:[DIRECTOR_REPORT_TITLES[0]]},
    {key:'evening',cadence:'daily',times:['19:00'],reports:[DIRECTOR_REPORT_TITLES[1]]},
    {key:'paused',enabled:false,cadence:'daily',times:['18:55'],reports:[DIRECTOR_REPORT_TITLES[2]]},
    {key:'no-reports',cadence:'daily',times:['18:58'],reports:[]},
  ]}}};
  for(const [now,start,end,title] of [
    ['2026-09-15T02:35:00Z','2026-09-14T13:30:00.000Z','2026-09-15T02:30:00.000Z',DIRECTOR_REPORT_TITLES[0]],
    ['2026-09-15T12:35:00Z','2026-09-15T02:30:00.000Z','2026-09-15T12:30:00.000Z',DIRECTOR_REPORT_TITLES[0]],
    ['2026-09-15T13:35:00Z','2026-09-15T12:30:00.000Z','2026-09-15T13:30:00.000Z',DIRECTOR_REPORT_TITLES[1]],
  ]){
    const groups=reportsDueForDesignation('director',new Date(now),20,settings);
    assert.equal(groups.length,1);
    assert.deepEqual(isoWindow(groups[0].window),{start,end});
    assert.deepEqual(groups[0].reports,[title]);
  }
  assert.equal(scheduledReportWindow(settings.designations.director.schedules[1],new Date('2026-09-15T13:35:00Z')).start.toISOString(),'2026-09-14T13:30:00.000Z','single-rule API retains its own recurrence');
});

test('weekly-only users retain weekly windows while legacy weekday rows use the previous chosen weekday',()=>{
  const weekly=settingsForWindow({cadence:'weekly',weekday:6,times:['19:00']});
  assert.deepEqual(isoWindow(reportsDueForDesignation('director',new Date('2026-09-05T13:35:00Z'),20,weekly)[0].window),{
    start:'2026-08-29T13:30:00.000Z',end:'2026-09-05T13:30:00.000Z',
  });
  const weekdays=applyHierarchyDeliveryRule(defaultHierarchyReportScheduleSettings(),'director',{
    scheduleDays:'Monday | Wednesday | Friday',scheduleTimes:'07:15 | 19:10',reportAccess:DIRECTOR_REPORT_TITLES[0],
  });
  assert.deepEqual(isoWindow(reportsDueForDesignation('director',new Date('2026-09-07T01:50:00Z'),20,weekdays)[0].window),{
    start:'2026-09-04T13:40:00.000Z',end:'2026-09-07T01:45:00.000Z',
  });
  assert.deepEqual(isoWindow(reportsDueForDesignation('director',new Date('2026-09-09T01:50:00Z'),20,weekdays)[0].window),{
    start:'2026-09-07T13:40:00.000Z',end:'2026-09-09T01:45:00.000Z',
  });
});

test('weekly CRM days skip the weekend and support multiple minute slots on each chosen day',()=>{
  const schedule={enabled:true,days:[1,3,5],times:['07:05','19:15']};
  assert.deepEqual(isoWindow(scheduledReportWindow(schedule,new Date('2026-09-07T01:40:00Z'))),{
    start:'2026-09-04T13:45:00.000Z',end:'2026-09-07T01:35:00.000Z',
  });
  assert.deepEqual(isoWindow(scheduledReportWindow({...schedule,cadence:'weekly',weekdays:[1,3,5]},new Date('2026-09-07T13:50:00Z'))),{
    start:'2026-09-07T01:35:00.000Z',end:'2026-09-07T13:45:00.000Z',
  });
});

test('calendar interval windows find actual prior dates across short, leap and year-boundary months',()=>{
  for(const [intervalDays,end,start] of [
    [3,'2026-09-03','2026-08-30'],
    [5,'2026-03-05','2026-02-25'],
    [7,'2028-03-07','2028-02-28'],
    [31,'2028-03-31','2028-01-31'],
    [7,'2027-01-07','2026-12-28'],
  ]){
    const schedule={cadence:'interval',intervalDays,times:['19:00']};
    const now=new Date(`${end}T13:35:00Z`);
    assert.deepEqual(isoWindow(scheduledReportWindow(schedule,now)),{start:`${start}T13:30:00.000Z`,end:`${end}T13:30:00.000Z`});
    assert.deepEqual(isoWindow(reportsDueForDesignation('director',now,20,settingsForWindow(schedule))[0].window),isoWindow(scheduledReportWindow(schedule,now)));
  }
});

test('delivery grace is inclusive at 20 minutes, with no early or expired occurrence',()=>{
  const settings=settingsForWindow({cadence:'daily',times:['19:00']});
  for(const [time,count] of [['13:29:59.999',0],['13:30:00.000',1],['13:50:00.000',1],['13:50:00.001',0]]){
    assert.equal(reportsDueForDesignation('director',new Date(`2026-09-15T${time}Z`),20,settings).length,count,time);
  }
  assert.equal(reportsDueForDesignation('director',new Date('2026-09-15T13:30:00Z'),0,settings).length,1);
  assert.deepEqual(reportsDueForDesignation('director',new Date('2026-09-15T13:30:00Z'),-1,settings),[]);
});

test('midnight grace uses the actual prior date and stable claim key for daily and weekly slots',()=>{
  for(const schedule of [{cadence:'daily'},{cadence:'weekly',weekday:1}]){
    const settings=settingsForWindow({...schedule,times:['23:55']});
    const first=reportsDueForDesignation('director',new Date('2026-09-07T18:25:00Z'),20,settings);
    const delayed=reportsDueForDesignation('director',new Date('2026-09-07T18:40:00Z'),20,settings);
    assert.equal(first.length,1);
    assert.deepEqual(delayed,first);
    assert.equal(first[0].slotKey,'2026-09-07-director-window-2355');
    assert.equal(first[0].window.end.toISOString(),'2026-09-07T18:25:00.000Z');
    assert.equal(reportsDueForDesignation('director',new Date('2026-09-07T18:45:00.001Z'),20,settings).length,0);
  }
  assert.deepEqual(isoWindow(scheduledReportWindow({times:['00:00']},new Date('2026-12-31T18:35:00Z'))),{
    start:'2026-12-30T18:30:00.000Z',end:'2026-12-31T18:30:00.000Z',
  });
});

test('close minute slots each have one stable claim and half-open windows assign boundary events once',()=>{
  const settings=settingsForWindow({cadence:'daily',times:['19:10','19:00','19:10']});
  const due=reportsDueForDesignation('director',new Date('2026-09-15T13:45:00Z'),20,settings);
  assert.equal(due.length,2);
  assert.equal(new Set(due.map(({slotKey})=>slotKey)).size,2);
  assert.equal(due[0].window.end.getTime(),due[1].window.start.getTime());
  assert.deepEqual(due,reportsDueForDesignation('director',new Date('2026-09-15T13:48:00Z'),20,settings));
  const events=['2026-09-14T13:40:00Z','2026-09-15T13:29:59.999Z','2026-09-15T13:30:00Z','2026-09-15T13:39:59.999Z'].map((value)=>new Date(value));
  for(const event of events)assert.equal(due.filter(({window})=>event>=window.start&&event<window.end).length,1);
  const end=due[1].window.end;
  assert.equal(due.filter(({window})=>end>=window.start&&end<window.end).length,0);
});

test('window helper rejects disabled, invalid, event and empty-day schedules',()=>{
  for(const schedule of [null,{enabled:false,times:['19:00']},{cadence:'event',times:['19:00']},{eventBased:true,times:['19:00']},{times:['99:00']},{times:[]},{cadence:'weekly',times:['19:00']},{times:['19:00'],days:[]},{cadence:'interval',intervalDays:0,times:['19:00']}]){
    assert.equal(scheduledReportWindow(schedule,new Date('2026-09-15T13:35:00Z')),null);
  }
  assert.equal(scheduledReportWindow({times:['19:00']},new Date('invalid')),null);
});

test('hierarchy report scheduler is wired into the server',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(server,/flowDesignationForUser/);
  assert.match(server,/reportsDueForDesignation/);
  assert.match(server,/applyHierarchyDeliveryRule/);
  assert.match(server,/effectiveScheduleSettings/);
  assert.match(server,/sendScheduledHierarchyReportBundles/);
  assert.match(server,/storedHierarchyReportScheduleSettings/);
  assert.match(server,/designationSettings\?\.recipientLogins\?\.includes\(login\)/);
  assert.match(server,/HIERARCHY-\$\{designation\.key\}-\$\{scheduleKey\}/);
  assert.match(server,/Director schedule is handled by the hierarchy report flow/);
});
