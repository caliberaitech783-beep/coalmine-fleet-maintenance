import React,{useState} from 'react';
import {REGION_DATA} from '../region-scope.mjs';

export default function HourlyBreakdownPreview({session}) {
  const [report,setReport]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [period,setPeriod]=useState('two-hour');
  const [zone,setZone]=useState('all'),[site,setSite]=useState('all');
  const availableSites=REGION_DATA.filter(region=>zone==='all'||region.code===zone).flatMap(region=>region.sites);
  const [sending,setSending]=useState(false),[delivery,setDelivery]=useState('');
  if(session?.role!=='super'||!['Admin','Super Admin'].includes(session.permissions?.adminLevel))return null;
  const load=async()=>{
    setLoading(true);setError('');
    try{
      const response=await fetch(`/api/reports/hourly-breakdown-preview?site=all&period=${period}`,{cache:'no-store',headers:{Authorization:`Bearer ${session.token}`}});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load the site report.');setReport(site==='all'?{...data,sites:data.sites.filter(item=>availableSites.includes(item.site))}:data.sites.find(item=>item.site===site));
    }catch(error){setError(error.message);}finally{setLoading(false);}
  };
  const send=async site=>{
    setSending(true);setDelivery('');setError('');
    try{
      const response=await fetch('/api/reports/hourly-breakdown-preview/telegram',{method:'POST',headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},body:JSON.stringify({site,period})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Telegram delivery failed.');
      setDelivery(`Sent ${data.site} BD report to your linked Telegram account. ${data.period}`);
    }catch(error){setError(error.message);}finally{setSending(false);}
  };
  return <section className="panel" aria-label="Hourly breakdown manual preview" style={{padding:20,marginBottom:20}}>
    <h2>Hourly Breakdown Report - manual preview</h2><p>Preview reports or send a fresh report to your linked private Telegram account.</p>
    <label>Zone <select aria-label="Report zone" value={zone} disabled={loading} onChange={event=>{setZone(event.target.value);setSite('all');setReport(null);}}><option value="all">All zones</option>{REGION_DATA.map(region=><option key={region.code} value={region.code}>{region.code} — {region.name}</option>)}</select></label>{' '}<label>Site <select aria-label="Report site" value={site} disabled={loading} onChange={event=>{setSite(event.target.value);setReport(null);}}><option value="all">All sites</option>{availableSites.map(name=><option key={name} value={name}>{name}</option>)}</select></label>{' '}<label>Report period <select aria-label="Consolidated BD report period" value={period} disabled={loading} onChange={event=>{setPeriod(event.target.value);setReport(null);}}><option value="two-hour">Latest 2 hours</option><option value="today">Today (IST)</option></select></label>{' '}
    <button type="button" disabled={loading} onClick={load}>{loading?'Loading report...':'Preview Hourly Breakdown Report'}</button>
    {error&&<p role="alert">{error}</p>}
    {delivery&&<p role="status">{delivery}</p>}
    {report?.sites&&<h3>All sites · Consolidated BD report</h3>}
    {(report?.sites||(report?[report]:[])).map(report=><div key={report.site} aria-label={`${report.site} hourly report`}><h3>{report.site}</h3><p>{report.period}</p><button type="button" onClick={()=>downloadReport(report)}>Download {report.site} CSV</button>{' '}<button type="button" disabled={sending||loading} onClick={()=>send(report.site)}>{sending?'Sending...':`Send ${report.site} to my Telegram`}</button>
      <dl style={{display:'flex',flexWrap:'wrap',gap:24}}>{Object.entries(report.counts).map(([label,value])=><div key={label}><dt>{label}</dt><dd style={{fontSize:24,fontWeight:700}}>{value}</dd></div>)}</dl>
      <div style={{overflowX:'auto'}}><table><thead><tr>{report.columns.map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{report.rows.map((row,index)=><tr key={index}>{row.map((value,i)=><td key={i} style={{whiteSpace:'pre-wrap',minWidth:i===4||i===5?200:90}}>{value}</td>)}</tr>)}</tbody></table></div>
      {!report.rows.length&&<p>No qualifying breakdown or idle records in this window.</p>}
    </div>)}
  </section>;
}

function downloadReport(report) {
  const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['Hourly Breakdown Report',report.site],['Period (IST)',report.period],...Object.entries(report.counts),[],report.columns,...report.rows];
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  const day=new Date(new Date(report.end).getTime()+330*60000).toISOString().slice(0,10);
  link.href=url;link.download=`hourly-breakdown-${report.site.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${day}.csv`;
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
