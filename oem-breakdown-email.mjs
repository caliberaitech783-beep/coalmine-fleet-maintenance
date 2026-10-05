import {createHash} from 'node:crypto';
import {createTicketMailer, escapeEmailHtml as escape} from './ticket-email.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {createFleetAssetResolver} from './dashboard-equipment-metrics.mjs';
import {requestShiftLabel} from './request-shift.mjs';
import {indiaDateTimeEpoch} from './report-date-range.mjs';

const clean=value=>String(value??'').trim();
const key=value=>clean(value).toLowerCase();
export const OEM_EMAIL_INTERVALS={L1:1,L2:3,L3:7,L4:10};
export function oemEmailDay(now=new Date()) {return new Date(now.getTime()+330*60000).toISOString().slice(0,10);}
export function oemEmailDue(level,activation,now=new Date()) {
  const local=new Date(now.getTime()+330*60000);
  const days=Math.round((Date.parse(oemEmailDay(now))-Date.parse(activation))/86400000);
  return local.getUTCHours()>=17 && days>=0 && days%OEM_EMAIL_INTERVALS[level]===0;
}
// Explicit legacy OEM-master site spellings; never broaden an unknown location to all sites.
const site=value=>canonicalSiteName(clean(value).replace(/\b(Majri|Sasti|Dhoptala)\s+2\b/gi,'$1 II').replace(/\bGauri Pauni\b/gi,'Gauri Pauni'));
export function oemEmailRecipients(contacts=[]) {
  const groups=new Map();
  for(const contact of contacts){
    const level=`L${clean(contact.level).match(/^(?:level\s*|l)?([1-4])$/i)?.[1]||''}`;
    const email=key(contact.email),oem=clean(contact.oem);
    const locations=(Array.isArray(contact.location)?contact.location:clean(contact.location).split(/[,;|\n]/)).map(site).filter(Boolean);
    if(!OEM_EMAIL_INTERVALS[level]||!oem||!locations.length||! /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))continue;
    const identity=JSON.stringify([email,key(oem),level]);
    const group=groups.get(identity)||{email,oem,level,name:clean(contact.contact)||'OEM Team',sites:[],recipientKey:createHash('sha256').update(identity).digest('hex')};
    group.sites=[...new Set([...group.sites,...locations])];groups.set(identity,group);
  }
  return [...groups.values()];
}
export function oemEmailRows({requests=[],equipment=[],recipient}) {
  const resolve=createFleetAssetResolver(equipment);
  return requests.filter(row=>key(row.oemResponsibility)==='oem'&&!['closed','idle','ideal'].includes(key(row.status)))
    .flatMap(row=>{
      const {assetIndex}=resolve(row,{allowTransferred:true});
      // Unresolved equipment must not be guessed into another OEM's report.
      if(assetIndex===null)return [];
      const asset=equipment[assetIndex],oem=asset.make||asset.oem;
      const location=asset.currentLocation||asset.location||asset.site||row.site;
      if(key(oem)!==key(recipient.oem)||!recipient.sites.includes(site(location)))return [];
      return [{...row,site:location,model:asset.model||row.model,door:row.door||asset.door||asset.equipmentName}];
    }).sort((a,b)=>String(a.site).localeCompare(String(b.site))||String(a.start).localeCompare(String(b.start)));
}
export function buildOemEmail({recipient,rows,shifts=[],now=new Date()}) {
  const days=OEM_EMAIL_INTERVALS[recipient.level];
  const label=days===1?'Daily Breakdown Report':`${days}-Day Breakdown ${recipient.level==='L2'?'Review':recipient.level==='L3'?'Escalation':'Management Review'}`;
  const subject=`[OEM BD | ${recipient.level}] ${recipient.oem} — ${label} — ${oemEmailDay(now)}`;
  const actions={L1:'Please share the action taken, pending parts or support requirements, and expected restoration time.',L2:'Please coordinate pending service visits, parts availability and delays, and provide a case-wise action plan and expected restoration time.',L3:'Please arrange regional support and confirm responsible persons and target completion dates.',L4:'Please arrange management intervention where technical, parts or service support is needed and share a coordinated recovery plan.'};
  const headers=['Shift','Job Reference','Site','Door No','Model','BD Started','Days of BD','Reason of BD','Latest Update','Delay Reason','ETC'];
  const values=rows.map(row=>{
    const started=indiaDateTimeEpoch(row.start);
    const minutes=Number.isFinite(started)?Math.max(0,Math.floor((now.getTime()-started)/60000)):null;
    const latest=row.dailyRemarks?.[0]||{};
    return [requestShiftLabel(row,shifts),row.ref,row.site,row.door,row.model,row.start,minutes===null?'—':`${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h ${minutes%60}m`,row.complaint,latest.remark,latest.delayedReason||latest.delayReason||row.delayedReason,row.expectedCompletionAt].map(value=>clean(value)||'—');
  });
  const intro=`Dear ${recipient.name},\n\nConsolidated active OEM BD cases for ${recipient.oem} across your assigned locations.\nActive OEM BD cases: ${rows.length}\nReport generated: ${oemEmailDay(now)}, ${new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}).format(now)} IST\n\n${actions[recipient.level]}`;
  const footer='Regards,\nCaliber — Nerve Center\nAutomated OEM Breakdown Reporting';
  const cell=(value,tag='td')=>`<${tag} style="border:1px solid #000;padding:8px;text-align:left">${escape(value)}</${tag}>`;
  return {subject,text:`${intro}\n\n${headers.join(' | ')}\n${values.map(row=>row.join(' | ')).join('\n')||'No active OEM BD cases.'}\n\n${footer}`,html:`<div style="font-family:Arial;color:#17233c"><p>${escape(intro).replaceAll('\n','<br>')}</p><table style="border-collapse:collapse"><thead><tr>${headers.map(value=>cell(value,'th')).join('')}</tr></thead><tbody>${values.map((row,index)=>`<tr style="background:${index%2?'#fff':'#eee'}">${row.map(value=>cell(value)).join('')}</tr>`).join('')}</tbody></table>${rows.length?'':'<p>No active OEM BD cases.</p>'}<p>${escape(footer).replaceAll('\n','<br>')}</p></div>`};
}

