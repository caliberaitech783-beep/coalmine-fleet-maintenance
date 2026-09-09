import React, {useCallback, useEffect, useMemo, useState} from "react";
import {
  Activity, CalendarDays, CheckCircle2, Clock, Download, HardDrive, History,
  Laptop, LogOut, Monitor, Play, RefreshCw, Save, Search, Settings, ShieldCheck,
  UserRound, X,
} from "lucide-react";
import {formatDisplayDateTime} from "../date-time-format.mjs";
import {DEFAULT_BACKUP_SETTINGS} from "../system-administration.mjs";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function api(session, path, init = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {Authorization:`Bearer ${session?.token || ""}`, ...(init.headers || {})},
  });
  const type = response.headers.get("content-type") || "";
  const body = type.includes("json") ? await response.json().catch(() => ({})) : null;
  if (!response.ok) throw new Error(body?.error || "The system administration request could not be completed.");
  return body;
}

function dateTime(value) {
  return value ? formatDisplayDateTime(value) : "-";
}

function bytes(value) {
  const size = Number(value || 0);
  if (!size) return "0 KB";
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function Status({children}) {
  return <span className={`sys-status ${String(children || "").toLowerCase().replaceAll(" ", "-")}`}>{children}</span>;
}

function Empty({children}) {
  return <div className="sys-empty">{children}</div>;
}

function PageHeader({title, subtitle, onRefresh, children}) {
  return <header className="sys-page-header">
    <div><span className="sys-eyebrow">SYSTEM ADMINISTRATION</span><h1>{title}</h1><p>{subtitle}</p></div>
    <div className="sys-header-actions">{onRefresh && <button type="button" className="secondary" onClick={onRefresh}><RefreshCw /> Refresh</button>}{children}</div>
  </header>;
}

function BackupTable({backups, session, exportOnly = false}) {
  const [downloading, setDownloading] = useState("");
  const download = async (backup) => {
    setDownloading(backup.id);
    try {
      const response = await fetch(`/api/system-admin/backups/${encodeURIComponent(backup.id)}/export`, {headers:{Authorization:`Bearer ${session.token}`}});
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not export this backup.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = backup.fileName; link.click();
      URL.revokeObjectURL(url);
    } catch (error) { alert(error.message); }
    finally { setDownloading(""); }
  };
  if (!backups.length) return <Empty>No backups are available yet.</Empty>;
  return <div className="sys-table-wrap"><table className="sys-table"><thead><tr>
    <th>Date & time</th><th>Backup file</th><th>Type</th><th>Status</th><th>Size</th><th>Created by</th><th>Expires</th>{exportOnly && <th>Action</th>}
  </tr></thead><tbody>{backups.map((backup) => <tr key={backup.id}>
    <td><b>{dateTime(backup.startedAt)}</b></td><td>{backup.fileName}<small>{backup.checksum ? `SHA-256 ${backup.checksum.slice(0, 12)}...` : backup.errorMessage}</small></td>
    <td>{backup.triggerType}</td><td><Status>{backup.status}</Status></td><td>{bytes(backup.sizeBytes)}</td><td>{backup.createdByName || backup.createdByLogin || "System"}</td><td>{dateTime(backup.expiresAt)}</td>
    {exportOnly && <td><button type="button" className="sys-icon-action" disabled={backup.status !== "Completed" || downloading === backup.id} onClick={() => download(backup)}><Download />{downloading === backup.id ? "Preparing..." : "Download"}</button></td>}
  </tr>)}</tbody></table></div>;
}

function BackupWorkspace({section, session}) {
  const [backups, setBackups] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_BACKUP_SETTINGS);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      if (section === "Backup Activity Logs") setLogs(await api(session, "/api/system-admin/backup-activity"));
      else {
        const result = await api(session, "/api/system-admin/backups");
        setBackups(result.backups || []); setSettings({...DEFAULT_BACKUP_SETTINGS, ...(result.settings || {})});
      }
    } catch (error) { alert(error.message); }
  }, [section, session]);
  useEffect(() => { load(); }, [load]);
  const createBackup = async () => {
    setBusy(true);
    try { await api(session, "/api/system-admin/backups", {method:"POST"}); await load(); }
    catch (error) { alert(error.message); }
    finally { setBusy(false); }
  };
  const saveSettings = async () => {
    setBusy(true);
    try {
      const saved = await api(session, "/api/system-admin/backup-settings", {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(settings)});
      setSettings(saved); alert("Backup settings saved.");
    } catch (error) { alert(error.message); }
    finally { setBusy(false); }
  };
  if (section === "Backup Activity Logs") return <section className="panel pagepanel sys-page"><PageHeader title="Backup Activity Logs" subtitle="Every backup, export, failure, and retention action" onRefresh={load} />
    {logs.length ? <div className="sys-table-wrap"><table className="sys-table"><thead><tr><th>Date & time</th><th>Action</th><th>Outcome</th><th>Administrator</th><th>Details</th><th>Backup ID</th></tr></thead><tbody>{logs.map((log)=><tr key={log.id}><td><b>{dateTime(log.occurredAt)}</b></td><td>{log.action}</td><td><Status>{log.outcome}</Status></td><td>{log.actorName || log.actorLogin || "System"}</td><td>{log.details || "-"}</td><td><code>{log.backupId || "-"}</code></td></tr>)}</tbody></table></div> : <Empty>No backup activity has been recorded.</Empty>}
  </section>;
  if (["Create Schedule Backup", "Backup Settings", "Storage and Retention"].includes(section)) {
    const schedule = section === "Create Schedule Backup";
    const retention = section === "Storage and Retention";
    return <section className="panel pagepanel sys-page"><PageHeader title={section} subtitle={schedule ? "Choose the daily run time and active weekdays" : retention ? "Control backup storage limits and automatic expiry" : "Control backup content and file naming"}>
      <button type="button" className="primary" disabled={busy} onClick={saveSettings}><Save /> {busy ? "Saving..." : "Save settings"}</button>
    </PageHeader><div className="sys-form">
      {schedule && <><label className="sys-switch"><input type="checkbox" checked={settings.enabled} onChange={(event)=>setSettings((current)=>({...current,enabled:event.target.checked}))}/><span />Enable scheduled backups</label>
        <div className="sys-form-grid"><label>Daily backup time (IST)<input type="time" value={settings.scheduleTime} onChange={(event)=>setSettings((current)=>({...current,scheduleTime:event.target.value}))}/></label><label>Schedule name<input value={settings.namePrefix} onChange={(event)=>setSettings((current)=>({...current,namePrefix:event.target.value}))}/></label></div>
        <fieldset><legend>Run on weekdays</legend><div className="sys-weekdays">{WEEKDAYS.map((day)=><label key={day}><input type="checkbox" checked={settings.weekdays.includes(day)} onChange={(event)=>setSettings((current)=>({...current,weekdays:event.target.checked?[...current.weekdays,day]:current.weekdays.filter((item)=>item!==day)}))}/><span>{day.slice(0,3)}</span></label>)}</div></fieldset></>}
      {section === "Backup Settings" && <><div className="sys-form-grid"><label>Backup file prefix<input value={settings.namePrefix} onChange={(event)=>setSettings((current)=>({...current,namePrefix:event.target.value}))}/></label><label>Backup format<input value="JSON application-data archive" readOnly /></label></div><label className="sys-switch"><input type="checkbox" checked={settings.includeAuditTrail} onChange={(event)=>setSettings((current)=>({...current,includeAuditTrail:event.target.checked}))}/><span />Include Audit Trail</label><label className="sys-switch"><input type="checkbox" checked={settings.includeLoginHistory} onChange={(event)=>setSettings((current)=>({...current,includeLoginHistory:event.target.checked}))}/><span />Include Login History</label></>}
      {retention && <><div className="sys-storage-banner"><HardDrive /><div><b>{settings.storageTarget}</b><span>Protected application database storage</span></div><Status>Active</Status></div><div className="sys-form-grid"><label>Retention period (days)<input type="number" min="1" max="365" value={settings.retentionDays} onChange={(event)=>setSettings((current)=>({...current,retentionDays:event.target.value}))}/></label><label>Maximum retained backups<input type="number" min="1" max="365" value={settings.maxBackups} onChange={(event)=>setSettings((current)=>({...current,maxBackups:event.target.value}))}/></label></div></>}
    </div></section>;
  }
  const completed = backups.filter((backup)=>backup.status === "Completed");
  return <section className="panel pagepanel sys-page"><PageHeader title={section} subtitle={section === "Daily Backup" ? "Create and monitor protected application-data backups" : section === "Export Backup" ? "Download a verified backup archive" : "Review every completed, running, and failed backup"} onRefresh={load}>
    {section === "Daily Backup" && <button type="button" className="primary" disabled={busy} onClick={createBackup}><HardDrive /> {busy ? "Creating backup..." : "Create backup now"}</button>}
  </PageHeader>
  {section === "Daily Backup" && <div className="sys-kpis"><div><History/><span>Total backups</span><b>{backups.length}</b></div><div><CheckCircle2/><span>Completed</span><b>{completed.length}</b></div><div><HardDrive/><span>Protected size</span><b>{bytes(completed.reduce((sum,item)=>sum+Number(item.sizeBytes||0),0))}</b></div><div><CalendarDays/><span>Retention</span><b>{settings.retentionDays} days</b></div></div>}
  <BackupTable backups={section === "Daily Backup" ? backups.slice(0, 12) : backups} session={session} exportOnly={section === "Export Backup"}/></section>;
}

