import React, {useMemo, useState} from 'react';
import {ChevronDown, ChevronLeft, ChevronRight, RefreshCw, MapPin, Truck, Info} from 'lucide-react';
import {INFO_PULSE_COLUMNS, buildInfoPulseBreakdowns, infoPulseColumns, infoPulseSiteOptions, infoPulseView} from '../info-pulse-data.mjs';
import {parseIstTimestamp} from '../ai-feeder.mjs';
import {formatDisplayDate, formatDisplayTime, formatDisplayDateTime} from '../date-time-format.mjs';
import {requestStatusLabel} from './request-status.mjs';
import {pulseCaseReasons, pulseCaseSeverity, pulseSeverityCounts} from './info-pulse-reasons.mjs';
import {pulseCaseTiming} from './info-pulse-timing.mjs';

const PAGE_SIZE = 25;
const labels = Object.fromEntries(INFO_PULSE_COLUMNS.map(column => [column.key, column.label]));
const severityLabels = {all: 'All cases', critical: 'Critical', warning: 'Warnings', info: 'Updates'};
const EMPTY_FILTERS = {site: '', from: '', to: '', type: '', severity: '', view: ''};
const issueHelp = {
  'etc-overdue': 'Active repair past its expected completion time (ETC).',
  'long-running': 'Active breakdown for at least 3 days.',
  'idle-vehicle': 'Request currently marked Idle.',
  'etc-due-soon': 'Active repair with ETC in the next 2 hours.',
  'awaiting-verification': 'Repair closed at least 12 hours ago and still awaiting MIS verification.',
  'stale-update': 'Active request at least 24 hours old with no maintenance remark recorded.',
  'new-request': 'Active request started within the last 12 hours.',
};
function RecordDate({value}) {
  return Number.isFinite(parseIstTimestamp(value))
    ? <time className="pulse-date"><b>{formatDisplayDate(value)}</b><span>{formatDisplayTime(value)}</span></time>
    : <span className="pulse-missing">Not recorded</span>;
}

