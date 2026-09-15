import {DIRECTOR_REPORT_TITLES,canonicalReportTitle} from './director-report-bundle.mjs';

export const SINGLE_REPORT_TEMPLATE_PURPOSES = [...new Set(DIRECTOR_REPORT_TITLES)].map(label=>({
  key:`report_${label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}`,
  label,reportTitle:label,group:'Single reports',
}));
const singleReportsByKey = new Map(SINGLE_REPORT_TEMPLATE_PURPOSES.map(report=>[report.key,report]));
export const isSingleReportPurpose = purpose => singleReportsByKey.has(purpose);
export function hierarchyReportMessagePurpose(reportTitles=[]) {
  const titles=[...new Set(reportTitles.map(canonicalReportTitle))];
  return titles.length===1?SINGLE_REPORT_TEMPLATE_PURPOSES.find(report=>report.reportTitle===titles[0])?.key||'consolidatedRequestReport':'consolidatedRequestReport';
}

// Keep approved provider definitions immutable for delivery during the v2 review.
export const LEGACY_WORKFLOW_TEMPLATES={
  passwordResetOtp:{name:'nerve_password_reset_otp',category:'AUTHENTICATION',example:['123456'],otpButton:true,components:[
    {type:'BODY',add_security_recommendation:true},
    {type:'FOOTER',code_expiration_minutes:10},
    {type:'BUTTONS',buttons:[{type:'OTP',otp_type:'COPY_CODE',text:'Copy Code'}]},
  ]},
  consolidatedRequestReport:{name:'nerve_consolidated_request_report',body:'Nerve Center scheduled fleet report:\n\n{{1}}\n\nGenerated automatically. Open Nerve Center for the complete live view.',example:['SCOPE: WCL\nWINDOW: 26 Aug 2026, 10:00 PM - 27 Aug 2026, 6:00 AM\nOFF ROAD / OPEN: 2\nON ROAD / CLOSED: 1']},
  consolidatedTicketReport:{name:'nerve_consolidated_crm_ticket_report',body:'Nerve Center scheduled CRM ticket report:\n\n{{1}}\n\nGenerated automatically. Open Nerve Center for the complete live view.',example:['SCOPE: WCL\nWINDOW: 27 Aug 2026, 8:00 AM - 27 Aug 2026, 3:00 PM\nOPEN TICKETS: 3\nCLOSED TICKETS: 2']},
  ticketCreated:{name:'nerve_ticket_created',body:'Nerve Center: Ticket {{1}} was created by {{2}} at {{3}}. Please open Nerve Center to review it.',example:['TIC/MAJRI-OB/240826/000001','Anoop Paul','Majri OB']},
  ticketResolved:{name:'nerve_ticket_resolved',body:'Nerve Center: Ticket {{1}} was resolved by {{2}}. Please open Nerve Center to view the resolution.',example:['TIC/MAJRI-OB/240826/000001','Administrator']},
  maintenanceReminder:{name:'nerve_maintenance_reminder',body:'Nerve Center reminder: Please add the {{1}} maintenance update and delay reason for request {{2}}. This update is due now.',example:['9:00 AM','REQ-1787566831835']},
  dailyUpdate:{name:'nerve_daily_update',body:'Nerve Center: {{1}} added a daily maintenance update for request {{2}}. Please open Nerve Center to review it.',example:['Maintenance User','REQ-1787566831835']},
  requestOpened:{name:'bdms_offroad_request_opened_v1',body:'BDMS Off Road Alert\nRequest {{1}} has been opened at {{2}}. Equipment: {{3}}, Door No.: {{4}}. Breakdown type: {{5}}. Reported by {{6}} at {{7}}. ETC: {{8}}.\nOpen request: {{9}}',example:['REQ-1787566831835','Majri OB','VOLVO TIPPERS','V257 - MH34BZ5560','Breakdown','Production User','24 Aug 2026, 3:49 PM','24 Aug 2026, 8:00 PM','https://bdms.cmll.in/?request=REQ-1787566831835']},
  requestClosed:{name:'bdms_onroad_request_closed_v1',body:'BDMS On Road Update\nRequest {{1}} for {{2}} at {{3}} has been closed by {{4}} at {{5}}. Total downtime: {{6}}. Status: On Road.\nOpen request: {{7}}',example:['REQ-1787566831835','VOLVO TIPPERS | Door: V257 - MH34BZ5560','Majri OB','Maintenance User','24 Aug 2026, 6:10 PM','0d 2h 21m','https://bdms.cmll.in/?request=REQ-1787566831835']},
  requestVerified:{name:'bdms_mis_verification_completed_v1',body:'BDMS MIS Verification\nRequest {{1}} for {{2}} at {{3}} was verified by {{4}} at {{5}}. Closing meter: {{6}}. Final status: Verified.\nOpen request: {{7}}',example:['REQ-1787566831835','VOLVO TIPPERS | Door: V257 - MH34BZ5560','Majri OB','MIS User','24 Aug 2026, 6:30 PM','HMR 12456','https://bdms.cmll.in/?request=REQ-1787566831835']},
  requestIdle:{name:'bdms_vehicle_idle_v1',body:'BDMS Idle Vehicle Alert\n{{1}} at {{2}} was marked Idle at {{3}}. Reason: {{4}}. Request: {{5}}. Approval action: {{6}}.\nOpen request: {{7}}',example:['VOLVO TIPPERS | Door: V257 - MH34BZ5560','Majri OB','24 Aug 2026, 6:10 PM','No driver','REQ-1787566831835','Project Manager or Production Manager must approve Make On Road','https://bdms.cmll.in/?request=REQ-1787566831835']},
};

