import React, {useMemo,useState} from 'react';
import {downtimeMatrixRange,downtimeToday,downtimeMatrixDetails,downtimeHoursMinutes} from './downtime-matrix.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';
import './downtime-matrix-report.css';

const hours = downtimeHoursMinutes;
const hour = value => value == null ? '—' : formatDisplayDateTime(value);
const columns = [
  {key:'door',label:'Door number',value:r=>r.door},
  {key:'status',label:'Status',value:r=>r.status},
  {key:'start',label:'From date and time (IST)',value:r=>hour(r.start)},
  {key:'end',label:'To date and time (IST)',value:r=>hour(r.end)},
  {key:'equipmentGroup',label:'Equipment group',value:r=>r.equipmentGroup || '—'},
  {key:'reason',label:'Reason',wrap:true,value:r=>r.reason},
  {key:'eventHours',label:'Breakdown hours',value:r=>hours(r.eventHours)},
  {key:'available',label:'Available hours',value:r=>hours(r.available)},
];

export default function DowntimeMatrixReport({requests,equipment,ReportSection,onBack}) {
  const [from,setFrom] = useState(()=>`${downtimeToday()}T00:00`);
  const [to,setTo] = useState(()=>`${downtimeToday(Date.now()+86400000)}T00:00`);
  const [group,setGroup] = useState('');
  const [site,setSite] = useState('');
  const validRange = Boolean(from && to && to>from && from<=`${downtimeToday()}T23:59`);
  const rows = useMemo(()=>validRange ? downtimeMatrixRange(requests,equipment,from,to) : [],[requests,equipment,from,to,validRange]);
  const sites = [...new Set(rows.map(row=>row.site))].sort();
  const selectedSite = sites.includes(site) ? site : sites[0] || '';
  const groups = [...new Set(rows.filter(row=>row.site===selectedSite).map(row=>row.equipmentGroup).filter(Boolean))].sort();
  const visible = rows.filter(row=>row.site===selectedSite && (!group || row.equipmentGroup===group));
  const details = downtimeMatrixDetails(visible);
  const rangeLabel = validRange ? `${hour(from)} to ${hour(to)} IST` : 'Invalid date/time range';
  const exportTitle = `Downtime Matrix Report · ${rangeLabel} · ${selectedSite || 'No sites'} · ${group || 'All equipment groups'}`;
  return <section className="reports-page panel pagepanel">
    <header><div><h1>Downtime Matrix Report</h1><p>Available hours = selected period hours − breakdown downtime. Each breakdown is shown separately.</p></div><button type="button" onClick={onBack}>Back to reports</button></header>
    <div className="downtime-range-filters">
      <label>From date and time (IST)<input type="datetime-local" value={from} onChange={event=>setFrom(event.target.value)} /></label>
      <label>To date and time (IST)<input type="datetime-local" value={to} onChange={event=>setTo(event.target.value)} /></label>
      <label>Equipment group<select value={group} onChange={event=>setGroup(event.target.value)}><option value="">All equipment groups</option>{[...new Set([...groups,...(group?[group]:[])])].map(value=><option key={value}>{value}</option>)}</select></label>
    </div>
    {!validRange && <p role="alert">Select a valid From and To date/time range, with From before To.</p>}
    <div className="downtime-site-tabs" role="group" aria-label="Downtime matrix site">
      {sites.map(value=><button type="button" key={value} aria-pressed={selectedSite===value} onClick={()=>setSite(value)}><span>{value}</span></button>)}
    </div>
    <p>Breakdown times are clipped to the selected period. Overlaps count once in available hours. Available hours repeat for each breakdown of the same machine and are provisional when the period includes future time.</p>
    <ReportSection title={exportTitle} key={exportTitle} description={`${visible.length} machines with breakdowns · One row per breakdown`} rows={details} columns={columns} rowKey={r=>r.key} emptyMessage="No breakdowns for the selected period, site and equipment group." />
  </section>;
}
