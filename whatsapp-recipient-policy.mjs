import {resolveMobileAccess} from './mobile-access.mjs';

export const WHATSAPP_DELIVERY_POLICY_VERSION=2;
export const DEFAULT_WORKFLOW_ALERT_ROLES=Object.freeze([
  'productionSupervisor','maintenanceSupervisor','misSupervisor','admin','superAdmin',
]);
export const DEFAULT_CRM_REPORT_ROLES=Object.freeze(['Admin','Manager','Super Admin']);

const DIRECTOR_PROFILE_NAMES=new Set(['mohit chadda','manish chadda','rahul chadda']);
const words=value=>String(value||'').trim().toLowerCase().replace(/[\s_-]+/g,' ');

// Account permissions historically default unknown levels (including Project
// Manager) to Admin. Resolve job restrictions before that fallback. Only a real
// Super Admin account overrides a Director or manager job designation.
export function whatsAppRecipientRole(user={},profile=resolveMobileAccess({user})){
  const adminLevel=words(user.adminLevel||profile.permissions?.adminLevel);
  if(/^super\s*admin$/.test(adminLevel))return 'superAdmin';
  const fields=[user.level,user.hierarchyLevel,user.userGroup,user.adminLevel,
    user.designation,user.role,user.department,user.oemRole,user.managerRole,
    user.assignedRole,user.mobileRole,profile.assignedRole,
    ...(profile.permissions?.managerRoles||[])]
    .flat().map(words).join(' ');
  const directorFields=[fields,user.employee,user.name].map(words).join(' ');
  if([user.employee,user.name].some(name=>DIRECTOR_PROFILE_NAMES.has(words(name)))||/\bdirector\b/.test(directorFields))return 'director';
  if(adminLevel==='manager'||/\bmanager\b/.test(fields)||/\bp\.m\b/.test(fields))return 'manager';
  if(adminLevel==='admin')return 'admin';
  return '';
}

// Shared by request routing and generic CRM / daily maintenance notifications.
// These classify recipients only; callers still enforce purpose switches and
// the existing site authorization for recipients other than all-alert admins.
export function isWhatsAppAllAlertRecipient(user={},profile=resolveMobileAccess({user})){
  return ['admin','superAdmin'].includes(whatsAppRecipientRole(user,profile));
}

export function isWhatsAppReportsOnlyRecipient(user={},profile=resolveMobileAccess({user})){
  return ['manager','director'].includes(whatsAppRecipientRole(user,profile));
}
