import React,{useEffect,useState} from 'react';
import {sessionTimeSummary,formatSessionDuration} from './login-session-duration.mjs';
import {LOGIN_ACTIVITY_FILTERS,loginActivityRows} from './login-activity.mjs';

function useHistory(token,parameters,refreshKey=0){
  const [state,setState]=useState({loading:true,data:null,error:''});
  useEffect(()=>{
    const controller=new AbortController();
    setState({loading:true,data:null,error:''});
    fetch(`/api/user-login-history?${parameters}`,{signal:controller.signal,cache:'no-store',headers:{Authorization:`Bearer ${token}`}})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load login history.');return data;})
      .then(data=>{if(!controller.signal.aborted)setState({loading:false,data,error:''});})
      .catch(error=>{if(!controller.signal.aborted)setState({loading:false,data:null,error:error.message});});
    return()=>controller.abort();
  },[token,parameters,refreshKey]);
  return state;
}

export function UserLoginHistory({token,row,Modal,Table,formatDate,deviceDetails,onClose}){
  const [refresh,setRefresh]=useState(0);
  const {loading,data,error}=useHistory(token,new URLSearchParams({period:'24h',login:row.login}).toString(),refresh);
  const timing=sessionTimeSummary(data?.sessions||[],data?.from,data?.to);
  return <Modal className="login-history-modal" title={<span className="login-history-heading"><span><span className="login-history-eyebrow">Login history · Last 24 hours</span><span className="login-history-name">{row.name||row.login}</span></span><span className="login-history-total" role="status"><span>Total time spent (last 24 hours)</span><strong>{loading?'Loading…':error?'Unavailable':formatSessionDuration(timing.total)}</strong></span></span>} close={onClose}>
    <div className="login-history-content">
    <div className="login-history-controls"><div><b>{loading?'Loading sessions…':`${data?.sessions?.length||0} recorded sessions`}</b><p>All devices, including ended sessions.</p></div><button type="button" className="secondary" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Refresh history</button></div>
    <details className="login-history-help"><summary>How is time calculated?</summary><p>Duration runs from login to last recorded activity, limited to the last 24 hours. Total time combines overlapping sessions only once; it is recorded session time, not a measure of continuous work.</p></details>
    {error&&<p role="alert">{error}</p>}
    <div className="login-history-table"><Table preserveColumnOrder exportTitle="User login sessions · Last 24 hours"><thead><tr><th>Session</th><th>Duration</th><th>Last activity</th><th>Device</th><th>Device ID</th><th>IP address</th></tr></thead>
      <tbody>{(data?.sessions||[]).map((item,index)=>{const device=deviceDetails(item.userAgent);return <tr key={item.sessionId}><td><span className={`session-state ${item.active?'online':'inactive'}`}>{item.active?'Signed in':'Ended / expired'}</span></td><td><b>{formatSessionDuration(timing.durations[index])}</b></td><td>{formatDate(item.lastSeenAt)}</td><td>{device.type} · {device.platform} · {device.browser}</td><td>{item.deviceId||'Not recorded'}</td><td>{item.ipAddress||'Not recorded'}</td></tr>;})}
      {!data?.sessions?.length&&<tr><td colSpan="6">{loading?'Loading history…':'No recorded sessions in the last 24 hours.'}</td></tr>}</tbody></Table></div>
    <p>Continuous history tracking began {data?.trackingSince?formatDate(data.trackingSince):'recently'}. Earlier retained activity is included where available.</p>
    </div>
  </Modal>;
}

export function UserLoginActivity({token,Table,formatDate,query=''}){
  const [toolbarTarget,setToolbarTarget]=useState(null);
  const [filter,setFilter]=useState('all');
  const [refresh,setRefresh]=useState(0);
  // Latest known timestamps are independent of the detailed-log retention window.
  const {loading,data,error}=useHistory(token,'period=all',refresh);
  const needle=query.trim().toLowerCase();
  const rows=loginActivityRows(data?.users||[],filter).filter(row=>[row.name,row.login,row.roleLabel,row.location].join(' ').toLowerCase().includes(needle));
  const noActivityCount=loginActivityRows(data?.users||[],'never').length;
  return <div className="login-activity-panel">
    <div className="login-activity-heading"><div><span className="login-history-eyebrow">User activity overview</span><h2>Last login &amp; last activity</h2></div><span className="login-activity-count" role="status"><strong>{loading?'…':error?'—':rows.length}</strong> users shown{data&&!loading?` · ${noActivityCount} with no recorded activity`:''}</span></div>
    <form className="login-activity-controls" onSubmit={event=>{event.preventDefault();setRefresh(value=>value+1);}}>
      <label>Show<select value={filter} onChange={event=>setFilter(event.target.value)}>{LOGIN_ACTIVITY_FILTERS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <button type="submit" className="secondary">Refresh</button>
    </form>
    <details className="login-history-help"><summary>About login history and activity</summary><p>Last login is the latest recorded successful sign-in. Last activity is the latest recorded authenticated session activity or saved action matched to this exact login name. An older action can confirm use even when its login time is unavailable. “No recorded activity” means no matching evidence is available, not proof that the person never used the software. Days since login use India calendar dates. Latest timestamps remain after detailed-log cleanup; retained login counts and login days cover only sessions still on record, not lifetime totals. Continuous history tracking began {data?.trackingSince?formatDate(data.trackingSince):'recently'}.</p></details>
    {error&&<p role="alert">{error}</p>}
    <div className="login-activity-table-actions" ref={setToolbarTarget} />
    <div className="login-history-table login-activity-scroll" tabIndex={0} role="region" aria-label="User activity results, scroll to view more users"><Table preserveColumnOrder toolbarTarget={toolbarTarget} toolbarPortal exportTitle="User login activity"><thead><tr><th>User</th><th>Login name</th><th>Role</th><th>Location</th><th>Status</th><th>Days since last login</th><th>Last recorded login</th><th>Last activity</th><th>Retained logins</th><th>Retained login days</th></tr></thead><tbody>
      {rows.map(row=><tr key={row.id} className={!row.hasActivity?'login-never':''}><td>{row.name||row.login}</td><td>{row.login}</td><td>{row.roleLabel}</td><td>{row.location}</td><td>{row.status}</td><td>{row.daysSince===null?'—':row.daysSince}</td><td>{row.lastLogin?formatDate(row.lastLogin):'Not recorded'}</td><td>{row.lastActivity?formatDate(row.lastActivity):'Not recorded'}</td><td>{row.loginCount}</td><td>{row.loginDays}</td></tr>)}
      {!rows.length&&<tr><td colSpan="10">{loading?'Loading activity…':error?'Activity is unavailable. Please refresh.':'No users match this view.'}</td></tr>}
    </tbody></Table></div>
  </div>;
}
