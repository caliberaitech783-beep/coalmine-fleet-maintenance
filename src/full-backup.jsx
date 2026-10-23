import React,{useEffect,useState} from 'react';
import {Download,RefreshCw,Save,ShieldCheck} from 'lucide-react';
import './backup-administration.css';

const labels={database:'PostgreSQL database',application:'Application source',gitHistory:'Code and Git history',media:'Photos, audio, PDFs and attachments',secrets:'Environment settings and secrets',hosting:'Azure hosting configuration',pitr:'PostgreSQL Point-in-Time Recovery',recovery:'Recovery instructions and versions',external:'External recovery dependencies'};
const date=value=>value?new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'—';
export default function FullBackup({session}){
  const [data,setData]=useState(null),[config,setConfig]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[notice,setNotice]=useState('');
  const headers={Authorization:`Bearer ${session?.token||''}`};
  async function api(url,options={}){const response=await fetch(url,{...options,headers:{...headers,...options.headers}});const result=await response.json();if(!response.ok)throw Error(result.error||'Full backup operation failed');return result;}
  async function load(edit=false){try{const result=await api('/api/full-backups');setData(result);if(edit)setConfig(result.settings);}catch(e){setError(e.message);}}
  useEffect(()=>{void load(true);const timer=setInterval(()=>void load(),10000);return()=>clearInterval(timer);},[session?.token]);
  async function action(kind){setBusy(kind);setError('');setNotice('');try{
    if(kind==='save'){await api('/api/full-backups/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});setNotice('Full Backup schedule saved.');}
    else{await api('/api/full-backups/run',{method:'POST'});setNotice('Encrypted backup started. History refreshes automatically; wait for it to finish before downloading.');}
    await load();
  }catch(e){setError(e.message);}finally{setBusy('');}}
  async function download(row){setBusy(row.id);setError('');try{
    // Stream to disk where supported, avoiding an entire large database in browser memory.
    const handle=window.showSaveFilePicker?await window.showSaveFilePicker({suggestedName:row.fileName}):null;
    const response=await fetch(`/api/full-backups/${row.id}/download`,{headers});if(!response.ok)throw Error('Recovery download failed');
    if(handle){const out=await handle.createWritable();try{await response.body.pipeTo(out);}catch(e){await out.abort().catch(()=>{});throw e;}}
    else{const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=row.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  }catch(e){if(e.name!=='AbortError')setError(e.message);}finally{setBusy('');}}
  const latest=data?.history?.find(row=>['Completed','Partial'].includes(row.status));
  return <section className="panel backup-admin-page"><header><div><h1>Full Backup</h1><p>Encrypted recovery copies for Caliber Pulse · India Standard Time</p></div><button onClick={()=>load()}><RefreshCw/>Refresh</button></header>
    {error&&<div className="backup-alert error" role="alert">{error}</div>}{notice&&<div className="backup-alert success" role="status">{notice}</div>}
    {data?.progress&&<div className="backup-alert success" role="status">{data.progress.stage} · {(Number(data.progress.bytesWritten||0)/1048576).toFixed(1)} MB written</div>}
    <div className="backup-content"><div className="backup-security-note"><ShieldCheck/><h3>Offline recovery key required</h3><p>{data?.keyConfigured?'Encryption public key is configured. Keep the matching private key offline; it is required to decrypt every recovery archive.':'Recovery key is missing. Backups cannot run until it is configured.'}</p><p>Key fingerprint: <code style={{overflowWrap:'anywhere'}}>{data?.keyFingerprint||'Not configured'}</code></p><p>The Full Backup file is encrypted and cannot be uploaded to Database → Import Backup. Decrypt it on a clean recovery computer and follow RECOVERY.md inside.</p></div>
    <div className="backup-section-heading"><div><h2>Recovery coverage</h2><p>Azure snapshot: {date(data?.hosting?.capturedAt)} · {data?.hosting?.summary||'Waiting for Azure collector'}</p></div><button className="primary" disabled={Boolean(busy)||!data?.keyConfigured||data?.history?.some(row=>row.status==='Running')} onClick={()=>action('run')}>Create full backup now</button></div>
    <div className="backup-coverage">{Object.entries(labels).map(([key,label])=><article key={key}><ShieldCheck/><div><b>{label}</b><p>{latest?.coverage?.[key]?.detail||'Not yet backed up'}</p></div><strong>{latest?.coverage?.[key]?.status||'Pending'}</strong></article>)}</div>
    <p>Azure inventory collection and an off-site copy of the latest full archive run daily at approximately 04:00 IST through GitHub Actions. GitHub may delay scheduled runs. Hosting snapshots older than 26 hours are marked stale. <a href="https://github.com/caliberaitech783-beep/coalmine-fleet-maintenance/actions/workflows/full-recovery-backup.yml" target="_blank" rel="noreferrer">Refresh Azure configuration manually in GitHub Actions</a> (select azure-hosting-1.0 and Run workflow).</p>
    <p>“Partial” means the archive contains useful recovery data but has gaps requiring review. PITR stays in Azure; its status and restore window are recorded, not downloadable WAL files. No zero-loss guarantee is implied.</p>
    {config&&<div className="backup-schedule"><h2>Schedule all recovery components</h2><p>The Azure collector refreshes hosting configuration separately every day. This schedule packages the latest snapshot together with the live database, media, application and settings.</p><div className="backup-form-grid">
    <label><span>Enable automatic Full Backup</span><input type="checkbox" checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})}/></label>
    <label><span>Backup time (IST)</span><input type="time" value={config.scheduleTime} onChange={e=>setConfig({...config,scheduleTime:e.target.value})}/></label>
    <fieldset><legend>Weekdays</legend><div className="backup-weekdays">{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day=><label key={day}><input type="checkbox" checked={config.weekdays.includes(day)} onChange={e=>setConfig({...config,weekdays:e.target.checked?[...config.weekdays,day]:config.weekdays.filter(item=>item!==day)})}/><span>{day.slice(0,3)}</span></label>)}</div></fieldset>
    <label><span>Retention days</span><input type="number" min="1" max="365" value={config.retentionDays} onChange={e=>setConfig({...config,retentionDays:Number(e.target.value)})}/></label><label><span>Maximum stored full backups</span><input type="number" min="1" max="365" value={config.maxBackups} onChange={e=>setConfig({...config,maxBackups:Number(e.target.value)})}/></label></div><footer><button className="primary" disabled={Boolean(busy)||!config.weekdays.length} onClick={()=>action('save')}><Save/>Save schedule</button></footer></div>}
    <h2>Full Backup history</h2><div style={{overflowX:'auto'}}><table><thead><tr><th>Created (IST)</th><th>Trigger</th><th>Status</th><th>Size</th><th>Checksum / details</th><th>Recovery file</th></tr></thead><tbody>{data?.history?.map(row=><tr key={row.id}><td>{date(row.startedAt)}</td><td>{row.triggerType}</td><td>{row.status}</td><td>{row.sizeBytes?`${(Number(row.sizeBytes)/1048576).toFixed(1)} MB`:'—'}</td><td style={{maxWidth:260,overflowWrap:'anywhere'}}>{row.errorMessage||row.checksum||'In progress'}</td><td>{row.fileName&&['Partial','Completed'].includes(row.status)&&<button disabled={Boolean(busy)} onClick={()=>download(row)}><Download/>Download encrypted archive</button>}</td></tr>)}</tbody></table></div>
    <p>Keep an additional offline copy and test a complete restore into a separate environment. Restoring production is never performed automatically by this page.</p></div></section>;
}
