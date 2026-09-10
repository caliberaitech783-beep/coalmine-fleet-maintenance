import {createTicketMailer,cleanEmailText,escapeEmailHtml} from './ticket-email.mjs';
import {formatDisplayDateTime} from './date-time-format.mjs';

const INDIA_OFFSET_MS=330*60*1000;
const DAY_MS=24*60*60*1000;

function indiaDateParts(value){
  const local=new Date(new Date(value).getTime()+INDIA_OFFSET_MS);
  return {dateKey:local.toISOString().slice(0,10),hour:local.getUTCHours()};
}

export function auditLogExportDue(now=new Date(),lastCompletedAt=null){
  const current=indiaDateParts(now);
  if(current.hour<17)return false;
  if(!lastCompletedAt)return true;
  const previous=indiaDateParts(lastCompletedAt);
  const currentDay=Date.parse(`${current.dateKey}T00:00:00Z`);
  const previousDay=Date.parse(`${previous.dateKey}T00:00:00Z`);
  return (currentDay-previousDay)/DAY_MS>=5;
}

export function auditLogExportSlot(now=new Date()){
  return `${indiaDateParts(now).dateKey}-1700-IST`;
}

export function buildAuditLogExportEmail({url,generatedAt=new Date(),rowCount=0}={}){
  const safeUrl=cleanEmailText(url);
  const generated=formatDisplayDateTime(generatedAt);
  const count=Number(rowCount||0).toLocaleString('en-IN');
  return {
    subject:`Nerve Center - Five-day Audit Trail export - ${generated}`,
    text:[
      'Nerve Center Audit Trail export',
      `Generated: ${generated}`,
      `Recorded events: ${count}`,
      'Coverage: Latest five days',
      '',
      `Download Excel: ${safeUrl}`,
      '',
      'This protected link expires after 30 days.',
    ].join('\n'),
    html:`<div style="font-family:Arial,sans-serif;color:#10213d;line-height:1.5;max-width:720px">
      <p style="margin:0 0 6px;color:#1d4ed8;font-weight:800">NERVE CENTER</p>
      <h2 style="margin:0 0 8px">Five-day Audit Trail export</h2>
      <p style="margin:0;color:#61708a">Generated: ${escapeEmailHtml(generated)}</p>
      <p style="margin:4px 0 20px;color:#61708a">${escapeEmailHtml(count)} recorded events from the latest five days</p>
      <a href="${escapeEmailHtml(safeUrl)}" style="display:inline-block;background:#5b2ca0;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:6px">Download Audit Trail Excel</a>
      <p style="margin:18px 0 0;color:#61708a">This protected link expires after 30 days.</p>
    </div>`,
  };
}

export async function sendAuditLogExportEmail({to,url,generatedAt,rowCount},env=process.env){
  const recipient=cleanEmailText(to);
  if(!recipient)return {sent:false,reason:'recipient email missing'};
  const {config,transporter}=createTicketMailer(env);
  if(!transporter)return {sent:false,reason:'Email is not configured'};
  const message=buildAuditLogExportEmail({url,generatedAt,rowCount});
  const result=await transporter.sendMail({
    from:`Nerve Center Audit Trail <${config.user}>`,
    to:recipient,
    ...message,
  });
  return {sent:true,messageId:result.messageId,accepted:result.accepted};
}
