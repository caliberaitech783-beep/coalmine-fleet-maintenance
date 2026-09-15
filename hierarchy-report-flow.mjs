import {canonicalReportTitle,DIRECTOR_REPORT_TITLES} from './director-report-bundle.mjs';
import {formatDisplayTime} from './date-time-format.mjs';
import {whatsAppRecipientRole} from './whatsapp-recipient-policy.mjs';
import {scheduledReportTimes as scheduleTimes,scheduledReportWindow,scheduledReportWindowsDue} from './report-delivery-window.mjs';
export {scheduledReportWindow} from './report-delivery-window.mjs';

const INDIA_OFFSET_MS=330*60*1000;
const REPORT={
  OPEN_BD:DIRECTOR_REPORT_TITLES[0],
  CLOSING_BD:DIRECTOR_REPORT_TITLES[1],
  MIS_VERIFICATION:DIRECTOR_REPORT_TITLES[2],
  ROAD_STATUS:DIRECTOR_REPORT_TITLES[3],
  VEHICLE_TRANSFER:DIRECTOR_REPORT_TITLES[4],
  LOCATION_WISE:DIRECTOR_REPORT_TITLES[5],
  IDLE_VEHICLE:DIRECTOR_REPORT_TITLES[6],
  RECENT_BREAKDOWN:DIRECTOR_REPORT_TITLES[7],
  OFFROAD_TO_MIS:DIRECTOR_REPORT_TITLES[8],
  EVENT_OPEN_TAT:DIRECTOR_REPORT_TITLES[9],
  EVENT_CLOSE_MIS:DIRECTOR_REPORT_TITLES[10],
  IDLE_PM:DIRECTOR_REPORT_TITLES[11],
  IDLE_FIRST_TRIP:DIRECTOR_REPORT_TITLES[12],
  IN_OUT:DIRECTOR_REPORT_TITLES[13],
};

const commonDaily=[REPORT.OPEN_BD,REPORT.CLOSING_BD,REPORT.MIS_VERIFICATION,REPORT.ROAD_STATUS];
const weeklyFleet=[REPORT.VEHICLE_TRANSFER,REPORT.LOCATION_WISE];
const dailyOperational=[REPORT.IDLE_VEHICLE,REPORT.RECENT_BREAKDOWN,REPORT.OFFROAD_TO_MIS,REPORT.EVENT_OPEN_TAT,REPORT.EVENT_CLOSE_MIS,REPORT.IDLE_PM,REPORT.IDLE_FIRST_TRIP,REPORT.IN_OUT];
const eventCore=[REPORT.OPEN_BD,REPORT.CLOSING_BD,REPORT.MIS_VERIFICATION];
const oemClosing=[REPORT.CLOSING_BD];
export const GENERAL_REPORT_TITLES=[REPORT.ROAD_STATUS,REPORT.VEHICLE_TRANSFER,REPORT.LOCATION_WISE,REPORT.RECENT_BREAKDOWN,REPORT.IN_OUT];
const GENERAL_REPORT_DESIGNATIONS=new Set(['director','projectManager','productionManager','productionSupervisor','maintenanceManager','maintenanceSupervisor','misManager','misSupervisor']);
const GENERAL_REPORT_SCHEDULE_KEY='general-daily-19';
const TIME_PATTERN=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ALLOWED_REPORTS=new Set(DIRECTOR_REPORT_TITLES);
export const HIERARCHY_WEEK_DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const WEEKDAY_NUMBER=new Map(HIERARCHY_WEEK_DAYS.map((day,index)=>[day.toLowerCase(),(index+1)%7]));

