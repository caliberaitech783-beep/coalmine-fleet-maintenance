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
export const baseTemplateKey = purpose => aliases[purpose] || purpose;
const titles={requestOpened:'OFF ROAD ALERT',requestClosed:'ON ROAD UPDATE',requestVerified:'MIS VERIFIED',requestIdle:'IDLE VEHICLE',offRoadEscalation:'OFF ROAD ESCALATION',idleReminder:'IDLE REMINDER',consolidatedRequestReport:'FLEET REPORTS',consolidatedTicketReport:'CRM TICKET REPORT',ticketCreated:'NEW CRM TICKET',ticketResolved:'CRM TICKET RESOLVED',dailyUpdate:'MAINTENANCE UPDATE'};
export function reportTemplateChoices(purpose) {
  const key=baseTemplateKey(purpose), base=META_WORKFLOW_TEMPLATES[key], fields=TEMPLATE_FIELD_LABELS[key];
  if(!base||!fields)return [];
  const title=titles[purpose]||titles[key];
  return [
    {variant:'standard',label:'Current standard',description:'Keep the existing wording.',body:base.body},
    {variant:'brief',label:'Compact summary',description:'Short lines for quick reading.',body:`Nerve Center · ${title}\n${fields.map((field,index)=>`${field}: {{${index+1}}}`).join(' | ')}\nView Nerve Center for the latest status.`},
    {variant:'detailed',label:'Structured detail',description:'Clear labels, one item per line.',body:`*NERVE CENTER | ${title}*\n\n${fields.map((field,index)=>`*${field}:* {{${index+1}}}`).join('\n')}\n\nThis is an automated operational update. Please review the details in Nerve Center.`},
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
  return String(body||'').replace(/\{\{(\d+)\}\}/g,(_,index)=>base?.example[Number(index)-1]||`[field ${index}]`);
}
