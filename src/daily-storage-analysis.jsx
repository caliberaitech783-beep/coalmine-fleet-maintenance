import React,{useState} from 'react';
const mb=value=>(Number(value)/1024**2).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function DailyStorageAnalysis({token}){
  const [report,setReport]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=async()=>{setBusy(true);setError('');try{const response=await fetch('/api/daily-storage-analysis',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const body=await response.json();if(!response.ok)throw Error(body.error||'Could not measure daily storage');setReport(body);}catch(e){setError(e.message);}finally{setBusy(false);}};
  const days=report?[...new Set(report.media.map(r=>r.day))].sort():[];
  return <section className="panel" aria-label="Daily retained media inventory"><h2>Daily retained media inventory</h2><p>Current files grouped by request event date, not upload date. Dates are IST. Opening and complaint files use request creation; closing files and maintenance audio use closure; first-trip images use the first-trip date. Includes pre-deployment hours on 17 October. Deleted or replaced files cannot be reconstructed.</p>
    <button disabled={busy} onClick={load}>{busy?'Measuring daily inventory…':'Check daily inventory'}</button>{error&&<p role="alert">{error}</p>}
    {report&&<><div style={{overflowX:'auto'}}><table><thead><tr><th>Event date (IST)</th>{['images','audio','videos','other'].map(k=><th key={k}>{k} (MB / files)</th>)}</tr></thead><tbody>{days.map(day=><tr key={day}><th>{day}</th>{['images','audio','videos','other'].map(kind=>{const rows=report.media.filter(r=>r.day===day&&r.kind===kind);return <td key={kind}>{mb(rows.reduce((s,r)=>s+Number(r.bytes),0))} / {rows.reduce((s,r)=>s+r.files,0)}</td>;})}</tr>)}</tbody></table></div>
    <h3>Retained published reports created since 17 October</h3><table><thead><tr><th>Created date (IST)</th><th>Files</th><th>Logical MB</th><th>Stored value MB</th></tr></thead><tbody>{report.reports.map(r=><tr key={r.day}><th>{r.day}</th><td>{r.files}</td><td>{mb(r.bytes)}</td><td>{mb(r.stored_bytes)}</td></tr>)}</tbody></table>
    <p>Media MB includes Base64 overhead. Stored report values account for value compression but exclude table/index overhead and reusable space. These current inventories cannot reconcile historical Azure disk growth exactly.</p><small>Checked {new Date(report.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST. Read-only.</small></>}
  </section>;
}
