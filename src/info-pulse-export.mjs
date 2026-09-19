import {parseIstTimestamp} from '../ai-feeder.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';
import {requestStatusLabel} from './request-status.mjs';
import {pulseDailyUpdates, pulseDelayReason} from './info-pulse-reasons.mjs';
import {pulseElapsed} from './info-pulse-timing.mjs';

// Export columns for the Info Pulse breakdown list, shared by Download as PDF,
// Download as Excel and Smart Print: one column per figure a ranked row shows, in
// reading order. Every value is plain text. A figure the list explains as missing
// ("Not recorded", "Not set") keeps that wording; anything else without a value is
// left blank. The serial number is added by the export builders themselves.
const TIER_LABELS = {critical: 'Critical · 24h+', warning: 'Warning · 12h+', open: 'Under 12h'};
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const recorded = value => Number.isFinite(parseIstTimestamp(value)) ? formatDisplayDateTime(value) : '';
const delayOf = row => pulseDelayReason(row.request || {});
const updatesOf = row => pulseDailyUpdates(row.request?.dailyRemarks);

export function pulseExportColumns(now = Date.now()) {
  return [
    {label: 'Site', value: row => text(row.site)},
    {label: 'Equipment / Vehicle', value: row => text(row.request?.door) || text(row.request?.reg) || 'Not recorded'},
    {label: 'Equipment group', value: row => text(row.request?.equipmentGroup) || text(row.request?.equipment)},
    {label: 'Request ref', value: row => text(row.request?.ref)},
    {label: 'Status', value: row => requestStatusLabel(row.request || {})},
    {label: 'Standing tier', value: row => TIER_LABELS[row.tier] || ''},
    {label: 'Breakdown reason', value: row => text(row.request?.complaint) || 'Not recorded'},
    // The overdue and closure reasons keep their label, so the cell says which reason it is.
    {label: 'Delay reason', value: row => {const delay = delayOf(row); return delay ? (delay.label === 'Delay reason' ? delay.value : `${delay.label}: ${delay.value}`) : '';}},
    {label: 'Delay reason recorded', value: row => {const delay = delayOf(row); return delay ? [recorded(delay.at), text(delay.author)].filter(Boolean).join(' · ') : '';}},
    {label: 'Standing since', value: row => recorded(row.request?.start) || 'Not recorded'},
    {label: 'Down for', value: row => pulseElapsed(row.startedAt, now)},
    {label: 'ETC', value: row => row.etcState === 'none' ? 'Not set' : Number.isFinite(row.etc) ? formatDisplayDateTime(new Date(row.etc).toISOString()) : recorded(row.request?.expectedCompletionAt) || 'Not recorded'},
    {label: 'ETC status', value: row => row.etcState === 'overdue' ? `Overdue by ${pulseElapsed(row.etc, now)}` : row.etcState === 'due' ? `Due in ${pulseElapsed(now, row.etc)}` : row.etcState === 'none' ? 'Not set' : 'Not recorded'},
    {label: 'Daily updates', value: row => String(updatesOf(row).length)},
    {label: 'Latest daily update', value: row => {const latest = updatesOf(row)[0]; return latest ? [recorded(latest.createdAt), latest.author, latest.remark, latest.delayReason ? `Delayed reason: ${latest.delayReason}` : ''].filter(Boolean).join(' · ') : '';}},
  ];
}
