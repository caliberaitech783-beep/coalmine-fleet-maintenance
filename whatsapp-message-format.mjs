import {META_WORKFLOW_TEMPLATES,LEGACY_WORKFLOW_TEMPLATES,V2_WORKFLOW_TEMPLATES,V2_TEMPLATE_FIELD_LABELS,TEMPLATE_FIELD_LABELS,baseTemplateKey} from './whatsapp-template-catalog.mjs';
import {displaySiteName} from './region-scope.mjs';
import {formatDisplayDateTime} from './date-time-format.mjs';

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

export function siteReportMessageContext({kind='Fleet',site,window,count,pdfUrl,xlsxUrl,summary=''}){
  return {site:displaySiteName(site)||'Not recorded',title:`${kind} consolidated report`,
    period:`${date(window.start)} to ${date(window.end)}`,
    summary:summary||`${count} ${kind==='CRM'?'tickets':'cases'} with activity`,pdfUrl,xlsxUrl};
}

// Site files stay separate. Only the recipient's delivery is consolidated.
// Never truncate the location list or any site-labelled download URL.
export function recipientReportMessage({kind='Fleet',window,reports=[]}){
  if(!reports.length)throw new Error('A consolidated delivery requires at least one site report.');
  const clean=report=>({...report,site:whatsappValue(displaySiteName(report.site),'Not recorded',Infinity)});
  const sites=reports.map(clean);
  if(sites.some(report=>!report.pdfUrl||!report.xlsxUrl))throw new Error('Every selected site requires PDF and Excel links.');
  const locations=sites.map(report=>report.site).join(' | ');
  const period=`${date(window.start)} to ${date(window.end)}`;
  const report={site:locations,title:`${kind} consolidated report`,period,
    summary:sites.map(row=>`${row.site}: ${row.summary}`).join(' | '),
    pdfUrl:sites.map(row=>`${row.site}: ${row.pdfUrl}`).join(' | '),
    xlsxUrl:sites.map(row=>`${row.site}: ${row.xlsxUrl}`).join(' | ')};
  const message=[`*LOCATIONS: ${locations}*`,`*Nerve Center | ${report.title}*`,`*Period:* ${period} IST`,
    ...sites.flatMap(row=>[`\n*SITE: ${row.site}*`,row.summary,`*PDF - ${row.site}:* ${row.pdfUrl}`,`*Excel - ${row.site}:* ${row.xlsxUrl}`]),
  ].join('\n');
  return {message,reportContext:report};
}

// Accept the legacy call contract while callers supply the saved record in
// context. This also allows queued/manual integrations to roll forward safely.
export function whatsAppMessageParameters(purpose,parameters=[],context={}){
  const key=baseTemplateKey(purpose),template=META_WORKFLOW_TEMPLATES[key],p=parameters;
  if(!template||template.otpButton)return p;
  // The v3 opened-request layout has the same length as the original v1 call.
  // Existing callers still use v1; explicitly mark any preformatted v3 input.
  if(context.parameterLayout==='current'||p.length===template.example.length&&p.length!==LEGACY_WORKFLOW_TEMPLATES[key]?.example.length)return p.map(value=>whatsappValue(value,'Not recorded',Infinity));
  if(p.length===V2_WORKFLOW_TEMPLATES[key]?.example.length)return TEMPLATE_FIELD_LABELS[key].map(label=>whatsappValue(p[V2_TEMPLATE_FIELD_LABELS[key].indexOf(label==='Locations'?'Site':label)],'Not recorded',Infinity));
  if(p.length!==LEGACY_WORKFLOW_TEMPLATES[key]?.example.length)throw new Error(`Template ${template.name} requires ${template.example.length} parameters.`);
  const r=context.request||{},t=context.ticket||{};
  const site=value=>whatsappValue(displaySiteName(context.site||r.site||t.site||value),'Not recorded',120);
  const equipment=value=>[r.equipmentGroup||r.equipment,r.door&&`Door: ${r.door}`,r.reg&&r.reg!==r.door&&`Reg: ${r.reg}`,r.chassis&&`Chassis: ${r.chassis}`].filter(Boolean).join(' | ')||value;
  const complaint=evidence(r.complaint,r.complaintAudio),work=evidence(r.maintenanceWork,r.maintenanceAudio);
  let values;
  switch(key){
    case 'requestOpened':values=[site(p[1]),p[0],equipment(`${p[2]} | Door: ${p[3]}`),r.category||p[4],complaint,p[5],p[6],r.expectedCompletionAt||r.expectedCompletionAtRaw?date(r.expectedCompletionAt||r.expectedCompletionAtRaw):p[7],p[8]];break;
    case 'requestClosed':values=[site(p[2]),p[0],equipment(p[1]),r.category,complaint,work,r.delayedReason||'None recorded',p[3],p[4],p[5],p[6]];break;
    case 'requestVerified':{
      const readings=Object.entries(r.closingMeterReadings||{}).filter(([,value])=>String(value??'').trim()).map(([type,value])=>`${type} ${value}`).join(' | ');
      values=[site(p[2]),p[0],equipment(p[1]),r.category,complaint,work,p[3],p[4],readings||p[5],r.firstTripDone?`Completed${r.firstTripAt?` at ${date(r.firstTripAt)} IST`:''}`:'Pending',p[6]];break;
    }
    case 'requestIdle':values=[site(p[1]),p[4],equipment(p[0]),r.category,complaint,p[3],work,p[2],r.idealRequestedBy,p[6]];break;
    case 'dailyUpdate':values=[site(),p[1],equipment(),r.category,context.remark,context.delayReason,r.expectedCompletionAt?date(r.expectedCompletionAt):'Not set',p[0],date(context.updatedAt),context.url];break;
    case 'maintenanceReminder':values=[site(),p[1],p[0]];break;
    case 'ticketCreated':values=[site(p[2]),p[0],t.category,t.priority,evidence(t.message,t.messageAudio),p[1],date(t.createdAt),context.url];break;
    case 'ticketResolved':values=[site(),p[0],t.category,t.priority,evidence(t.message,t.messageAudio),evidence(t.resolutionMessage,t.resolutionAudio),p[1],date(t.resolvedAt),context.url];break;
    case 'consolidatedRequestReport':case 'consolidatedTicketReport':{
      const report=context.report||{};
      // Unstructured manual messages keep their full contents, including links.
      // A global report must identify its scope honestly rather than invent a site.
      values=[whatsappValue(context.site||report.site,'Not recorded',Infinity),report.title||'Shared report',report.period||'See report details',report.summary||p[0],report.pdfUrl||'See report details',report.xlsxUrl||'See report details'];break;
    }
    default:return p;
  }
  return values.map(value=>whatsappValue(value,'Not recorded',['consolidatedRequestReport','consolidatedTicketReport'].includes(key)?Infinity:240));
}

export function renderWhatsAppTemplate(template,parameters){
  return template.body.replace(/\{\{(\d+)\}\}/g,(_,index)=>String(parameters[Number(index)-1]??'Not recorded'));
}
