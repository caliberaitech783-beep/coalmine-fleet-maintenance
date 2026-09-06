import {flowDesignationForUser} from './hierarchy-report-flow.mjs';
import {resolveMobileAccess} from './mobile-access.mjs';
import {managerReportScope,reportScopeIncludesSite} from './region-scope.mjs';
import {canonicalSiteName} from './site-location.mjs';

const DIRECTOR_PROFILE_NAMES=new Set(['mohit chadda','manish chadda','rahul chadda']);
const normalizedWords=(value)=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');

export const WHATSAPP_WORKFLOW_POLICY={
  opened:{templateKey:'requestOpened',recipientRoles:['maintenanceSupervisor','maintenanceManager','productionManager']},
  closed:{templateKey:'requestClosed',recipientRoles:['productionSupervisor','productionManager','maintenanceManager']},
  verified:{templateKey:'requestVerified',recipientRoles:['productionManager','maintenanceManager','misManager']},
  idle:{templateKey:'requestIdle',recipientRoles:['projectManager','productionManager','maintenanceManager','misManager']},
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
  const designation=flowDesignationForUser(user,profile);
  if(designation?.key)keys.add(designation.key);
  if(profile.assignedRole==='Production User')keys.add('productionSupervisor');
  if(profile.assignedRole==='Maintenance User')keys.add('maintenanceSupervisor');
  if(profile.assignedRole==='MIS User')keys.add('misSupervisor');
  for(const role of profile.permissions?.managerRoles||[]){
    if(role==='Production Manager')keys.add('productionManager');
    if(role==='Maintenance Manager')keys.add('maintenanceManager');
    if(role==='MIS Manager')keys.add('misManager');
  }
  return {keys,designation};
}

export function isExcludedWorkflowWhatsAppRecipient(user={},profile=resolveMobileAccess({user})){
  const rawAdminLevel=normalizedWords(user.adminLevel);
  const name=normalizedWords(user.employee||user.name);
  const {designation}=workflowRoleKeys(user,profile);
  if(DIRECTOR_PROFILE_NAMES.has(name)||designation?.key==='director')return true;
  if(rawAdminLevel==='admin'||rawAdminLevel==='super admin')return true;
  return profile.sessionRole==='super'&&profile.permissions?.adminLevel==='Admin'&&designation?.key!=='projectManager';
}

export function isWorkflowWhatsAppRecipient(user={},eventType='',site=''){
  const policy=WHATSAPP_WORKFLOW_POLICY[eventType];
  if(!policy)return false;
  const profile=resolveMobileAccess({user});
  if(isExcludedWorkflowWhatsAppRecipient(user,profile))return false;
  const {keys}=workflowRoleKeys(user,profile);
  if(!policy.recipientRoles.some((role)=>keys.has(role)))return false;
  if(profile.sessionRole==='normal'){
    const userSite=canonicalSiteName(user.site||user.location||user.currentLocation);
    return Boolean(userSite)&&userSite===canonicalSiteName(site);
  }
  return reportScopeIncludesSite(managerReportScope(user),site);
}

export function workflowWhatsAppRecipientLogins(rows=[],{eventType,site}={}){
  const excludedLogins=new Set(rows.map((row)=>row?.record_data||row||{}).filter((user)=>isExcludedWorkflowWhatsAppRecipient(user)).map((user)=>String(user.login||'').trim().toLowerCase()).filter(Boolean));
  const logins=[];
  for(const row of rows){
    const user=row?.record_data||row||{};
    const login=String(user.login||'').trim().toLowerCase();
    if(login&&!excludedLogins.has(login)&&isWorkflowWhatsAppRecipient(user,eventType,site))logins.push(login);
  }
  return [...new Set(logins)];
}

export function workflowRequestLink(reference,baseUrl='https://bdms.cmll.in'){
  const root=String(baseUrl||'https://bdms.cmll.in').replace(/\/+$/,'');
  return `${root}/?request=${encodeURIComponent(String(reference||'').trim())}`;
}

export function workflowReminderSlot(eventType,eventAt,now=new Date()){
  const started=new Date(eventAt);
  const current=new Date(now);
  if(!Number.isFinite(started.getTime())||!Number.isFinite(current.getTime()))return '';
  const elapsedHours=Math.floor((current-started)/(60*60*1000));
  if(eventType==='opened')return elapsedHours>=WHATSAPP_WORKFLOW_DELIVERY_RULES.offRoadEscalationHours?'offroad-hour-4':'';
  if(eventType==='idle'&&elapsedHours>=WHATSAPP_WORKFLOW_DELIVERY_RULES.idleRepeatHours)return `idle-hour-${elapsedHours}`;
  return '';
}
