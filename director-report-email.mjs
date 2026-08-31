import {createTicketMailer,cleanEmailText,escapeEmailHtml} from './ticket-email.mjs';
import {buildDirectorReportArchiveBuffer} from './director-report-bundle.mjs';

function groupLinks(links=[]){
  return links.reduce((groups,link)=>{
    const department=cleanEmailText(link.department||'General')||'General';
    if(!groups.has(department))groups.set(department,[]);
    groups.get(department).push(link);
    return groups;
  },new Map());
}

function emailDate(value){
  return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(value);
}

export function buildDirectorReportEmail({generatedAt=new Date(),links=[]}={}){
  const sections=[];
  for(const [department,items] of groupLinks(links)){
    const rows=items.map((item,index)=>`
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e3e9f3;color:#10213d;font-weight:700">${index+1}. ${escapeEmailHtml(item.title)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e3e9f3;white-space:nowrap">
          <a href="${escapeEmailHtml(item.pdfUrl)}" style="color:#1d4ed8;text-decoration:none;font-weight:700">PDF</a>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e3e9f3;white-space:nowrap">
          <a href="${escapeEmailHtml(item.xlsxUrl)}" style="color:#15803d;text-decoration:none;font-weight:700">Excel</a>
        </td>
      </tr>`).join('');
    sections.push(`
      <h3 style="margin:22px 0 8px;color:#10213d">${escapeEmailHtml(department)}</h3>
      <table style="border-collapse:collapse;width:100%;max-width:900px;border:1px solid #e3e9f3;border-radius:8px;overflow:hidden">
        <thead>
          <tr>
            <th style="padding:10px 12px;text-align:left;background:#f3f6fb;color:#61708a">Report</th>
            <th style="padding:10px 12px;text-align:left;background:#f3f6fb;color:#61708a">PDF</th>
            <th style="padding:10px 12px;text-align:left;background:#f3f6fb;color:#61708a">Excel</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`);
  }
  const generated=emailDate(generatedAt);
  const text=[
    'Nerve Center',
    "Director's Daily Report",
    'Schedule: Daily 7:00 PM IST',
    `Generated: ${generated}`,
    '',
    ...[...groupLinks(links)].flatMap(([department,items])=>[
      `${department} --`,
      ...items.flatMap((item,index)=>[`${index+1}. ${item.title}`,`PDF: ${item.pdfUrl}`,`Excel: ${item.xlsxUrl}`,'']),
    ]),
  ].join('\n');
  const html=`<div style="font-family:Arial,sans-serif;color:#10213d;line-height:1.45">
    <div style="max-width:940px">
      <p style="margin:0 0 6px;color:#1d4ed8;font-weight:800;letter-spacing:.04em">NERVE CENTER</p>
      <h2 style="margin:0;color:#10213d">Director's Daily Report</h2>
      <p style="margin:6px 0 0;color:#61708a">Schedule: Daily 7:00 PM IST</p>
      <p style="margin:0 0 20px;color:#61708a">Generated: ${escapeEmailHtml(generated)}</p>
      <h3 style="margin:0 0 12px;color:#10213d">Department Wise Report Links</h3>
      ${sections.join('')}
    </div>
  </div>`;
  return {subject:`Nerve Center - Director's Daily Report - ${generated}`,text,html};
}

export function buildDirectorReportZipAttachment(bundle={}){
  const files=Array.isArray(bundle.files)?bundle.files:[];
  if(!files.length)return null;
  const slotKey=cleanEmailText(bundle.slotKey||'director-daily-report');
  return {
    filename:`nerve-center-director-reports-${slotKey}.zip`,
    content:buildDirectorReportArchiveBuffer(files),
    contentType:'application/zip',
  };
}

export async function sendDirectorReportEmail({to,bundle},env=process.env){
  const recipients=String(to||'').split(',').map((value)=>value.trim()).filter(Boolean);
  if(!recipients.length)return {sent:false,reason:'recipient email missing'};
  const {config,transporter}=createTicketMailer(env);
  if(!transporter)return {sent:false,reason:'Email is not configured'};
  const email=buildDirectorReportEmail(bundle);
  const zipAttachment=buildDirectorReportZipAttachment(bundle);
  const result=await transporter.sendMail({
    from:`Nerve Center Reports <${config.user}>`,
    to:recipients,
    subject:email.subject,
    text:email.text,
    html:email.html,
    attachments:zipAttachment?[zipAttachment]:[],
  });
  return {sent:true,messageId:result.messageId,accepted:result.accepted,attachmentCount:zipAttachment?1:0};
}
