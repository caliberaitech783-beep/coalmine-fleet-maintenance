import {reportScopeIncludesSite} from './region-scope.mjs';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const keyPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const offset = 330 * 60000;
export const defaultPersonalReportSchedules = () => ({enabled: false, schedules: []});

export function normalizePersonalReportSchedules(value = {}, allowedReports = []) {
  const allowed = new Set(allowedReports);
  const usedKeys = new Set();
  const schedules = (Array.isArray(value?.schedules) ? value.schedules : []).slice(0,20).flatMap((item, index) => {
    if (!item || !['daily', 'weekly'].includes(item.cadence)) return [];
    let key = typeof item.key === 'string' && keyPattern.test(item.key) ? item.key : `schedule-${index + 1}`;
    let suffix = 0;
    while (usedKeys.has(key)) key = `schedule-${index + 1}-${++suffix}`;
    usedKeys.add(key);
    return [{key, enabled: item.enabled === true, cadence: item.cadence,
      weekday: Number.isInteger(item.weekday) && item.weekday >= 0 && item.weekday <= 6 ? item.weekday : 1,
      times: [...new Set((Array.isArray(item.times) ? item.times : []).filter(time => typeof time === 'string' && timePattern.test(time)))].sort().slice(0,6),
      reports: [...new Set((Array.isArray(item.reports) ? item.reports : []).filter(title => allowed.has(title)))],
    }];
  });
  return {enabled: value?.enabled === true, schedules};
}

export function personalScheduleValidationError(value, allowedReports) {
  if (!value || typeof value.enabled !== 'boolean' || !Array.isArray(value.schedules)) return 'Provide your personal schedule settings.';
  if (value.schedules.length > 20) return 'You can save up to 20 schedules.';
  const keys = new Set(), allowed = new Set(allowedReports);
  for (const schedule of value.schedules) {
    if (!schedule || typeof schedule.key !== 'string' || !keyPattern.test(schedule.key) || keys.has(schedule.key)) return 'Each schedule must have a unique valid identifier.';
    keys.add(schedule.key);
    if (typeof schedule.enabled !== 'boolean') return 'Choose whether each schedule is active.';
    if (!['daily', 'weekly'].includes(schedule.cadence)) return 'Choose Daily or Weekly for personal reports.';
    if (schedule.cadence === 'weekly' && (!Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6)) return 'Choose a valid weekday.';
    if (!Array.isArray(schedule.times) || schedule.times.length > 6 || schedule.times.some(time => typeof time !== 'string' || !timePattern.test(time))) return 'Use up to 6 valid IST times per schedule.';
    if (!Array.isArray(schedule.reports) || schedule.reports.some(title => !allowed.has(title))) return 'Your report access has changed. Reload and select only reports available to you.';
    if (value.enabled && schedule.enabled && (!schedule.times.length || !schedule.reports.length)) return 'Select at least one report and delivery time for each active schedule.';
  }
  if (value.enabled && !value.schedules.some(schedule => schedule.enabled)) return 'Add an active schedule, or pause personal delivery.';
  return '';
}

// Group by actual clock slot, not by mutable schedule keys. Overlapping
// selections send once; each distinct time retains a stable database claim.
export function personalReportsDue(settings, now = new Date(), updatedAt = null, graceMinutes = 20) {
  if (!settings.enabled) return [];
  const groups = new Map();
  for (const age of [0, 1]) {
    const date = new Date(now.getTime() + offset - age * 86400000);
    const day = date.toISOString().slice(0,10);
    for (const schedule of settings.schedules) {
      if (!schedule.enabled || !schedule.reports.length || (schedule.cadence === 'weekly' && schedule.weekday !== date.getUTCDay())) continue;
      for (const time of schedule.times) {
        const instant = new Date(`${day}T${time}:00+05:30`).getTime();
        const elapsed = now.getTime() - instant;
        if (elapsed < 0 || elapsed > graceMinutes * 60000 || (updatedAt && instant < new Date(updatedAt).getTime())) continue;
        const slotKey = `${day}-${time.replace(':', '')}`;
        const group = groups.get(slotKey) || {slotKey, scheduleLabel: `${day} at ${time} IST`, reports: []};
        group.reports = [...new Set([...group.reports, ...schedule.reports])];
        groups.set(slotKey, group);
      }
    }
  }
  return [...groups.values()].sort((a,b) => a.slotKey.localeCompare(b.slotKey));
}

// Match Reports > master-data scoping; an unassigned site is never all sites.
export function personalReportSourceData(data, scope) {
  if (!scope || (scope.restrictToScope !== false && (!Array.isArray(scope.allowedSites) || !scope.allowedSites.length))) throw new Error('No report site is assigned to this account.');
  const includes = site => scope.restrictToScope === false || reportScopeIncludesSite({sites: scope.allowedSites}, site);
  return {
    requests: (data.requests || []).filter(row => includes(row.site || row.reportSite)),
    equipmentRecords: (data.equipmentRecords || []).filter(row => includes(row.currentLocation || row.location || row.site)),
    transferRecords: (data.transferRecords || []).filter(row => [row.source, row.destination].some(includes)),
  };
}
