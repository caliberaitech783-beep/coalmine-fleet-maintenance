import {canonicalReportTitle,DIRECTOR_REPORT_TITLES} from './director-report-bundle.mjs';

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

export const HIERARCHY_REPORT_DESIGNATIONS={
  director:{label:"Director's",level:1,schedules:[
    {key:'daily-19',label:'Daily consolidate @ 7:00 PM',hours:[19],reports:[...commonDaily,...dailyOperational]},
    {key:'weekly-sat-19',label:'Weekly once consolidate (Saturday @ 7:00 PM)',hours:[19],weekday:6,reports:weeklyFleet},
  ]},
  projectManager:{label:'Project Manager (P.M)',level:2,schedules:[
    {key:'daily-08-18',label:'Daily consolidate twice @ 8:00 AM & 6:00 PM',hours:[8,18],reports:commonDaily},
    {key:'weekly-sat-19',label:'Weekly once consolidate (Saturday @ 7:00 PM)',hours:[19],weekday:6,reports:weeklyFleet},
    {key:'daily-19',label:'Daily consolidate @ 7:00 PM',hours:[19],reports:dailyOperational},
  ]},
  productionManager:{label:'Production Manager',level:3,schedules:[
    {key:'every-event',label:'Every event',eventBased:true,reports:eventCore},
    {key:'daily-08-18',label:'Daily twice consolidate @ 8:00 AM & 6:00 PM',hours:[8,18],reports:[REPORT.ROAD_STATUS]},
    {key:'daily-19',label:'Daily consolidate @ 7:00 PM',hours:[19],reports:dailyOperational},
  ]},
  productionSupervisor:{label:'Production Incharge / Supervisor',level:4,schedules:[
    {key:'every-event',label:'Every event',eventBased:true,reports:eventCore},
  ]},
  maintenanceManager:{label:'Maintenance Manager',level:3,schedules:[
    {key:'every-event',label:'Every event',eventBased:true,reports:eventCore},
    {key:'daily-08-18',label:'Daily twice consolidate @ 8:00 AM & 6:00 PM',hours:[8,18],reports:[REPORT.ROAD_STATUS]},
    {key:'daily-19',label:'Daily consolidate @ 7:00 PM',hours:[19],reports:dailyOperational},
  ]},
  maintenanceSupervisor:{label:'Maintenance Incharge / Supervisor',level:4,schedules:[
    {key:'every-event',label:'Every event',eventBased:true,reports:eventCore},
  ]},
  misManager:{label:'MIS Manager',level:3,schedules:[
    {key:'every-event',label:'Every event',eventBased:true,reports:[REPORT.CLOSING_BD,REPORT.MIS_VERIFICATION]},
    {key:'daily-08-18',label:'Daily twice consolidate @ 8:00 AM & 6:00 PM',hours:[8,18],reports:[REPORT.ROAD_STATUS]},
    {key:'daily-19',label:'Daily consolidate @ 7:00 PM',hours:[19],reports:dailyOperational},
  ]},
  misSupervisor:{label:'MIS Incharge / Supervisor',level:4,schedules:[
    {key:'every-event',label:'Every event',eventBased:true,reports:[REPORT.CLOSING_BD,REPORT.MIS_VERIFICATION]},
  ]},
  oemNationalHead:{label:'National Head',level:1,schedules:[
    {key:'every-7-days-19',label:'Every 7th day consolidate @ 7:00 PM',hours:[19],intervalDays:7,reports:oemClosing},
  ]},
  oemRegionalHead:{label:'Regional Head / Zonal Head',level:2,schedules:[
    {key:'every-5-days-19',label:'Every 5th day consolidate @ 7:00 PM',hours:[19],intervalDays:5,reports:oemClosing},
  ]},
  oemAreaServiceEngineer:{label:'Area Service engineer',level:3,schedules:[
    {key:'every-3-days-19',label:'Every 3rd day consolidate @ 7:00 PM',hours:[19],intervalDays:3,reports:oemClosing},
  ]},
  oemServiceEngineer:{label:'Service Engineer / Site Service Engineer',level:4,schedules:[
    {key:'daily-19',label:'Every day consolidate @ 7:00 PM',hours:[19],reports:oemClosing},
  ]},
};

function scheduleCadence(schedule={}){
  if(schedule.eventBased||schedule.cadence==='event')return 'event';
  if(schedule.intervalDays||schedule.cadence==='interval')return 'interval';
  if(schedule.weekday!=null||schedule.cadence==='weekly')return 'weekly';
  return 'daily';
}

function scheduleTimes(schedule={}){
  const supplied=Array.isArray(schedule.times)?schedule.times:[];
  const fromHours=Array.isArray(schedule.hours)?schedule.hours.map((hour)=>`${String(Number(hour)).padStart(2,'0')}:00`):[];
  return [...new Set((supplied.length?supplied:fromHours).map(clean).filter((time)=>TIME_PATTERN.test(time)))].slice(0,6);
}

function configuredSchedule(schedule={},index=0){
  const cadence=scheduleCadence(schedule);
  const times=cadence==='event'?[]:scheduleTimes(schedule);
  const reports=[...new Set((Array.isArray(schedule.reports)?schedule.reports:[]).map(canonicalReportTitle).filter((title)=>ALLOWED_REPORTS.has(title)))];
  return {
    key:clean(schedule.key)||`schedule-${index+1}`,
    enabled:schedule.enabled!==false,
    cadence,
    weekday:cadence==='weekly'?Math.min(6,Math.max(0,Number(schedule.weekday)||0)):null,
    intervalDays:cadence==='interval'?Math.min(31,Math.max(2,Number(schedule.intervalDays)||7)):null,
    times,
    reports,
  };
}

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
    schedules:withGeneralReportSchedule(key,designation.schedules.map(configuredSchedule)),
  }]))};
}