export const HIERARCHY_REPORT_DESIGNATIONS={
  superAdmin:{label:'Super Admin',level:1,schedules:[
    {key:'daily-19',label:'Daily consolidate @ 07:00:00 PM',hours:[19],reports:[...DIRECTOR_REPORT_TITLES]},
    {key:'weekly-sat-19',label:'Weekly once consolidate (Saturday @ 07:00:00 PM)',hours:[19],weekday:6,reports:weeklyFleet},
  ]},
  admin:{label:'Admin',level:1,schedules:[
    {key:'daily-19',label:'Daily consolidate @ 07:00:00 PM',hours:[19],reports:[...DIRECTOR_REPORT_TITLES]},
    {key:'weekly-sat-19',label:'Weekly once consolidate (Saturday @ 07:00:00 PM)',hours:[19],weekday:6,reports:weeklyFleet},
  ]},
  director:{label:"Director's",level:1,schedules:[
    {key:'daily-19',label:'Daily consolidate @ 07:00:00 PM',hours:[19],reports:[...commonDaily,...dailyOperational]},
    {key:'weekly-sat-19',label:'Weekly once consolidate (Saturday @ 07:00:00 PM)',hours:[19],weekday:6,reports:weeklyFleet},
  ]},
  projectManager:{label:'Project Manager (P.M)',level:2,schedules:[
    {key:'daily-08-18',label:'Daily consolidate twice @ 08:00:00 AM & 06:00:00 PM',hours:[8,18],reports:commonDaily},
    {key:'weekly-sat-19',label:'Weekly once consolidate (Saturday @ 07:00:00 PM)',hours:[19],weekday:6,reports:weeklyFleet},
    {key:'daily-19',label:'Daily consolidate @ 07:00:00 PM',hours:[19],reports:dailyOperational},
  ]},
  productionManager:{label:'Production Manager',level:3,schedules:[
    {key:'daily-08-18',label:'Daily twice consolidate @ 08:00:00 AM & 06:00:00 PM',hours:[8,18],reports:commonDaily},
    {key:'daily-19',label:'Daily consolidate @ 07:00:00 PM',hours:[19],reports:dailyOperational},
  ]},
  productionSupervisor:{label:'Production Incharge / Supervisor',level:4,schedules:[
    {key:GENERAL_REPORT_SCHEDULE_KEY,hours:[19],reports:[...eventCore,...GENERAL_REPORT_TITLES]},
  ]},
  maintenanceManager:{label:'Maintenance Manager',level:3,schedules:[
    {key:'daily-08-18',label:'Daily twice consolidate @ 08:00:00 AM & 06:00:00 PM',hours:[8,18],reports:commonDaily},
    {key:'daily-19',label:'Daily consolidate @ 07:00:00 PM',hours:[19],reports:dailyOperational},
  ]},
  maintenanceSupervisor:{label:'Maintenance Incharge / Supervisor',level:4,schedules:[
    {key:GENERAL_REPORT_SCHEDULE_KEY,hours:[19],reports:[...eventCore,...GENERAL_REPORT_TITLES]},
  ]},
  misManager:{label:'MIS Manager',level:3,schedules:[
    {key:'daily-08-18',label:'Daily twice consolidate @ 08:00:00 AM & 06:00:00 PM',hours:[8,18],reports:[REPORT.CLOSING_BD,REPORT.MIS_VERIFICATION,REPORT.ROAD_STATUS]},
    {key:'daily-19',label:'Daily consolidate @ 07:00:00 PM',hours:[19],reports:dailyOperational},
  ]},
  misSupervisor:{label:'MIS Incharge / Supervisor',level:4,schedules:[
    {key:GENERAL_REPORT_SCHEDULE_KEY,hours:[19],reports:[REPORT.CLOSING_BD,REPORT.MIS_VERIFICATION,...GENERAL_REPORT_TITLES]},
  ]},
  oemNationalHead:{label:'National Head',level:1,schedules:[
    {key:'every-7-days-19',label:'Every 7th day consolidate @ 07:00:00 PM',hours:[19],intervalDays:7,reports:oemClosing},
  ]},
  oemRegionalHead:{label:'Regional Head / Zonal Head',level:2,schedules:[
    {key:'every-5-days-19',label:'Every 5th day consolidate @ 07:00:00 PM',hours:[19],intervalDays:5,reports:oemClosing},
  ]},
  oemAreaServiceEngineer:{label:'Area Service engineer',level:3,schedules:[
    {key:'every-3-days-19',label:'Every 3rd day consolidate @ 07:00:00 PM',hours:[19],intervalDays:3,reports:oemClosing},
  ]},
  oemServiceEngineer:{label:'Service Engineer / Site Service Engineer',level:4,schedules:[
    {key:'daily-19',label:'Every day consolidate @ 07:00:00 PM',hours:[19],reports:oemClosing},
  ]},
};

