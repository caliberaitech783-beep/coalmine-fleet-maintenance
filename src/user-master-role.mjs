import {assignedUserRoles} from '../account-role-access.mjs';
const clean = (value) => String(value ?? "").trim();

// Display the saved role without modifying account authority or permissions.
export function userMasterRole(record = {}) {
  const accountType = clean(record.userType);
  const authority = clean(record.adminLevel);
  const isDesktop = /super/i.test(accountType);
  if(Object.hasOwn(record,'userRoles')){
    const roles=assignedUserRoles(record);
    if(!isDesktop)return roles.join(' | ')||'Not assigned';
    if(roles.includes('Account User'))return `${authority||'User'} | Account User`;
  }
  if (isDesktop && /^(super admin|admin)$/i.test(authority)) return authority;
  if (authority.toLowerCase() === "manager" || (isDesktop && !authority)) {
    const roles = [...new Set(clean(record.managerRole).split(/\s*\|\s*/).filter(Boolean))];
    if (roles.length) return roles.join(" | ");
    if (authority) return authority;
  }
  const specificRole = [record.userGroup, record.mobileRole, record.assignedRole]
    .map(clean).find((role) => role && role.toLowerCase() !== "user");
  return specificRole || authority || accountType || "Not assigned";
}
