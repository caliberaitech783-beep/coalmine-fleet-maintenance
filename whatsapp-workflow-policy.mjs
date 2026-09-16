import {flowDesignationForUser} from './hierarchy-report-flow.mjs';
import {resolveMobileAccess} from './mobile-access.mjs';
import {managerReportScope,reportScopeIncludesSite,userSiteScope} from './region-scope.mjs';
import {DEFAULT_WORKFLOW_ALERT_ROLES,whatsAppRecipientRole} from './whatsapp-recipient-policy.mjs';

export {isWhatsAppAllAlertRecipient,isWhatsAppReportsOnlyRecipient,whatsAppRecipientRole} from './whatsapp-recipient-policy.mjs';

export const WHATSAPP_WORKFLOW_POLICY={
  opened:{templateKey:'requestOpened',recipientRoles:[...DEFAULT_WORKFLOW_ALERT_ROLES]},
  closed:{templateKey:'requestClosed',recipientRoles:[...DEFAULT_WORKFLOW_ALERT_ROLES]},
  verified:{templateKey:'requestVerified',recipientRoles:[...DEFAULT_WORKFLOW_ALERT_ROLES]},
  idle:{templateKey:'requestIdle',recipientRoles:[...DEFAULT_WORKFLOW_ALERT_ROLES]},
};

export const WHATSAPP_WORKFLOW_DELIVERY_RULES={
  locationScoped:true,
  sendOutsideWorkingHours:true,
  offRoadEscalationHours:4,
  idleRepeatHours:1,
  includeRequestLink:true,
  auditEveryAttempt:false,
  trackMessageStatus:true,
  language:'English',
};

function workflowRoleKeys(user={},profile=resolveMobileAccess({user})){
  const keys=new Set();
  const designation=flowDesignationForUser(user,profile)||flowDesignationForUser({designation:user.assignedRole||user.mobileRole},profile);
  if(designation?.key)keys.add(designation.key);
  if(profile.assignedRole==='Production User')keys.add('productionSupervisor');
  if(profile.assignedRole==='Maintenance User')keys.add('maintenanceSupervisor');
  if(profile.assignedRole==='MIS User')keys.add('misSupervisor');
  return keys;
}

export function isExcludedWorkflowWhatsAppRecipient(user={},profile=resolveMobileAccess({user}),settings=null,eventType=''){
  const role=whatsAppRecipientRole(user,profile);
  if(['manager','director','admin','superAdmin'].includes(role))return true;
  // An excluded leadership row must also block an eligible duplicate login.
  return Boolean(settings&&role&&!settings.events?.[eventType]?.recipientRoles?.includes(role));
}

export function isWorkflowWhatsAppRecipient(user={},eventType='',site='',settings=null){
  const policy=settings?settings.events?.[eventType]:WHATSAPP_WORKFLOW_POLICY[eventType];
  if(!policy)return false;
  if(settings&&(!settings.enabled||policy.enabled===false))return false;
  const profile=resolveMobileAccess({user});
  if(isExcludedWorkflowWhatsAppRecipient(user,profile,settings,eventType))return false;
  const leadership=whatsAppRecipientRole(user,profile);
  const keys=leadership?new Set([leadership]):workflowRoleKeys(user,profile);
  if(!policy.recipientRoles?.some((role)=>keys.has(role)))return false;
  if(profile.sessionRole==='normal'){
    return reportScopeIncludesSite(userSiteScope(user),site);
  }
  const scope=managerReportScope(user);
  return reportScopeIncludesSite(scope,site);
}

export function workflowWhatsAppRecipientLogins(rows=[],{eventType,site,settings=null}={}){
  const excludedLogins=new Set(rows.map((row)=>row?.record_data||row||{}).filter((user)=>isExcludedWorkflowWhatsAppRecipient(user,resolveMobileAccess({user}),settings,eventType)).map((user)=>String(user.login||'').trim().toLowerCase()).filter(Boolean));
  const logins=[];
  for(const row of rows){
    const user=row?.record_data||row||{};
    const login=String(user.login||'').trim().toLowerCase();
    if(login&&!excludedLogins.has(login)&&isWorkflowWhatsAppRecipient(user,eventType,site,settings))logins.push(login);
  }
  return [...new Set(logins)];
}

export function workflowRequestLink(reference,baseUrl='https://bdms.cmll.in'){
  const root=String(baseUrl||'https://bdms.cmll.in').replace(/\/+$/,'');
  return `${root}/?request=${encodeURIComponent(String(reference||'').trim())}`;
}

export function workflowReminderSlot(eventType,eventAt,now=new Date(),settings=null){
  const started=new Date(eventAt);
  const current=new Date(now);
  if(!Number.isFinite(started.getTime())||!Number.isFinite(current.getTime()))return '';
  const elapsedHours=Math.floor((current-started)/(60*60*1000));
  const offRoad=settings?.reminders?.offRoad||{enabled:true,hours:WHATSAPP_WORKFLOW_DELIVERY_RULES.offRoadEscalationHours};
  const idle=settings?.reminders?.idle||{enabled:true,hours:WHATSAPP_WORKFLOW_DELIVERY_RULES.idleRepeatHours};
  if(eventType==='opened')return offRoad.enabled&&elapsedHours>=offRoad.hours?`offroad-hour-${offRoad.hours}`:'';
  if(eventType==='idle'&&idle.enabled&&elapsedHours>=idle.hours)return `idle-hour-${Math.floor(elapsedHours/idle.hours)*idle.hours}`;
  return '';
}
