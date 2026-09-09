import {SINGLE_REPORT_TEMPLATE_PURPOSES,isSingleReportPurpose,validReportTemplateVariant} from './whatsapp-template-catalog.mjs';

export const WORKFLOW_ROLE_OPTIONS = [
  ['maintenanceSupervisor','Maintenance supervisor'],['maintenanceManager','Maintenance manager'],
  ['productionSupervisor','Production supervisor'],['productionManager','Production manager'],
  ['misSupervisor','MIS supervisor'],['misManager','MIS manager'],['projectManager','Project manager'],
  ['director','Director'],['admin','Admin'],['superAdmin','Super Admin'],
  ['oemNationalHead','OEM national head'],['oemRegionalHead','OEM regional head'],
  ['oemAreaServiceEngineer','OEM area engineer'],['oemServiceEngineer','OEM site engineer'],
].map(([key,label])=>({key,label}));
export const EVENT_OPTIONS = [
  {key:'opened',label:'Opened / Off Road',purpose:'requestOpened'},
  {key:'closed',label:'Closed / On Road',purpose:'requestClosed'},
  {key:'verified',label:'MIS Verified',purpose:'requestVerified'},
  {key:'idle',label:'Marked Idle',purpose:'requestIdle'},
];
export const PURPOSE_OPTIONS = [
  ...EVENT_OPTIONS.map(({purpose:key,label})=>({key,label,group:'Individual alerts and updates'})),
  {key:'offRoadEscalation',label:'Off Road escalation',group:'Reminders'}, {key:'idleReminder',label:'Idle reminder',group:'Reminders'},
  {key:'consolidatedRequestReport',label:'Consolidated hierarchy / fleet bundle',group:'Consolidated reports'},
  {key:'consolidatedTicketReport',label:'Scheduled CRM report',group:'Consolidated reports'},
  {key:'ticketCreated',label:'CRM ticket created',group:'Individual alerts and updates'}, {key:'ticketResolved',label:'CRM ticket resolved',group:'Individual alerts and updates'},
  {key:'dailyUpdate',label:'Daily maintenance update',group:'Individual alerts and updates'},
  {key:'manualReports',label:'Manual report send',group:'Manual reports'},
  ...SINGLE_REPORT_TEMPLATE_PURPOSES,
];
const initialRoles = {opened:['maintenanceSupervisor','maintenanceManager','productionManager'],closed:['productionSupervisor','productionManager','maintenanceManager'],verified:['productionManager','maintenanceManager','misManager'],idle:['projectManager','productionManager','maintenanceManager','misManager']};
export const validWhatsAppTime = value => typeof value==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const unique = values => [...new Set(values)];
const object = value => value && typeof value==='object' && !Array.isArray(value) ? value : {};
const bool = (value,fallback) => typeof value==='boolean' ? value : fallback;
const bounded = (value,fallback,min,max) => Number.isInteger(value)&&value>=min&&value<=max ? value : fallback;

export function defaultWhatsAppReportSettings() {
  return {enabled:true,
    events:Object.fromEntries(EVENT_OPTIONS.map(({key})=>[key,{enabled:true,recipientRoles:[...initialRoles[key]]}])),
    reminders:{offRoad:{enabled:true,hours:4},idle:{enabled:true,hours:1}},
    crm:{enabled:true,days:[0,1,2,3,4,5,6],times:['08:00','15:00','20:00'],recipientRoles:['Admin','Manager'],sendEmpty:true,format:'both'},
    channels:{hierarchyReports:true,ticketCreated:false,ticketResolved:false,dailyUpdate:false,passwordResetOtp:true,manualReports:true},
    quietHours:{enabled:false,start:'22:00',end:'07:00'},
    templates:Object.fromEntries(PURPOSE_OPTIONS.map(({key})=>[key,{variant:isSingleReportPurpose(key)?'inherit':'standard',body:''}])),
  };
}