export default function InfoPulseContent({cases = [], requests = [], scope, role, now, updatedAt, ready, error, refreshing, onRefresh}) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState('');
  const [page, setPage] = useState(0);
  const [countHelp, setCountHelp] = useState(null);
  const columns = infoPulseColumns(role);
  const sites = useMemo(() => infoPulseSiteOptions(requests, scope?.sites || []), [requests, scope]);
  const summary = useMemo(() => infoPulseView(cases, {...filters, sites}), [cases, filters, sites]);
  const severityCounts = useMemo(() => pulseSeverityCounts(summary.rows), [summary]);
  const priorityCases = useMemo(() => filters.severity ? cases.filter(row => pulseCaseSeverity(row) === filters.severity) : cases, [cases, filters.severity]);
  const issueSummary = useMemo(() => infoPulseView(priorityCases, filters), [priorityCases, filters]);
  const matching = useMemo(() => infoPulseView(priorityCases, {...filters, site: ''}), [priorityCases, filters]);
  const siteCounts = useMemo(() => {
    const counts = new Map();
    for (const row of matching.rows) counts.set(row.siteKey, (counts.get(row.siteKey) || 0) + 1);
    return counts;
  }, [matching]);
  const breakdownsView = filters.view === 'breakdowns';
  const breakdowns = useMemo(() => buildInfoPulseBreakdowns(requests, cases), [requests, cases]);
  const breakdownSummary = useMemo(() => infoPulseView(breakdowns, {from: filters.from, to: filters.to, sites}), [breakdowns, filters.from, filters.to, sites]);
  const breakdownCounts = useMemo(() => new Map(breakdownSummary.sites.map(site => [site.key, site.total])), [breakdownSummary]);
  const breakdownTotal = filters.site ? breakdownCounts.get(filters.site) || 0 : breakdownSummary.totals.total;
  const detail = useMemo(() => {
    const source = breakdownsView ? breakdownSummary : matching;
    return {...source, rows: filters.site ? source.rows.filter(row => row.siteKey === filters.site) : source.rows};
  }, [matching, breakdownSummary, breakdownsView, filters.site]);
  const lastPage = Math.max(0, Math.ceil(detail.rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const rows = detail.rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selectedSite = sites.find(site => site.key === filters.site)?.label || 'All sites';
  const changeFilter = (key, value) => {setFilters(current => ({...current, [key]: value, ...(['type', 'severity'].includes(key) ? {view: ''} : {})})); setExpanded(''); setPage(0);};
  const showBreakdowns = siteKey => {setFilters(current => ({...current, view: 'breakdowns', type: '', severity: '', ...(siteKey === undefined ? {} : {site: siteKey})})); setExpanded(''); setPage(0);};
  const showCountHelp = event => {
    const meta = event.currentTarget.closest('.pulse-meta').getBoundingClientRect();
    const content = event.currentTarget.closest('.pulse-content').getBoundingClientRect();
    const below = content.bottom - meta.bottom - 20, above = meta.top - content.top - 20;
    const placement = below < 220 && above > below ? 'above' : 'below';
    setCountHelp({placement, maxHeight: Math.max(80, Math.min(440, placement === 'above' ? above : below))});
  };
  return <div className="pulse-content">
    {ready && !summary.invalidRange && <div className="pulse-site-filter">
      <span className="pulse-site-label" id="pulse-site-label">Site</span>
      <div className="pulse-site-tabs" role="group" aria-labelledby="pulse-site-label">
        {[{key: '', label: 'All sites'}, ...sites].map(site => <button type="button" key={site.key} aria-pressed={filters.site === site.key} aria-label={`Filter site: ${site.label}`} onClick={() => changeFilter('site', site.key)}><span>{site.label}</span><b>{site.key ? siteCounts.get(site.key) || 0 : matching.rows.length}</b></button>)}
      </div>
    </div>}
    <div className="pulse-toolbar">
      <label>Request date from<input type="date" value={filters.from} max={filters.to || undefined} onChange={event => changeFilter('from', event.target.value)} /></label>
      <label>Request date to<input type="date" value={filters.to} min={filters.from || undefined} onChange={event => changeFilter('to', event.target.value)} /></label>
      {Object.values(filters).some(Boolean) && <button type="button" className="pulse-reset" onClick={() => {setFilters(EMPTY_FILTERS); setExpanded(''); setPage(0);}}>Reset</button>}
      <button type="button" className="pulse-refresh" onClick={onRefresh} disabled={refreshing} aria-label="Refresh Info Pulse"><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    <div className="pulse-meta"><div className="pulse-meta-context"><span>{!filters.from && !filters.to ? 'All request dates' : `${filters.from ? formatDisplayDate(filters.from) : 'Earliest'} – ${filters.to ? formatDisplayDate(filters.to) : 'Latest'}`}</span>
      <div className="pulse-count-help" onMouseEnter={showCountHelp} onMouseLeave={event => {if (!event.currentTarget.contains(event.currentTarget.ownerDocument.activeElement)) setCountHelp(null);}} onFocus={showCountHelp} onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget)) setCountHelp(null);}} onKeyDown={event => {if (event.key === 'Escape') {event.stopPropagation(); setCountHelp(null);}}}>
        <button type="button" className="pulse-help-trigger" aria-label="What these counts mean" aria-describedby={countHelp ? 'pulse-count-explanation' : undefined} onClick={showCountHelp}><Info size={15} aria-hidden="true" /></button>
        {countHelp && <div id="pulse-count-explanation" className="pulse-count-tooltip" role="tooltip" tabIndex={0} data-placement={countHelp.placement} style={{maxHeight: countHelp.maxHeight}}>
          <b className="pulse-tooltip-title">What these counts mean</b>
          <p><b>Default:</b> All sites you can access, all request dates and all cases. Date filters use the breakdown start date in IST.</p>
          <p><b>Total breakdowns</b> counts every open request once, excluding idle and closed or verified requests, whether or not it has raised an alert. Site chips show each site in your scope; select one to list its breakdowns.</p>
          <p><b>All cases</b> counts each qualifying request once. Its highest priority decides its box: <b>Critical → Warnings → Updates.</b> The three boxes add up to All cases; site badges show unique matching cases.</p>
          <p><b>Case order:</b> Critical first, longest ETC overdue first. Other critical cases follow by longest standing time, then warnings and updates.</p>
          <dl>{columns.map(column => <div key={column.key}><dt className={column.tone}>{column.label}<small>{severityLabels[column.tone]}</small></dt><dd>{issueHelp[column.key]}</dd></div>)}</dl>
          <p>Issue counts can overlap: one request may be both overdue and down for 3 days. Verified requests and requests matching none of these checks are excluded. Filters narrow the results.</p>
          <p>Cards show the site, equipment, status, standing time, ETC, complaint and recorded reasons. Expand a card for daily updates and full details. <b>{PAGE_SIZE} cases per page · IST · Refreshes every 30 seconds.</b></p>
        </div>}
      </div>
    </div><span>{updatedAt ? `Updated ${formatDisplayDateTime(updatedAt)} IST` : 'Dates and times in IST'}</span></div>
    {error && <div className="pulse-message pulse-error" role="alert">{ready ? 'Refresh failed. Showing the last loaded counts.' : 'Could not load site counts.'} <button type="button" disabled={refreshing} onClick={onRefresh}>Retry</button></div>}
    {!ready ? <p className="pulse-message" role="status">{error ? 'Counts unavailable.' : 'Loading site counts…'}</p> : summary.invalidRange ? <p className="pulse-message pulse-error" role="alert">From date must be on or before To date.</p> : <>
      <section className={`pulse-breakdown-box${breakdownsView ? ' selected' : ''}`} aria-label="Total breakdowns by site">
        <button type="button" className="pulse-breakdown-total" aria-pressed={breakdownsView} aria-label={`Total breakdowns: ${breakdownTotal} at ${selectedSite}`} onClick={() => breakdownsView ? changeFilter('view', '') : showBreakdowns()}>
          <span>Total breakdowns</span><b>{breakdownTotal}</b><small>{selectedSite} · open requests, excluding idle</small>
        </button>
        <div className="pulse-breakdown-sites" role="group" aria-label="Breakdowns by site">
          {sites.length ? sites.map(site => {
            const count = breakdownCounts.get(site.key) || 0;
            return <button type="button" key={site.key} className={count ? 'active' : 'quiet'} aria-pressed={breakdownsView && filters.site === site.key} aria-label={`Breakdowns at ${site.label}: ${count}`} onClick={() => showBreakdowns(site.key)}><span>{site.label}</span><b>{count}</b></button>;
          }) : <span className="pulse-breakdown-empty">No sites in scope</span>}
        </div>
      </section>
      <div className="pulse-overview" role="group" aria-label="Cases by highest priority">
        {Object.entries(severityLabels).map(([key, label]) => <button type="button" key={key} className={`pulse-stat ${key}${!breakdownsView && (filters.severity || 'all') === key ? ' selected' : ''}`} aria-pressed={!breakdownsView && (filters.severity || 'all') === key} aria-label={`${label}: ${severityCounts[key]} cases`} disabled={key !== 'all' && !severityCounts[key] && filters.severity !== key} onClick={() => changeFilter('severity', key === 'all' ? '' : key)}><span>{label}</span><b>{severityCounts[key]}</b></button>)}
      </div>
      <div className="pulse-issue-filter" role="group" aria-label="Filter cases by issue">
        {[{key: '', label: 'All cases', tone: 'all'}, ...columns].map(column => {
          const count = column.key ? issueSummary.totals.counts[column.key] : issueSummary.totals.total;
          return <button type="button" key={column.key} className={`pulse-issue-option ${column.tone}`} aria-pressed={!breakdownsView && filters.type === column.key} aria-label={`Filter issue: ${column.label}`} disabled={Boolean(column.key) && !count && filters.type !== column.key} onClick={() => changeFilter('type', column.key)}><span>{column.label}</span><b>{count}</b></button>;
        })}
      </div>
      <div className="pulse-results-line"><h3>{selectedSite} <span>/ {breakdownsView ? 'All breakdowns' : [severityLabels[filters.severity], labels[filters.type]].filter(Boolean).join(' · ') || 'All cases'}</span></h3><span role="status">{detail.rows.length} {breakdownsView ? 'breakdowns' : 'cases'}</span></div>
        <div key={`cases:${filters.view}:${filters.site}:${filters.from}:${filters.to}:${filters.type}:${filters.severity}:${currentPage}`} className="pulse-case-list" tabIndex={0} role="region" aria-label="Matching case records">
          {rows.length ? rows.map(row => {
              const request = row.request;
              const reasons = pulseCaseReasons(row, filters.type);
              const isExpanded = expanded === row.key;
              const highlights = reasons.reasons.filter(reason => reason.key !== 'work');
              const latestUpdate = reasons.updates.find(update => update.remark);
              return <article className={`pulse-case-card ${row.issues.length ? pulseCaseSeverity(row) : 'plain'}`} key={row.key}>
                <div className="pulse-card-heading"><span className="pulse-card-site"><MapPin size={14} />{row.site}</span><span className="pulse-card-status">{requestStatusLabel(request)}</span></div>
                <div className="pulse-card-main"><button type="button" className="pulse-record-link" aria-expanded={isExpanded} aria-controls={`pulse-record-${row.key}`} onClick={() => setExpanded(isExpanded ? '' : row.key)}><span className="pulse-card-vehicle"><Truck size={22} /><span><b>{request.door || request.reg || 'Not recorded'}</b><small>{request.equipmentGroup || request.equipment || ''}{request.equipmentGroup || request.equipment ? ' · ' : ''}{request.ref || 'Reference not recorded'}</small></span></span><ChevronDown size={18} /></button>
                <div className="pulse-issues">{row.issues.length ? row.issues.map(issue => <span className={issue.severity} data-selected={filters.type === issue.type} key={issue.type}>{labels[issue.type]}</span>) : <span className="plain">No alerts</span>}</div></div>
                <dl className="pulse-card-dates">{pulseCaseTiming(row, now).map(field => <div key={field.label} className={field.tone || ''}><dt>{field.label}</dt><dd>{'date' in field ? <RecordDate value={field.date} /> : <strong className="pulse-duration">{field.value}</strong>}</dd></div>)}</dl>
                <dl className="pulse-card-reasons">{highlights.map(reason => <div key={reason.key} className={`${reason.key === 'complaint' ? 'complaint' : 'reason'}${reason.missing ? ' missing' : ''}`}><dt>{reason.key === 'complaint' ? 'Issue / complaint' : reason.label}</dt><dd>{reason.value}</dd>{reason.at && <time>{formatDisplayDateTime(reason.at)} IST</time>}</div>)}</dl>
                {(latestUpdate || request.maintenanceWork) && <div className="pulse-latest-update"><b>{latestUpdate ? 'Latest maintenance update' : 'Maintenance work'}</b><p>{latestUpdate?.remark || request.maintenanceWork}</p>{latestUpdate?.createdAt && <time>{formatDisplayDateTime(latestUpdate.createdAt)} IST{latestUpdate.author ? ` · ${latestUpdate.author}` : ''}</time>}</div>}
                {isExpanded && <div id={`pulse-record-${row.key}`} className="pulse-record-detail"><dl className="pulse-record-facts">{[
                ['Status', requestStatusLabel(request)], ['Equipment', request.equipmentGroup || request.equipment],
                ['Registration', request.reg], ['Repair type', request.category],
                ['Maintenance work', request.maintenanceWork],
                ['ETC', request.expectedCompletionAt && formatDisplayDateTime(request.expectedCompletionAt)],
                ['Closed', request.closedAt && formatDisplayDateTime(request.closedAt)],
              ].filter(([, value]) => String(value || '').trim()).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                  <h4>Daily updates & delay reasons <span>{reasons.updates.length}</span></h4>
                  {reasons.updates.length ? <ol className="pulse-reason-history">{reasons.updates.map((update, index) => <li key={`${update.createdAt}-${index}`}><div><time>{update.createdAt ? `${formatDisplayDateTime(update.createdAt)} IST` : 'Date not recorded'}</time>{update.author && <span>{update.author}</span>}</div><dl><div><dt>Maintenance update</dt><dd>{update.remark || 'Not recorded'}</dd></div><div><dt>Delay reason</dt><dd>{update.delayReason || 'Not recorded'}</dd></div></dl></li>)}</ol> : <p className="pulse-no-updates">No daily updates recorded.</p>}
                </div>}
                <button type="button" className="pulse-details-toggle" aria-expanded={isExpanded} aria-controls={`pulse-record-${row.key}`} onClick={() => setExpanded(isExpanded ? '' : row.key)}>{isExpanded ? 'Hide details' : 'All details & reasons'}<ChevronDown size={15} /></button>
              </article>;
            }) : <p className="pulse-empty">{breakdownsView ? 'No active breakdowns.' : 'No matching cases.'}</p>}
        </div>
        {detail.rows.length > PAGE_SIZE && <div className="pulse-pagination"><span>{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, detail.rows.length)} of {detail.rows.length} {breakdownsView ? 'breakdowns' : 'cases'}</span><div><button type="button" aria-label="Previous cases" disabled={currentPage === 0} onClick={() => {setPage(currentPage - 1); setExpanded('');}}><ChevronLeft size={16} /></button><span>{currentPage + 1} / {lastPage + 1}</span><button type="button" aria-label="Next cases" disabled={currentPage === lastPage} onClick={() => {setPage(currentPage + 1); setExpanded('');}}><ChevronRight size={16} /></button></div></div>}
    </>}
  </div>;
}
