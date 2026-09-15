import {META_WORKFLOW_TEMPLATES,LEGACY_WORKFLOW_TEMPLATES,baseTemplateKey} from './whatsapp-template-catalog.mjs';
import {displaySiteName} from './region-scope.mjs';
import {formatDisplayDateTime} from './date-time-format.mjs';
import {resolveMobileAccess} from './mobile-access.mjs';

// Values occupy individual template fields. Line breaks and bold labels live
// in the approved template itself, since provider parameters are single-line.
export const whatsappValue=(value,fallback='Not recorded',limit=240)=>{
  const text=String(value??'').replace(/[*`]/g,'').replace(/\s+/g,' ').trim()||fallback;
  // Never truncate a download URL or change underscores in identifiers/URLs.
  if(/https?:\/\//i.test(text))return text;
  return text.length>limit?`${text.slice(0,limit-1).trimEnd()}…`:text;
};
const date=value=>value?formatDisplayDateTime(value):'Not recorded';
const evidence=(text,audio)=>text||(audio?'Audio recorded — open Nerve Center to listen':'Not recorded');

export function whatsAppNextStep(purpose,user={}){
  const profile=resolveMobileAccess({user});
  const role=profile.assignedRole||'';
  const admin=profile.sessionRole==='super'&&['Admin','Super Admin'].includes(profile.permissions?.adminLevel);
  if(purpose==='ticketCreated')return admin?'Review the CRM issue and record the resolution.':'Your ticket is recorded. Track its progress in CRM.';
  if(purpose==='ticketResolved')return admin?'Review the resolution and any further follow-up in CRM.':'Review the resolution of your ticket in CRM.';
  if(['requestIdle','idleReminder'].includes(purpose))return 'Await Project / Production Manager approval before Make On Road. Review the idle reason and coordinate the next action.';
  if(purpose==='requestVerified')return role==='Production User'?'Review the verified record and first-trip status.':admin?'Review the verified record and follow up on any pending first trip.':'Review the verification, closing meter and first-trip status.';
  if(purpose==='requestClosed')return role==='MIS User'?'Verify the closure, closing meter and first-trip details in Nerve Center.':role==='Production User'?'Review the On Road update and coordinate the first trip after the required checks.':admin?'Track MIS verification and first-trip completion.':'Review the recorded repair work and support MIS verification.';
  if(purpose==='dailyUpdate')return role==='Maintenance User'?'Keep repair progress, delay reason and expected completion up to date.':'Review repair progress, the delay reason and expected completion.';
  if(role==='Maintenance User')return purpose==='offRoadEscalation'?'Review the delayed repair and update progress and expected completion.':'Review acceptance, diagnose the complaint and record the repair plan.';
  if(role==='Production User')return 'Track the request and coordinate equipment availability with Maintenance.';
  if(role==='MIS User')return 'Monitor the request; verification follows maintenance closure.';
  return 'Review the breakdown, coordinate the responsible team and track expected completion.';
}

export function siteReportMessageContext({kind='Fleet',site,window,count,pdfUrl,xlsxUrl,summary=''}){
  return {site:displaySiteName(site)||'Not recorded',title:`${kind} consolidated report`,
    period:`${date(window.start)} to ${date(window.end)}`,
    summary:summary||`${count} ${kind==='CRM'?'tickets':'cases'} with activity`,pdfUrl,xlsxUrl,
    notes:'This site only. Activity from the previous scheduled time up to this time. Download links expire in 14 days.'};
}

// Accept the legacy call contract while callers supply the saved record in
// context. This also allows queued/manual integrations to roll forward safely.
export function whatsAppMessageParameters(purpose,parameters=[],context={}){
  const key=baseTemplateKey(purpose),template=META_WORKFLOW_TEMPLATES[key],p=parameters;
  if(!template||template.otpButton)return p;
  if(p.length===template.example.length)return p.map(value=>whatsappValue(value,'Not recorded',1400));
  if(p.length!==LEGACY_WORKFLOW_TEMPLATES[key]?.example.length)throw new Error(`Template ${template.name} requires ${template.example.length} parameters.`);
  const r=context.request||{},t=context.ticket||{};
  const next=context.nextStep||whatsAppNextStep(purpose,context.recipient);
  const site=value=>whatsappValue(displaySiteName(context.site||r.site||t.site||value),'Not recorded',120);
  const equipment=value=>[r.equipmentGroup||r.equipment,r.door&&`Door: ${r.door}`,r.reg&&r.reg!==r.door&&`Reg: ${r.reg}`,r.chassis&&`Chassis: ${r.chassis}`].filter(Boolean).join(' | ')||value;
  const complaint=evidence(r.complaint,r.complaintAudio),work=evidence(r.maintenanceWork,r.maintenanceAudio);
  let values;
  switch(key){
    case 'requestOpened':values=[site(p[1]),p[0],equipment(`${p[2]} | Door: ${p[3]}`),r.category||p[4],complaint,p[5],p[6],r.expectedCompletionAt||r.expectedCompletionAtRaw?date(r.expectedCompletionAt||r.expectedCompletionAtRaw):p[7],next,p[8]];break;
    case 'requestClosed':values=[site(p[2]),p[0],equipment(p[1]),r.category,complaint,work,r.delayedReason||'None recorded',p[3],p[4],p[5],next,p[6]];break;
    case 'requestVerified':{
      const readings=Object.entries(r.closingMeterReadings||{}).filter(([,value])=>String(value??'').trim()).map(([type,value])=>`${type} ${value}`).join(' | ');
      values=[site(p[2]),p[0],equipment(p[1]),r.category,complaint,work,p[3],p[4],readings||p[5],r.firstTripDone?`Completed${r.firstTripAt?` at ${date(r.firstTripAt)} IST`:''}`:'Pending',next,p[6]];break;
    }
    case 'requestIdle':values=[site(p[1]),p[4],equipment(p[0]),r.category,complaint,p[3],work,p[2],r.idealRequestedBy,next,p[6]];break;
    case 'dailyUpdate':values=[site(),p[1],equipment(),r.category,context.remark,context.delayReason,r.expectedCompletionAt?date(r.expectedCompletionAt):'Not set',p[0],date(context.updatedAt),next,context.url];break;
    case 'maintenanceReminder':values=[site(),p[1],p[0],'Add today’s maintenance update and delay reason in Nerve Center.'];break;
    case 'ticketCreated':values=[site(p[2]),p[0],t.category,t.priority,evidence(t.message,t.messageAudio),p[1],date(t.createdAt),next,context.url];break;
    case 'ticketResolved':values=[site(),p[0],t.category,t.priority,evidence(t.message,t.messageAudio),evidence(t.resolutionMessage,t.resolutionAudio),p[1],date(t.resolvedAt),next,context.url];break;
    case 'consolidatedRequestReport':case 'consolidatedTicketReport':{
      const report=context.report||{};
      // Unstructured manual messages keep their full contents, including links.
      // A global report must identify its scope honestly rather than invent a site.
      values=[site(report.site),report.title||'Shared report',report.period||'See report details',report.summary||p[0],report.pdfUrl||'See report details',report.xlsxUrl||'See report details',report.notes||'Open Nerve Center for the complete report.'];break;
    }
    default:return p;
  }
  return values.map((value,index)=>whatsappValue(value,'Not recorded',['consolidatedRequestReport','consolidatedTicketReport'].includes(key)?(index===3?1400:500):240));
}

export function renderWhatsAppTemplate(template,parameters){
  return template.body.replace(/\{\{(\d+)\}\}/g,(_,index)=>String(parameters[Number(index)-1]??'Not recorded'));
}
