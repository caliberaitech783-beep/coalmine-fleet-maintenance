import {hasAccountRole,accountPrivileges} from './account-role-access.mjs';
// Only explicit authority or an Accounts/Director assignment grants access.
// Broad Reports access and legacy default Admin normalization are not grants.
export function ibossAccountsEligible(user = {}) {
  const clean = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if(Object.hasOwn(user,'userRoles'))return hasAccountRole(user);
  if (clean(user.adminLevel) === 'manager') return false;
  if (clean(user.userType) === 'account user') return true;
  if (['admin', 'super admin'].includes(clean(user.adminLevel))) return true;
  if (['admin', 'admin user', 'super admin'].includes(clean(user.userType))) return true;
  const assignments = [user.designation, user.department, user.userGroup, user.assignedRole, user.managerRole];
  return assignments.some(value => /\b(director|directors|accounts|accountant|accounting)\b/.test(clean(value)));
}

export function ibossAccountsAllowed(session = {}, permissions = session.permissions || {}) {
  if(session.role==='super'&&permissions.explicitAccountRole===true)return permissions.ibossAccounts===true;
  if (session.role === 'normal' && session.userType === 'Account User' && session.assignedRole === 'Account User') return permissions.ibossAccounts === true;
  const allows = (selection, name) => selection == null || selection.includes(name);
  return session.role === 'super' && permissions.ibossAccounts === true
    && String(permissions.adminLevel || '').trim().toLowerCase() !== 'manager'
    && allows(permissions.tabAccess, 'Reports')
    && (allows(permissions.reportAccess, 'Reports') || allows(permissions.reportAccess, 'Accounts'));
}
export function accountSectionAllowed(session,section){return ibossAccountsAllowed(session)&&accountPrivileges(session.permissions).includes(section);}
