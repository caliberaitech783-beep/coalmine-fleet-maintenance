import React, {useState} from 'react';
import {RefreshCw, MapPin, Truck, AlertTriangle, Activity, Clock} from 'lucide-react';
import {parseIstTimestamp} from '../ai-feeder.mjs';
import {formatDisplayDate, formatDisplayTime, formatDisplayDateTime} from '../date-time-format.mjs';
import {requestStatusLabel} from './request-status.mjs';
import {PULSE_TIERS, pulseBreakdownRows, pulseElapsed, pulseTierCounts} from './info-pulse-timing.mjs';

const tierIcons = {all: Activity, critical: AlertTriangle, warning: Clock, open: Truck};

function RecordDate({value}) {
  return Number.isFinite(parseIstTimestamp(value))
    ? <time className="pulse-date"><b>{formatDisplayDate(value)}</b><span>{formatDisplayTime(value)}</span></time>
    : <span className="pulse-missing">Not recorded</span>;
}

// Info Pulse: four KPI cards (BD balance, critical ≥ 24h, warning ≥ 12h, open)
// over one ranked list of open breakdowns, longest standing first. Clicking a
// card narrows the list to that standing-time tier; BD balance shows all.
export default function InfoPulseContent({breakdowns = [], scope, now, updatedAt, ready, error, refreshing, onRefresh}) {
  const [tier, setTier] = useState('all');
  const rows = ready ? pulseBreakdownRows(breakdowns, now) : [];
  const counts = pulseTierCounts(rows);
  const shown = tier === 'all' ? rows : rows.filter(row => row.tier === tier);
  const scopeLabel = scope?.label || 'Assigned location';
  const selected = PULSE_TIERS.find(option => option.key === tier) || PULSE_TIERS[0];
  return <div className="pulse-content">
    <div className="pulse-toolbar">
      <p className="pulse-lede">Every open breakdown in <b>{scopeLabel}</b>, longest standing first. Idle, closed and verified requests are not counted. Dates and times in IST.</p>
      <div className="pulse-refresh-group"><span className="pulse-updated">{updatedAt ? `Updated ${formatDisplayDateTime(updatedAt)} IST` : 'Not refreshed yet'}</span>
        <button type="button" className="pulse-refresh" onClick={onRefresh} disabled={refreshing} aria-label="Refresh Info Pulse"><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>
    <div className="pulse-kpis" role="group" aria-label="Breakdowns by standing time">
      {PULSE_TIERS.map(option => {
        const Icon = tierIcons[option.key];
        const count = ready ? counts[option.key] : null;
        return <button type="button" key={option.key} className={`pulse-kpi ${option.key}${tier === option.key ? ' selected' : ''}`} aria-pressed={tier === option.key} aria-label={`${option.label}: ${ready ? count : 'unavailable'}`} onClick={() => setTier(option.key)}>
          <span className="pulse-kpi-icon"><Icon size={20} aria-hidden="true" /></span>
          <span className="pulse-kpi-label">{option.label}</span>
          <b className="pulse-kpi-count">{ready ? count : '—'}</b>
          <small className="pulse-kpi-hint">{option.hint}</small>
        </button>;
      })}
    </div>
    {error && <div className="pulse-message pulse-error" role="alert">{ready ? 'Refresh failed. Showing the last loaded breakdowns.' : 'Could not load breakdowns.'} <button type="button" disabled={refreshing} onClick={onRefresh}>Retry</button></div>}
    {!ready ? <p className="pulse-message" role="status">{error ? 'Breakdowns unavailable.' : 'Loading breakdowns…'}</p> : <>
      <div className="pulse-results-line"><h3 className={selected.key}>{selected.label}<span>{selected.hint}</span></h3><span role="status">{shown.length} of {rows.length} breakdowns</span></div>
      {shown.length ? <ol className="pulse-breakdown-list" aria-label={`${selected.label} breakdowns, longest standing first`}>
        {shown.map((row, index) => {
          const request = row.request || {};
          return <li className={`pulse-breakdown-row ${row.tier}`} key={row.key}>
            <span className="pulse-rank" aria-hidden="true">{index + 1}</span>
            <div className="pulse-row-equipment">
              <span className="pulse-row-site"><MapPin size={13} aria-hidden="true" />{row.site}</span>
              <b className="pulse-row-vehicle"><Truck size={18} aria-hidden="true" />{request.door || request.reg || 'Not recorded'}</b>
              <small>{[request.equipmentGroup || request.equipment, request.ref].filter(Boolean).join(' · ') || 'Reference not recorded'}</small>
              <span className="pulse-row-status"><i className="pulse-status-tag">{requestStatusLabel(request)}</i><i className={`pulse-tier-tag ${row.tier}`}>{row.tier === 'critical' ? 'Critical · 24h+' : row.tier === 'warning' ? 'Warning · 12h+' : 'Under 12h'}</i></span>
            </div>
            <div className="pulse-row-reason"><span>Breakdown reason</span><p>{String(request.complaint || '').trim() || 'Not recorded'}</p></div>
            <dl className="pulse-row-timing">
              <div><dt>Standing since</dt><dd><RecordDate value={request.start} /></dd></div>
              <div className={`standing ${row.tier}`}><dt>Down for</dt><dd><strong className="pulse-duration">{pulseElapsed(row.startedAt, now)}</strong><i className="pulse-standing-bar" aria-hidden="true" style={{'--fill': row.share}} /></dd></div>
              <div className={row.etcState}><dt>ETC</dt><dd>{row.etcState === 'none' ? <span className="pulse-missing">Not set</span> : <>
                <RecordDate value={Number.isFinite(row.etc) ? new Date(row.etc).toISOString() : request.expectedCompletionAt} />
                {row.etcState === 'overdue' && <em><AlertTriangle size={13} aria-hidden="true" />Overdue by {pulseElapsed(row.etc, now)}</em>}
                {row.etcState === 'due' && <em>Due in {pulseElapsed(now, row.etc)}</em>}
              </>}</dd></div>
            </dl>
          </li>;
        })}
      </ol> : <p className="pulse-empty">{tier === 'all' ? 'No open breakdowns. BD balance is 0.' : `No ${selected.label.toLowerCase()} breakdowns right now.`}</p>}
    </>}
  </div>;
}