function LoginSessions({section, session}) {
  const [rows, setRows] = useState([]), [query, setQuery] = useState("");
  const load = useCallback(async()=>{try{setRows(await api(session, section === "Login Sessions" ? "/api/system-admin/login-sessions" : "/api/system-admin/login-history"))}catch(error){alert(error.message)}},[section,session]);
  useEffect(()=>{load()},[load]);
  const visible=useMemo(()=>rows.filter((row)=>JSON.stringify(row).toLowerCase().includes(query.toLowerCase())),[rows,query]);
  const closeSession=async(row)=>{
    const reason=window.prompt(`Reason for closing ${row.name || row.login}'s session:`);
    if(reason===null)return;
    if(!reason.trim()){alert("A reason is required.");return;}
    if(!window.confirm(`Forcefully close the session for ${row.name || row.login}?`))return;
    try{await api(session,`/api/system-admin/login-sessions/${encodeURIComponent(row.sessionId)}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:reason.trim()})});await load()}catch(error){alert(error.message)}
  };
  return <section className="panel pagepanel sys-page"><PageHeader title={section} subtitle={section === "Login Sessions" ? "Active users, device details, and session controls" : "Successful, failed, signed-out, and force-closed login activity"} onRefresh={load}/>
    <div className="sys-toolbar"><Search/><input type="search" placeholder={`Search ${section.toLowerCase()}`} value={query} onChange={(event)=>setQuery(event.target.value)}/><b>{visible.length} records</b></div>
    {visible.length ? <div className="sys-table-wrap"><table className="sys-table"><thead><tr><th>User name</th><th>Employee</th><th>Role</th><th>Device</th><th>App Device ID</th><th>IP address</th><th>{section === "Login Sessions" ? "Last activity" : "Date & time"}</th>{section === "Login History" && <><th>Event</th><th>Outcome / reason</th></>}{section === "Login Sessions" && <th>Action</th>}</tr></thead><tbody>{visible.map((row)=><tr key={`${row.id||row.sessionId}-${row.occurredAt||"active"}`}><td><b>{row.login || "-"}</b></td><td>{row.name || "-"}</td><td>{row.displayRole || row.role || "-"}</td><td><span className="sys-device"><Monitor/>{row.device?.type || "Unknown"} · {row.device?.platform || "Unknown"} · {row.device?.browser || "Unknown"}</span></td><td><code>{row.deviceId || "-"}</code></td><td>{row.ipAddress || "-"}</td><td>{dateTime(row.lastSeenAt || row.occurredAt)}</td>{section === "Login History" && <><td>{row.eventType}</td><td><Status>{row.outcome}</Status><small>{row.reason || ""}</small></td></>}{section === "Login Sessions" && <td>{row.isCurrent ? <Status>Current</Status> : <button type="button" className="sys-danger-action" onClick={()=>closeSession(row)}><LogOut/>Force close</button>}</td>}</tr>)}</tbody></table></div> : <Empty>No matching session records.</Empty>}
  </section>;
}

function DeviceAccess({session}) {
  const [sessions,setSessions]=useState([]),[requests,setRequests]=useState([]),[target,setTarget]=useState(""),[reason,setReason]=useState(""),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{try{const [active,support]=await Promise.all([api(session,"/api/system-admin/login-sessions"),api(session,"/api/system-admin/device-access")]);setSessions(active.filter((item)=>!item.isCurrent));setRequests(support)}catch(error){alert(error.message)}},[session]);
  useEffect(()=>{load()},[load]);
  const requestAccess=async()=>{setBusy(true);try{await api(session,"/api/system-admin/device-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({targetSessionId:target,reason})});setReason("");await load()}catch(error){alert(error.message)}finally{setBusy(false)}};
  const action=async(item,name)=>{try{await api(session,`/api/system-admin/device-access/${item.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:name})});await load();if(name==="start")window.location.href="ms-quick-assist:"}catch(error){alert(error.message)}};
  return <section className="panel pagepanel sys-page"><PageHeader title="Device Access" subtitle="Consent-based remote support requests and active-session control" onRefresh={load}/><div className="sys-support-request"><div><ShieldCheck/><h2>Request employee device support</h2></div><select value={target} onChange={(event)=>setTarget(event.target.value)}><option value="">Select active user device</option>{sessions.map((item)=><option key={item.sessionId} value={item.sessionId}>{item.name || item.login} · {item.device?.platform} · {item.deviceId || "No device ID"}</option>)}</select><input value={reason} maxLength={500} onChange={(event)=>setReason(event.target.value)} placeholder="Business reason for remote support"/><button type="button" className="primary" disabled={busy||!target||!reason.trim()} onClick={requestAccess}><Laptop/>Request access</button></div>
    {requests.length ? <div className="sys-table-wrap"><table className="sys-table"><thead><tr><th>Requested</th><th>Employee / device</th><th>Reason</th><th>Status</th><th>Requested by</th><th>Actions</th></tr></thead><tbody>{requests.map((item)=><tr key={item.id}><td>{dateTime(item.requestedAt)}</td><td><b>{item.targetName || item.targetLogin}</b><small>{item.targetDeviceId || "No device ID"}</small></td><td>{item.reason}</td><td><Status>{item.status}</Status></td><td>{item.requesterName || item.requesterLogin}</td><td><div className="sys-row-actions">{item.status === "Approved" && <button type="button" className="sys-icon-action" onClick={()=>action(item,"start")}><Play/>Open support</button>}{["Requested","Approved","Active"].includes(item.status)&&<button type="button" className="sys-danger-action" onClick={()=>action(item,"end")}><X/>End</button>}</div></td></tr>)}</tbody></table></div> : <Empty>No remote support requests have been created.</Empty>}
  </section>;
}