function isLegacyEventSchedule(schedule={}){
  if(['daily','weekly','interval'].includes(schedule.cadence))return false;
  return Boolean(schedule.eventBased||['event','every-event','every event'].includes(words(schedule.cadence))||(!schedule.cadence&&schedule.key==='every-event'));
}

function scheduleCadence(schedule={}){
  if(['daily','weekly','interval'].includes(schedule.cadence))return schedule.cadence;
  if(isLegacyEventSchedule(schedule))return 'daily';
  if(schedule.intervalDays||schedule.cadence==='interval')return 'interval';
  if(schedule.weekday!=null||schedule.cadence==='weekly')return 'weekly';
  return 'daily';
}

function configuredSchedule(schedule={},index=0){
  const cadence=scheduleCadence(schedule);
  const times=scheduleTimes(schedule);
  const reports=[...new Set((Array.isArray(schedule.reports)?schedule.reports:[]).map(canonicalReportTitle).filter((title)=>ALLOWED_REPORTS.has(title)))];
  return {
    key:clean(schedule.key)||`schedule-${index+1}`,
    enabled:schedule.enabled!==false,
    cadence,
    weekday:cadence==='weekly'?Math.min(6,Math.max(0,Math.trunc(Number(schedule.weekday))||0)):null,
    intervalDays:cadence==='interval'?Math.min(31,Math.max(2,Math.trunc(Number(schedule.intervalDays))||7)):null,
    ...(Array.isArray(schedule.weekdays)?{weekdays:[...new Set(schedule.weekdays.filter((day)=>Number.isInteger(day)&&day>=0&&day<=6))]}:{}),
    ...(Array.isArray(schedule.days)?{days:[...new Set(schedule.days.filter((day)=>Number.isInteger(day)&&day>=0&&day<=6))]}:{}),
    times,
    reports,
  };
}

// Migrate selected event titles once, using the user's/role's existing active
// timed slot. Never invent report selections, alter timed slots or unpause them.
function scheduledOnlySchedules(designationKey,schedules=[],roleSchedules){
  const timed=schedules.filter((schedule)=>!isLegacyEventSchedule(schedule)).map(configuredSchedule);
  const legacy=schedules.filter(isLegacyEventSchedule).map(configuredSchedule);
  if(!legacy.length)return timed;
  const assigned=new Set(timed.flatMap((schedule)=>schedule.reports));
  const missing=[...new Set(legacy.filter((schedule)=>schedule.enabled).flatMap((schedule)=>schedule.reports))].filter((title)=>!assigned.has(title));
  const active=timed.find((schedule)=>schedule.enabled&&schedule.times.length&&schedule.reports.length);
  if(active&&missing.length)active.reports.push(...missing);
  if(!active&&!timed.length&&missing.length){
    const defaults=roleSchedules??HIERARCHY_REPORT_DESIGNATIONS[designationKey]?.schedules??[];
    const fallback=defaults.find((schedule)=>schedule.enabled!==false&&!isLegacyEventSchedule(schedule)&&scheduleTimes(schedule).length);
    // An explicitly paused/empty role configuration must not gain a new slot.
    if(fallback||roleSchedules===undefined)timed.push(configuredSchedule({...fallback,key:fallback?.key||'daily-19',times:fallback?scheduleTimes(fallback):['19:00'],reports:missing}));
  }
  // Retain disabled choices as disabled scheduled entries for later editing.
  for(const schedule of legacy.filter((schedule)=>!schedule.enabled)){
    timed.push({...schedule,times:schedule.times.length?schedule.times:['19:00']});
  }
  // When all existing timed slots are paused/cleared, retain any unplaced
  // selections in a paused row instead of silently dropping or delivering them.
  const retained=new Set(timed.flatMap((schedule)=>schedule.reports));
  for(const schedule of legacy.filter((schedule)=>schedule.enabled)){
    const reports=schedule.reports.filter((title)=>!retained.has(title));
    if(!reports.length)continue;
    timed.push({...schedule,enabled:false,times:schedule.times.length?schedule.times:['19:00'],reports});
    reports.forEach((title)=>retained.add(title));
  }
  return timed;
}

