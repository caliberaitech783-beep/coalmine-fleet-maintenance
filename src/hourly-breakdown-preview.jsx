import React,{useState} from 'react';

export default function HourlyBreakdownPreview({session}) {
  const [report,setReport]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  if(session?.role!=='super'||!['Admin','Super Admin'].includes(session.permissions?.adminLevel))return null;
  const load=async(site='all')=>{
    setLoading(true);setError('');
    try{
      const response=await fetch(`/api/reports/hourly-breakdown-preview${site==='all'?'?site=all':''}`,{cache:'no-store',headers:{Authorization:`Bearer ${session.token}`}});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load the site report.');setReport(data);
    }catch(error){setError(error.message);}finally{setLoading(false);}
  };
  return <section className="panel" aria-label="Hourly breakdown manual preview" style={{padding:20,marginBottom:20}}>
    <h2>Hourly Breakdown Report - manual preview</h2><p>Review only. This does not send messages or enable a schedule.</p>
    <button type="button" disabled={loading} onClick={()=>load('all')}>{loading?'Loading report...':'Preview all sites - latest 2 hours'}</button>{' '}
    <button type="button" disabled={loading} onClick={()=>load('sasti')}>Preview Sasti OC - latest 2 hours</button>
    {error&&<p role="alert">{error}</p>}
    {report?.sites&&<h3>All sites · Consolidated BD report</h3>}
    {(report?.sites||(report?[report]:[])).map(report=><div key={report.site} aria-label={`${report.site} hourly report`}><h3>{report.site}</h3><p>{report.period}</p>
      <dl style={{display:'flex',flexWrap:'wrap',gap:24}}>{Object.entries(report.counts).map(([label,value])=><div key={label}><dt>{label}</dt><dd style={{fontSize:24,fontWeight:700}}>{value}</dd></div>)}</dl>
      <div style={{overflowX:'auto'}}><table><thead><tr>{report.columns.map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{report.rows.map((row,index)=><tr key={index}>{row.map((value,i)=><td key={i} style={{whiteSpace:'pre-wrap',minWidth:i===4||i===5?200:90}}>{value}</td>)}</tr>)}</tbody></table></div>
      {!report.rows.length&&<p>No qualifying breakdown or idle records in this window.</p>}
    </div>)}
  </section>;
}