export function normalizeHierarchyReportScheduleSettings(value={}){
  const defaults=defaultHierarchyReportScheduleSettings();
  const supplied=value?.designations&&typeof value.designations==='object'?value.designations:{};
  return {designations:Object.fromEntries(Object.keys(HIERARCHY_REPORT_DESIGNATIONS).map((key)=>{
    const current=supplied[key];
    if(!current||typeof current!=='object')return [key,defaults.designations[key]];
    return [key,{
      enabled:current.enabled!==false,
      allRecipients:current.allRecipients!==false,
      recipientLogins:[...new Set((Array.isArray(current.recipientLogins)?current.recipientLogins:[]).map((login)=>clean(login).toLowerCase()).filter(Boolean))].slice(0,500),
      schedules:withGeneralReportSchedule(key,(Array.isArray(current.schedules)?current.schedules:[]).slice(0,20).map(configuredSchedule)),
    }];
  }))};
}

export function hierarchyScheduleLabel(schedule={}){
  if(schedule.cadence==='event')return 'Every event';
  const times=(schedule.times||[]).join(' & ')||'Time not set';
  if(schedule.cadence==='weekly')return `Weekly on ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][schedule.weekday]||'Sunday'} @ ${times}`;
  if(schedule.cadence==='interval')return `Every ${schedule.intervalDays||7} days @ ${times}`;
  return `Daily @ ${times}`;
}

function clean(value){return String(value??'').trim()}
function words(value){return clean(value).toLowerCase()}
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

function scheduleDueTime(schedule,now,graceMinutes){
  if(schedule.enabled===false||schedule.eventBased||schedule.cadence==='event')return '';
  const local=hierarchyIndiaParts(now);
  if((schedule.cadence==='weekly'||schedule.weekday!=null)&&local.weekday!==schedule.weekday)return '';
  if((schedule.cadence==='interval'||schedule.intervalDays)&&local.day%schedule.intervalDays!==0)return '';
  return scheduleTimes(schedule).find((time)=>{
    const [hour,minute]=time.split(':').map(Number);
    const slot=new Date(Date.UTC(local.year,local.month-1,local.day,hour,minute)-INDIA_OFFSET_MS);
    const delay=now.getTime()-slot.getTime();
    return delay>=0&&delay<=graceMinutes*60*1000;
  })||'';
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
  return configured.schedules
    .map((schedule)=>({schedule,slotTime:scheduleDueTime(schedule,now,graceMinutes)}))
    .filter(({slotTime})=>Boolean(slotTime))
    .map(({schedule,slotTime})=>({
      designationKey,
      designationLabel:designation.label,
      level:designation.level,
      scheduleKey:schedule.key,
      scheduleLabel:schedule.label||hierarchyScheduleLabel(schedule),
      reports:[...new Set(schedule.reports)],
      slotKey:hierarchyReportSlotKey({now,designationKey,scheduleKey:schedule.key,slotTime}),
    }));
}

export function reportsForHierarchyEvent(designationKey,event,settings=null){
  const title={opened:REPORT.OPEN_BD,closed:REPORT.CLOSING_BD,verified:REPORT.MIS_VERIFICATION}[event?.type];
  if(!title||!clean(event?.request?.ref))return [];
  const designation=HIERARCHY_REPORT_DESIGNATIONS[designationKey];
  const configured=normalizeHierarchyReportScheduleSettings(settings||{}).designations[designationKey];
  if(!designation||!configured?.enabled)return [];
  return configured.schedules.filter((schedule)=>schedule.enabled&&schedule.cadence==='event'&&schedule.reports.includes(title)).map((schedule)=>({
    designationKey,designationLabel:designation.label,level:designation.level,
    scheduleKey:schedule.key,scheduleLabel:`Every event: ${event.type}`,
    reports:[title],slotKey:`event-${encodeURIComponent(event.request.ref)}-${event.type}-${schedule.key}`,
  }));
}

export function flowDesignationForUser(user={},profile={}){
  const managerRoles=profile?.permissions?.managerRoles||[];
  const fields=[user.level,user.hierarchyLevel,user.userGroup,user.adminLevel,user.designation,user.role,user.department,user.employee,user.name,user.oemRole,user.managerRole,managerRoles.join(' '),profile.assignedRole].map(words).join(' ');
  const adminLevel=words(user.adminLevel||profile?.permissions?.adminLevel);
  if(fields.includes('director'))return {key:'director',...HIERARCHY_REPORT_DESIGNATIONS.director};
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
  if(profile.assignedRole==='Production User')return {key:'productionSupervisor',...HIERARCHY_REPORT_DESIGNATIONS.productionSupervisor};
  if(profile.assignedRole==='Maintenance User')return {key:'maintenanceSupervisor',...HIERARCHY_REPORT_DESIGNATIONS.maintenanceSupervisor};
  if(profile.assignedRole==='MIS User')return {key:'misSupervisor',...HIERARCHY_REPORT_DESIGNATIONS.misSupervisor};
  return null;
}
