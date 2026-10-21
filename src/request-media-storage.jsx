import React,{useState} from 'react';
const size=bytes=>`${(bytes/1024**2).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})} MB`;
const kinds=['images','videos','audio','pdfs','other'];
export default function RequestMediaStorage({token}){
  const [report,setReport]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=async()=>{setBusy(true);setError('');try{
    const response=await fetch('/api/request-media-storage',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const body=await response.json();if(!response.ok)throw Error(body.error||'Could not check media storage.');setReport(body);
  }catch(problem){setError(problem.message);}finally{setBusy(false);}};
  return <section className="panel" aria-label="Request media storage breakdown"><h2>Request media storage breakdown</h2>
    <p>Images, videos and audio grouped by MIS verification date in IST. Includes opening, closing and first-trip cards and complaint attachments. Read-only; nothing is deleted. Values include Base64 storage overhead.</p>
    <button type="button" disabled={busy} onClick={load}>{busy?'Measuring media…':'Check media breakdown'}</button>
    {error&&<p role="alert">{error}</p>}
    {report&&<><div style={{overflowX:'auto'}}><table><thead><tr><th>Verification period (IST)</th>{kinds.map(kind=><th key={kind}>{kind==='pdfs'?'PDFs':kind[0].toUpperCase()+kind.slice(1)}</th>)}<th>All media</th></tr></thead><tbody>
      {report.periods.filter(row=>row.key!=='afterOctober'||row.requests>0).map(row=><tr key={row.key}><th>{row.label}</th>{kinds.map(kind=><td key={kind}>{size(row.types[kind].bytes)} · {row.types[kind].files.toLocaleString('en-IN')} files</td>)}<td>{size(row.totalBytes)}</td></tr>)}
      <tr><th>Total</th>{kinds.map(kind=><td key={kind}>{size(report.periods.reduce((sum,row)=>sum+row.types[kind].bytes,0))}</td>)}<td>{size(report.totals.totalBytes)}</td></tr>
    </tbody></table></div>
    <p>Existing Photos and audio counter: {size(report.totals.counterBytes)}. This includes {size(report.totals.counterJsonOverheadBytes)} of complaint attachment JSON metadata. Opening/closing trip cards omitted by that counter: {size(report.totals.additionalTripCardBytes)}.</p>
    <p>All media plus attachment metadata: {size(report.totals.totalBytes+report.totals.counterJsonOverheadBytes)}. These are logical data sizes; database compression, indexes and reusable space affect physical storage.</p>
    <small>Checked {new Date(report.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST. October means verified from 1 October up to, but excluding, 1 November 2026.</small></>}
  </section>;
}
