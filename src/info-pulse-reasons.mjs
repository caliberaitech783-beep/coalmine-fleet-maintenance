import {parseIstTimestamp} from '../ai-feeder.mjs';

const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

export function pulseDailyUpdates(value) {
  const records = Array.isArray(value) ? value : text(value) ? [{remark: value}] : [];
  return records.filter(Boolean).map(record => typeof record === 'string' ? {remark: record} : record)
    .map(record => ({
      remark: text(record.remark), delayReason: text(record.delayReason),
      createdAt: text(record.createdAt), author: text(record.authorName || record.authorLogin),
    }))
    .filter(record => record.remark || record.delayReason)
    .sort((a, b) => (parseIstTimestamp(b.createdAt) || 0) - (parseIstTimestamp(a.createdAt) || 0));
}

export function pulseCaseReasons(row, selectedType = '') {
  const request = row.request || {};
  const types = new Set((row.issues || []).map(issue => issue.type));
  const updates = pulseDailyUpdates(request.dailyRemarks);
  const latestDelay = updates.find(update => update.delayReason);
  const reasons = [];
  const add = (key, label, value, required = false, at = '') => {
    const recorded = text(value);
    if (recorded || required) reasons.push({key, label, value: recorded || 'Not recorded', missing: !recorded, at});
  };
  add('complaint', 'Breakdown reason / complaint', request.complaint, true);
  add('idle', 'Idle reason', request.idleReason, types.has('idle-vehicle'));
  add('overdue', 'Overdue reason', request.overdueReason || latestDelay?.delayReason, types.has('etc-overdue'), request.overdueReason ? '' : latestDelay?.createdAt);
  if (!types.has('etc-overdue')) add('delay', 'Latest delay reason', latestDelay?.delayReason, types.has('long-running'), latestDelay?.createdAt);
  add('closure', 'Closure delay reason', request.delayedReason);
  add('arrival', 'Arrival delay reason', request.arrivalFlagRemark, Boolean(request.arrivalFlaggedAt));
  add('mis', 'MIS red-flag reason', request.misFlagRemark, Boolean(request.misFlaggedAt));
  add('work', 'Maintenance work', request.maintenanceWork);
  const primaryType = selectedType || row.issues?.[0]?.type;
  const preferred = primaryType === 'idle-vehicle' ? 'idle' : primaryType === 'etc-overdue' ? 'overdue' : primaryType === 'long-running' ? (types.has('etc-overdue') ? 'overdue' : 'delay') : primaryType === 'awaiting-verification' && reasons.some(reason => reason.key === 'mis') ? 'mis' : 'complaint';
  return {reasons, updates, primary: reasons.find(reason => reason.key === preferred) || reasons[0]};
}

export function pulseCaseSeverity(row) {
  const issues = row.issues || [];
  return issues.some(issue => issue.severity === 'critical') ? 'critical' : issues.some(issue => issue.severity === 'warning') ? 'warning' : 'info';
}

export function pulseSeverityCounts(cases = []) {
  const result = {all: cases.length, critical: 0, warning: 0, info: 0};
  for (const row of cases) result[pulseCaseSeverity(row)]++;
  return result;
}
