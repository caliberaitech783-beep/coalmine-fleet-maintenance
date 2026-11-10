import test from 'node:test';
import assert from 'node:assert/strict';
import {HIERARCHY_REPORT_DESIGNATIONS,applyHierarchyDeliveryRule,applyUserReportScheduleOverride,defaultHierarchyReportScheduleSettings,flowDesignationForUser,reportsDueForDesignation} from '../hierarchy-report-flow.mjs';
import {defaultWhatsAppReportSettings} from '../whatsapp-report-settings.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {crmReportsPossiblyDue,hierarchyReportsPossiblyDue} from '../scheduled-report-due.mjs';

const CLOSING_BD=DIRECTOR_REPORT_TITLES[1];
// 2026-09-11 is a Friday; 2026-09-14 a Monday. Times below are IST (UTC+05:30).
const ist=(day,time)=>new Date(`2026-09-${day}T${time}:00+05:30`);
const settings=()=>defaultHierarchyReportScheduleSettings();

test('role defaults: due inside the grace after a configured time, not between times',()=>{
  const timetables={scheduleSettings:settings()};
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','19:05'),...timetables}),true,'19:00 daily rows');
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','08:19'),...timetables}),true,'08:00 manager rows, last minute of grace');
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','08:21'),...timetables}),false,'grace over');
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','12:05'),...timetables}),false,'no default row at noon');
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','03:00'),...timetables}),false);
});

test('a personal schedule makes its own time due, and only for its own role',()=>{
  const personal={designationKey:'misSupervisor',enabled:true,schedules:[{key:'mine',cadence:'daily',times:['12:00'],reports:[CLOSING_BD]}]};
  const overrides=new Map([['mis-a',personal]]);
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','12:05'),scheduleSettings:settings(),userScheduleOverrides:overrides}),true);
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','12:05'),scheduleSettings:settings(),userScheduleOverrides:new Map([['mis-a',{...personal,enabled:false}]])}),false,'a paused personal schedule is not due');
  const paused=settings();paused.designations.misSupervisor.enabled=false;
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','12:05'),scheduleSettings:paused,userScheduleOverrides:overrides}),false,'the administrator\'s role pause still applies');
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','12:05'),scheduleSettings:settings(),userScheduleOverrides:{'mis-a':personal}}),true,'a plain object of overrides is accepted');
});

test('a Hierarchy master delivery rule moves the role to its own days and times',()=>{
  const rule={designation:HIERARCHY_REPORT_DESIGNATIONS.misSupervisor.label,scheduleDays:'Monday',scheduleTimes:'12:00',reportAccess:CLOSING_BD};
  assert.equal(hierarchyReportsPossiblyDue({now:ist('14','12:05'),scheduleSettings:settings(),hierarchyRows:[{record_data:rule}]}),true,'Monday 12:00 under the rule');
  assert.equal(hierarchyReportsPossiblyDue({now:ist('14','12:05'),scheduleSettings:settings()}),false,'nothing at Monday noon without the rule');
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','12:05'),scheduleSettings:settings(),hierarchyRows:[rule]}),false,'the rule does not cover Friday');
});

test('personalOnly ignores role timetables, which is what the CRM report needs',()=>{
  const personal={designationKey:'director',enabled:true,schedules:[{key:'mine',cadence:'daily',times:['19:00'],reports:[CLOSING_BD]}]};
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','19:05'),scheduleSettings:settings(),personalOnly:true}),false,'no personal schedules at all');
  assert.equal(hierarchyReportsPossiblyDue({now:ist('11','19:05'),scheduleSettings:settings(),userScheduleOverrides:new Map([['d',personal]]),personalOnly:true}),true);
  const crm=defaultWhatsAppReportSettings().crm;
  assert.deepEqual(crm.times,['08:00','15:00','20:00']);
  assert.equal(crmReportsPossiblyDue({now:ist('11','15:05'),crmSettings:crm,scheduleSettings:settings()}),true,'CRM default time');
  assert.equal(crmReportsPossiblyDue({now:ist('11','12:05'),crmSettings:crm,scheduleSettings:settings()}),false);
  assert.equal(crmReportsPossiblyDue({now:ist('11','19:05'),crmSettings:crm,scheduleSettings:settings()}),false,'a role default time is not a CRM time');
  assert.equal(crmReportsPossiblyDue({now:ist('11','19:05'),crmSettings:crm,scheduleSettings:settings(),userScheduleOverrides:new Map([['d',personal]])}),true,'a personal schedule decides that recipient\'s CRM time');
});