// Populate fresh defaults only. Saved lists (including removed choices) are final.
function withGeneralReportSchedule(designationKey,schedules=[]){
  if(!GENERAL_REPORT_DESIGNATIONS.has(designationKey))return schedules;
  const assigned=new Set(schedules.flatMap((schedule)=>schedule.reports||[]));
  const missing=GENERAL_REPORT_TITLES.filter((title)=>!assigned.has(title));
  if(!missing.length)return schedules;
  const existingIndex=schedules.findIndex((schedule)=>schedule.key===GENERAL_REPORT_SCHEDULE_KEY);
  if(existingIndex>=0)return schedules.map((schedule,index)=>index===existingIndex?{...schedule,reports:[...new Set([...schedule.reports,...missing])]}:schedule);
  return [...schedules,configuredSchedule({key:GENERAL_REPORT_SCHEDULE_KEY,cadence:'daily',times:['19:00'],reports:missing},schedules.length)];
}

export function defaultHierarchyReportScheduleSettings(){
  return {designations:Object.fromEntries(Object.entries(HIERARCHY_REPORT_DESIGNATIONS).map(([key,designation])=>[key,{
    enabled:true,
    allRecipients:true,
    recipientLogins:[],
    managedByHierarchy:false,
    managedByReportSettings:false,
    schedules:withGeneralReportSchedule(key,designation.schedules.map(configuredSchedule)),
  }]))};
}

export function normalizeHierarchyReportScheduleSettings(value={}){
  const defaults=defaultHierarchyReportScheduleSettings();
  const supplied=value?.designations&&typeof value.designations==='object'?value.designations:{};
  return {designations:Object.fromEntries(Object.keys(HIERARCHY_REPORT_DESIGNATIONS).map((key)=>{
    const current=supplied[key];
    if(!current||typeof current!=='object')return [key,defaults.designations[key]];
    const managedByHierarchy=current.managedByHierarchy===true;
    const schedules=scheduledOnlySchedules(key,(Array.isArray(current.schedules)?current.schedules:[]).slice(0,20));
    return [key,{
      enabled:current.enabled!==false,
      allRecipients:current.allRecipients!==false,
      recipientLogins:[...new Set((Array.isArray(current.recipientLogins)?current.recipientLogins:[]).map((login)=>clean(login).toLowerCase()).filter(Boolean))].slice(0,500),
      managedByHierarchy,
      managedByReportSettings:current.managedByReportSettings===true,
      schedules,
    }];
  }))};
}

function hierarchyList(value){
  return [...new Set(String(value??'').split(/\s*\|\s*/).map(clean).filter(Boolean))];
}

