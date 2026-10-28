import {normalizeShiftRecord} from './shift-master.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {displaySiteName} from './region-scope.mjs';
import {buildHourlyBreakdownPreview} from './hourly-breakdown-preview.mjs';
import {requestsWithDoorNumbers} from './equipment-door.mjs';

const OFFSET=330*60000;
export function hourlyTelegramSlots(shifts,now=new Date()){
  const timestamp=new Date(now).getTime(),slots=[];
  const normalized=shifts.flatMap(row=>{try{return [normalizeShiftRecord(row)];}catch{return [];}});
  for(const dayOffset of [0,-86400000]){
    const date=new Date(timestamp+OFFSET+dayOffset).toISOString().slice(0,10);
    const active=normalized.filter(s=>s.status==='Active'&&['A','1'].includes(s.shiftCode)&&(!s.effectiveFrom||s.effectiveFrom<=date)&&(!s.effectiveTo||s.effectiveTo>=date));
    for(const site of new Set(active.map(s=>canonicalSiteName(s.site)))){
      if(!site)continue;
      const matches=active.filter(s=>canonicalSiteName(s.site)===site);
      if(matches.length!==1)continue;
      const [h,m,s]=matches[0].startTime.split(':').map(Number);
      const midnight=Date.parse(`${date}T00:00:00+05:30`);
      for(let seconds=h*3600+m*60+(s||0)+7200;seconds<=86400;seconds+=7200){
        const cutoff=midnight+seconds*1000;
        if(timestamp>=cutoff&&timestamp-cutoff<10*60000)slots.push({site:displaySiteName(site),cutoff:new Date(cutoff),key:`HOURLY-BD-${site}-${new Date(cutoff).toISOString()}`});
      }
    }
  }
  return slots;
}

// Claim before sending. A crash/ambiguous Telegram response leaves a reviewable
// Sending/Failed row rather than retrying a document that may already be delivered.
export function createHourlyTelegramDelivery({pool,loadGroups,loadSource,buildPdf,sendDocument}){
  let running=false;
  return async function deliver(now=new Date()){
    if(running)return {skipped:true};
    running=true;
    try{
      const {rows}=await pool.query("SELECT record_data FROM master_records WHERE master_name='Shift Master'");
      const slots=hourlyTelegramSlots(rows.map(r=>r.record_data),now);
      if(!slots.length)return {skipped:true};
      const groups=await loadGroups();
      let source, sent=0,failed=0;
      for(const slot of slots){
        const targets=new Map(groups.filter(group=>/^-[1-9]\d*$/.test(String(group.chatId))&&canonicalSiteName(group.site)===canonicalSiteName(slot.site)).map(group=>[String(group.chatId),group]));
        if(targets.size!==1){
          console.error('Hourly Telegram report needs exactly one registered site group',slot.site);failed++;continue;
        }
        let buffer,caption;
        for(const [chatId,recipient] of targets){
          const scope=`HOURLY-TELEGRAM-SITE-${canonicalSiteName(slot.site)}-${chatId}`;
          const claim=await pool.query("INSERT INTO whatsapp_consolidated_report_runs (slot_key,recipient_login,scope_key,status,attempts,updated_at) VALUES ($1,$2,$3,'Sending',1,NOW()) ON CONFLICT (slot_key,recipient_login,scope_key) DO NOTHING RETURNING id",[slot.key,chatId,scope]);
          if(!claim.rowCount)continue;
          try{
            if(!buffer){
              source??=await loadSource();
              const report=buildHourlyBreakdownPreview(requestsWithDoorNumbers(source.requests,source.equipmentRecords),slot.cutoff,slot.site);
              caption=`Hourly Breakdown Report · ${slot.site}\n${report.period}\n${Object.entries(report.counts).map(([k,v])=>`${k}: ${v}`).join(' · ')}`;
              buffer=await buildPdf({title:caption,columns:report.columns.map(label=>({label})),rows:report.rows,pageSize:'A3'});
            }
            const result=await sendDocument({chatId,buffer,filename:`hourly-breakdown-${slot.site.replace(/[^a-z0-9]+/gi,'-')}-${slot.cutoff.toISOString().replace(/[:.]/g,'-')}.pdf`,caption});
            if(!result?.sent)throw Error('Telegram did not confirm delivery');
            await pool.query("UPDATE whatsapp_consolidated_report_runs SET status='Sent by Telegram',updated_at=NOW() WHERE id=$1",[claim.rows[0].id]);
            sent++;
          }catch(error){
            await pool.query("UPDATE whatsapp_consolidated_report_runs SET status='Failed - review Telegram before retry',updated_at=NOW() WHERE id=$1",[claim.rows[0].id]);
            console.error('Hourly Telegram site group report failed',recipient.site,error.message);failed++;
          }
        }
      }
      return {sent,failed};
    }finally{running=false;}
  };
}
