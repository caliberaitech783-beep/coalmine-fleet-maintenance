import React,{useState} from 'react';

export default function HourlyBreakdownPreview({session}) {
  const [report,setReport]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [period,setPeriod]=useState('two-hour');
  if(session?.role!=='super'||!['Admin','Super Admin'].includes(session.permissions?.adminLevel))return null;
  const load=async(site='all')=>{
    setLoading(true);setError('');
    try{
      const response=await fetch(`/api/reports/hourly-breakdown-preview?site=${site}&period=${period}`,{cache:'no-store',headers:{Authorization:`Bearer ${session.token}`}});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load the site report.');setReport(data);
    }catch(error){setError(error.message);}finally{setLoading(false);}
  };
  return <section className="panel" aria-label="Hourly breakdown manual preview" style={{padding:20,marginBottom:20}}>
    <h2>Hourly Breakdown Report - manual preview</h2><p>Review only. This does not send messages or enable a schedule.</p>
    <label>Report period <select aria-label="Consolidated BD report period" value={period} disabled={loading} onChange={event=>{setPeriod(event.target.value);setReport(null);}}><option value="two-hour">Latest 2 hours</option><option value="today">Today (IST)</option></select></label>{' '}
    <button type="button" disabled={loading} onClick={()=>load('all')}>{loading?'Loading report...':`Preview all sites - ${period==='today'?'today':'latest 2 hours'}`}</button>{' '}
    <button type="button" disabled={loading} onClick={()=>load('sasti')}>Preview Sasti OC - {period==='today'?'today':'latest 2 hours'}</button>
    {error&&<p role="alert">{error}</p>}
    {report?.sites&&<h3>All sites · Consolidated BD report</h3>}
    {(report?.sites||(report?[report]:[])).map(report=><div key={report.site} aria-label={`${report.site} hourly report`}><h3>{report.site}</h3><p>{report.period}</p><button type="button" onClick={()=>downloadReport(report)}>Download {report.site} CSV</button>
      <dl style={{display:'flex',flexWrap:'wrap',gap:24}}>{Object.entries(report.counts).map(([label,value])=><div key={label}><dt>{label}</dt><dd style={{fontSize:24,fontWeight:700}}>{value}</dd></div>)}</dl>
      <div style={{overflowX:'auto'}}><table><thead><tr>{report.columns.map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{report.rows.map((row,index)=><tr key={index}>{row.map((value,i)=><td key={i} style={{whiteSpace:'pre-wrap',minWidth:i===4||i===5?200:90}}>{value}</td>)}</tr>)}</tbody></table></div>
      {!report.rows.length&&<p>No qualifying breakdown or idle records in this window.</p>}
    </div>)}
  </section>;
}

function downloadReport(report) {
  const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['Consolidated BD report',report.site],['Period (IST)',report.period],...Object.entries(report.counts),[],report.columns,...report.rows];
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  const day=new Date(new Date(report.end).getTime()+330*60000).toISOString().slice(0,10);
  link.href=url;link.download=`consolidated-bd-${report.site.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${day}.csv`;
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