export function applyHierarchyDeliveryRule(settings,designationKey,rule={}){
  const normalized=normalizeHierarchyReportScheduleSettings(settings||{});
  if(!Object.prototype.hasOwnProperty.call(rule,'scheduleDays')&&!Object.prototype.hasOwnProperty.call(rule,'scheduleTimes'))return normalized;
  const designation=normalized.designations[designationKey];
  if(!designation)return normalized;
  if(designation.managedByReportSettings===true)return normalized;
  if(!designation.schedules.some((schedule)=>schedule.enabled&&schedule.reports.length))return normalized;
  const weekdays=[...new Set(hierarchyList(rule.scheduleDays).map((day)=>WEEKDAY_NUMBER.get(day.toLowerCase())).filter((day)=>day!=null))];
  const times=hierarchyList(rule.scheduleTimes).filter((time)=>TIME_PATTERN.test(time)).slice(0,6);
  const activeReports=new Set(designation.schedules.filter((schedule)=>schedule.enabled).flatMap((schedule)=>schedule.reports));
  const pausedReports=new Set(designation.schedules.filter((schedule)=>!schedule.enabled).flatMap((schedule)=>schedule.reports).filter((title)=>!activeReports.has(title)));
  const reports=hierarchyList(rule.reportAccess).map(canonicalReportTitle).filter((title)=>ALLOWED_REPORTS.has(title)&&!pausedReports.has(title));
  let scheduled=[];
  if(weekdays.length&&times.length&&reports.length){
    scheduled=weekdays.length===7
      ? [configuredSchedule({key:'hierarchy-daily',cadence:'daily',times,reports})]
      : weekdays.map((weekday)=>configuredSchedule({key:`hierarchy-weekday-${weekday}`,cadence:'weekly',weekday,times,reports}));
  }
  return {designations:{...normalized.designations,[designationKey]:{
    ...designation,
    managedByHierarchy:true,
    schedules:[...designation.schedules.filter((schedule)=>!schedule.enabled),...scheduled],
  }}};
}

export function reportsAssignedToDesignation(settings,designationKey){
  return [...new Set((settings?.designations?.[designationKey]?.schedules||[]).flatMap((schedule)=>schedule.reports||[]))];
}

// A user's personal copy of their role schedule. The administrator's role
// configuration decides which reports may be chosen; the frequency, IST times and
// the selection within that list belong to the user.
// Optional `roleSchedules` supplies current role timing for event-only migration;
// applyUserReportScheduleOverride supplies it automatically.
export function normalizeUserReportSchedule(value,{designationKey='',allowedReports=[],roleSchedules}={}){
  if(!value||typeof value!=='object')return null;
  const allowed=new Set(allowedReports.map(canonicalReportTitle));
  const key=clean(value.designationKey)||clean(designationKey);
  const schedules=scheduledOnlySchedules(key,(Array.isArray(value.schedules)?value.schedules:[]).slice(0,20),roleSchedules)
    .map((schedule)=>({...schedule,reports:schedule.reports.filter((title)=>allowed.has(title))}));
  return {
    designationKey:key,
    enabled:value.enabled!==false,
    schedules,
    updatedAt:clean(value.updatedAt)||null,
  };
}

export function userReportScheduleValidationError(userSchedule){
  if(!userSchedule||!userSchedule.enabled)return '';
  for(const schedule of userSchedule.schedules){
    if(!schedule.enabled)continue;
    if(!schedule.times.length)return 'Add at least one IST time to each active schedule.';
    if(!schedule.reports.length)return 'Select at least one report for each active schedule.';
  }
  return '';
}

// Effective delivery settings for one user: the role default (already adjusted by any
// Hierarchy master rule) unless that user saved a personal schedule for the same role.
// The administrator's Active switch for the role still pauses the personal schedule.
export function applyUserReportScheduleOverride(settings,designationKey,userSchedule){
  const normalized=normalizeHierarchyReportScheduleSettings(settings||{});
  const designation=normalized.designations[designationKey];
  if(!designation||!userSchedule||typeof userSchedule!=='object')return normalized;
  const personal=normalizeUserReportSchedule(userSchedule,{designationKey,allowedReports:reportsAssignedToDesignation(normalized,designationKey),roleSchedules:designation.schedules});
  if(personal.designationKey&&personal.designationKey!==designationKey)return normalized;
  return {designations:{...normalized.designations,[designationKey]:{
    ...designation,
    enabled:designation.enabled&&personal.enabled,
    // The user's list is final: never re-add a General Reports slot they removed.
    managedByHierarchy:true,
    schedules:personal.schedules,
  }}};
}

