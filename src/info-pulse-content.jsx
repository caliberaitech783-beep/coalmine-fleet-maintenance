import React, {useState} from 'react';
import {RefreshCw, MapPin, Truck, AlertTriangle, Activity, Clock} from 'lucide-react';
import {infoPulseDate, infoPulseSiteOptions, infoPulseView} from '../info-pulse-data.mjs';
import {parseIstTimestamp} from '../ai-feeder.mjs';
import {formatDisplayDate, formatDisplayTime, formatDisplayDateTime} from '../date-time-format.mjs';
import {requestStatusLabel} from './request-status.mjs';
import {PULSE_TIERS, pulseBreakdownRows, pulseElapsed, pulseTierCounts} from './info-pulse-timing.mjs';

const tierIcons = {all: Activity, critical: AlertTriangle, warning: Clock, open: Truck};
const EMPTY_FILTERS = {site: '', from: '', to: ''};
const PERIODS = [1, 7, 14, 30];
const DAY = 86_400_000;

function RecordDate({value}) {
  return Number.isFinite(parseIstTimestamp(value))
    ? <time className="pulse-date"><b>{formatDisplayDate(value)}</b><span>{formatDisplayTime(value)}</span></time>
    : <span className="pulse-missing">Not recorded</span>;
}

// Info Pulse: site and request-date filters, four KPI cards (BD balance,
// critical ≥ 24h, warning ≥ 12h, open) and one ranked list of open breakdowns,
// longest standing first. Clicking a card narrows the list to that tier.
export default function InfoPulseContent({breakdowns = [], scope, now, updatedAt, ready, error, refreshing, onRefresh}) {
  const [tier, setTier] = useState('all');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const sites = infoPulseSiteOptions(breakdowns.map(row => row.request), scope?.sites || []);
  const multiSite = sites.length > 1;
  const view = infoPulseView(ready ? pulseBreakdownRows(breakdowns, now) : [], filters);
  const rows = view.rows;
  const counts = pulseTierCounts(rows);
  const shown = tier === 'all' ? rows : rows.filter(row => row.tier === tier);
  const scopeLabel = scope?.label || 'Assigned location';
  const siteLabel = (multiSite && sites.find(site => site.key === filters.site)?.label) || '';
  const selected = PULSE_TIERS.find(option => option.key === tier) || PULSE_TIERS[0];
  const today = infoPulseDate(new Date(now ?? Date.now()).toISOString());
  const periodDays = filters.to === today && filters.from ? Math.round((Date.parse(filters.to) - Date.parse(filters.from)) / DAY) + 1 : 0;
  const filtered = Boolean(filters.site || filters.from || filters.to);
  const changeFilter = (key, value) => setFilters(current => ({...current, [key]: value}));
  const preset = days => setFilters(current => ({...current, from: infoPulseDate(new Date(now - (days - 1) * DAY).toISOString()), to: today}));
  const dateCaption = !filters.from && !filters.to ? 'All request dates' : `${filters.from ? formatDisplayDate(filters.from) : 'Earliest'} – ${filters.to ? formatDisplayDate(filters.to) : 'Latest'}`;
  return <div className="pulse-content">
    <div className="pulse-toolbar">
      <p className="pulse-lede">Every open breakdown in <b>{siteLabel || scopeLabel}</b>, longest standing first. Idle, closed and verified requests are not counted. Dates and times in IST.</p>
      <div className="pulse-refresh-group"><span className="pulse-updated">{updatedAt ? `Updated ${formatDisplayDateTime(updatedAt)} IST` : 'Not refreshed yet'}</span>
        <button type="button" className="pulse-refresh" onClick={onRefresh} disabled={refreshing} aria-label="Refresh Info Pulse"><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>
    <div className="pulse-filters">
      {multiSite && <label><span><MapPin size={14} aria-hidden="true" /> Site</span><select aria-label="Info Pulse site" value={filters.site} onChange={event => changeFilter('site', event.target.value)}><option value="">All sites</option>{sites.map(site => <option key={site.key} value={site.key}>{site.label}</option>)}</select></label>}
      <label><span>Request date from</span><input type="date" aria-label="Info Pulse from date" value={filters.from} max={filters.to || undefined} onChange={event => changeFilter('from', event.target.value)} /></label>
      <label><span>Request date to</span><input type="date" aria-label="Info Pulse to date" value={filters.to} min={filters.from || undefined} onChange={event => changeFilter('to', event.target.value)} /></label>
      <div className="pulse-period" role="group" aria-label="Info Pulse period">{PERIODS.map(days => <button type="button" key={days} aria-pressed={periodDays === days} className={periodDays === days ? 'active' : ''} onClick={() => preset(days)}>{days === 1 ? 'Today' : `${days}D`}</button>)}</div>
      {filtered && <button type="button" className="pulse-reset" onClick={() => setFilters(EMPTY_FILTERS)}>Reset</button>}
      <span className="pulse-filter-caption">{multiSite ? `${siteLabel || 'All sites'} · ` : ''}{dateCaption}</span>
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
    {!ready ? <p className="pulse-message" role="status">{error ? 'Breakdowns unavailable.' : 'Loading breakdowns…'}</p> : view.invalidRange ? <p className="pulse-message pulse-error" role="alert">From date must be on or before To date.</p> : <>
      <div className="pulse-results-line"><h3 className={selected.key}>{selected.label}<span>{selected.hint}</span></h3><span role="status">{shown.length} of {rows.length} breakdowns{filtered ? ` · ${multiSite ? `${siteLabel || 'All sites'} · ` : ''}${dateCaption}` : ''}</span></div>
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
      </ol> : <p className="pulse-empty">{filtered ? 'No breakdowns match these filters.' : tier === 'all' ? 'No open breakdowns. BD balance is 0.' : `No ${selected.label.toLowerCase()} breakdowns right now.`}</p>}
    </>}
  </div>;
}
