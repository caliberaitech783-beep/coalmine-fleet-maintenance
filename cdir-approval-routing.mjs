import {assignedUserRoles} from './account-role-access.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {userSiteSelection,managerReportScope,reportScopeIncludesSite} from './region-scope.mjs';
export function officeApprovalKey(site){
 const key=canonicalSiteName(site);
 if(['nagpur','nagpur office','corporate office nagpur','nagpur corporate office'].includes(key))return 'nagpur';
 if(['chandrapur','chandrapur head office','head office chandrapur','chandrapur office'].includes(key))return 'chandrapur';
 return '';
}
export const approvalRoleForSite=site=>officeApprovalKey(site)?'HR Manager':'Project Manager';
export function hrManagerAssignedToOffice(user,site){const office=officeApprovalKey(site);return Boolean(office&&userSiteSelection(user).some(value=>officeApprovalKey(value)===office));}
export function cdirApprovalRecipients(users,site,resolveAccess){
 return [...new Set(users.filter(user=>{
  if(officeApprovalKey(site))return assignedUserRoles(user).includes('HR Manager')&&hrManagerAssignedToOffice(user,site);
  const profile=resolveAccess({user});return profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&profile.permissions.managerRoles?.includes('Project Manager')&&reportScopeIncludesSite(managerReportScope(user),site);
 }).map(user=>String(user.login||'').trim().toLowerCase()).filter(Boolean))];
}
