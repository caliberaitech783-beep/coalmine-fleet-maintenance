import {createHash} from 'node:crypto';
import {applyHierarchyDeliveryRule,applyUserReportScheduleOverride,flowDesignationForUser,reportsDueForDesignation} from './hierarchy-report-flow.mjs';
import {hierarchyAccessAllowsReport} from './hierarchy-report-catalogue.mjs';
import {hierarchyRecipientReportScope} from './hierarchy-report-scope.mjs';
import {resolveMobileAccess} from './mobile-access.mjs';
import {reportScopeIncludesSite} from './region-scope.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {TELEGRAM_SITES} from './telegram-site-groups.mjs';

// Reuse saved hierarchy/personal timetables and scope. Shared deliveries are a
// union of due fleet titles, never a combined multi-site personal report.
export function siteFleetPlans({users,hierarchyRecords=[],scheduleSettings,userScheduleOverrides=new Map(),now=new Date()}){
  const plans=new Map();
  for(const user of users){
    const profile=resolveMobileAccess({user}),designation=flowDesignationForUser(user,profile);
    if(!designation)continue;
    const login=String(user.login||'').trim().toLowerCase();
    const configured=scheduleSettings.designations[designation.key];
    if(!configured?.allRecipients&&!configured?.recipientLogins?.includes(login))continue;
    const rule=hierarchyRecords.map(row=>row.record_data||row).find(row=>String(row.designation||'').trim().toLowerCase()===designation.label.toLowerCase());
    const effective=applyUserReportScheduleOverride(rule?applyHierarchyDeliveryRule(scheduleSettings,designation.key,rule):scheduleSettings,designation.key,userScheduleOverrides.get(login)||null);
    // Remove disallowed titles before calculating windows, just like the personal flow.
    if(rule)effective.designations[designation.key].schedules=effective.designations[designation.key].schedules.map(schedule=>({...schedule,reports:schedule.reports.filter(title=>hierarchyAccessAllowsReport(rule.reportAccess,title))}));
    const scope=hierarchyRecipientReportScope(user,profile,rule?.siteAccess);
    for(const due of reportsDueForDesignation(designation.key,now,20,effective)){
      const titles=due.reports.filter(title=>!rule||hierarchyAccessAllowsReport(rule.reportAccess,title));
      if(!titles.length)continue;
      for(const site of TELEGRAM_SITES.filter(site=>reportScopeIncludesSite(scope,site))){
        const key=JSON.stringify([site,due.window.start.toISOString(),due.window.end.toISOString()]);
        const plan=plans.get(key)||{site,window:due.window,reports:new Set()};
        titles.forEach(title=>plan.reports.add(title));plans.set(key,plan);
      }
    }
  }
  return [...plans.values()].map(plan=>({...plan,reports:[...plan.reports].sort(),slotKey:`SITE-FLEET-${plan.window.start.toISOString()}-${plan.window.end.toISOString()}`}));
}

export function createSiteFleetTelegramDelivery({pool,loadPlans,loadGroups,loadSettings,allowed,checkGroup,publish,sendText,loadSource}){
  let running=false;
  return async function deliver(now=new Date()){
    if(running)return {skipped:true};
    running=true;
    try{
      const settings=await loadSettings();
      const plans=await loadPlans(now);
      if(!plans.length)return {skipped:true};
      const groups=await loadGroups();let source,sent=0,failed=0,skipped=0;
      for(const plan of plans){
        const matches=new Map(groups.filter(group=>canonicalSiteName(group.site)===canonicalSiteName(plan.site)&&/^-[1-9]\d*$/.test(String(group.chatId))).map(group=>[String(group.chatId),group]));
        if(matches.size!==1){failed++;continue;}
        const [chatId]=matches.keys();
        if(!allowed(settings,'siteFleetReport',now,chatId)){skipped++;continue;}
        // Independent per-title claims prevent a title being resent if other
        // recipients/schedules contribute additional titles to this window later.
        const claimed=[];
        for(const title of plan.reports){
          const scope=`SITE-FLEET-${canonicalSiteName(plan.site)}-${createHash('sha256').update(title).digest('hex').slice(0,24)}`;
          const result=await pool.query("INSERT INTO whatsapp_consolidated_report_runs (slot_key,recipient_login,scope_key,status,attempts,updated_at) VALUES ($1,$2,$3,'Sending',1,NOW()) ON CONFLICT (slot_key,recipient_login,scope_key) DO NOTHING RETURNING id",[plan.slotKey,chatId,scope]);
          if(result.rowCount)claimed.push({id:result.rows[0].id,title});
        }
        if(!claimed.length){skipped++;continue;}
        try{
          await checkGroup(chatId);
          source??=await loadSource();
          const bundle=await publish({...plan,reportTitles:claimed.map(row=>row.title),sourceData:source,now});
          const result=await sendText({chatId,message:bundle.message,purpose:'siteFleetReport',settings});
          if(!result?.sent)throw new Error('Telegram did not confirm delivery');
          await pool.query("UPDATE whatsapp_consolidated_report_runs SET status='Sent by Telegram',updated_at=NOW() WHERE id=ANY($1::bigint[])",[claimed.map(row=>row.id)]);
          sent++;
        }catch(error){
          await pool.query("UPDATE whatsapp_consolidated_report_runs SET status='Failed - review Telegram before retry',updated_at=NOW() WHERE id=ANY($1::bigint[])",[claimed.map(row=>row.id)]);
          console.error('Site fleet Telegram delivery failed',plan.site,error.message);failed++;
        }
      }
      return {sent,failed,skipped};
    }finally{running=false;}
  };
}
