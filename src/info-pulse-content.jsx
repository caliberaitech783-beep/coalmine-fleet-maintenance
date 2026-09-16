import React, {useEffect, useState} from 'react';
import {RefreshCw, MapPin, Truck, AlertTriangle, Activity, Clock, RotateCcw} from 'lucide-react';
import {infoPulseDate, infoPulseFilterView, infoPulseRegions} from '../info-pulse-data.mjs';
import {parseIstTimestamp} from '../ai-feeder.mjs';
import {formatDisplayDate, formatDisplayTime, formatDisplayDateTime} from '../date-time-format.mjs';
import {requestStatusLabel} from './request-status.mjs';
import {pulseDelayReason} from './info-pulse-reasons.mjs';
import {PULSE_TIERS, pulseBreakdownRows, pulseElapsed, pulseTierCounts} from './info-pulse-timing.mjs';

const tierIcons = {all: Activity, critical: AlertTriangle, warning: Clock, open: Truck};
const PERIODS = [1, 7, 14, 30];
const DAY = 86_400_000;
const INITIAL_VISIBLE_ROWS = 24;

function RecordDate({value}) {
  return Number.isFinite(parseIstTimestamp(value))
    ? <time className="pulse-date"><b>{formatDisplayDate(value)}</b><span>{formatDisplayTime(value)}</span></time>
    : <span className="pulse-missing">Not recorded</span>;
}

function ChipRow({name, label, allLabel, options, value, choose}) {
  return <div className="pulse-filter-level" data-level={name}>
    <span className="pulse-filter-level-label">{label}</span>
    <div className="pulse-filter-chips" role="group" aria-label={`${label} choices`}>
      {[{key: '', label: allLabel, count: options.reduce((total, option) => total + option.count, 0)}, ...options].map(option => <button type="button" key={option.key} aria-pressed={value === option.key} className={option.key ? '' : 'pulse-filter-all'} onClick={() => choose(name, option.key)}><span>{option.label}</span><b>{option.count}</b></button>)}
    </div>
  </div>;
}

