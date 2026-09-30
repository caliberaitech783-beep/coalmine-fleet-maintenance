import React, {useEffect, useMemo, useState} from 'react';
import './employee-tenure-report.css';
import DateInput from './date-input.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import {TENURE_MONTHS, buildEmployeeTenureReport} from './employee-tenure.mjs';

const columns = [
  {key: 'empId', label: 'Employee ID', value: row => row.empId},
  {key: 'name', label: 'Employee name', value: row => row.name},
  {key: 'site', label: 'Site', value: row => row.site},
  {key: 'region', label: 'Region', value: row => row.region},
  {key: 'category', label: 'Category', value: row => row.category},
  {key: 'department', label: 'Department', value: row => row.department},
  {key: 'designation', label: 'Designation', value: row => row.designation},
  {key: 'joiningDate', label: 'Joining date', value: row => formatDisplayDate(row.joiningDate)},
  {key: 'tenure', label: 'Working tenure', value: row => row.label, sortValue: row => row.months * 32 + row.days},
];

const excludedColumns = [
  ...columns.slice(0, 7),
  {key: 'joiningDate', label: 'Recorded joining date', value: row => row.joiningDate || 'Not recorded'},
  {key: 'reason', label: 'Exclusion reason', value: row => row.reason},
];

export default function EmployeeTenureReport({token, ReportSection}) {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const [asOf, setAsOf] = useState(today);
  const [minimum, setMinimum] = useState(3);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState({token: '', loading: true, error: '', directory: null});
  const [filters, setFilters] = useState({site: '', region: '', department: '', category: '', designation: ''});
  const [search, setSearch] = useState('');
  const [view, setView] = useState('included');
  const [reason, setReason] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData({token, loading: true, error: '', directory: null});
    fetch('/api/cdir/directory', {headers: {Authorization: `Bearer ${token}`}, cache: 'no-store', signal: controller.signal})
      .then(async response => {
        const directory = await response.json();
        if (!response.ok) throw new Error(directory.error || 'Could not load employee records.');
        if (!directory.matrix || typeof directory.matrix !== 'object') throw new Error('Employee records are unavailable.');
        if (!controller.signal.aborted) setData({token, loading: false, error: '', directory});
      }).catch(error => {if (!controller.signal.aborted) setData({token, loading: false, error: error.message, directory: null});});
    return () => controller.abort();
  }, [token, attempt]);
  const report = useMemo(() => buildEmployeeTenureReport(data.token === token ? data.directory : null, asOf, minimum, filters), [data, token, asOf, minimum, filters]);
  const available = useMemo(() => {
    const all = buildEmployeeTenureReport(data.token === token ? data.directory : null, asOf, minimum);
    return [...all.rows, ...all.excludedRows];
  }, [data, token, asOf, minimum]);
  const excludedRows = report.excludedRows.filter(row => !reason || row.reason === reason);
  const fields = [['site', 'Site'], ['region', 'Region'], ['department', 'Department'], ['category', 'Category'], ['designation', 'Designation']];
  const filterSummary = fields.filter(([key]) => filters[key]).map(([key, label]) => `${label}: ${filters[key]}`).join(' · ');
  const viewTabs = <div className="employee-tenure-tabs" role="group" aria-label="Employee report view">
        <button type="button" aria-pressed={view === 'included'} onClick={() => setView('included')}>Tenure report ({report.rows.length})</button>
        <button type="button" aria-pressed={view === 'excluded'} onClick={() => setView('excluded')}>Excluded employees ({report.excludedRows.length})</button>
      </div>;
  return <section className="reports-workspace employee-tenure-report">
    <h1>Employee Tenure Report</h1>
    <div className="employee-tenure-filters">
      <label>Counted through <DateInput aria-label="Employee tenure counted through" value={asOf} max={today} onChange={event => {if (event.target.value && event.target.value <= today) setAsOf(event.target.value);}} /></label>
      <label>Minimum completed service <select aria-label="Minimum completed service" value={minimum} onChange={event => setMinimum(Number(event.target.value))}>{TENURE_MONTHS.map(months => <option value={months} key={months}>{months}+ months</option>)}</select></label>
      {fields.map(([key, label]) => <label key={key}>{label} <select aria-label={label} value={filters[key]} onChange={event => setFilters(current => ({...current, [key]: event.target.value}))}>
        <option value="">All {key === 'category' ? 'categories' : `${label.toLowerCase()}s`}</option>
        {[...new Set([...available.map(row => row[key]), filters[key]].filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>)}
      <button type="button" onClick={() => {setFilters({site: '', region: '', department: '', category: '', designation: ''});setReason('');}}>Clear filters</button>
      <div className="employee-tenure-search-actions">
        <label className="employee-tenure-search"><input type="search" data-smart-search aria-label="Search employee tenure report" placeholder="Search this report" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <button type="button" onClick={() => setAttempt(value => value + 1)}>Refresh</button>
      </div>
    </div>
    {data.loading || data.token !== token ? <p role="status">Loading employee records…</p> : data.error ? <p role="alert">{data.error} Use Refresh to retry.</p> : <>

      {view === 'excluded' && <label className="employee-tenure-reason">Exclusion reason <select aria-label="Exclusion reason" value={reason} onChange={event => setReason(event.target.value)}>
        <option value="">All reasons</option><option>Missing joining date</option><option>Invalid joining date</option>
      </select></label>}
      {view === 'included' && report.missingDates > 0 && <p role="status">{report.missingDates} active employee records excluded because their joining date is missing or invalid.</p>}
      {view === 'excluded' ? <ReportSection key="excluded" title={`Excluded Employees · ${formatDisplayDate(asOf)}${filterSummary ? ` · ${filterSummary}` : ''}${reason ? ` · ${reason}` : ''}`} headingControl={viewTabs} category="employee-tenure" query={search} showSearch={false} description="Active employees whose joining date is missing or invalid. Tenure cannot be calculated until the joining date is corrected in C-Dir Masters." columns={excludedColumns} rows={excludedRows} rowKey={(row, index) => row.empId || `${row.name}-${index}`} emptyMessage="No excluded employees match the selected filters." /> : <ReportSection title={`Employee Tenure Report · ${formatDisplayDate(asOf)} · ${minimum}+ months${filterSummary ? ` · ${filterSummary}` : ''}`} headingControl={viewTabs} category="employee-tenure" query={search} showSearch={false} description={`Counted through ${formatDisplayDate(asOf)}. Example: 3Y 2M 15D means 3 years, 2 months and 15 days. Roster: ${data.directory.meta?.generated || 'Employee master'}.`} columns={columns} rows={report.rows} rowKey={(row, index) => row.empId || `${row.name}-${index}`} emptyMessage="No currently working employees match the selected filters and tenure." />}
    </>}
  </section>;
}
