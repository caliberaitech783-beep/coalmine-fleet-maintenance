import {assignedUserRoles} from './account-role-access.mjs';
import {officeApprovalKey} from './cdir-approval-routing.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {userSiteSelection,managerReportScope,reportScopeIncludesSite} from './region-scope.mjs';
import {managerRoleSelection} from './admin-access.mjs';

export const cdirLogin=value=>String(value||'').trim().toLowerCase();
export const cdirSiteKey=value=>officeApprovalKey(value)||canonicalSiteName(value);
export const cdirSameRecord=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
export function cdirSubmissionAllowed(session={},user={},site){
  const admin=session.role==='super'&&['admin','super admin'].includes(String(user.adminLevel||session.permissions?.adminLevel||'').toLowerCase());
  if(admin||/\bdirector\b/i.test(String(user.designation||user.employeeDesignation||'')))return true;
  const roles=[session.assignedRole,...assignedUserRoles(user)],sites=userSiteSelection(user);
  if(roles.some(role=>['HR User','HR Manager'].includes(role)))return sites.some(value=>officeApprovalKey(value)==='nagpur')||sites.some(value=>cdirSiteKey(value)===cdirSiteKey(site));
  const pm=session.role==='super'&&String(user.adminLevel||session.permissions?.adminLevel).toLowerCase()==='manager'&&managerRoleSelection(user.managerRole||session.permissions?.managerRoles||session.permissions?.managerRole).includes('Project Manager');
  return pm&&reportScopeIncludesSite(managerReportScope(user),site)&&!officeApprovalKey(site);
}
export async function assertNoCdirPendingChange(client,employeeIds){
  if(!employeeIds.length)return;
  const {rows}=await client.query("SELECT record_data FROM cdir_change_requests WHERE record_data->>'status'='Pending'");
  if(rows.some(row=>(row.record_data.employeeRecordIds||[]).some(id=>employeeIds.map(String).includes(String(id)))))throw Object.assign(new Error('An employee/contact update is pending. Complete or reject it first.'),{status:409});
}
