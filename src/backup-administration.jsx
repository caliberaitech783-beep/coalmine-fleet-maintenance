import React,{useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CalendarClock,CheckCircle2,CloudCog,Database,Download,FileArchive,FolderOpen,HardDrive,History,KeyRound,RefreshCw,RotateCcw,Save,ShieldCheck,Trash2,Upload} from 'lucide-react';

const backupTabs=['Backup','Export Backup','Import Backup','Backup Schedule'];
const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const tokenFor=(session)=>session?.token||'';
const authHeaders=(session,extra={})=>({Authorization:`Bearer ${tokenFor(session)}`,...extra});
const formatBytes=(bytes)=>{
  const value=Number(bytes||0);
  if(value<1024)return `${value} B`;
  if(value<1024**2)return `${(value/1024).toFixed(1)} KB`;
  if(value<1024**3)return `${(value/1024**2).toFixed(1)} MB`;
  return `${(value/1024**3).toFixed(2)} GB`;
};
const backupSize=(row)=>{
  if(row.status==='Running')return 'Writing...';
  if(row.status==='Failed')return 'No file';
  return formatBytes(row.sizeBytes);
};
const backupDetail=(row)=>{
  if(row.checksum)return `SHA-256 ${row.checksum.slice(0,16)}…`;
  if(row.errorMessage)return `Backup failed: ${row.errorMessage}`;
  if(row.status==='Running')return 'The recovery file is being created.';
  return 'No recovery file is available.';
};
const displayDateTime=(value)=>value?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(new Date(value)).replace(',','').replaceAll('/','-').replace(/\b(am|pm)\b/i,(period)=>period.toUpperCase()):'—';
const displayScheduleTime=(value)=>{
  const [hour24,minute]=String(value||'02:00').split(':').map(Number);
  return `${String(hour24%12||12).padStart(2,'0')}:${String(minute||0).padStart(2,'0')}:00 ${hour24>=12?'PM':'AM'}`;
};
const fileNameFromResponse=(response,fallback)=>{
  const header=response.headers.get('content-disposition')||'';
  const encoded=/filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  const plain=/filename="?([^";]+)"?/i.exec(header)?.[1];
  try{return decodeURIComponent(encoded||plain||fallback);}catch{return plain||fallback;}
};

async function saveResponseToComputer(response,suggestedName){
  if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error||'The backup could not be downloaded.');}
  const fileName=fileNameFromResponse(response,suggestedName);
  if(typeof window.showSaveFilePicker==='function'){
    const handle=await window.showSaveFilePicker({suggestedName:fileName,types:[{description:'BDMS compressed backup',accept:{'application/gzip':['.gz']}}]});
    const writable=await handle.createWritable();
    await response.body.pipeTo(writable);
    return fileName;
  }
  const blob=await response.blob();
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  return fileName;
}

function ScheduleTime({value,onChange}){
  const [hour24,minute]=String(value||'02:00').split(':').map(Number);
  const period=hour24>=12?'PM':'AM';
  const hour=hour24%12||12;
  const update=(nextHour=hour,nextMinute=minute,nextPeriod=period)=>{
    const normalized=(nextHour%12)+(nextPeriod==='PM'?12:0);
    onChange(`${String(normalized).padStart(2,'0')}:${String(nextMinute).padStart(2,'0')}`);
  };
  return <div className="backup-time-control" aria-label="Scheduled backup time">
    <select value={hour} onChange={(event)=>update(Number(event.target.value))} aria-label="Hour">{Array.from({length:12},(_,index)=>index+1).map(option=><option key={option}>{option}</option>)}</select>
    <span>:</span>
    <select value={minute} onChange={(event)=>update(hour,Number(event.target.value))} aria-label="Minute">{[0,15,30,45].map(option=><option key={option} value={option}>{String(option).padStart(2,'0')}</option>)}</select>
    <select value={period} onChange={(event)=>update(hour,minute,event.target.value)} aria-label="AM or PM"><option>AM</option><option>PM</option></select>
  </div>;
}

