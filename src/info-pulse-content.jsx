import React from 'react';
import {createPortal} from 'react-dom';
import {RefreshCw, MapPin, Truck, AlertTriangle} from 'lucide-react';
import {parseIstTimestamp} from '../ai-feeder.mjs';
import {formatDisplayDate, formatDisplayTime, formatDisplayDateTime} from '../date-time-format.mjs';
import {requestStatusLabel} from './request-status.mjs';
import {pulseBreakdownRows, pulseElapsed} from './info-pulse-timing.mjs';

function RecordDate({value}) {
  return Number.isFinite(parseIstTimestamp(value))
    ? <time className="pulse-date"><b>{formatDisplayDate(value)}</b><span>{formatDisplayTime(value)}</span></time>
    : <span className="pulse-missing">Not recorded</span>;
}

// Info Pulse is a single ranked list: the live BD balance (every open request
// that is not idle, closed or verified) with each breakdown's reason below it,
// longest standing first. There are no filters, categories or drill-downs.
export default function InfoPulseContent({breakdowns = [], scope, now, updatedAt, ready, error, refreshing, onRefresh, headerTarget = null}) {
  const rows = ready ? pulseBreakdownRows(breakdowns, now) : [];
  const scopeLabel = scope?.label || 'Assigned location';
  const balance = <div className="pulse-breakdown-total" role="status" aria-label={ready ? `BD balance: ${rows.length} open breakdowns at ${scopeLabel}` : 'BD balance unavailable'}>
    <span>BD balance</span><b>{ready ? rows.length : '—'}</b><small>{ready ? `${scopeLabel} · open breakdowns, excluding idle` : error ? 'Could not load' : 'Loading…'}</small>
  </div>;
  return <div className="pulse-content">
    {headerTarget ? createPortal(balance, headerTarget) : balance}
    <div className="pulse-toolbar">
      <p className="pulse-lede">Every open breakdown in <b>{scopeLabel}</b>, longest standing first. Idle, closed and verified requests are not counted. Dates and times in IST.</p>
      <div className="pulse-refresh-group"><span className="pulse-updated">{updatedAt ? `Updated ${formatDisplayDateTime(updatedAt)} IST` : 'Not refreshed yet'}</span>
        <button type="button" className="pulse-refresh" onClick={onRefresh} disabled={refreshing} aria-label="Refresh Info Pulse"><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>
    {error && <div className="pulse-message pulse-error" role="alert">{ready ? 'Refresh failed. Showing the last loaded breakdowns.' : 'Could not load breakdowns.'} <button type="button" disabled={refreshing} onClick={onRefresh}>Retry</button></div>}
    {!ready ? <p className="pulse-message" role="status">{error ? 'Breakdowns unavailable.' : 'Loading breakdowns…'}</p> : rows.length ? <ol className="pulse-breakdown-list" aria-label="Open breakdowns, longest standing first">
      {rows.map(row => {
        const request = row.request || {};
        return <li className={`pulse-breakdown-row ${row.etcState}`} key={row.key}>
          <span className="pulse-rank" aria-hidden="true">{row.rank}</span>
          <div className="pulse-row-equipment">
            <span className="pulse-row-site"><MapPin size={13} aria-hidden="true" />{row.site}</span>
            <b className="pulse-row-vehicle"><Truck size={18} aria-hidden="true" />{request.door || request.reg || 'Not recorded'}</b>
            <small>{[request.equipmentGroup || request.equipment, request.ref].filter(Boolean).join(' · ') || 'Reference not recorded'}</small>
            <span className="pulse-row-status">{requestStatusLabel(request)}</span>
          </div>
          <div className="pulse-row-reason"><span>Breakdown reason</span><p>{String(request.complaint || '').trim() || 'Not recorded'}</p></div>
          <dl className="pulse-row-timing">
            <div><dt>Standing since</dt><dd><RecordDate value={request.start} /></dd></div>
            <div className="standing"><dt>Down for</dt><dd><strong className="pulse-duration">{pulseElapsed(row.startedAt, now)}</strong><i className="pulse-standing-bar" aria-hidden="true" style={{'--fill': row.share}} /></dd></div>
            <div className={row.etcState}><dt>ETC</dt><dd>{row.etcState === 'none' ? <span className="pulse-missing">Not set</span> : <>
              <RecordDate value={Number.isFinite(row.etc) ? new Date(row.etc).toISOString() : request.expectedCompletionAt} />
              {row.etcState === 'overdue' && <em><AlertTriangle size={13} aria-hidden="true" />Overdue by {pulseElapsed(row.etc, now)}</em>}
              {row.etcState === 'due' && <em>Due in {pulseElapsed(now, row.etc)}</em>}
            </>}</dd></div>
          </dl>
        </li>;
      })}
    </ol> : <p className="pulse-empty">No open breakdowns. BD balance is 0.</p>}
  </div>;
}
