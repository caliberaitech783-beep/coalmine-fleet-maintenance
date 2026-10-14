import React, {useMemo,useState} from 'react';
import {downtimeMatrix,downtimeToday} from './downtime-matrix.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';

const hours = value => `${Number(value.toFixed(2))} h`;
const summaryColumns = [
  {key:'site',label:'Site',value:r=>r.site}, {key:'door',label:'Door number',value:r=>r.door},
  {key:'count',label:'Breakdowns',value:r=>r.events.length},
  {key:'downtime',label:'Downtime',value:r=>hours(r.downtime)},
  {key:'available',label:'Available hours',value:r=>hours(r.available)},
];
const eventColumns = [
  ...summaryColumns.slice(0,2), {key:'occurrence',label:'Breakdown number',value:r=>r.occurrence},
  {key:'ref',label:'Request',value:r=>r.ref},
  {key:'start',label:'From (IST)',value:r=>formatDisplayDateTime(new Date(r.start).toISOString())},
  {key:'end',label:'To (IST)',value:r=>formatDisplayDateTime(new Date(r.end).toISOString())},
  {key:'hours',label:'Downtime in selected day',value:r=>hours(r.hours)},
  {key:'reason',label:'Reason',wrap:true,value:r=>r.reason}, {key:'status',label:'Status',value:r=>r.open?'Ongoing':'Closed'},
];

export default function DowntimeMatrixReport({requests,equipment,ReportSection,onBack}) {
  const [date,setDate] = useState(()=>downtimeToday());
  const [site,setSite] = useState('');
  const rows = useMemo(()=>downtimeMatrix(requests,equipment,date),[requests,equipment,date]);
  const visible = rows.filter(row=>!site||row.site===site);
  const events = visible.flatMap(row=>row.events.map((event,index)=>({...event,site:row.site,door:row.door,occurrence:index+1,key:`${row.key}:${index}`})));
  return <section className="reports-page panel pagepanel">
    <header><div><h1>Downtime Matrix Report</h1><p>Daily availability = 24 hours − breakdown downtime. Each breakdown is shown separately.</p></div><button type="button" onClick={onBack}>Back to reports</button></header>
    <div className="reports-header-actions"><label>Day (IST)<input type="date" value={date} max={downtimeToday()} onChange={event=>setDate(event.target.value)} /></label><label>Site<select value={site} onChange={event=>setSite(event.target.value)}><option value="">All sites</option>{[...new Set(rows.map(row=>row.site))].sort().map(value=><option key={value}>{value}</option>)}</select></label></div>
    <p>Breakdowns spanning midnight are split at the day boundary. Overlapping breakdowns count once in daily downtime. Ongoing breakdowns count up to report generation; today's available hours are provisional.</p>
    <ReportSection title="Downtime Matrix Report" description={`${date} · ${site||'All sites'} · Daily machine totals`} rows={visible} columns={summaryColumns} rowKey={r=>r.key} emptyMessage="No equipment or breakdowns for the selected day and site." />
    <ReportSection title="Individual breakdowns" description={`${date} · ${site||'All sites'} · Separate breakdown occurrences`} rows={events} columns={eventColumns} rowKey={r=>r.key} emptyMessage="No breakdowns for the selected day and site." />
  </section>;
}
