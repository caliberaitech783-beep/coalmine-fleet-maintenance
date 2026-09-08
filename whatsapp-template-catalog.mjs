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

export const META_WORKFLOW_TEMPLATES={
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

export const TEMPLATE_FIELD_LABELS = {
  requestOpened:['Request reference','Site','Equipment','Door number','Breakdown type','Reported by','Opened at','Expected completion','Request link'],
  requestClosed:['Request reference','Equipment / door','Site','Closed by','Closed at','Downtime','Request link'],
  requestVerified:['Request reference','Equipment / door','Site','Verified by','Verified at','Closing meter','Request link'],
  requestIdle:['Equipment / door','Site','Idle since','Idle reason','Request reference','Approval action','Request link'],
  consolidatedRequestReport:['Report summary and download links'],consolidatedTicketReport:['CRM summary'],
  ticketCreated:['Ticket reference','Created by','Site'],ticketResolved:['Ticket reference','Resolved by'],
  dailyUpdate:['Updated by','Request reference'],
};
const aliases={offRoadEscalation:'requestOpened',idleReminder:'requestIdle',manualReports:'consolidatedRequestReport'};
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
  consolidatedTicketReport:{intro:'Your scheduled CRM ticket summary is ready.',action:'Review the reporting window and follow up on the listed ticket activity in Nerve Center.'},
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
  const key=baseTemplateKey(purpose), base=META_WORKFLOW_TEMPLATES[key], fields=TEMPLATE_FIELD_LABELS[key];
  if(!base||!fields)return [];
  const {title,intro,action}=reportTemplateContext(purpose);
  const single=isSingleReportPurpose(purpose),report=fields.length===1;
  const lines=fields.map((field,index)=>`${field}: {{${index+1}}}`).join('\n');
  return [
    {variant:'standard',label:'Current standard',description:'Keep the existing wording.',body:base.body},
    {variant:'brief',label:'Compact summary',description:'Short lines for quick reading.',body:`Nerve Center · ${title}\n${fields.map((field,index)=>`${field}: {{${index+1}}}`).join(' | ')}\nView Nerve Center for the latest status.`},
    {variant:'detailed',label:'Structured detail',description:'Clear labels, one item per line.',body:`*NERVE CENTER | ${title}*\n\n${fields.map((field,index)=>`*${field}:* {{${index+1}}}`).join('\n')}\n\nThis is an automated operational update. Please review the details in Nerve Center.`},
    {variant:'executive',label:'Executive brief',description:report?'A short introduction for management review.':'Event context followed by key facts.',body:`*${title} | MANAGEMENT BRIEF*\n${intro}\n\n${lines}\n\nFor review: ${action}`},
    {variant:'action',label:'Action focused',description:'Make the next operational step clear.',body:`*ACTION REVIEW · ${title}*\n\n${action}\n\n*Supporting details*\n${lines}\n\nRecord follow-up in Nerve Center so the team has the latest information.`},
    {variant:'handover',label:'Team handover',description:report?'Share report context with the next team.':'Pass the event details to the next team.',body:`*TEAM HANDOVER | ${title}*\n${intro}\n\n${fields.map((field,index)=>`• ${field}: {{${index+1}}}`).join('\n')}\n\n*Next team:* ${action}\nCheck Nerve Center for updates since this message was generated.`},
    {variant:'checklist',label:'Review checklist',description:'Facts followed by a short review checklist.',body:`*${title} — REVIEW CHECKLIST*\n\n${lines}\n\n☐ Review the ${report?'reporting scope and included records':'reference and recorded details'}.\n☐ ${action}\n☐ Record any required follow-up in Nerve Center.`},
    {variant:'formal',label:'Formal notice',description:'Professional wording for official updates.',body:`Nerve Center | ${title}\n\nDear colleague,\n${intro} The recorded details are provided below for your review.\n\n${lines}\n\n${action}\nRegards,\nNerve Center Operations`},
    {variant:'numbered',label:report?'Report review card':'Numbered facts',description:report?'Separate the report contents and follow-up.':'Numbered fields for easy reference.',body:report?`*${title} | REPORT REVIEW*\n\n*1. ${single?'Selected report':'Report contents'}*\n${lines}\n\n*2. Review and follow-up*\n${action}\n\nGenerated by Nerve Center.`:`*${title} | FACTS AT A GLANCE*\n\n${fields.map((field,index)=>`${index+1}. ${field}: {{${index+1}}}`).join('\n')}\n\n*Follow-up:* ${action}`},
    {variant:'dashboard',label:'Status card',description:report?'A report-ready card with a clear next step.':'A visual event card with labelled facts.',body:`📋 *${title}*\n${intro}\n━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━\n*Next step*\n${action}\n\nNerve Center · Operational update`},
  ];
}
export function validateCustomTemplate(purpose,body) {
  const fields=TEMPLATE_FIELD_LABELS[baseTemplateKey(purpose)];
  if(!fields||typeof body!=='string'||!body.trim()||body.length>1024)return 'Enter message wording between 1 and 1,024 characters.';
  const tokens=[...body.matchAll(/\{\{([^{}]+)\}\}/g)].map(match=>match[1]);
  if(tokens.some(token=>!/^\d+$/.test(token)||Number(token)<1||Number(token)>fields.length)||body.replace(/\{\{\d+\}\}/g,'').match(/[{}]/))return 'Use only the numbered placeholders shown below.';
  if(fields.some((_,index)=>!tokens.includes(String(index+1))))return 'Keep every required placeholder so operational details are not lost.';
  if(tokens.length!==fields.length||tokens.some((token,index)=>token!==String(index+1)))return 'Use each required placeholder once, in numbered order.';
  if(/^\s*\{\{|\}\}\s*$/.test(body))return 'Add wording before and after the placeholders.';
  return '';
}
export function previewReportTemplate(purpose,body) {
  const base=META_WORKFLOW_TEMPLATES[baseTemplateKey(purpose)];
  const single=singleReportsByKey.get(purpose);
  const example=single?[`${single.label} | SCOPE: Sasti OB | 4 rows | PDF: https://example.com/reports/sample.pdf | Excel: https://example.com/reports/sample.xlsx`]
    :purpose==='consolidatedRequestReport'?['Fleet report bundle | SCOPE: Sasti OB | Road status: 24 rows | Availability: 8 rows | PDF / Excel: https://example.com/reports/bundle']
    :base?.example;
  return String(body||'').replace(/\{\{(\d+)\}\}/g,(_,index)=>String(example?.[Number(index)-1]||`[field ${index}]`).replace(/\s+/g,' '));
}
