export const ACCOUNT_PRIVILEGES = ['Dashboard','Masters','Transactions','Report Merge'];
export const TEAM_ROLES = ['Production User','Maintenance User','MIS User','General User','Account User'];
export function assignedUserRoles(user={}) {
  const raw=Object.hasOwn(user,'userRoles')?user.userRoles:(user.userType==='Account User'?'Account User':user.userGroup||user.mobileRole||user.assignedRole||'');
  return [...new Set((Array.isArray(raw)?raw:String(raw||'').split(/\s*\|\s*/)).filter(role=>TEAM_ROLES.includes(role)))];
}
export function hasAccountRole(user={}) {return assignedUserRoles(user).includes('Account User');}
export function accountPrivileges(record={}) {
  if(!Object.hasOwn(record,'accountAccess'))return [...ACCOUNT_PRIVILEGES];
  const raw=record.accountAccess;
  return [...new Set((Array.isArray(raw)?raw:String(raw||'').split(/\s*\|\s*/)).filter(value=>ACCOUNT_PRIVILEGES.includes(value)))];
}
