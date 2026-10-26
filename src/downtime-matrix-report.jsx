import React, {useMemo,useState} from 'react';
import {REGION_DATA} from '../region-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';
import {customBreakdownRange,downtimeToday,downtimeMatrixDetails,downtimeHoursMinutes} from './downtime-matrix.mjs';
import {parseRequestTimelineTimestamp} from '../request-timeline.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';
import './downtime-matrix-report.css';
import {downtimeMatrixExport} from './downtime-matrix-export.mjs';

export function ReportTimeSelect({label,value,onChange}) {
  const [rawHour='00',minute='00',second='00']=String(value||'00:00:00').split(':');
  const hour24=Number(rawHour),hour=String(hour24%12||12).padStart(2,'0'),period=hour24>=12?'PM':'AM';
  const boundary=hour==='12'&&minute==='00'&&second==='00';
  const options=count=>Array.from({length:count},(_,index)=>String(index).padStart(2,'0'));
  const update=(part,next)=>{
    const selected={hour,minute,second,period,[part]:next};
    const nextHour=Number(selected.hour)%12+(selected.period==='PM'?12:0);
    onChange(`${String(nextHour).padStart(2,'0')}:${selected.minute}:${selected.second}`);
  };
  return <span className="report-time-select" role="group" aria-label={label}>
    {[
      ['hour','Hour',hour,options(12).map((_,index)=>String(index+1).padStart(2,'0'))],
      ['minute','Min',minute,options(60)],
      ['second','Sec',second,options(60)],
      ['period','AM/PM',period,['AM','PM']],
    ].map(([part,caption,selected,choices])=><span className="report-time-part" key={part}>
      <small>{caption}</small>
      <select required aria-label={`${label} ${part}`} value={selected} onChange={event=>update(part,event.target.value)}>
        {choices.map(choice=><option key={choice} value={choice}>{part==='period'&&boundary?`${choice} (${choice==='AM'?'Midnight':'Noon'})`:choice}</option>)}
      </select>
    </span>)}
  </span>;
}

const hours = downtimeHoursMinutes;
const hour = value => value == null ? '—' : formatDisplayDateTime(value).replace('12:00:00 PM','12:00:00 Noon').replace('12:00:00 AM','12:00:00 Midnight');
const columns = [
  {key:'door',label:'Door number',value:r=>r.door},
  {key:'equipmentGroup',label:'Equipment group',value:r=>r.equipmentGroup || '—'},
  {key:'status',label:'Status',value:r=>r.status},
  {key:'start',label:'From date/time (IST)',value:r=>hour(r.start)},
  {key:'end',label:'To date/time (IST)',value:r=>hour(r.end)},
  {key:'reason',label:'Reason',wrap:true,value:r=>r.reason},
  {key:'eventHours',label:'Breakdown hours',value:r=>hours(r.eventHours)},
  {key:'available',label:'Available hours',value:r=>hours(r.available)},
];

export default function DowntimeMatrixReport({requests,equipment,ReportSection,onBack}) {
  const [draft,setDraft] = useState(()=>({fromDate:downtimeToday(),fromTime:'00:00',toDate:downtimeToday(),toTime:'23:59'}));
  const [period,setPeriod] = useState(draft);
  const [error,setError] = useState('');
  const from = `${period.fromDate}T${period.fromTime}`;
  const to = `${period.toDate}T${period.toTime}`;
  // The To minute is inclusive, matching other report date/time filters.
  const end = new Date(parseRequestTimelineTimestamp(to).getTime()+60000).toISOString();
  const rangeLabel = `${hour(from)} to ${hour(to)} IST`;
  const update = (key,value)=>setDraft(current=>({...current,[key]:value}));
  const apply = event => {
    event.preventDefault();
    const start=parseRequestTimelineTimestamp(`${draft.fromDate}T${draft.fromTime}`);
    const finish=parseRequestTimelineTimestamp(`${draft.toDate}T${draft.toTime}`);
    if (!start||!finish||finish<start||start.getTime()>Date.now()) {setError('Select a valid date/time range. From must not be after To or in the future.');return;}
    setError('');setPeriod({...draft});
  };
  const [site,setSite] = useState('');
  const [zone,setZone] = useState('all');
  const rows = useMemo(()=>customBreakdownRange(requests,equipment,from,end),[requests,equipment,from,end]);
  const sites = [...new Set([...equipment,...requests].map(row=>row.reportSite || row.site || row.currentLocation || row.location).filter(Boolean))].filter(name=>zone==='all'||REGION_DATA.find(region=>region.code===zone)?.sites.some(value=>canonicalSiteName(value)===canonicalSiteName(name))).sort();
  const selectedSite = sites.includes(site) ? site : sites[0] || '';
  const visible = rows.filter(row=>row.site===selectedSite);
  const details = downtimeMatrixDetails(visible);
  return <section className="reports-page panel pagepanel">
    <header><div><h1>Custom Breakdown Report</h1><p>Available hours = selected period hours − breakdown downtime. Each breakdown is shown separately.</p></div><button type="button" onClick={onBack}>Back to reports</button></header>
    <form className="downtime-period-filters" onSubmit={apply}>
      <label>Zone<select value={zone} onChange={event=>{setZone(event.target.value);setSite('');}}><option value="all">All zones</option>{REGION_DATA.map(region=><option key={region.code} value={region.code}>{region.code} — {region.name}</option>)}</select></label>
      <label>Site<select value={selectedSite} onChange={event=>setSite(event.target.value)}>{sites.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
      <label>From date (IST)<input required type="date" value={draft.fromDate} max={downtimeToday()} onChange={event=>update('fromDate',event.target.value)} /></label>
      <label>From time<ReportTimeSelect label="From time" value={draft.fromTime} onChange={value=>update('fromTime',value)} /></label>
      <label>To date (IST)<input required type="date" value={draft.toDate} onChange={event=>update('toDate',event.target.value)} /></label>
      <label>To time<ReportTimeSelect label="To time" value={draft.toTime} onChange={value=>update('toTime',value)} /></label>
      <button type="submit" className="primary">Apply</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <div className="downtime-site-tabs" role="group" aria-label="Downtime matrix site">
      {sites.map(value=><button type="button" key={value} aria-pressed={selectedSite===value} onClick={()=>setSite(value)}><span>{value}</span></button>)}
    </div>
    <p>Only breakdowns that started within the selected period are shown, including the To minute. Earlier breakdowns are excluded even if still ongoing or closed during this period. Durations are clipped to the selected period. Overlaps count once in available hours. Available hours repeat for each breakdown of the same machine and are provisional when the period includes future time.</p>
    <ReportSection title="Custom Breakdown Report" exportTransform={view=>downtimeMatrixExport(view,{site:selectedSite,rangeLabel})} description={`${rangeLabel} · ${selectedSite || 'No sites'} · ${visible.length} machines with breakdowns · One row per breakdown`} rows={details} columns={columns} rowKey={r=>r.key} emptyMessage="No breakdowns for the selected period and site." />
  </section>;
}
