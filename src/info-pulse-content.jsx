import React, {useMemo, useState} from 'react';
import {ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, MapPin, Truck} from 'lucide-react';
import {INFO_PULSE_COLUMNS, infoPulseColumns, infoPulseSiteOptions, infoPulseView} from '../info-pulse-data.mjs';
import {parseIstTimestamp} from '../ai-feeder.mjs';
import {formatDisplayDate, formatDisplayTime, formatDisplayDateTime} from '../date-time-format.mjs';
import {requestStatusLabel} from './request-status.mjs';
import {pulseCaseReasons, pulseCaseSeverity, pulseSeverityCounts} from './info-pulse-reasons.mjs';

const PAGE_SIZE = 25;
const labels = Object.fromEntries(INFO_PULSE_COLUMNS.map(column => [column.key, column.label]));
const severityLabels = {all: 'All cases', critical: 'Critical', warning: 'Warnings', info: 'Updates'};
function RecordDate({value}) {
  return Number.isFinite(parseIstTimestamp(value))
    ? <time className="pulse-date"><b>{formatDisplayDate(value)}</b><span>{formatDisplayTime(value)}</span></time>
    : <span className="pulse-missing">—</span>;
}

export default function InfoPulseContent({cases = [], requests = [], scope, role, now, updatedAt, ready, error, refreshing, onRefresh}) {
  const [filters, setFilters] = useState({site: '', from: '', to: ''});
  const [selection, setSelection] = useState(null);
  const [expanded, setExpanded] = useState('');
  const [page, setPage] = useState(0);
  const columns = infoPulseColumns(role);
  const sites = useMemo(() => infoPulseSiteOptions(requests, scope?.sites || []), [requests, scope]);
  const summary = useMemo(() => infoPulseView(cases, {...filters, sites}), [cases, filters, sites]);
  const severityCounts = pulseSeverityCounts(summary.rows);
  const detail = useMemo(() => {
    const view = infoPulseView(cases, {...filters, site: selection?.site || filters.site, type: selection?.type || ''});
    return selection?.severity ? {...view, rows: view.rows.filter(row => pulseCaseSeverity(row) === selection.severity)} : view;
  }, [cases, filters, selection]);
  const lastPage = Math.max(0, Math.ceil(detail.rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const rows = detail.rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selectedSite = sites.find(site => site.key === (selection?.site || filters.site))?.label || 'All sites';
  const changeFilter = (key, value) => {setFilters(current => ({...current, [key]: value})); setSelection(null); setExpanded(''); setPage(0);};
  const inspect = (site, type = '', severity = '') => {setSelection({site, type, severity}); setExpanded(''); setPage(0);};
  const countButton = (row, type = '') => {
    const count = type ? row.counts[type] : row.total;
    return <button type="button" className={`pulse-number ${type ? INFO_PULSE_COLUMNS.find(column => column.key === type)?.tone : 'total'}`} disabled={!count} aria-label={`${row.label}: ${count} ${type ? labels[type] : 'cases'}`} onClick={() => inspect(row.key, type)}>{count}</button>;
  };
  return <div className="pulse-content">
    <div className="pulse-toolbar">
      <label>Site<select value={filters.site} onChange={event => changeFilter('site', event.target.value)}><option value="">All permitted sites</option>{sites.map(site => <option key={site.key} value={site.key}>{site.label}</option>)}</select></label>
      <label>Request date from<input type="date" value={filters.from} max={filters.to || undefined} onChange={event => changeFilter('from', event.target.value)} /></label>
      <label>Request date to<input type="date" value={filters.to} min={filters.from || undefined} onChange={event => changeFilter('to', event.target.value)} /></label>
      {(filters.site || filters.from || filters.to) && <button type="button" className="pulse-reset" onClick={() => {setFilters({site: '', from: '', to: ''}); setSelection(null); setPage(0);}}>Reset</button>}
      <button type="button" className="pulse-refresh" onClick={onRefresh} disabled={refreshing} aria-label="Refresh Info Pulse"><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    <div className="pulse-meta"><span>{!filters.from && !filters.to ? 'All request dates' : `${filters.from ? formatDisplayDate(filters.from) : 'Earliest'} – ${filters.to ? formatDisplayDate(filters.to) : 'Latest'}`}</span><span>{updatedAt ? `Updated ${formatDisplayDateTime(updatedAt)} IST` : 'Dates and times in IST'}</span></div>
    {error && <div className="pulse-message pulse-error" role="alert">{ready ? 'Refresh failed. Showing the last loaded counts.' : 'Could not load site counts.'} <button type="button" disabled={refreshing} onClick={onRefresh}>Retry</button></div>}
    {!ready ? <p className="pulse-message" role="status">{error ? 'Counts unavailable.' : 'Loading site counts…'}</p> : summary.invalidRange ? <p className="pulse-message pulse-error" role="alert">From date must be on or before To date.</p> : <>
      {!selection && <div className="pulse-overview" aria-label="Cases by highest priority">
        {Object.entries(severityLabels).map(([key, label]) => <button type="button" key={key} className={`pulse-stat ${key}${(selection?.severity || (!selection?.type && selection ? 'all' : '')) === key ? ' selected' : ''}`} disabled={!severityCounts[key]} aria-label={`${label}: ${severityCounts[key]} cases`} aria-pressed={(selection?.severity || (!selection?.type && selection ? 'all' : '')) === key} onClick={() => inspect('', '', key === 'all' ? '' : key)}><span>{label}</span><b>{severityCounts[key]}</b></button>)}
      </div>}
      <div className="pulse-section-heading">
        {selection ? <><button type="button" className="pulse-back" onClick={() => {setSelection(null); setExpanded('');}}><ArrowLeft size={16} /> Sites</button><h3>{selectedSite} <span>/ {selection.type ? labels[selection.type] : severityLabels[selection.severity] || 'All cases'}</span></h3><b className="pulse-case-count" role="status">{detail.rows.length} cases</b></> : <><h3>Site-wise cases</h3><b className="pulse-case-count" role="status">{summary.totals.total} cases</b></>}
      </div>
      {!selection ? <>
        <div key="sites" className="pulse-table-scroll" tabIndex={0} role="region" aria-label="Site-wise case counts">
          <table className="pulse-table pulse-summary"><thead><tr><th scope="col">Site</th><th scope="col">Cases</th>{columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>{summary.sites.length ? summary.sites.map(row => <tr key={row.key}><th scope="row"><button type="button" className="pulse-site-link" onClick={() => inspect(row.key)}>{row.label}</button></th><td>{countButton(row)}</td>{columns.map(column => <td key={column.key}>{countButton(row, column.key)}</td>)}</tr>) : <tr><td colSpan={columns.length + 2} className="pulse-empty">No sites in this scope.</td></tr>}</tbody>
            <tfoot><tr><th scope="row">Total</th><td>{countButton(summary.totals)}</td>{columns.map(column => <td key={column.key}>{countButton(summary.totals, column.key)}</td>)}</tr></tfoot>
          </table>
        </div>
        <p className="pulse-count-note">Cases count each request once. Priority cards use the highest severity; issue columns can overlap.</p>
      </> : <>
        <div key={`cases:${selection.site}:${selection.type}:${selection.severity}:${currentPage}`} className="pulse-case-list" tabIndex={0} role="region" aria-label="Matching case records">
          {rows.length ? rows.map(row => {
              const request = row.request;
              const reasons = pulseCaseReasons(row, selection.type);
              const isExpanded = expanded === row.key;
              const start = parseIstTimestamp(request.start);
              const closed = parseIstTimestamp(request.closedAt);
              const end = Number.isFinite(closed) ? closed : now;
              const days = Number.isFinite(start) && end >= start ? ((end - start) / 86_400_000).toFixed(1) : '—';
              return <article className={`pulse-case-card ${pulseCaseSeverity(row)}`} key={row.key}>
                <div className="pulse-card-heading"><span className="pulse-card-site"><MapPin size={14} />{row.site}</span><span className="pulse-card-status">{requestStatusLabel(request)}</span></div>
                <button type="button" className="pulse-record-link" aria-expanded={isExpanded} aria-controls={`pulse-record-${row.key}`} onClick={() => setExpanded(isExpanded ? '' : row.key)}><span className="pulse-card-vehicle"><Truck size={22} /><span><b>{request.door || request.reg || 'Not recorded'}</b><small>{request.equipmentGroup || request.equipment || ''}{request.equipmentGroup || request.equipment ? ' · ' : ''}{request.ref || 'Reference not recorded'}</small></span></span><ChevronDown size={18} /></button>
                <div className="pulse-issues">{row.issues.map(issue => <span className={issue.severity} key={issue.type}>{labels[issue.type]}</span>)}</div>
                <dl className="pulse-card-dates"><div><dt>Request started</dt><dd><RecordDate value={request.start} /></dd></div><div><dt>ETC</dt><dd><RecordDate value={request.expectedCompletionAt} /></dd></div>{Number.isFinite(closed) && <div><dt>Closed</dt><dd><RecordDate value={request.closedAt} /></dd></div>}<div><dt>Days down</dt><dd className="pulse-days">{days}</dd></div></dl>
                {!isExpanded && <div className={`pulse-reason-preview${reasons.primary.missing ? ' missing' : ''}`}><b>{reasons.primary.label}</b><p>{reasons.primary.value}</p>{reasons.primary.at && <time>{formatDisplayDateTime(reasons.primary.at)} IST</time>}</div>}
                {isExpanded && <div id={`pulse-record-${row.key}`} className="pulse-record-detail"><dl className="pulse-record-facts">{[
                ['Status', requestStatusLabel(request)], ['Equipment', request.equipmentGroup || request.equipment],
                ['Registration', request.reg], ['Repair type', request.category],
                ['ETC', request.expectedCompletionAt && formatDisplayDateTime(request.expectedCompletionAt)],
                ['Closed', request.closedAt && formatDisplayDateTime(request.closedAt)],
              ].filter(([, value]) => String(value || '').trim()).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                  <h4>All reasons</h4><dl className="pulse-reason-details">{reasons.reasons.map(reason => <div key={reason.key} className={reason.missing ? 'missing' : ''}><dt>{reason.label}{reason.at && <time>{formatDisplayDateTime(reason.at)} IST</time>}</dt><dd>{reason.value}</dd></div>)}</dl>
                  <h4>Daily updates & delay reasons <span>{reasons.updates.length}</span></h4>
                  {reasons.updates.length ? <ol className="pulse-reason-history">{reasons.updates.map((update, index) => <li key={`${update.createdAt}-${index}`}><div><time>{update.createdAt ? `${formatDisplayDateTime(update.createdAt)} IST` : 'Date not recorded'}</time>{update.author && <span>{update.author}</span>}</div><dl><div><dt>Maintenance update</dt><dd>{update.remark || 'Not recorded'}</dd></div><div><dt>Delay reason</dt><dd>{update.delayReason || 'Not recorded'}</dd></div></dl></li>)}</ol> : <p className="pulse-no-updates">No daily updates recorded.</p>}
                </div>}
                <button type="button" className="pulse-details-toggle" aria-expanded={isExpanded} aria-controls={`pulse-record-${row.key}`} onClick={() => setExpanded(isExpanded ? '' : row.key)}>{isExpanded ? 'Hide details' : 'All details & reasons'}<ChevronDown size={15} /></button>
              </article>;
            }) : <p className="pulse-empty">No matching cases.</p>}
        </div>
        {detail.rows.length > PAGE_SIZE && <div className="pulse-pagination"><span>{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, detail.rows.length)} of {detail.rows.length} cases</span><div><button type="button" aria-label="Previous cases" disabled={currentPage === 0} onClick={() => {setPage(currentPage - 1); setExpanded('');}}><ChevronLeft size={16} /></button><span>{currentPage + 1} / {lastPage + 1}</span><button type="button" aria-label="Next cases" disabled={currentPage === lastPage} onClick={() => {setPage(currentPage + 1); setExpanded('');}}><ChevronRight size={16} /></button></div></div>}
      </>}
    </>}
  </div>;
}