export function RemoteSupportConsent({session}) {
  const [requests,setRequests]=useState([]);
  const load=useCallback(async()=>{if(!session?.token)return;try{setRequests(await api(session,"/api/system-admin/device-access/mine"))}catch{}},[session]);
  useEffect(()=>{load();const timer=window.setInterval(load,15000);return()=>window.clearInterval(timer)},[load]);
  const respond=async(item,action)=>{try{await api(session,`/api/system-admin/device-access/${item.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});setRequests((current)=>current.filter((request)=>request.id!==item.id));if(action==="approve")window.location.href="ms-quick-assist:"}catch(error){alert(error.message)}};
  const request=requests[0];
  if(!request)return null;
  const pending=request.status==="Requested";
  return <div className="support-consent" role="alertdialog" aria-modal="true" aria-label="Remote support approval"><div className="support-consent-icon"><Laptop/></div><div><span>{pending?"DEVICE ACCESS REQUEST":"REMOTE SUPPORT IN PROGRESS"}</span><b>{pending?`${request.requesterName || "An administrator"} is requesting remote support`:`Support access is ${request.status.toLowerCase()}`}</b><p>{request.reason}</p><small>{pending?"Access starts only after you approve and confirm in Windows Quick Assist.":"Close Quick Assist and end this session whenever support is complete."}</small></div><div>{pending?<><button type="button" className="secondary" onClick={()=>respond(request,"decline")}>Decline</button><button type="button" className="primary" onClick={()=>respond(request,"approve")}><ShieldCheck/>Approve & open</button></>:<button type="button" className="sys-danger-action" onClick={()=>respond(request,"end")}><X/>End session</button>}</div></div>;
}

export default function SystemAdministrationPage({section, session, auditTrail}) {
  if (section === "Audit Trail") return auditTrail;
  if (["Login Sessions", "Login History"].includes(section)) return <LoginSessions section={section} session={session}/>;
  if (section === "Device Access") return <DeviceAccess session={session}/>;
  return <BackupWorkspace section={section} session={session}/>;
}