function BackupHistory({history,onDownload,onDelete,busy}){
  return <div className="backup-history-wrap">
    <table className="backup-history-table"><thead><tr><th>Date & time</th><th>Backup file</th><th>Type</th><th>Status</th><th>Size</th><th>Created by</th><th>Recovery file</th><th>Delete</th></tr></thead>
      <tbody>{history.length?history.map(row=><tr key={row.id}><td>{displayDateTime(row.completedAt||row.startedAt)}</td><td><b>{row.fileName}</b><small className={row.errorMessage?'backup-run-error':''}>{backupDetail(row)}</small></td><td>{row.triggerType}</td><td><span className={`backup-state ${String(row.status).toLowerCase()}`}>{row.status}</span></td><td><b className={`backup-size ${String(row.status).toLowerCase()}`}>{backupSize(row)}</b></td><td>{row.createdBy||'System'}</td><td>{row.downloadable?<button type="button" className="backup-icon-action" title="Download backup" aria-label={`Download ${row.fileName}`} disabled={busy} onClick={()=>onDownload(row)}><Download /></button>:<span className="backup-unavailable">—</span>}</td><td><button type="button" className="backup-icon-action danger" title="Delete backup history" aria-label={`Delete ${row.fileName}`} disabled={busy} onClick={()=>onDelete(row)}><Trash2 /></button></td></tr>):<tr><td colSpan="8" className="backup-empty">No backup runs have been recorded yet.</td></tr>}</tbody>
    </table>
  </div>;
}

