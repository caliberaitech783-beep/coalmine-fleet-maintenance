import {aiFeederAlerts, alertTypesForRole, parseIstTimestamp, uniqueInfoPulseRequests} from './ai-feeder.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {REGION_DATA, displaySiteName} from './region-scope.mjs';

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

const VEHICLE_GROUP = /tipper|truck|bus|jeep|car\b|tanker|trailer|water|ambulance|van\b|tractor|pickup|lorry/i;
// Requests record KMR for vehicles and HMR for equipment; older requests without
// a meter type are classified by their equipment group name.
export function infoPulseAssetCategory(request = {}) {
  const meter = String(request.meterType || '').trim().toUpperCase();
  if (meter === 'KMR') return 'Vehicles';
  if (meter === 'HMR') return 'Equipment';
  return VEHICLE_GROUP.test(String(request.equipmentGroup || request.equipment || '')) ? 'Vehicles' : 'Equipment';
}

// Regions available to the user: every region whose sites intersect the scope
// (a null scope means all regions), each limited to the sites in scope.
export function infoPulseRegions(scopeSites = null) {
  const allowed = Array.isArray(scopeSites) ? new Set(scopeSites.map(canonicalSiteName).filter(Boolean)) : null;
  return REGION_DATA.map(region => ({code: region.code, label: region.code, sites: region.sites.filter(site => !allowed || allowed.has(canonicalSiteName(site)))}))
    .filter(region => region.sites.length);
}

const regionOfSite = (regions, siteKey) => regions.find(region => region.sites.some(site => canonicalSiteName(site) === siteKey))?.code || 'unmapped';
const countBy = (rows, keyOf, labelOf = keyOf) => {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, {key, label: labelOf(row), count: 0});
    groups.get(key).count++;
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true}));
};

// Dashboard-style cascade: started-date range first, then region tabs, site
// chips and equipment/vehicle chips, each level counted within its parent.
// Invalid selections fall back to "all" instead of hiding every record.
export function infoPulseFilterView(rows = [], {region = 'all', site = '', category = '', from = '', to = ''} = {}, regions = infoPulseRegions()) {
  const invalidRange = Boolean(from && to && from > to);
  // Undated rows cannot be proven to start after "to", so only a "from" bound excludes them.
  const dated = invalidRange ? [] : rows.filter(row => !(from || to) || (!row.date ? !from : (!from || row.date >= from) && (!to || row.date <= to)));
  const entries = dated.map(row => ({row, region: regionOfSite(regions, row.siteKey), category: infoPulseAssetCategory(row.request)}));
  const regionOptions = [{code: 'all', label: 'All regions', count: entries.length}, ...regions.map(item => ({code: item.code, label: item.label, count: entries.filter(entry => entry.region === item.code).length}))];
  if (entries.some(entry => entry.region === 'unmapped')) regionOptions.push({code: 'unmapped', label: 'Other / unassigned', count: entries.filter(entry => entry.region === 'unmapped').length});
  const selection = {region: regionOptions.some(option => option.code === region) ? region : 'all', site: '', category: ''};
  let filtered = selection.region === 'all' ? entries : entries.filter(entry => entry.region === selection.region);
  const sites = countBy(filtered, entry => entry.row.siteKey, entry => entry.row.site);
  const selectedSite = site ? canonicalSiteName(site) : '';
  if (selectedSite && sites.some(option => option.key === selectedSite)) {
    selection.site = selectedSite;
    filtered = filtered.filter(entry => entry.row.siteKey === selectedSite);
  }
  const categories = countBy(filtered, entry => entry.category);
  if (category && categories.some(option => option.key === category)) {
    selection.category = category;
    filtered = filtered.filter(entry => entry.category === category);
  }
  return {
    invalidRange, selection, regions: regionOptions, sites, categories,
    regionLabel: regionOptions.find(option => option.code === selection.region)?.label || 'All regions',
    total: rows.length, rows: filtered.map(entry => entry.row),
  };
}
