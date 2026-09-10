import React, {useMemo, useState} from 'react';
import {ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, RefreshCw} from 'lucide-react';
import {INFO_PULSE_COLUMNS, infoPulseColumns, infoPulseSiteOptions, infoPulseView} from '../info-pulse-data.mjs';
import {parseIstTimestamp} from '../ai-feeder.mjs';
import {formatDisplayDate, formatDisplayTime, formatDisplayDateTime} from '../date-time-format.mjs';
import {requestStatusLabel} from './request-status.mjs';

const PAGE_SIZE = 25;
const labels = Object.fromEntries(INFO_PULSE_COLUMNS.map(column => [column.key, column.label]));
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
  const detail = useMemo(() => infoPulseView(cases, {...filters, site: selection?.site || filters.site, type: selection?.type || ''}), [cases, filters, selection]);
  const lastPage = Math.max(0, Math.ceil(detail.rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const rows = detail.rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selectedSite = sites.find(site => site.key === (selection?.site || filters.site))?.label || 'All sites';
  const changeFilter = (key, value) => {setFilters(current => ({...current, [key]: value})); setSelection(null); setExpanded(''); setPage(0);};
  const inspect = (site, type = '') => {setSelection({site, type}); setExpanded(''); setPage(0);};
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
      <div className="pulse-section-heading">
        {selection ? <><button type="button" className="pulse-back" onClick={() => {setSelection(null); setExpanded('');}}><ArrowLeft size={16} /> Sites</button><h3>{selectedSite} <span>/ {selection.type ? labels[selection.type] : 'All cases'}</span></h3><b className="pulse-case-count" role="status">{detail.rows.length} cases</b></> : <><h3>Site-wise cases</h3><b className="pulse-case-count" role="status">{summary.totals.total} cases</b></>}
      </div>
      {!selection ? <>
        <div className="pulse-table-scroll" tabIndex={0} role="region" aria-label="Site-wise case counts">
          <table className="pulse-table pulse-summary"><thead><tr><th scope="col">Site</th><th scope="col">Cases</th>{columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>{summary.sites.length ? summary.sites.map(row => <tr key={row.key}><th scope="row"><button type="button" className="pulse-site-link" onClick={() => inspect(row.key)}>{row.label}</button></th><td>{countButton(row)}</td>{columns.map(column => <td key={column.key}>{countButton(row, column.key)}</td>)}</tr>) : <tr><td colSpan={columns.length + 2} className="pulse-empty">No sites in this scope.</td></tr>}</tbody>
            <tfoot><tr><th scope="row">Total</th><td>{countButton(summary.totals)}</td>{columns.map(column => <td key={column.key}>{countButton(summary.totals, column.key)}</td>)}</tr></tfoot>
          </table>
        </div>
        <p className="pulse-count-note">Cases count each request once. A case may appear in more than one issue column.</p>
      </> : <>
        <div className="pulse-table-scroll" tabIndex={0} role="region" aria-label="Matching case records">
          <table className="pulse-table pulse-records"><thead><tr><th scope="col">Door / request</th><th scope="col">Site</th><th scope="col">Request started</th><th scope="col">{selection.type === 'awaiting-verification' ? 'Closed' : 'ETC / closed'}</th><th scope="col">Days down</th><th scope="col">Issues</th></tr></thead>
            <tbody>{rows.length ? rows.map(row => {
              const request = row.request;
              const start = parseIstTimestamp(request.start);
              const closed = parseIstTimestamp(request.closedAt);
              const end = Number.isFinite(closed) ? closed : now;
              const days = Number.isFinite(start) && end >= start ? ((end - start) / 86_400_000).toFixed(1) : '—';
              return <React.Fragment key={row.key}><tr className={expanded === row.key ? 'pulse-expanded-row' : ''}>
                <th scope="row"><button type="button" className="pulse-record-link" aria-expanded={expanded === row.key} aria-controls={`pulse-record-${row.key}`} onClick={() => setExpanded(expanded === row.key ? '' : row.key)}><span><b>{request.door || request.reg || 'Not recorded'}</b><small>{request.ref || 'Reference not recorded'}</small></span><ChevronDown size={16} /></button></th>
                <td>{row.site}</td><td><RecordDate value={request.start} /></td><td><span className="pulse-date-kind">{Number.isFinite(closed) ? 'Closed' : 'ETC'}</span><RecordDate value={Number.isFinite(closed) ? request.closedAt : request.expectedCompletionAt} /></td><td className="pulse-days">{days}</td>
                <td><div className="pulse-issues">{row.issues.map(issue => <span className={issue.severity} key={issue.type}>{labels[issue.type]}</span>)}</div></td>
              </tr>{expanded === row.key && <tr id={`pulse-record-${row.key}`}><td colSpan={6} className="pulse-record-detail"><dl>{[
                ['Status', requestStatusLabel(request)], ['Equipment', request.equipmentGroup || request.equipment],
                ['Registration', request.reg], ['Repair type', request.category],
                ['ETC', request.expectedCompletionAt && formatDisplayDateTime(request.expectedCompletionAt)],
                ['Closed', request.closedAt && formatDisplayDateTime(request.closedAt)],
                ['Complaint', request.complaint], ['Latest remark', request.dailyRemarks],
                ['Idle reason', request.idleReason],
              ].filter(([, value]) => String(value || '').trim()).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></td></tr>}</React.Fragment>;
            }) : <tr><td colSpan={6} className="pulse-empty">No matching cases.</td></tr>}</tbody>
          </table>
        </div>
        {detail.rows.length > PAGE_SIZE && <div className="pulse-pagination"><span>{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, detail.rows.length)} of {detail.rows.length} cases</span><div><button type="button" aria-label="Previous cases" disabled={currentPage === 0} onClick={() => {setPage(currentPage - 1); setExpanded('');}}><ChevronLeft size={16} /></button><span>{currentPage + 1} / {lastPage + 1}</span><button type="button" aria-label="Next cases" disabled={currentPage === lastPage} onClick={() => {setPage(currentPage + 1); setExpanded('');}}><ChevronRight size={16} /></button></div></div>}
      </>}
    </>}
  </div>;
}