// The pre-check must never say "nothing due" when the per-recipient senders would find a due
// window for someone. This replays the senders' own effective-settings construction for a
// mixed set of recipients, rules and personal schedules across a whole day.
test('whenever any recipient is due under the senders\' rules, the pre-check says so',()=>{
  const users=[
    {login:'super',userType:'Super User',adminLevel:'Super Admin'},
    {login:'admin',userType:'Super User',adminLevel:'Admin'},
    {login:'pm',userType:'Super User',adminLevel:'Manager',managerRole:'Project Manager',site:'Sasti OB'},
    {login:'mm',userType:'Super User',adminLevel:'Manager',managerRole:'Maintenance Manager',site:'Sasti OB'},
    {login:'mis-a',userType:'Mobile User',userGroup:'MIS User',site:'Sasti OB'},
    {login:'prod',userType:'Mobile User',userGroup:'Production User',site:'Majri OB'},
    {login:'se',userType:'Super User',adminLevel:'Admin',designation:'Site Service Engineer'},
  ];
  const scheduleSettings=settings();
  scheduleSettings.designations.maintenanceManager.schedules.push({key:'extra',enabled:true,cadence:'daily',times:['13:37'],reports:[CLOSING_BD]});
  const hierarchyRows=[
    {record_data:{designation:HIERARCHY_REPORT_DESIGNATIONS.projectManager.label,scheduleDays:'Friday | Monday',scheduleTimes:'06:10 | 21:40',reportAccess:CLOSING_BD}},
    {record_data:{designation:HIERARCHY_REPORT_DESIGNATIONS.misSupervisor.label,siteAccess:'Sasti OB',reportAccess:CLOSING_BD}},
  ];
  const userScheduleOverrides=new Map([
    ['mis-a',{designationKey:'misSupervisor',enabled:true,schedules:[{key:'mine',cadence:'daily',times:['04:25','16:50'],reports:[CLOSING_BD]}]}],
    ['prod',{designationKey:'productionSupervisor',enabled:true,schedules:[{key:'mine',cadence:'weekly',weekday:5,times:['11:11'],reports:[CLOSING_BD]}]}],
    ['admin',{designationKey:'director',enabled:true,schedules:[{key:'mine',cadence:'daily',times:['09:09'],reports:[CLOSING_BD]}]}],
  ]);
  const ruleFor=designation=>hierarchyRows.map(row=>row.record_data).find(rule=>String(rule.designation||'').trim().toLowerCase()===designation.label.toLowerCase());
  const anyRecipientDue=now=>users.some(user=>{
    const profile=resolveMobileAccess({user}),designation=flowDesignationForUser(user,profile);
    if(!designation)return false;
    const rule=ruleFor(designation);
    const roleSettings=rule?applyHierarchyDeliveryRule(scheduleSettings,designation.key,rule):scheduleSettings;
    const effective=applyUserReportScheduleOverride(roleSettings,designation.key,userScheduleOverrides.get(user.login)||null);
    return reportsDueForDesignation(designation.key,now,20,effective).length>0;
  });
  let dueMinutes=0,quietMinutes=0;
  for(const day of ['11','12','14']){
    for(let minute=0;minute<24*60;minute+=1){
      const now=new Date(ist(day,'00:00').getTime()+minute*60000);
      const recipientsDue=anyRecipientDue(now);
      const possiblyDue=hierarchyReportsPossiblyDue({now,scheduleSettings,hierarchyRows,userScheduleOverrides});
      if(recipientsDue)assert.equal(possiblyDue,true,`${now.toISOString()}: a recipient is due but the pre-check would skip the tick`);
      if(possiblyDue)dueMinutes++;else quietMinutes++;
    }
  }
  assert.ok(dueMinutes>0&&quietMinutes>dueMinutes,`most minutes are quiet (${quietMinutes} quiet, ${dueMinutes} due)`);
});
