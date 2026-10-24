import React,{useEffect,useMemo,useState} from 'react';
import {watchRequestRefresh} from './request-refresh.mjs';
import {recordBelongsToSite} from '../site-location.mjs';
import {REGION_DATA} from '../region-scope.mjs';
import {LMV_DETAIL_COLUMNS,LMV_SUMMARY_COLUMNS,lmvCounts,lmvRowsForMode,lmvSiteSummary,lmvSummaryRows} from '../lmv-fleet.mjs';
import FleetSiteBars from './fleet-site-bars.jsx';

export function useLmvFleet(token) {
  const [state,setState]=useState({token,records:[],scope:null,loaded:false,error:'',generatedAt:''});
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true,controller;
    setState(previous=>previous.token===token?previous:{token,records:[],scope:null,loaded:false,error:'',generatedAt:''});
    const load=async()=>{
      controller?.abort();controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),15000);
      try {
        const response=await fetch('/api/lmv-fleet',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
        const data=await response.json();
        if(!response.ok)throw Object.assign(new Error(data.error||'Could not load LMV fleet.'),{status:response.status});
        if(!Array.isArray(data.records)||!data.scope)throw new Error('Invalid LMV fleet response.');
        if(active)setState({token,...data,loaded:true,error:''});
      }catch(error){if(active)setState(previous=>[401,403].includes(error.status)?{token,records:[],scope:null,loaded:false,error:error.message}:({...previous,error:error.name==='AbortError'?'LMV loading timed out. Retry.':error.message}));}
      finally{clearTimeout(timeout);}
    };
    const stop=watchRequestRefresh(load,{win:window,doc:document,initial:true});
    return ()=>{active=false;stop();controller?.abort();};
  },[token,attempt]);
  return {...(state.token===token?state:{records:[],scope:null,loaded:false,error:''}),retry:()=>setAttempt(value=>value+1)};
}

export const LMV_MODES=[['total','Total LMV','total'],['balance','BD Balance','balance'],['oem','OEM BD','oem'],['breakdown','Breakdown','breakdown']];
export function LmvFleetControls({records,mode,onMode,onInspect,loaded,error,retry,onReports}) {
  const counts=lmvCounts(records);
  return <div className="lmv-fleet-controls">
    <div className="mine-fleet-chart-toggle" role="group" aria-label="Other vehicles LMV chart view" title={counts.demo>0 ? `${counts.demo} labelled demo LMVs · sample statuses` : 'Other vehicles / LMV'}>
      {LMV_MODES.map(([key,label,count])=><div key={key} className={`mine-fleet-view-option ${mode===key?'active':''}`}><button type="button" disabled={!loaded} aria-pressed={mode===key} onClick={()=>onMode(key)}>{label}</button><button type="button" disabled={!loaded} className="mine-fleet-toggle-count" aria-label={`View ${label} LMV records`} onClick={()=>onInspect({mode:key})}>{loaded?counts[count]:'—'}</button></div>)}
    </div>
    <div className="lmv-fleet-tools"><button type="button" className="secondary" onClick={()=>onMode('')} aria-pressed={!mode}>All fleet bars</button>
    <button type="button" className="secondary" disabled={!loaded} onClick={onReports}>LMV reports</button></div>
    {error&&<span role="alert">{error} <button type="button" onClick={retry}>Retry</button></span>}
  </div>;
}

const modeLabel=mode=>LMV_MODES.find(([key])=>key===mode)?.[1]||({onroad:'On road',idle:'Idle',unknown:'Needs review'}[mode])||'Total LMV';
export function LmvFleetView({records,regions,mode,onInspect,ExportMenu,stale=false}) {
  const summary=lmvSiteSummary(records,regions);
  const max=Math.max(5,...summary.flatMap(region=>region.sites.map(site=>site.total)));
  const summaryRows=lmvSummaryRows(records,regions);
  return <section className="lmv-fleet-view" aria-label={`Other vehicles / LMV · ${modeLabel(mode)}`}>
    <div className="lmv-view-heading"><strong>{modeLabel(mode)} · Other vehicles</strong><span>Current status{stale?' · Last checked data':''}</span><ExportMenu title={`LMV ${modeLabel(mode)} · Current status${stale?' · Last checked data':''}`} columns={LMV_DETAIL_COLUMNS} rows={lmvRowsForMode(records,mode)} /></div>
    <div className="lmv-site-chart">
      {summary.map(region=><section className="lmv-region" key={region.code} aria-label={`${region.code} LMV sites`}>
        <div className="lmv-sites">{region.sites.map(site=>{
          const siteRecords=records.filter(record=>recordBelongsToSite(record,site.name));
          const plotted=mode==='balance'?site.balance:mode==='oem'?site.oem:site.breakdown;
          return <div className="lmv-site" key={site.name}>
            <button type="button" className="lmv-bars-trigger" onClick={()=>onInspect({site:site.name,mode})} aria-label={`${site.name}: ${site.total} total LMV, ${site.breakdown} LMV BD, ${site.bdPercent.toFixed(1)} percent breakdown`}>
              {mode==='oem'?<div className="lmv-oem-bars">{[...new Set(siteRecords.map(record=>record.make||'Unspecified'))].map((make,index)=>{
                const count=lmvRowsForMode(siteRecords,'oem').filter(record=>(record.make||'Unspecified')===make).length;
                return <span key={make} className="lmv-oem-column" title={`${make}: ${count} OEM breakdowns`}><i style={{height:`${count/max*100}%`,background:`hsl(${170+index*9} 65% ${34+index*3}%)`}}><b>{count}</b></i><small>{make}</small></span>;
              })}</div>:<FleetSiteBars site={{otherVehicles:site.total,breakdown:{otherVehicles:plotted}}} columns={[["otherVehicles","Other vehicles / LMV"]]} axisMax={max} showBreakdown={mode!=='total'} />}
            </button>
            <b>{site.name}</b>
            <button type="button" onClick={()=>onInspect({site:site.name,mode:'breakdown'})}>LMV BD {site.breakdown}</button>
            <button type="button" onClick={()=>onInspect({site:site.name,mode:'total'})}>Total LMV {site.total}</button>
            <button type="button" className="lmv-bd-percent" onClick={()=>onInspect({site:site.name,mode:'breakdown'})}>LMV BD (%) {site.bdPercent.toFixed(1)}</button>
            <button type="button" onClick={()=>onInspect({site:site.name,mode:'onroad'})}>On road {site.onroad}</button>
            <button type="button" onClick={()=>onInspect({site:site.name,mode:'idle'})}>Idle {site.idle}</button>
          </div>;
        })}</div>
        <footer><b>{region.code}</b> · Total LMV {summaryRows.find(row=>row.name===`${region.code} total`)?.total||0} · LMV BD {summaryRows.find(row=>row.name===`${region.code} total`)?.breakdown||0}</footer>
      </section>)}
    </div>
  </section>;
}

