import {accessAllows} from './admin-access.mjs';
import {buildDepartmentReports} from './department-reports.mjs';
import {IN_OUT_REPORT_TITLE} from './in-out-report.mjs';

const categories = ['general', 'production', 'maintenance', 'mis'];

// Shared by the Reports page and personal delivery authorization. Scheduling
// preferences never grant or remove access to a report.
export function reportCategoryIdsForUser(permissions = {}, session = {}) {
  const adminLevel = String(permissions.adminLevel || '').trim();
  if (['Admin', 'Super Admin'].includes(adminLevel) || (session.role === 'super' && adminLevel !== 'Manager')) return [...categories];
  const roleText = [
    ...(Array.isArray(permissions.managerRoles) ? permissions.managerRoles : []),
    permissions.managerRole, permissions.department, session.assignedRole,
    session.department, session.designation,
  ].filter(Boolean).join(' ').toLowerCase();
  if (adminLevel === 'Manager' && (!roleText || roleText.includes('project manager') || roleText.includes('director'))) return [...categories];
  return categories.filter(category => category === 'general' || roleText.includes(category));
}

export function canReadReports(session = {}) {
  return session.role === 'normal'
    ? ['Production User', 'Maintenance User', 'MIS User'].includes(session.assignedRole)
    : session.role === 'super' && (accessAllows(session.permissions?.tabAccess, 'Reports') || accessAllows(session.permissions?.mobileTabAccess, 'Reports'));
}

export const PERSONAL_REPORT_CATALOG = [
  ...['Report for On Road / Off Road & Idle', 'Vehicle Transfer Report', 'Total Equipment / Vehicle Location Wise', 'Recent Breakdown Cases', IN_OUT_REPORT_TITLE]
    .map(title => ({title, category: 'general'})),
  ...buildDepartmentReports().map(({title, category}) => ({title, category})),
];

export function personalReportsForUser(session = {}) {
  if (!canReadReports(session)) return [];
  const allowed = reportCategoryIdsForUser(session.permissions, session);
  return [...new Set(PERSONAL_REPORT_CATALOG.filter(report => allowed.includes(report.category)).map(report => report.title))];
}