export const LEGACY_TEMPLATE_FIELD_LABELS = {
  requestOpened:['Request reference','Site','Equipment','Door number','Breakdown type','Reported by','Opened at','Expected completion','Request link'],
  requestClosed:['Request reference','Equipment / door','Site','Closed by','Closed at','Downtime','Request link'],
  requestVerified:['Request reference','Equipment / door','Site','Verified by','Verified at','Closing meter','Request link'],
  requestIdle:['Equipment / door','Site','Idle since','Idle reason','Request reference','Approval action','Request link'],
  consolidatedRequestReport:['Report summary and download links'],consolidatedTicketReport:['PDF and Excel downloads'],
  ticketCreated:['Ticket reference','Created by','Site'],ticketResolved:['Ticket reference','Resolved by'],
  dailyUpdate:['Updated by','Request reference'],
};
export const TEMPLATE_FIELD_LABELS = {
  requestOpened:['Site','Request','Equipment / door','Breakdown type','Complaint / reason','Reported by','Off Road since (IST)','Expected completion (IST)','Next step','Open request'],
  requestClosed:['Site','Request','Equipment / door','Breakdown type','Complaint / reason','Work completed','Delay reason','Closed by','On Road at (IST)','Downtime','Next step','Open request'],
  requestVerified:['Site','Request','Equipment / door','Breakdown type','Complaint / reason','Work completed','Verified by','Verified at (IST)','Closing meter','First trip','Next step','Open request'],
  requestIdle:['Site','Request','Equipment / door','Breakdown type','Complaint / reason','Idle reason','Work completed','Idle since (IST)','Marked by','Next step','Open request'],
  consolidatedRequestReport:['Site','Report','Reporting period (IST)','Summary','PDF / files','Excel / other files','Notes'],
  consolidatedTicketReport:['Site','Report','Reporting period (IST)','Summary','PDF','Excel','Notes'],
  ticketCreated:['Site','Ticket','Category','Priority','Issue / reason','Raised by','Raised at (IST)','Next step','Open CRM'],
  ticketResolved:['Site','Ticket','Category','Priority','Issue / reason','Resolution','Resolved by','Resolved at (IST)','Next step','Open CRM'],
  dailyUpdate:['Site','Request','Equipment / door','Breakdown type','Maintenance update','Delay reason','Expected completion (IST)','Updated by','Updated at (IST)','Next step','Open request'],
  maintenanceReminder:['Site','Request','Update due (IST)','Next step'],
};
const sampleRequest=['Majri OB','REQ-1787566831835','VOLVO TIPPERS | Door: V257 - MH34BZ5560','Breakdown','Hydraulic hose leaking'];
const sampleLink='https://bdms.cmll.in/?request=REQ-1787566831835';
const examples={
  requestOpened:[...sampleRequest,'Production User','24 Aug 2026, 3:49 PM','24 Aug 2026, 8:00 PM','Maintenance: review acceptance and record the repair plan.',sampleLink],
  requestClosed:[...sampleRequest,'Replaced hydraulic hose and tested','Awaiting spare hose','Maintenance User','24 Aug 2026, 6:10 PM','0d 2h 21m','MIS: verify the closure and record the first trip.',sampleLink],
  requestVerified:[...sampleRequest,'Replaced hydraulic hose and tested','MIS User','24 Aug 2026, 6:30 PM','HMR 12456','Completed at 24 Aug 2026, 6:25 PM','Production: review the verified record and first-trip status.',sampleLink],
  requestIdle:[...sampleRequest,'No driver','Repair completed; awaiting driver','24 Aug 2026, 6:10 PM','Maintenance User','Await Project / Production Manager approval before Make On Road.',sampleLink],
  ticketCreated:['Majri OB','TIC/MAJRI-OB/240826/000001','Maintenance','High','Spare hose unavailable','Maintenance User','24 Aug 2026, 4:00 PM','Admin: review the issue and record a resolution.','https://bdms.cmll.in/'],
  ticketResolved:['Majri OB','TIC/MAJRI-OB/240826/000001','Maintenance','High','Spare hose unavailable','Replacement arranged from site stores','Administrator','24 Aug 2026, 5:30 PM','Review the recorded resolution in CRM.','https://bdms.cmll.in/'],
  dailyUpdate:['Majri OB','REQ-1787566831835',sampleRequest[2],'Breakdown','Replacement hose requested','Awaiting parts','24 Aug 2026, 8:00 PM','Maintenance User','24 Aug 2026, 4:30 PM','Review the latest progress and expected completion.',sampleLink],
  maintenanceReminder:['Majri OB','REQ-1787566831835','9:00 AM','Add today’s maintenance update and delay reason.'],
  consolidatedRequestReport:['Majri OB','Fleet consolidated report','14 Sep 2026, 7:00 PM to 15 Sep 2026, 7:00 AM','6 cases with activity','https://example.com/reports/majri-fleet.pdf','https://example.com/reports/majri-fleet.xlsx','This site only. Download links expire in 14 days.'],
  consolidatedTicketReport:['Majri OB','CRM consolidated report','14 Sep 2026, 7:00 PM to 15 Sep 2026, 7:00 AM','5 tickets with activity: 3 open, 2 resolved','https://example.com/reports/majri-crm.pdf','https://example.com/reports/majri-crm.xlsx','All permitted ticket categories for this site. Links expire in 14 days.'],
};
const standardTitles={requestOpened:'Off Road Alert',requestClosed:'On Road Update',requestVerified:'MIS Verified',requestIdle:'Idle Vehicle',ticketCreated:'New CRM Ticket',ticketResolved:'CRM Ticket Resolved',dailyUpdate:'Maintenance Update',maintenanceReminder:'Maintenance Reminder',consolidatedRequestReport:'Fleet Report',consolidatedTicketReport:'CRM Report'};
export const META_WORKFLOW_TEMPLATES=Object.fromEntries(Object.entries(LEGACY_WORKFLOW_TEMPLATES).map(([key,legacy])=>[key,key==='passwordResetOtp'?legacy:{
  name:`nerve_${key.toLowerCase()}_site_v2`,
  body:`*SITE: {{1}}*\n*Nerve Center | ${standardTitles[key]}*\n\n${TEMPLATE_FIELD_LABELS[key].slice(1).map((label,index)=>`*${label}:* {{${index+2}}}`).join('\n')}\n\nOpen Nerve Center for complete details.`,
  example:examples[key],
}]));
const aliases={offRoadEscalation:'requestOpened',idleReminder:'requestIdle',manualReports:'consolidatedRequestReport'};
for(const [purpose,key,title] of [['offRoadEscalation','requestOpened','Off Road Escalation'],['idleReminder','requestIdle','Idle Reminder']]){
  META_WORKFLOW_TEMPLATES[purpose]={...META_WORKFLOW_TEMPLATES[key],name:`nerve_${purpose.toLowerCase()}_site_v2`,body:META_WORKFLOW_TEMPLATES[key].body.replace(standardTitles[key],title)};
}
export const baseTemplateKey = purpose => isSingleReportPurpose(purpose)?'consolidatedRequestReport':aliases[purpose] || purpose;
const titles={requestOpened:'OFF ROAD ALERT',requestClosed:'ON ROAD UPDATE',requestVerified:'MIS VERIFIED',requestIdle:'IDLE VEHICLE',offRoadEscalation:'OFF ROAD ESCALATION',idleReminder:'IDLE REMINDER',consolidatedRequestReport:'FLEET REPORTS',consolidatedTicketReport:'CRM TICKET REPORT',ticketCreated:'NEW CRM TICKET',ticketResolved:'CRM TICKET RESOLVED',dailyUpdate:'MAINTENANCE UPDATE'};
const purposeNotes={
  requestOpened:{intro:'A breakdown request has been opened.',action:'Review the reported breakdown and update the acceptance or repair plan in Nerve Center.'},
  requestClosed:{intro:'A request has been closed and marked On Road.',action:'Review the closure record and follow the applicable verification steps in Nerve Center.'},
  requestVerified:{intro:'MIS verification has been recorded for this request.',action:'Review the verified record and recorded closing meter in Nerve Center.'},
  requestIdle:{intro:'A vehicle has been marked Idle.',action:'Review the idle reason and follow the approval action shown in this message.'},
  offRoadEscalation:{intro:'This request remains Off Road at the escalation check.',action:'Review the repair progress and update the expected completion time in Nerve Center.'},
  idleReminder:{intro:'This vehicle remains Idle at the reminder check.',action:'Review the idle reason and complete the applicable approval action in Nerve Center.'},
  consolidatedRequestReport:{intro:'Your consolidated fleet report bundle is ready.',action:'Review the included reports and use their download links for the detailed records.'},
  consolidatedTicketReport:{intro:'Your consolidated CRM report files are ready.',action:'Open the PDF or Excel download link for complete ticket details.'},
  ticketCreated:{intro:'A new CRM ticket has been created.',action:'Open the ticket to review its description and record the next action in Nerve Center.'},
  ticketResolved:{intro:'A CRM ticket has been resolved.',action:'Open the ticket to review the recorded resolution in Nerve Center.'},
  dailyUpdate:{intro:'A daily maintenance update has been recorded.',action:'Review the latest maintenance remarks and recorded progress in Nerve Center.'},
  manualReports:{intro:'A report has been shared with you from Nerve Center.',action:'Review the shared report details and any included download links.'},
};
export function reportTemplateContext(purpose) {
  const report=singleReportsByKey.get(purpose);
  if(report)return {title:report.label,intro:`Your ${report.label} is ready.`,action:'Open the report links to review the records and follow up in Nerve Center.'};
  return {title:titles[purpose]||titles[baseTemplateKey(purpose)]||'REPORT',...purposeNotes[purpose]};
}
export const REPORT_TEMPLATE_VARIANTS = ['standard','brief','detailed','executive','action','handover','checklist','formal','numbered','dashboard'];
export function validReportTemplateVariant(purpose,variant) {
  return REPORT_TEMPLATE_VARIANTS.includes(variant)||variant==='custom'||variant==='inherit'&&isSingleReportPurpose(purpose);
}
export function resolvedReportTemplateChoice(purpose,settings) {
  if(isSingleReportPurpose(purpose)&&(!settings?.templates?.[purpose]||settings.templates[purpose].variant==='inherit')){
    return {purpose:'consolidatedRequestReport',selection:settings?.templates?.consolidatedRequestReport||{variant:'standard',body:''}};
  }
  return {purpose,selection:settings?.templates?.[purpose]||{variant:'standard',body:''}};
}
export function reportTemplateChoices(purpose) {
  const key=baseTemplateKey(purpose), base=META_WORKFLOW_TEMPLATES[purpose]||META_WORKFLOW_TEMPLATES[key], fields=TEMPLATE_FIELD_LABELS[key];
  if(!base||!fields)return [];
  const {title,intro,action}=reportTemplateContext(purpose);
  const lines=fields.slice(1).map((field,index)=>`*${field}:* {{${index+2}}}`).join('\n');
  const header=`*SITE: {{1}}*`;
  const styles=[
    ['standard','Site-first standard','Site heading and clearly labelled details.',null],
    ['brief','Compact summary','Short introduction for quick reading.',`*${title}*`],
    ['detailed','Structured detail','Event context and complete facts.',`*NERVE CENTER | ${title}*\n${intro}`],
    ['executive','Executive brief','Key facts for review.',`*${title} | MANAGEMENT BRIEF*`],
    ['action','Action focused','Highlight the required follow-up.',`*ACTION REVIEW | ${title}*`],
    ['handover','Team handover','Pass the event details to the next team.',`*TEAM HANDOVER | ${title}*`],
    ['checklist','Review checklist','Facts for a complete review.',`*${title} | REVIEW CHECKLIST*`],
    ['formal','Formal notice','Professional operational wording.',`*Nerve Center | ${title}*\nDear colleague, ${intro}`],
    ['numbered','Numbered facts','Numbered fields for reference.',`*${title} | FACTS AT A GLANCE*`],
    ['dashboard','Status card','A clear operational status card.',`*${title} | STATUS CARD*`],
  ];
  return styles.map(([variant,label,description,heading])=>({variant,label,description,
    body:variant==='standard'?base.body:`${header}\n${heading}\n\n${variant==='numbered'?fields.slice(1).map((field,index)=>`${index+1}. *${field}:* {{${index+2}}}`).join('\n'):lines}\n\n${variant==='action'?action:'Open Nerve Center for complete details.'}`,
  }));
}

