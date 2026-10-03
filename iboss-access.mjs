// Only explicit authority or an Accounts/Director assignment grants access.
// Broad Reports access and legacy default Admin normalization are not grants.
export function ibossAccountsEligible(user = {}) {
  const clean = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (['admin', 'super admin'].includes(clean(user.adminLevel))) return true;
  if (['admin', 'admin user', 'super admin'].includes(clean(user.userType))) return true;
  const assignments = [user.designation, user.department, user.userGroup, user.assignedRole, user.managerRole];
  return assignments.some(value => /\b(director|directors|accounts|accountant|accounting)\b/.test(clean(value)));
}

export function ibossAccountsAllowed(session = {}, permissions = session.permissions || {}) {
  const allows = (selection, name) => selection == null || selection.includes(name);
  return session.role === 'super' && permissions.ibossAccounts === true
    && allows(permissions.tabAccess, 'Reports')
    && (allows(permissions.reportAccess, 'Reports') || allows(permissions.reportAccess, 'Accounts'));
}