export function hierarchyScheduleLabel(schedule={}){
  if(isLegacyEventSchedule(schedule))return hierarchyScheduleLabel({...configuredSchedule(schedule),times:scheduleTimes(schedule).length?scheduleTimes(schedule):['19:00']});
  const times=(schedule.times||[]).map((time)=>formatDisplayTime(time)).join(' & ')||'Time not set';
  if(schedule.cadence==='weekly')return `Weekly on ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][schedule.weekday]||'Sunday'} @ ${times}`;
  if(schedule.cadence==='interval')return `Every ${schedule.intervalDays||7} days @ ${times}`;
  return `Daily @ ${times}`;
}

function clean(value){return String(value??'').trim()}
function words(value){return clean(value).toLowerCase().replace(/\s+/g,' ')}
function includesAny(text,needles){return needles.some((needle)=>text.includes(needle))}

export function hierarchyIndiaParts(now=new Date()){
  const shifted=new Date(now.getTime()+INDIA_OFFSET_MS);
  return {
    year:shifted.getUTCFullYear(),
    month:shifted.getUTCMonth()+1,
    day:shifted.getUTCDate(),
    weekday:shifted.getUTCDay(),
    hour:shifted.getUTCHours(),
    minute:shifted.getUTCMinutes(),
  };
}

export function hierarchyReportSlotKey({now=new Date(),designationKey,scheduleKey,slotTime}={}){
  const local=hierarchyIndiaParts(now);
  const timeKey=clean(slotTime).replace(':','')||String(local.hour).padStart(2,'0');
  return `${local.year}-${String(local.month).padStart(2,'0')}-${String(local.day).padStart(2,'0')}-${designationKey}-${scheduleKey}-${timeKey}`;
}

export function reportsDueForDesignation(designationKey,now=new Date(),graceMinutes=20,settings=null){
  const designation=HIERARCHY_REPORT_DESIGNATIONS[designationKey];
  if(!designation)return [];
  const configured=normalizeHierarchyReportScheduleSettings(settings||{}).designations[designationKey];
  if(configured?.enabled===false)return [];
  const schedules=configured.schedules.filter((schedule)=>schedule.enabled&&schedule.reports.length);
  const windowsByEnd=new Map();
  const deliveryWindow=(window)=>{
    const end=window.end.getTime();
    if(!windowsByEnd.has(end)){
      // Report rows choose which titles are due; all active rows together choose
      // the user's delivery timetable. Coincident rows share the same window.
      const beforeEnd=new Date(end-1);
      const start=Math.max(...schedules.map((schedule)=>scheduledReportWindow(schedule,beforeEnd)?.end.getTime()??-Infinity));
      windowsByEnd.set(end,{start:new Date(start),end:window.end});
    }
    return windowsByEnd.get(end);
  };
  const seen=new Set();
  return schedules
    .flatMap((schedule)=>scheduledReportWindowsDue(schedule,now,graceMinutes).map((window)=>({schedule,window:deliveryWindow(window)})))
    .map(({schedule,window})=>({
      designationKey,
      designationLabel:designation.label,
      level:designation.level,
      scheduleKey:schedule.key,
      scheduleLabel:schedule.label||hierarchyScheduleLabel(schedule),
      reports:[...new Set(schedule.reports)],
      window,
      slotKey:hierarchyReportSlotKey({now:window.end,designationKey,scheduleKey:schedule.key,slotTime:new Date(window.end.getTime()+INDIA_OFFSET_MS).toISOString().slice(11,16)}),
    })).filter((group)=>{
      if(seen.has(group.slotKey))return false;
      seen.add(group.slotKey);
      return true;
    });
}

