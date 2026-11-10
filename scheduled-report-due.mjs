import {HIERARCHY_REPORT_DESIGNATIONS,applyHierarchyDeliveryRule,applyUserReportScheduleOverride,normalizeHierarchyReportScheduleSettings,reportsDueForDesignation} from './hierarchy-report-flow.mjs';
import {scheduledReportWindowsDue} from './report-delivery-window.mjs';

const clean=value=>String(value??'').trim();

// Which report times are due depends only on the saved timetables: the role defaults in Report
// settings, a Hierarchy master rule for the role, and each user's personal schedule. The
// 60-second report jobs used to read every Users & employees row (and the CRM job every
// Equipment master row) before finding that none of those times was due. This answers "could
// any recipient be due now?" from the timetables alone.
//
// It is a superset of the per-recipient decision: for every way the senders can build a
// recipient's effective schedule (the role default, that default under each rule saved for the
// role, and each of those under each personal schedule) it asks the same reportsDueForDesignation
// the senders ask. Filters the senders apply afterwards (recipient lists, site scope, report
// titles a rule withholds) can only remove due windows, never add one. A yes still runs the full
// pass, which decides who receives what.
export function hierarchyReportsPossiblyDue({now=new Date(),scheduleSettings,hierarchyRows=[],userScheduleOverrides=new Map(),graceMinutes=20,personalOnly=false}={}){
  const normalized=normalizeHierarchyReportScheduleSettings(scheduleSettings||{});
  const rules=(Array.isArray(hierarchyRows)?hierarchyRows:[]).map(row=>row?.record_data||row).filter(rule=>rule&&typeof rule==='object');
  const personal=[...(userScheduleOverrides instanceof Map?userScheduleOverrides.values():Object.values(userScheduleOverrides||{}))]
    .filter(schedule=>schedule&&typeof schedule==='object');
  if(personalOnly&&!personal.length)return false;
  for(const [key,designation] of Object.entries(HIERARCHY_REPORT_DESIGNATIONS)){
    const label=clean(designation.label).toLowerCase();
    const roleSettings=[normalized,...rules.filter(rule=>clean(rule.designation).toLowerCase()===label).map(rule=>applyHierarchyDeliveryRule(normalized,key,rule))];
    for(const settings of roleSettings){
      if(!personalOnly&&reportsDueForDesignation(key,now,graceMinutes,settings).length)return true;
      for(const schedule of personal){
        // A personal schedule saved for another role leaves this role on its default.
        if(clean(schedule.designationKey)&&clean(schedule.designationKey)!==key)continue;
        if(reportsDueForDesignation(key,now,graceMinutes,applyUserReportScheduleOverride(settings,key,schedule)).length)return true;
      }
    }
  }
  return false;
}

// The CRM report follows the CRM time in Report settings for everyone, except a recipient who
// saved a personal schedule for their role: their CRM report then follows that schedule.
export function crmReportsPossiblyDue({now=new Date(),crmSettings,graceMinutes=20,...timetables}={}){
  if(scheduledReportWindowsDue(crmSettings,now,graceMinutes).length)return true;
  return hierarchyReportsPossiblyDue({now,graceMinutes,...timetables,personalOnly:true});
}
