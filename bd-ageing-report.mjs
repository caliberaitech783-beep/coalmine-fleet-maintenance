import {indiaDateTimeEpoch} from './report-date-range.mjs';
import {isActiveBreakdown} from './info-pulse-data.mjs';
import {requestsVisibleGlobally} from './mis-request-visibility.mjs';

const ALLOWED_LOGINS = new Set(['mohitchadda', 'manishchadda', 'rahulchadda', 'thakur@1990']);
export function canViewBdAgeingReport(session) {
  return ALLOWED_LOGINS.has(String(session?.login || '').trim().toLowerCase());
}

export const BD_AGEING_GROUPS = [
  {id: '2-4', label: '2–4 days', description: 'At least 2 days and less than 4 days'},
  {id: '4-6', label: '4–6 days', description: 'At least 4 days and up to 6 days'},
  {id: 'over-6', label: 'More than 6 days', description: 'Strictly more than 6 days'},
];

export function buildBdAgeingReport(requests = [], now = Date.now()) {
  const groups = BD_AGEING_GROUPS.map(group => ({...group, rows: []}));
  for (const request of requestsVisibleGlobally(requests)) {
    if (!isActiveBreakdown(request) || String(request.verificationStatus || '').trim().toLowerCase() === 'verified') continue;
    const start = indiaDateTimeEpoch(request.start);
    const elapsed = now - start;
    if (!Number.isFinite(elapsed) || elapsed < 2 * 86400000) continue;
    const index = elapsed < 4 * 86400000 ? 0 : elapsed <= 6 * 86400000 ? 1 : 2;
    const minutes = Math.floor(elapsed / 60000);
    groups[index].rows.push({
      ref: request.ref, site: request.site, door: request.door,
      equipmentGroup: request.equipmentGroup, status: request.status,
      start: request.start, complaint: request.complaint,
      ageMilliseconds: elapsed,
      age: `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h ${minutes % 60}m`,
    });
  }
  for (const group of groups) group.rows.sort((a,b) => b.ageMilliseconds - a.ageMilliseconds || String(a.ref).localeCompare(String(b.ref)));
  return {generatedAt: new Date(now).toISOString(), groups, total: groups.reduce((sum,group) => sum + group.rows.length, 0)};
}

// Fail closed before fetching any report data; administrators have no bypass.
export function bdAgeingReportHandler({loadRequests, now = Date.now}) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!canViewBdAgeingReport(req.session)) return res.status(403).json({error: 'You do not have access to BD Ageing Report.'});
    try {
      const {requests, scope} = await loadRequests(req.session);
      return res.json({...buildBdAgeingReport(requests, now()), scope});
    } catch (error) { next(error); }
  };
}