// Individual workflow alerts have their own delivery path; reports are timed only.
export function reportsForHierarchyEvent(){return []}

export function flowDesignationForUser(user={},profile={}){
  const managerRoles=profile?.permissions?.managerRoles||[];
  const fields=[user.level,user.hierarchyLevel,user.userGroup,user.adminLevel,user.designation,user.role,user.department,user.employee,user.name,user.oemRole,user.managerRole,managerRoles.join(' '),profile.assignedRole].map(words).join(' ');
  const adminLevel=words(user.adminLevel||profile?.permissions?.adminLevel);
  const policyRole=whatsAppRecipientRole(user,profile);
  // Super Admin is a reporting authority of its own, before job designations.
  if(policyRole==='superAdmin')return {key:'superAdmin',...HIERARCHY_REPORT_DESIGNATIONS.superAdmin};
  if(policyRole==='director'||fields.includes('director'))return {key:'director',...HIERARCHY_REPORT_DESIGNATIONS.director};
  if(includesAny(fields,['project manager','p.m','pm manager'])||adminLevel==='project manager')return {key:'projectManager',...HIERARCHY_REPORT_DESIGNATIONS.projectManager};
  if(includesAny(fields,['national head']))return {key:'oemNationalHead',...HIERARCHY_REPORT_DESIGNATIONS.oemNationalHead};
  if(includesAny(fields,['regional head','zonal head']))return {key:'oemRegionalHead',...HIERARCHY_REPORT_DESIGNATIONS.oemRegionalHead};
  if(includesAny(fields,['area service engineer']))return {key:'oemAreaServiceEngineer',...HIERARCHY_REPORT_DESIGNATIONS.oemAreaServiceEngineer};
  if(includesAny(fields,['site service engineer','service engineer']))return {key:'oemServiceEngineer',...HIERARCHY_REPORT_DESIGNATIONS.oemServiceEngineer};
  if(includesAny(fields,['production manager'])||managerRoles.includes('Production Manager'))return {key:'productionManager',...HIERARCHY_REPORT_DESIGNATIONS.productionManager};
  if(fields.includes('production')&&includesAny(fields,['incharge','supervisor']))return {key:'productionSupervisor',...HIERARCHY_REPORT_DESIGNATIONS.productionSupervisor};
  if(includesAny(fields,['maintenance manager'])||managerRoles.includes('Maintenance Manager'))return {key:'maintenanceManager',...HIERARCHY_REPORT_DESIGNATIONS.maintenanceManager};
  if(fields.includes('maintenance')&&includesAny(fields,['incharge','supervisor']))return {key:'maintenanceSupervisor',...HIERARCHY_REPORT_DESIGNATIONS.maintenanceSupervisor};
  if(includesAny(fields,['mis manager'])||managerRoles.includes('MIS Manager'))return {key:'misManager',...HIERARCHY_REPORT_DESIGNATIONS.misManager};
  if(fields.includes('mis')&&includesAny(fields,['incharge','supervisor']))return {key:'misSupervisor',...HIERARCHY_REPORT_DESIGNATIONS.misSupervisor};
  if(policyRole==='manager')return {key:'projectManager',...HIERARCHY_REPORT_DESIGNATIONS.projectManager};
  if(adminLevel==='admin'||[user.designation,user.userGroup,user.role,profile.assignedRole].some((value)=>words(value)==='admin'))return {key:'admin',...HIERARCHY_REPORT_DESIGNATIONS.admin};
  if(profile.assignedRole==='Production User')return {key:'productionSupervisor',...HIERARCHY_REPORT_DESIGNATIONS.productionSupervisor};
  if(profile.assignedRole==='Maintenance User')return {key:'maintenanceSupervisor',...HIERARCHY_REPORT_DESIGNATIONS.maintenanceSupervisor};
  if(profile.assignedRole==='MIS User')return {key:'misSupervisor',...HIERARCHY_REPORT_DESIGNATIONS.misSupervisor};
  return null;
}
