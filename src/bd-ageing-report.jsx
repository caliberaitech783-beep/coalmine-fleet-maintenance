import React, {useEffect, useState} from 'react';
import {canViewBdAgeingReport} from '../bd-ageing-report.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';
import {bdAgeingView} from './bd-ageing-filters.mjs';
import './bd-ageing-report.css';

const columns = [
  {key:'ref',label:'Request',value:row=>row.ref},
  {key:'region',label:'Region',value:row=>row.region},
  {key:'site',label:'Site',value:row=>row.site},
  {key:'door',label:'Door number',value:row=>row.door},
  {key:'equipmentGroup',label:'Equipment group',value:row=>row.equipmentGroup},
  {key:'status',label:'Status',value:row=>row.status},
  {key:'start',label:'Breakdown started (IST)',value:row=>formatDisplayDateTime(row.start)},
  {key:'age',label:'BD age',value:row=>row.age},
  {key:'ageingGroup',label:'Ageing group',value:row=>row.ageingGroup},
  {key:'complaint',label:'Reason of BD',value:row=>row.complaint},
];

export default function BdAgeingReport({session, ReportSection, onBack}) {
  const allowed = canViewBdAgeingReport(session);
  const [data,setData] = useState(null);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [refresh,setRefresh] = useState(0);
  const [ageing,setAgeing] = useState('all');
  const [region,setRegion] = useState('all');
  const [site,setSite] = useState('all');
  const view = bdAgeingView(data?.groups || [],{ageing,region,site});
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    (async () => {
      try {
        const response = await fetch('/api/reports/bd-ageing', {headers:{Authorization:`Bearer ${session.token}`},cache:'no-store',signal:controller.signal});
        if (!response.ok) throw new Error(response.status === 403 ? 'You do not have access to BD Ageing Report.' : 'Could not load BD Ageing Report. Please retry.');
        const result = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  },[allowed,session?.token,refresh]);
  if (!allowed) return <section className="panel"><h1>Access denied</h1><p>You do not have access to BD Ageing Report.</p></section>;
  return <section className="reports-page panel pagepanel">
    <header><div><h1>BD Ageing Report</h1><p>Currently open breakdowns · elapsed time from breakdown start · under 2 days excluded.</p></div>
      <div className="reports-header-actions"><button type="button" onClick={onBack}>Back to reports</button><button type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>{loading?'Loading…':'Refresh'}</button></div>
    </header>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Loading open breakdowns…</p>}
    {data && <><p>{view.rows.length} of {data.total} requests · {data.scope?.label || 'Assigned sites'} · Updated {formatDisplayDateTime(data.generatedAt)} IST</p>
      <div className="bd-ageing-filters">
        <label>Region<select aria-label="BD ageing region" value={region} onChange={event=>{setRegion(event.target.value);setSite('all');}}><option value="all">All regions</option>{[...new Set([...view.regions,...(region==='all'?[]:[region])])].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <label>Site<select aria-label="BD ageing site" value={site} onChange={event=>setSite(event.target.value)}><option value="all">All sites</option>{view.sites.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}{site!=='all'&&!view.sites.some(item=>item.key===site)&&<option value={site}>{site} (no current requests)</option>}</select></label>
        <button type="button" disabled={ageing==='all'&&region==='all'&&site==='all'} onClick={()=>{setAgeing('all');setRegion('all');setSite('all');}}>Reset filters</button>
      </div>
      <div className="bd-ageing-tabs" role="tablist" aria-label="Breakdown ageing" onKeyDown={event=>{
        const direction=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
        if(!direction&&event.key!=='Home'&&event.key!=='End')return;
        event.preventDefault();
        const index=view.tabs.findIndex(tab=>tab.id===ageing);
        const next=event.key==='Home'?0:event.key==='End'?view.tabs.length-1:(index+direction+view.tabs.length)%view.tabs.length;
        setAgeing(view.tabs[next].id);event.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus();
      }}>{view.tabs.map(tab=><button key={tab.id} id={`bd-ageing-tab-${tab.id}`} type="button" role="tab" aria-selected={ageing===tab.id} aria-controls="bd-ageing-results" tabIndex={ageing===tab.id?0:-1} className={ageing===tab.id?'active':''} onClick={()=>setAgeing(tab.id)}>{tab.label} <span>{tab.count}</span></button>)}</div>
      <div id="bd-ageing-results" role="tabpanel" aria-labelledby={`bd-ageing-tab-${ageing}`}>
        <ReportSection title="BD Ageing Report" description={`${view.tabs.find(tab=>tab.id===ageing)?.label} · ${region==='all'?'All regions':region} · ${site==='all'?'All sites':view.sites.find(item=>item.key===site)?.label||site} · ${view.rows.length} requests`} rows={view.rows} columns={columns} rowKey={row=>row.ref} emptyMessage="No open breakdowns match the selected ageing, region and site." />
      </div>
    </>}
  </section>;
}