export default function BackupAdministration({section='Backup',session,onNavigate=()=>{}}){
  const [data,setData]=useState({settings:null,history:[],storageRoot:''});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [file,setFile]=useState(null);
  const [inspection,setInspection]=useState(null);
  const [confirmation,setConfirmation]=useState('');
  const [settings,setSettings]=useState(null);
  const active=backupTabs.includes(section)?section:'Backup';
  const isTrueSuper=session?.permissions?.adminLevel==='Super Admin';
  const load=async()=>{
    setLoading(true);
    try{
      const response=await fetch('/api/backups',{cache:'no-store',headers:authHeaders(session)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Could not load backup administration.');
      setData(result);setSettings(result.settings);setError('');
    }catch(loadError){setError(loadError.message||'Could not load backup administration.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[session?.token]);
  const latest=useMemo(()=>data.history.find(row=>['Completed','Exported'].includes(row.status)),[data.history]);
  const runBackup=async()=>{
    setBusy('run');setError('');setNotice('');
    try{
      const response=await fetch('/api/backups/run',{method:'POST',headers:authHeaders(session)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Could not create the backup.');
      setNotice(`Protected backup ${result.fileName} was created successfully.`);await load();
    }catch(runError){setError(runError.message||'Could not create the backup.');}
    finally{setBusy('');}
  };
  const exportBackup=async()=>{
    setBusy('export');setError('');setNotice('');
    try{
      let handle=null;
      const suggested=`BDMS-Full-Backup-${new Date().toISOString().slice(0,10)}.ndjson.gz`;
      if(typeof window.showSaveFilePicker==='function')handle=await window.showSaveFilePicker({suggestedName:suggested,types:[{description:'BDMS compressed backup',accept:{'application/gzip':['.gz']}}]});
      const response=await fetch('/api/backups/export',{method:'POST',headers:authHeaders(session)});
      if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error||'Could not export the backup.');}
      const fileName=fileNameFromResponse(response,suggested);
      if(handle){const writable=await handle.createWritable();await response.body.pipeTo(writable);}
      else await saveResponseToComputer(response,fileName);
      setNotice(`${fileName} was exported to the selected location.`);await load();
    }catch(exportError){if(exportError.name!=='AbortError')setError(exportError.message||'Could not export the backup.');}
    finally{setBusy('');}
  };
  const downloadStored=async(row)=>{
    setBusy(`download-${row.id}`);setError('');
    try{
      const response=await fetch(`/api/backups/${encodeURIComponent(row.id)}/download`,{headers:authHeaders(session)});
      await saveResponseToComputer(response,row.fileName);
      setNotice(`${row.fileName} was saved to the selected location.`);
    }catch(downloadError){if(downloadError.name!=='AbortError')setError(downloadError.message||'Could not download the backup.');}
    finally{setBusy('');}
  };
  const deleteStored=async(row)=>{
    if(!window.confirm(`Delete ${row.fileName}?\n\nThis permanently removes the backup history and its recovery file, if available.`))return;
    setBusy(`delete-${row.id}`);setError('');setNotice('');
    try{
      const response=await fetch(`/api/backups/${encodeURIComponent(row.id)}`,{method:'DELETE',headers:authHeaders(session)});
      if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error||'Could not delete the backup history.');}
      setNotice(`${row.fileName} was deleted from backup history.`);await load();
    }catch(deleteError){setError(deleteError.message||'Could not delete the backup history.');}
    finally{setBusy('');}
  };
  const inspectImport=async()=>{
    if(!file)return setError('Select a .ndjson.gz backup file first.');
    setBusy('inspect');setError('');setNotice('');setInspection(null);
    try{
      const response=await fetch('/api/backups/import/inspect',{method:'POST',headers:authHeaders(session,{'Content-Type':'application/octet-stream','X-Backup-File-Name':file.name}),body:file});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Could not inspect the backup.');
      setInspection(result);setNotice('Backup integrity checks passed. Review the details before restoring.');
    }catch(inspectError){setError(inspectError.message||'Could not inspect the backup.');}
    finally{setBusy('');}
  };
  const restoreBackup=async()=>{
    setBusy('restore');setError('');
    try{
      const response=await fetch('/api/backups/import/restore',{method:'POST',headers:authHeaders(session,{'Content-Type':'application/json'}),body:JSON.stringify({token:inspection?.token,confirmation})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Could not restore the backup.');
      localStorage.removeItem('nerveCenterSession');sessionStorage.removeItem('nerveCenterSession');
      window.alert(`Restore completed. Safety backup created: ${result.safetyBackup?.fileName||'Yes'}. Please sign in again.`);
      window.location.replace('/');
    }catch(restoreError){setError(restoreError.message||'Could not restore the backup.');setBusy('');}
  };
  const saveSettings=async()=>{
    setBusy('settings');setError('');setNotice('');
    try{
      const response=await fetch('/api/backups/settings',{method:'PUT',headers:authHeaders(session,{'Content-Type':'application/json'}),body:JSON.stringify(settings)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Could not save the backup schedule.');
      setSettings(result.settings);setNotice('Automatic backup schedule and retention settings were saved.');await load();
    }catch(saveError){setError(saveError.message||'Could not save the backup schedule.');}
    finally{setBusy('');}
  };
  return <section className="panel pagepanel backup-admin-page">
    <header><div><span className="page-eyebrow">System recovery</span><h1>{active}</h1><p>Protect the database, application configuration, and recovery history before a failure occurs.</p></div><button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCw />{loading?'Refreshing...':'Refresh'}</button></header>
    <nav className="backup-tabs" aria-label="Backup administration sections">{backupTabs.map(tab=><button type="button" key={tab} className={active===tab?'active':''} onClick={()=>onNavigate(tab)}>{tab==='Backup'?<ShieldCheck />:tab==='Export Backup'?<Download />:tab==='Import Backup'?<Upload />:<CalendarClock />}{tab}</button>)}</nav>
    {error&&<div className="backup-alert error" role="alert"><AlertTriangle /><span>{error}</span></div>}
    {notice&&<div className="backup-alert success" role="status"><CheckCircle2 /><span>{notice}</span></div>}
    {active==='Backup'&&<div className="backup-content">
      <div className="backup-overview-kpis"><article><Database /><div><small>Database protection</small><b>{latest?'Protected':'Backup required'}</b><p>{latest?displayDateTime(latest.completedAt||latest.startedAt):'Create the first full backup'}</p></div></article><article><HardDrive /><div><small>Protected storage</small><b>{data.history.filter(row=>row.downloadable).length} files</b><p>{data.storageRoot||'Loading storage location'}</p></div></article><article><CalendarClock /><div><small>Automatic schedule</small><b>{settings?.enabled?'Active':'Paused'}</b><p>{settings?`${displayScheduleTime(settings.scheduleTime)} IST · ${settings.weekdays.length} days/week`:'Loading schedule'}</p></div></article></div>
      <div className="backup-overview-heading"><div><h2>Disaster recovery coverage</h2><p>These layers are required to rebuild BDMS after an application, database, or hosting failure.</p></div><button type="button" className="primary" onClick={runBackup} disabled={Boolean(busy)}><FileArchive />{busy==='run'?'Creating backup...':'Create backup now'}</button></div>
      <div className="backup-coverage"><article><span>1</span><div><h3>PostgreSQL application data</h3><p>Requests, users, masters, tickets, audit records, report rules, WhatsApp settings, and all other public database tables.</p></div><b>Included</b></article><article><span>2</span><div><h3>Application source and history</h3><p>Keep the GitHub repository and periodically run the supplied local backup script to create a verified repository bundle and source archive.</p></div><b>Git + local</b></article><article><span>3</span><div><h3>Azure service configuration</h3><p>Record App Service, database, hostnames, deployment slots, Front Door, and resource inventory separately after infrastructure changes.</p></div><b className="attention">Admin task</b></article><article><span>4</span><div><h3>External credentials and provider accounts</h3><p>Environment-only database, Oracle, email, and hosting secrets must also remain in the company password manager. Meta and Fast2SMS account ownership stays with those providers.</p></div><b className="attention">Separate vault</b></article></div>
      <div className="backup-section-heading"><div><h2>Backup history</h2><p>Recent automatic, manual, export, and pre-restore recovery points.</p></div></div><BackupHistory history={data.history} onDownload={downloadStored} onDelete={deleteStored} busy={Boolean(busy)} />
    </div>}
    {active==='Export Backup'&&<div className="backup-content backup-task-layout"><div className="backup-task-main"><span className="backup-feature-icon"><Download /></span><h2>Export a complete database backup</h2><p>The browser asks where to save the compressed recovery file. The export is streamed, checksum-verified, and never held as one large value in application memory.</p><div className="backup-includes"><span><CheckCircle2 />All business and master data</span><span><CheckCircle2 />Users, sessions, permissions, and audit records</span><span><CheckCircle2 />Workflow, reporting, and integration settings</span><span><CheckCircle2 />Every current PostgreSQL public table</span></div><button type="button" className="primary backup-primary-action" disabled={Boolean(busy)} onClick={exportBackup}><FolderOpen />{busy==='export'?'Preparing full backup...':'Choose location and export'}</button></div><aside className="backup-security-note"><KeyRound /><h3>Treat exports as confidential</h3><p>A complete recovery file contains operational data, password hashes, and any integration credentials stored in application settings. Save it only in an encrypted, access-controlled company folder.</p></aside></div>}
    {active==='Import Backup'&&<div className="backup-content backup-task-layout"><div className="backup-task-main"><span className="backup-feature-icon danger"><RotateCcw /></span><h2>Inspect and restore a backup</h2><p>A selected archive is fully checked before restore is enabled. BDMS automatically creates a new safety backup of the current system before replacing data.</p>{!isTrueSuper?<div className="backup-permission"><ShieldCheck /><div><b>Super Admin approval required</b><p>Only a Super Admin can replace live production data.</p></div></div>:<><label className="backup-file-picker"><Upload /><div><b>{file?.name||'Select a BDMS backup file'}</b><small>{file?formatBytes(file.size):'.ndjson.gz files up to 2 GB'}</small></div><input type="file" accept=".ndjson.gz,application/gzip" onChange={(event)=>{setFile(event.target.files?.[0]||null);setInspection(null);setConfirmation('');}} /></label><button type="button" className="secondary backup-inspect" onClick={inspectImport} disabled={!file||Boolean(busy)}>{busy==='inspect'?'Checking every record...':'Inspect backup integrity'}</button>{inspection&&<div className="backup-inspection"><h3><CheckCircle2 />Backup verified</h3><dl><div><dt>Created</dt><dd>{displayDateTime(inspection.createdAt)}</dd></div><div><dt>Tables</dt><dd>{inspection.tableCount}</dd></div><div><dt>Total rows</dt><dd>{Number(inspection.totalRows||0).toLocaleString('en-IN')}</dd></div><div><dt>File size</dt><dd>{formatBytes(inspection.sizeBytes)}</dd></div></dl><label><span>Type <b>RESTORE BDMS</b> to authorize replacement of production data</span><input value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} autoComplete="off" /></label><button type="button" className="danger-action" disabled={confirmation!=='RESTORE BDMS'||Boolean(busy)} onClick={restoreBackup}><RotateCcw />{busy==='restore'?'Creating safety backup and restoring...':'Create safety backup and restore'}</button></div>}</>}</div><aside className="backup-security-note danger"><AlertTriangle /><h3>Restore changes live data</h3><p>Users may be signed out, and every included table is returned to the state recorded in the selected file.</p></aside></div>}
    {active==='Backup Schedule'&&settings&&<div className="backup-content backup-schedule"><div className="backup-schedule-header"><div><h2>Automatic backup schedule</h2><p>Backups run in India Standard Time and are retained in protected server storage.</p></div><label className="backup-toggle"><input type="checkbox" checked={settings.enabled} onChange={(event)=>setSettings({...settings,enabled:event.target.checked})}/><span />{settings.enabled?'Active':'Paused'}</label></div><div className="backup-form-grid"><fieldset><legend>Weekdays</legend><div className="backup-weekdays">{weekdays.map(day=><label key={day}><input type="checkbox" checked={settings.weekdays.includes(day)} onChange={(event)=>setSettings({...settings,weekdays:event.target.checked?[...settings.weekdays,day]:settings.weekdays.filter(item=>item!==day)})}/><span>{day.slice(0,3)}</span></label>)}</div></fieldset><label><span>Backup time (IST)</span><ScheduleTime value={settings.scheduleTime} onChange={(scheduleTime)=>setSettings({...settings,scheduleTime})}/></label><label><span>Storage folder</span><div className="backup-input-icon"><FolderOpen /><input value={settings.storageFolder} onChange={(event)=>setSettings({...settings,storageFolder:event.target.value})}/></div><small>Inside protected root: {data.storageRoot}</small></label><label><span>Retention days</span><input type="number" min="1" max="365" value={settings.retentionDays} onChange={(event)=>setSettings({...settings,retentionDays:Number(event.target.value)})}/></label><label><span>Maximum stored backups</span><input type="number" min="1" max="365" value={settings.maxBackups} onChange={(event)=>setSettings({...settings,maxBackups:Number(event.target.value)})}/></label></div><footer><button type="button" className="secondary" disabled={Boolean(busy)} onClick={runBackup}><CloudCog />{busy==='run'?'Running...':'Run backup now'}</button><button type="button" className="primary" disabled={Boolean(busy)} onClick={saveSettings}><Save />{busy==='settings'?'Saving...':'Save schedule'}</button></footer></div>}
  </section>;
}
