import { indiaDateTimeEpoch } from './report-date-range.mjs';
import { elapsedLabel } from './report-metrics.mjs';

export const acceptanceTime = row => row.acceptedAt || '';
export function maintenanceDelay(row, now = new Date()) {
  const accepted = indiaDateTimeEpoch(acceptanceTime(row));
  if (!Number.isFinite(accepted)) return 'Not accepted';
  return elapsedLabel(new Date(Math.min(accepted, now.getTime())).toISOString(), now.toISOString());
}
export function pendingRemark(row, now = new Date()) {
  if (now.getTime() - indiaDateTimeEpoch(acceptanceTime(row)) > 86400000) return 'No Update';
  const remarks = row.dailyRemarks || [];
  const last = remarks[remarks.length - 1];
  return (typeof last === 'string' ? last : last?.remark) || 'No Remark';
}
export const olderThanTenDays = (row, now = new Date()) => now.getTime() - indiaDateTimeEpoch(row.start || row.createdAt) > 10 * 86400000;
export const availabilityPercentage = value => Number(value) === 100 ? '100%' : `${Number(value).toFixed(2)}%`;
export function reportPdfHeading(title, rows = [], columns = []) {
  const locationColumns = columns.filter(column => /^(location|current location|request site|site|site location|from location|to location)$/i.test(column.label || ''));
  const sites = [...new Set(rows.flatMap(row => [row.reportSite || row.site || row.currentLocation || row.location, row.source, row.destination, ...locationColumns.map(column => column.value?.(row))]).map(value => String(value || '').trim()).filter(value => value && value !== '—'))];
  return sites.length ? `${title} - ${sites.join(', ')}` : title;
}
