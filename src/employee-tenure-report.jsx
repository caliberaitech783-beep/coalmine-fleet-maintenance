import React, {useEffect, useMemo, useState} from 'react';
import DateInput from './date-input.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import {TENURE_MONTHS, buildEmployeeTenureReport} from './employee-tenure.mjs';

const columns = [
  {key: 'empId', label: 'Employee ID', value: row => row.empId},
  {key: 'name', label: 'Employee name', value: row => row.name},
  {key: 'department', label: 'Department', value: row => row.department},
  {key: 'designation', label: 'Designation', value: row => row.designation},
  {key: 'joiningDate', label: 'Joining date', value: row => formatDisplayDate(row.joiningDate)},
  {key: 'tenure', label: 'Working tenure', value: row => row.label, sortValue: row => row.months * 32 + row.days},
];

export default function EmployeeTenureReport({token, ReportSection}) {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const [asOf, setAsOf] = useState(today);
  const [minimum, setMinimum] = useState(3);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState({token: '', loading: true, error: '', directory: null});
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
  const report = useMemo(() => buildEmployeeTenureReport(data.token === token ? data.directory : null, asOf, minimum), [data, token, asOf, minimum]);
  return <section className="reports-workspace">
    <h1>Employee Tenure Report</h1>
    <p>Currently working employees only. Service is counted from joining date through the selected date, in completed years, months and remaining days. Employees with less than three months of service and employees who have left are excluded.</p>
    <div style={{display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end', marginBottom: 16}}>
      <label>Counted through <DateInput aria-label="Employee tenure counted through" value={asOf} max={today} onChange={event => {if (event.target.value && event.target.value <= today) setAsOf(event.target.value);}} /></label>
      <label>Minimum completed service <select aria-label="Minimum completed service" value={minimum} onChange={event => setMinimum(Number(event.target.value))}>{TENURE_MONTHS.map(months => <option value={months} key={months}>{months}+ months</option>)}</select></label>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Refresh</button>
    </div>
    {data.loading || data.token !== token ? <p role="status">Loading employee records…</p> : data.error ? <p role="alert">{data.error} Use Refresh to retry.</p> : <>
      {report.missingDates > 0 && <p role="status">{report.missingDates} active employee records excluded because their joining date is missing or invalid.</p>}
      <ReportSection title={`Employee Tenure Report · ${formatDisplayDate(asOf)} · ${minimum}+ months`} category="employee-tenure" description={`Counted through ${formatDisplayDate(asOf)}. Example: 3Y 2M 15D means 3 years, 2 months and 15 days. Roster: ${data.directory.meta?.generated || 'Employee master'}.`} columns={columns} rows={report.rows} rowKey={(row, index) => row.empId || `${row.name}-${index}`} emptyMessage="No currently working employees meet the selected tenure." />
    </>}
  </section>;
}
