import {aiFeederAlerts, alertTypesForRole, parseIstTimestamp, uniqueInfoPulseRequests} from './ai-feeder.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {displaySiteName} from './region-scope.mjs';

export const INFO_PULSE_COLUMNS = [
  {key: 'etc-overdue', label: 'ETC overdue', tone: 'critical'},
  {key: 'long-running', label: 'Down ≥ 3 days', tone: 'critical'},
  {key: 'idle-vehicle', label: 'Idle', tone: 'warning'},
  {key: 'etc-due-soon', label: 'ETC ≤ 2 hours', tone: 'warning'},
  {key: 'awaiting-verification', label: 'MIS ≥ 12 hours', tone: 'warning'},
  {key: 'stale-update', label: 'No remark ≥ 24h', tone: 'warning'},
  {key: 'new-request', label: 'New ≤ 12 hours', tone: 'info'},
];

export function infoPulseColumns(role) {
  const allowed = new Set(alertTypesForRole(role));
  return INFO_PULSE_COLUMNS.filter(column => allowed.has(column.key));
}

export function infoPulseDate(value) {
  const ms = parseIstTimestamp(value);
  return Number.isFinite(ms) ? new Date(ms + 330 * 60_000).toISOString().slice(0, 10) : '';
}

const severityOrder = {critical: 0, warning: 1, info: 2};
function compareCasePriority(left, right) {
  const priority = row => Math.min(...row.issues.map(issue => severityOrder[issue.severity] ?? 3));
  const leftPriority = priority(left), rightPriority = priority(right);
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  // Preserve the existing warning/update order. Critical cases use the overdue
  // issue itself, so another issue on the same request cannot promote a newer ETC.
  if (leftPriority !== severityOrder.critical) return 0;
  const leftOverdue = left.issues.find(issue => issue.type === 'etc-overdue');
  const rightOverdue = right.issues.find(issue => issue.type === 'etc-overdue');
  if (Boolean(leftOverdue) !== Boolean(rightOverdue)) return leftOverdue ? -1 : 1;
  if (leftOverdue && rightOverdue && leftOverdue.at !== rightOverdue.at) return leftOverdue.at - rightOverdue.at;
  const standingSince = row => {
    const timestamp = parseIstTimestamp(row.request.start);
    return Number.isFinite(timestamp) ? timestamp : Infinity;
  };
  return standingSince(left) - standingSince(right) || left.key.localeCompare(right.key);
}

export function buildInfoPulseCases(requests = [], options = {}) {
  const records = uniqueInfoPulseRequests(requests);
  const byKey = new Map(records.map(request => [request.pulseKey, request]));
  const cases = new Map();
  for (const issue of aiFeederAlerts(records, options)) {
    // Stable generated keys also preserve distinct records with missing references.
    const request = byKey.get(issue.requestKey);
    if (!request) continue;
    if (!cases.has(issue.requestKey)) cases.set(issue.requestKey, {
      key: issue.requestKey, request,
      siteKey: canonicalSiteName(request.site || request.location || request.currentLocation) || 'unassigned',
      site: displaySiteName(request.site || request.location || request.currentLocation) || 'Not assigned',
      date: infoPulseDate(request.start),
      issues: [],
    });
    cases.get(issue.requestKey).issues.push(issue);
  }
  return [...cases.values()].sort(compareCasePriority);
}

const ENDED_STATUSES = new Set(['closed', 'verified']);
const IDLE_STATUSES = new Set(['idle', 'ideal']);
// Mirrors the dashboard Breakdown count: open requests that are not idle.
export function isActiveBreakdown(request = {}) {
  const status = String(request.status || '').trim().toLowerCase();
  return !ENDED_STATUSES.has(status) && !IDLE_STATUSES.has(status) && !String(request.verifiedAt || '').trim();
}

// Every active breakdown once, longest standing first, whether or not it has
// raised an alert; alert issues are attached when the case list has them.
export function buildInfoPulseBreakdowns(requests = [], cases = []) {
  const issues = new Map(cases.map(row => [row.key, row.issues]));
  const standingSince = request => {
    const timestamp = parseIstTimestamp(request.start);
    return Number.isFinite(timestamp) ? timestamp : Infinity;
  };
  return uniqueInfoPulseRequests(requests).filter(isActiveBreakdown).map(request => ({
    key: request.pulseKey, request,
    siteKey: canonicalSiteName(request.site || request.location || request.currentLocation) || 'unassigned',
    site: displaySiteName(request.site || request.location || request.currentLocation) || 'Not assigned',
    date: infoPulseDate(request.start),
    issues: issues.get(request.pulseKey) || [],
  })).sort((left, right) => standingSince(left.request) - standingSince(right.request) || left.key.localeCompare(right.key));
}

export function infoPulseSiteOptions(requests = [], assignedSites = []) {
  const sites = new Map();
  for (const value of [...assignedSites, ...requests.filter(Boolean).map(row => row.site || row.location || row.currentLocation || '')]) {
    const key = canonicalSiteName(value) || 'unassigned';
    if (!sites.has(key)) sites.set(key, {key, label: displaySiteName(value) || 'Not assigned'});
  }
  return [...sites.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function infoPulseView(cases = [], {site = '', from = '', to = '', type = '', sites = []} = {}) {
  const invalidRange = Boolean(from && to && from > to);
  const selectedSite = site ? canonicalSiteName(site) : '';
  const filtered = invalidRange ? [] : cases.filter(row =>
    (!selectedSite || row.siteKey === selectedSite) &&
    (!(from || to) || (row.date && (!from || row.date >= from) && (!to || row.date <= to))));
  const makeSummary = (key, label) => ({key, label, total: 0, counts: Object.fromEntries(INFO_PULSE_COLUMNS.map(column => [column.key, 0]))});
  const totals = makeSummary('', 'Total');
  const grouped = new Map(sites.filter(row => !selectedSite || row.key === selectedSite).map(row => [row.key, makeSummary(row.key, row.label)]));
  for (const row of filtered) {
    if (!grouped.has(row.siteKey)) grouped.set(row.siteKey, makeSummary(row.siteKey, row.site));
    const summary = grouped.get(row.siteKey);
    summary.total++;
    totals.total++;
    for (const key of new Set(row.issues.map(issue => issue.type))) {
      summary.counts[key]++;
      totals.counts[key]++;
    }
  }
  return {
    invalidRange, totals,
    sites: [...grouped.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    rows: filtered.filter(row => !type || row.issues.some(issue => issue.type === type)),
  };
}