export function normalizeWhatsAppReportSettings(input={}) {
  const value=object(input), defaults=defaultWhatsAppReportSettings();
  const roles=new Set(WORKFLOW_ROLE_OPTIONS.map(role=>role.key));
  const events=object(value.events), reminders=object(value.reminders), crm=object(value.crm), channels=object(value.channels), quiet=object(value.quietHours), templates=object(value.templates);
  return {enabled:bool(value.enabled,defaults.enabled),
    events:Object.fromEntries(EVENT_OPTIONS.map(({key})=>{const current=object(events[key]);return [key,{enabled:bool(current.enabled,true),recipientRoles:Array.isArray(current.recipientRoles)?unique(current.recipientRoles.filter(role=>roles.has(role))):defaults.events[key].recipientRoles}];})),
    reminders:Object.fromEntries(['offRoad','idle'].map(key=>[key,{enabled:bool(reminders[key]?.enabled,true),hours:bounded(reminders[key]?.hours,defaults.reminders[key].hours,1,key==='idle'?24:168)}])),
    crm:{enabled:bool(crm.enabled,true),days:Array.isArray(crm.days)?unique(crm.days.filter(day=>Number.isInteger(day)&&day>=0&&day<=6)).sort():defaults.crm.days,
      times:Array.isArray(crm.times)?unique(crm.times.filter(validWhatsAppTime)).sort().slice(0,6):defaults.crm.times,
      recipientRoles:Array.isArray(crm.recipientRoles)?unique(crm.recipientRoles.filter(role=>['Admin','Manager','Super Admin'].includes(role))):defaults.crm.recipientRoles,
      sendEmpty:bool(crm.sendEmpty,true),format:['both','summary','pdf'].includes(crm.format)?crm.format:'both'},
    channels:Object.fromEntries(Object.entries(defaults.channels).map(([key,fallback])=>[key,bool(channels[key],fallback)])),
    quietHours:{enabled:bool(quiet.enabled,false),start:validWhatsAppTime(quiet.start)?quiet.start:defaults.quietHours.start,end:validWhatsAppTime(quiet.end)?quiet.end:defaults.quietHours.end},
    templates:Object.fromEntries(PURPOSE_OPTIONS.map(({key})=>[key,{variant:validReportTemplateVariant(key,templates[key]?.variant)?templates[key].variant:defaults.templates[key].variant,body:typeof templates[key]?.body==='string'?templates[key].body.slice(0,1024):''}])),
  };
}

export function whatsappSettingsValidationError(input) {
  if(!input||typeof input.enabled!=='boolean')return 'Choose whether WhatsApp delivery is active.';
  for(const {key} of EVENT_OPTIONS){const event=input.events?.[key];if(!event||typeof event.enabled!=='boolean'||!Array.isArray(event.recipientRoles)||event.recipientRoles.some(role=>!WORKFLOW_ROLE_OPTIONS.some(option=>option.key===role)))return 'Select valid recipient roles for each alert.';}
  for(const key of ['offRoad','idle']){const reminder=input.reminders?.[key];if(!reminder||typeof reminder.enabled!=='boolean'||!Number.isInteger(reminder.hours)||reminder.hours<1||reminder.hours>(key==='idle'?24:168))return 'Use 1–168 hours for Off Road escalation and 1–24 hours for Idle reminders.';}
  const crm=input.crm;
  if(!crm||typeof crm.enabled!=='boolean'||!Array.isArray(crm.days)||crm.days.some(day=>!Number.isInteger(day)||day<0||day>6)||!Array.isArray(crm.times)||crm.times.length>6||crm.times.some(time=>!validWhatsAppTime(time)))return 'Set valid CRM weekdays and up to six IST delivery times.';
  if(!Array.isArray(crm.recipientRoles)||crm.recipientRoles.some(role=>!['Admin','Manager','Super Admin'].includes(role))||!['both','pdf','summary'].includes(crm.format)||typeof crm.sendEmpty!=='boolean')return 'Choose valid CRM recipients, report format and empty-report preference.';
  if(crm.enabled&&(!crm.days.length||!crm.times.length||!crm.recipientRoles.length))return 'Choose at least one CRM day, time and recipient role, or turn CRM reports off.';
  const quiet=input.quietHours;
  if(!quiet||typeof quiet.enabled!=='boolean'||!validWhatsAppTime(quiet.start)||!validWhatsAppTime(quiet.end)||quiet.enabled&&quiet.start===quiet.end)return 'Quiet hours need different valid start and end times.';
  for(const key of Object.keys(defaultWhatsAppReportSettings().channels))if(typeof input.channels?.[key]!=='boolean')return 'Choose the delivery switches for each message type.';
  for(const {key} of PURPOSE_OPTIONS){const template=input.templates?.[key];if(!template||!validReportTemplateVariant(key,template.variant)||typeof template.body!=='string'||template.body.length>1024)return 'Choose a valid template style with at most 1,024 characters.';}
  return '';
}

export function isWhatsAppQuietTime(settings,now=new Date()) {
  if(!settings.quietHours.enabled)return false;
  const local=new Date(now.getTime()+330*60000).toISOString().slice(11,16), {start,end}=settings.quietHours;
  return start<end ? local>=start&&local<end : local>=start||local<end;
}

export function whatsappPurposeEnabled(settings,purpose='',now=new Date()) {
  if(!settings.enabled)return false;
  if(purpose==='passwordResetOtp')return settings.channels.passwordResetOtp;
  if(isWhatsAppQuietTime(settings,now))return false;
  const event=EVENT_OPTIONS.find(option=>option.purpose===purpose);
  if(event)return settings.events[event.key].enabled;
  if(purpose==='offRoadEscalation')return settings.reminders.offRoad.enabled&&settings.events.opened.enabled;
  if(purpose==='idleReminder')return settings.reminders.idle.enabled&&settings.events.idle.enabled;
  if(purpose==='consolidatedTicketReport')return settings.crm.enabled;
  if(purpose==='consolidatedRequestReport'||isSingleReportPurpose(purpose))return settings.channels.hierarchyReports;
  if(purpose==='manualReports')return settings.channels.manualReports;
  if(Object.hasOwn(settings.channels,purpose))return settings.channels[purpose];
  return true;
}
