import { managerRoleSelection } from './admin-access.mjs';

export function canEditBreakdownResponsibility(session) {
  const permissions = session?.permissions;
  return session?.role === 'super' && permissions?.adminLevel === 'Manager' &&
    managerRoleSelection(permissions.managerRoles?.length ? permissions.managerRoles : permissions.managerRole)
      .some(role => ['Maintenance Manager', 'Project Manager'].includes(role));
}