export function LmvFleetDialog({selection,records,regions,close,Dialog,ReportSection}) {
  if(!selection)return null;
  const scoped=selection.site?records.filter(record=>recordBelongsToSite(record,selection.site)):records;
  return <Dialog title={`${selection.site||'All selected sites'} · LMV ${selection.reports?'reports':modeLabel(selection.mode)}`} close={close}>
    <LmvReports records={scoped} regions={selection.site?regions.map(region=>({...region,sites:region.sites.filter(site=>(typeof site==='string'?site:site.name)===selection.site)})).filter(region=>region.sites.length):regions} ReportSection={ReportSection} initialMode={selection.mode||'total'} initialSummary={selection.reports} />
  </Dialog>;
}

export function LmvReports({records,regions=REGION_DATA,ReportSection,initialMode='total',initialSummary=false}) {
  const [mode,setMode]=useState(initialSummary?'summary':initialMode);
  const [source,setSource]=useState('all');
  const filtered=records.filter(record=>source==='all'||(source==='demo'?record.demo===true:record.demo!==true));
  const counts=lmvCounts(filtered);
  const reportTabs=[['summary','Site-wise summary'],['total','LMV total'],['breakdown','LMV BD'],['balance','LMV BD Balance'],['oem','LMV OEM BD'],['onroad','LMV on road'],['idle','LMV idle'],['unknown','LMV needs review']];
  return <div className="lmv-reports">
    <p>Current LMV status across the selected sites. BD Balance = LMV BD − LMV OEM BD. LMV BD % = LMV BD ÷ Total LMV × 100.</p>
    {counts.demo>0&&<p className="lmv-demo-notice">Includes {counts.demo} clearly labelled DEMO vehicles with sample statuses. No maintenance cases were created for these samples.</p>}
    <div className="lmv-report-controls"><label>Data source<select value={source} onChange={event=>setSource(event.target.value)}><option value="all">All LMVs (including demos)</option><option value="live">Live LMVs only</option><option value="demo">Demo LMVs only</option></select></label></div>
    <div className="tabs" role="group" aria-label="LMV report type">{reportTabs.map(([key,label])=><button type="button" key={key} className={mode===key?'active':''} aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}</div>
    <ReportSection key={mode} title={reportTabs.find(([key])=>key===mode)?.[1]||'LMV report'} description="Current snapshot · labelled demos can be excluded using Data source" columns={mode==='summary'?LMV_SUMMARY_COLUMNS:LMV_DETAIL_COLUMNS} rows={mode==='summary'?lmvSummaryRows(filtered,regions):lmvRowsForMode(filtered,mode)} emptyMessage="No matching LMV records" rowKey={(row,index)=>row.id||`${row.region}-${row.name}-${index}`} />
  </div>;
}

export function LmvReportsPage({token,ReportSection,onBack}) {
  const data=useLmvFleet(token);
  const [site,setSite]=useState('all');
  const allowedRegions=useMemo(()=>REGION_DATA.map(region=>({...region,sites:region.sites.filter(name=>!data.scope?.restrictToScope||data.scope.allowedSites?.some(allowed=>recordBelongsToSite({site:allowed},name)))})).filter(region=>region.sites.length),[data.scope]);
  const sites=allowedRegions.flatMap(region=>region.sites);
  const regions=allowedRegions.map(region=>({...region,sites:region.sites.filter(name=>site==='all'||site===name)})).filter(region=>region.sites.length);
  const records=data.records.filter(record=>site==='all'||recordBelongsToSite(record,site));
  return <section className="panel pagepanel"><header><h1>Other vehicles / LMV reports</h1><button type="button" className="secondary" onClick={onBack}>Back to reports</button><button type="button" className="secondary" onClick={data.retry}>Refresh</button></header>
    <label>Site<select value={site} onChange={event=>setSite(event.target.value)}><option value="all">All assigned sites</option>{sites.map(name=><option key={name}>{name}</option>)}</select></label>
    {data.error&&<p role="alert">{data.error}</p>}
    {data.loaded?<LmvReports records={records} regions={regions} ReportSection={ReportSection} initialSummary />:<p role="status">Loading LMV reports…</p>}
  </section>;
}