export function validateCustomTemplate(purpose,body) {
  const fields=TEMPLATE_FIELD_LABELS[baseTemplateKey(purpose)];
  if(!fields||typeof body!=='string'||!body.trim()||body.length>1024)return 'Enter message wording between 1 and 1,024 characters.';
  const tokens=[...body.matchAll(/\{\{([^{}]+)\}\}/g)].map(match=>match[1]);
  if(tokens.some(token=>!/^\d+$/.test(token)||Number(token)<1||Number(token)>fields.length)||body.replace(/\{\{\d+\}\}/g,'').match(/[{}]/))return 'Use only the numbered placeholders shown below.';
  if(fields.some((_,index)=>!tokens.includes(String(index+1))))return 'Keep every required placeholder so operational details are not lost.';
  if(tokens.length!==fields.length||tokens.some((token,index)=>token!==String(index+1)))return 'Use each required placeholder once, in numbered order.';
  if(/^\s*\{\{|\}\}\s*$/.test(body))return 'Add wording before and after the placeholders.';
  if(!body.trimStart().startsWith('*SITE: {{1}}*\n'))return 'Start with *SITE: {{1}}* on its own first line so the site stays highlighted.';
  return '';
}
export function previewReportTemplate(purpose,body) {
  const base=META_WORKFLOW_TEMPLATES[baseTemplateKey(purpose)];
  const single=singleReportsByKey.get(purpose);
  const example=base?.example?.map((value,index)=>single&&index===1?single.label:value);
  return String(body||'').replace(/\{\{(\d+)\}\}/g,(_,index)=>String(example?.[Number(index)-1]||`[field ${index}]`).replace(/\s+/g,' '));
}