// Info Pulse: dashboard-style filters (region tabs, site and equipment/vehicle
// chips, started-date range defaulting to today), four standing-time KPI cards
// and one ranked list of open breakdowns, longest standing first.
export default function InfoPulseContent({breakdowns = [], scope, now, updatedAt, ready, error, refreshing, onRefresh}) {
  const today = infoPulseDate(new Date(now ?? Date.now()).toISOString());
  // BD balance as of today: every open breakdown started on or before today.
  const defaults = {region: 'all', site: '', category: '', from: '', to: today};
  const [tier, setTier] = useState('all');
  const [filters, setFilters] = useState(defaults);
  // The filter panel opens collapsed on every screen; its border blinks purple with a cue for three seconds.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cue, setCue] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setCue(false), 3000);
    return () => clearTimeout(timer);
  }, []);
  const [rowLimit, setRowLimit] = useState(INITIAL_VISIBLE_ROWS);
  const regions = infoPulseRegions(scope?.sites);
  const view = infoPulseFilterView(ready ? pulseBreakdownRows(breakdowns, now) : [], filters, regions);
  const rows = view.rows;
  const counts = pulseTierCounts(rows);
  const shown = tier === 'all' ? rows : rows.filter(row => row.tier === tier);
  const visibleRows = shown.slice(0, rowLimit);
  const scopeLabel = scope?.label || 'Assigned location';
  const selected = PULSE_TIERS.find(option => option.key === tier) || PULSE_TIERS[0];
  const periodDays = filters.to === today && filters.from ? Math.round((Date.parse(filters.to) - Date.parse(filters.from)) / DAY) + 1 : 0;
  const changed = Object.keys(defaults).some(key => filters[key] !== defaults[key]);
  const choose = (name, value) => { setRowLimit(INITIAL_VISIBLE_ROWS); setFilters(current => ({...current, [name]: value, ...(name === 'region' ? {site: '', category: ''} : name === 'site' ? {category: ''} : {})})); };
  const preset = days => { setRowLimit(INITIAL_VISIBLE_ROWS); setFilters(current => ({...current, from: infoPulseDate(new Date(now - (days - 1) * DAY).toISOString()), to: today})); };
  const untilToday = !filters.from && filters.to === today;
  const dateCaption = !filters.from && !filters.to ? 'All dates' : !filters.from ? `Until ${formatDisplayDate(filters.to)}` : filters.from === filters.to ? formatDisplayDate(filters.from) : `${formatDisplayDate(filters.from)} – ${filters.to ? formatDisplayDate(filters.to) : 'Latest'}`;
  const siteLabel = view.selection.site ? view.sites.find(site => site.key === view.selection.site)?.label || '' : '';
  const regionLabel = view.selection.region === 'all' && regions.length === 1 ? regions[0].label : view.regionLabel;
  const placeCaption = [regionLabel, siteLabel, view.selection.category].filter(Boolean).join(' · ');
  return <div className="pulse-content">
    <div className="pulse-toolbar">
      <p className="pulse-lede">Every open breakdown in <b>{siteLabel || (view.selection.region !== 'all' && view.regionLabel) || scopeLabel}</b>, longest standing first. Idle, closed and verified requests are not counted. Dates and times in IST.</p>
      <div className="pulse-refresh-group"><span className="pulse-updated">{updatedAt ? `Updated ${formatDisplayDateTime(updatedAt)} IST` : 'Not refreshed yet'}</span>
        <button type="button" className="pulse-refresh" onClick={onRefresh} disabled={refreshing} aria-label="Refresh Info Pulse"><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>
    <details className={`pulse-filter-panel${cue ? ' pulse-filter-hint' : ''}`} open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
      <summary className="pulse-filter-summary"><b>Filters</b><span>{placeCaption} · {dateCaption}</span>{cue && <em className="pulse-filter-cue" role="status">Customise yourself</em>}<span className="pulse-show-filters">Show filters</span><span className="pulse-hide-filters">Hide filters</span></summary>
      <div className="pulse-filter-topline">
        {regions.length > 1 ? <div className="pulse-region-tabs" role="tablist" aria-label="Breakdowns by region">
          {view.regions.map(region => <button type="button" key={region.code} role="tab" aria-selected={view.selection.region === region.code} onClick={() => choose('region', region.code)}><span>{region.label}</span><b>{region.count}</b></button>)}
        </div> : <span className="pulse-filter-scope"><MapPin size={14} aria-hidden="true" />{regionLabel}</span>}
        <button type="button" className="pulse-reset" disabled={!changed} onClick={() => { setFilters(defaults); setRowLimit(INITIAL_VISIBLE_ROWS); }}><RotateCcw size={14} aria-hidden="true" />Reset selection</button>
      </div>
      {view.sites.length > 1 && ChipRow({name: 'site', label: 'Site', allLabel: 'All sites', options: view.sites, value: view.selection.site, choose})}
      {ChipRow({name: 'category', label: 'Equipment / Vehicle', allLabel: 'All equipment & vehicles', options: view.categories, value: view.selection.category, choose})}
      <div className="pulse-filter-dates">
        <b className="pulse-record-count" role="status">{shown.length} of {view.total} records</b>
        <span className="pulse-filter-dates-label">Started</span>
        <label><span>From</span><input type="date" aria-label="Info Pulse from date" value={filters.from} max={filters.to || undefined} onChange={event => choose('from', event.target.value)} /></label>
        <label><span>To</span><input type="date" aria-label="Info Pulse to date" value={filters.to} min={filters.from || undefined} onChange={event => choose('to', event.target.value)} /></label>
        <div className="pulse-period" role="group" aria-label="Info Pulse period"><button type="button" aria-pressed={untilToday} className={untilToday ? 'active' : ''} onClick={() => { setRowLimit(INITIAL_VISIBLE_ROWS); setFilters(current => ({...current, from: '', to: today})); }}>Until today</button>{PERIODS.map(days => <button type="button" key={days} aria-pressed={periodDays === days} className={periodDays === days ? 'active' : ''} onClick={() => preset(days)}>{days === 1 ? 'Today' : `${days}D`}</button>)}<button type="button" aria-pressed={!filters.from && !filters.to} className={!filters.from && !filters.to ? 'active' : ''} onClick={() => { setRowLimit(INITIAL_VISIBLE_ROWS); setFilters(current => ({...current, from: '', to: ''})); }}>All dates</button></div>
        <span className="pulse-filter-caption">{dateCaption}</span>
      </div>
    </details>
    <div className="pulse-kpis" role="group" aria-label="Breakdowns by standing time">
      {PULSE_TIERS.map(option => {
        const Icon = tierIcons[option.key];
        const count = ready ? counts[option.key] : null;
        return <button type="button" key={option.key} className={`pulse-kpi ${option.key}${tier === option.key ? ' selected' : ''}`} aria-pressed={tier === option.key} aria-label={`${option.label}: ${ready ? count : 'unavailable'}`} onClick={() => { setTier(option.key); setRowLimit(INITIAL_VISIBLE_ROWS); }}>
          <span className="pulse-kpi-icon"><Icon size={20} aria-hidden="true" /></span>
          <span className="pulse-kpi-label">{option.label}</span>
          <b className="pulse-kpi-count">{ready ? count : '—'}</b>
          <small className="pulse-kpi-hint">{option.hint}</small>
        </button>;
      })}
    </div>
    {error && <div className="pulse-message pulse-error" role="alert">{ready ? 'Refresh failed. Showing the last loaded breakdowns.' : 'Could not load breakdowns.'} <button type="button" disabled={refreshing} onClick={onRefresh}>Retry</button></div>}
    {!ready ? <p className="pulse-message" role="status">{error ? 'Breakdowns unavailable.' : 'Loading breakdowns…'}</p> : view.invalidRange ? <p className="pulse-message pulse-error" role="alert">From date must be on or before To date.</p> : <>
      <div className="pulse-results-line"><h3 className={selected.key}>{selected.label}<span>{selected.hint}</span></h3><span>{shown.length} of {rows.length} breakdowns · {placeCaption} · {dateCaption}</span></div>
      {shown.length ? <><ol className="pulse-breakdown-list" aria-label={`${selected.label} breakdowns, longest standing first`}>
        {visibleRows.map((row, index) => {
          const request = row.request || {};
          const delay = pulseDelayReason(request);
          return <li className={`pulse-breakdown-row ${row.tier}`} key={row.key}>
            <span className="pulse-rank" aria-hidden="true">{index + 1}</span>
            <div className="pulse-row-equipment">
              <span className="pulse-row-site"><MapPin size={13} aria-hidden="true" />{row.site}</span>
              <b className="pulse-row-vehicle"><Truck size={18} aria-hidden="true" />{request.door || request.reg || 'Not recorded'}</b>
              <small>{[request.equipmentGroup || request.equipment, request.ref].filter(Boolean).join(' · ') || 'Reference not recorded'}</small>
              <span className="pulse-row-status"><i className="pulse-status-tag">{requestStatusLabel(request)}</i><i className={`pulse-tier-tag ${row.tier}`}>{row.tier === 'critical' ? 'Critical · 24h+' : row.tier === 'warning' ? 'Warning · 12h+' : 'Under 12h'}</i></span>
            </div>
            <div className="pulse-row-reason"><span>Breakdown reason</span><p>{String(request.complaint || '').trim() || 'Not recorded'}</p>
              {delay && <div className="pulse-row-delay"><span>{delay.label}</span><p>{delay.value}</p>{delay.at && Number.isFinite(parseIstTimestamp(delay.at)) && <time>{formatDisplayDateTime(delay.at)} IST{delay.author ? ` · ${delay.author}` : ''}</time>}</div>}
            </div>
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
      </ol>{visibleRows.length < shown.length && <button type="button" className="pulse-load-more" onClick={() => setRowLimit(limit => limit + INITIAL_VISIBLE_ROWS)}>Show {Math.min(INITIAL_VISIBLE_ROWS, shown.length - visibleRows.length)} more breakdowns</button>}</> : <p className="pulse-empty">{changed || tier !== 'all' ? 'No breakdowns match this selection.' : 'No open breakdowns. BD balance is 0.'}</p>}
    </>}
  </div>;
}