export async function sendScheduledOemEmails({pool,loadData,now=new Date(),mailer=createTicketMailer()}) {
  const client=await pool.connect();let locked=false;
  try{
    locked=(await client.query('SELECT pg_try_advisory_lock(71903541) AS locked')).rows[0].locked;
    if(!locked)return {skipped:true};
    await client.query(`CREATE TABLE IF NOT EXISTS oem_email_schedule (id INTEGER PRIMARY KEY CHECK(id=1), activation_date TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS oem_email_deliveries (day TEXT NOT NULL,recipient_key TEXT NOT NULL,email TEXT NOT NULL,oem TEXT NOT NULL,level TEXT NOT NULL,status TEXT NOT NULL,message_id TEXT,case_count INTEGER NOT NULL DEFAULT 0,error TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(day,recipient_key))`);
    await client.query('INSERT INTO oem_email_schedule(id,activation_date) VALUES(1,$1) ON CONFLICT DO NOTHING',[oemEmailDay(now)]);
    const activation=(await client.query('SELECT activation_date FROM oem_email_schedule WHERE id=1')).rows[0].activation_date;
    if(!oemEmailDue('L1',activation,now))return {skipped:true};
    if(!mailer.transporter)throw new Error('OEM email schedule cannot send: SMTP is not configured');
    const data=await loadData();let sent=0,failed=0;
    for(const recipient of oemEmailRecipients(data.contacts)){
      if(!oemEmailDue(recipient.level,activation,now))continue;
      const rows=oemEmailRows({...data,recipient});
      const claim=await client.query(`INSERT INTO oem_email_deliveries(day,recipient_key,email,oem,level,status,case_count) VALUES($1,$2,$3,$4,$5,'Sending',$6) ON CONFLICT DO NOTHING RETURNING recipient_key`,[oemEmailDay(now),recipient.recipientKey,recipient.email,recipient.oem,recipient.level,rows.length]);
      if(!claim.rowCount)continue;
      let result;
      try{
        result=await mailer.transporter.sendMail({from:`Nerve Center <${mailer.config.user}>`,to:recipient.email,...buildOemEmail({recipient,rows,shifts:data.shifts,now})});
        if(!result.accepted?.some(address=>key(address)===recipient.email))throw new Error('SMTP did not accept the recipient');
      }catch(error){
        failed++;
        // Do not automatically resend ambiguous SMTP outcomes: delivery may already have occurred.
        await client.query("UPDATE oem_email_deliveries SET status='Failed / review required',error=$3,updated_at=NOW() WHERE day=$1 AND recipient_key=$2",[oemEmailDay(now),recipient.recipientKey,clean(error.message).slice(0,500)]);
        continue;
      }
      await client.query("UPDATE oem_email_deliveries SET status='SMTP accepted',message_id=$3,updated_at=NOW() WHERE day=$1 AND recipient_key=$2",[oemEmailDay(now),recipient.recipientKey,result.messageId||'']);sent++;
    }
    if(failed)throw new Error(`OEM email report: ${sent} accepted by SMTP; ${failed} failed, see oem_email_deliveries`);
    return sent?{sent}:{skipped:true};
  }finally{if(locked)await client.query('SELECT pg_advisory_unlock(71903541)').catch(()=>{});client.release();}
}
