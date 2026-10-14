import React, {useMemo,useState} from 'react';
import {downtimeMatrix,downtimeToday,downtimeMatrixDetails} from './downtime-matrix.mjs';
import './downtime-matrix-report.css';

const hours = value => `${Number(value.toFixed(2))} h`;
const hour = value => value == null ? '—' : new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true}).format(value);
const columns = [
  {key:'door',label:'Door number',value:r=>r.door},
  {key:'equipmentGroup',label:'Equipment group',value:r=>r.equipmentGroup || '—'},
  {key:'count',label:'Breakdowns',value:r=>r.count},
  {key:'occurrence',label:'Breakdown number',value:r=>r.occurrence},
  {key:'start',label:'From hour (IST)',value:r=>hour(r.start)},
  {key:'end',label:'To hour (IST)',value:r=>hour(r.end)},
  {key:'reason',label:'Reason',wrap:true,value:r=>r.reason},
  {key:'eventHours',label:'Breakdown hours',value:r=>hours(r.eventHours)},
  {key:'downtime',label:'Daily downtime',value:r=>hours(r.downtime)},
  {key:'available',label:'Available hours',value:r=>hours(r.available)},
];

export default function DowntimeMatrixReport({requests,equipment,ReportSection,onBack}) {
  const [date,setDate] = useState(()=>downtimeToday());
  const [site,setSite] = useState('');
  const rows = useMemo(()=>downtimeMatrix(requests,equipment,date),[requests,equipment,date]);
  const sites = [...new Set(rows.map(row=>row.site))].sort();
  const selectedSite = sites.includes(site) ? site : sites[0] || '';
  const visible = rows.filter(row=>row.site===selectedSite);
  const details = downtimeMatrixDetails(visible);
  return <section className="reports-page panel pagepanel">
    <header><div><h1>Downtime Matrix Report</h1><p>Daily availability = 24 hours − breakdown downtime. Each breakdown is shown separately.</p></div><button type="button" onClick={onBack}>Back to reports</button></header>
    <label>Day (IST)<input type="date" value={date} max={downtimeToday()} onChange={event=>setDate(event.target.value)} /></label>
    <div className="downtime-site-tabs" role="group" aria-label="Downtime matrix site">
      {sites.map(value=><button type="button" key={value} aria-pressed={selectedSite===value} onClick={()=>setSite(value)}><span>{value}</span></button>)}
    </div>
    <p>Breakdowns spanning midnight are split at the day boundary. Overlaps count once in daily downtime. Daily totals repeat for each breakdown of the same machine; today's available hours are provisional. To hour at midnight is 12:00 AM on the following day.</p>
    <ReportSection title="Downtime Matrix Report" description={`${date} · ${selectedSite || 'No sites'} · ${visible.length} machines with breakdowns · One row per breakdown`} rows={details} columns={columns} rowKey={r=>r.key} emptyMessage="No breakdowns for the selected day and site." />
  </section>;
}
