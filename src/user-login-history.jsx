import React,{useEffect,useState} from 'react';

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
  return <Modal title={`${row.name||row.login} · Login sessions · Last 24 hours`} close={onClose}>
    <p>All recorded sessions used in the last 24 hours, including separate devices and sessions that have ended.</p>
    <button type="button" className="secondary" onClick={()=>setRefresh(value=>value+1)}>Refresh history</button>
    {error&&<p role="alert">{error}</p>}
    <div className="login-history-table"><Table preserveColumnOrder exportTitle="User login sessions · Last 24 hours"><thead><tr><th>Session</th><th>Signed in</th><th>Last activity</th><th>Device</th><th>Device ID</th><th>IP address</th></tr></thead>
      <tbody>{(data?.sessions||[]).map(item=>{const device=deviceDetails(item.userAgent);return <tr key={item.sessionId}><td>{item.active?'Signed in':'Ended / expired'}</td><td>{formatDate(item.createdAt)}</td><td>{formatDate(item.lastSeenAt)}</td><td>{device.type} · {device.platform} · {device.browser}</td><td>{item.deviceId||'Not recorded'}</td><td>{item.ipAddress||'Not recorded'}</td></tr>;})}
      {!data?.sessions?.length&&<tr><td colSpan="6">{loading?'Loading history…':'No recorded sessions in the last 24 hours.'}</td></tr>}</tbody></Table></div>
    <p>Continuous history tracking began {data?.trackingSince?formatDate(data.trackingSince):'recently'}. Earlier retained activity is included where available.</p>
  </Modal>;
}

export function UserLoginActivity({token,Table,formatDate,query=''}){
  const [period,setPeriod]=useState('7d');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [range,setRange]=useState({period:'7d'});
  const [filter,setFilter]=useState('none');
  const [refresh,setRefresh]=useState(0);
  const {loading,data,error}=useHistory(token,new URLSearchParams(range).toString(),refresh);
  const rows=(data?.users||[]).filter(row=>(filter==='all'||(filter==='none'&&!row.sessionCount)||(filter==='active'&&row.sessionCount)||(filter==='never'&&!row.lastLogin))
    &&[row.name,row.login,row.roleLabel,row.location].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="login-activity-panel">
    <h2>Never logged in / Login activity</h2>
    <form className="login-activity-controls" onSubmit={event=>{event.preventDefault();setRange(period==='custom'?{period,from,to}:{period});setRefresh(value=>value+1);}}>
      <label>Period<select value={period} onChange={event=>{setPeriod(event.target.value);if(event.target.value==='7d')setRange({period:'7d'});}}><option value="7d">Last 7 days</option><option value="custom">Custom dates</option></select></label>
      {period==='custom'&&<><label>From<input type="date" required value={from} onChange={event=>setFrom(event.target.value)} /></label><label>To<input type="date" required min={from} value={to} onChange={event=>setTo(event.target.value)} /></label></>}
      <label>Activity<select value={filter} onChange={event=>setFilter(event.target.value)}><option value="none">No activity in selected period</option><option value="active">Logged in / active in selected period</option><option value="never">No recorded login history</option><option value="all">All users</option></select></label>
      <button type="submit" className="secondary">{period==='custom'?'Apply dates':'Refresh activity'}</button>
    </form>
    <p>{data?`${formatDate(data.from)} — ${formatDate(data.to)} · ${rows.length} users`:''}</p>
    <p>“No recorded login” means no retained history is available; it does not prove the account has never been used. Continuous tracking began {data?.trackingSince?formatDate(data.trackingSince):'recently'}. Login days counts days with a new sign-in, not total time worked.</p>
    {error&&<p role="alert">{error}</p>}
    <div className="login-history-table"><Table preserveColumnOrder exportTitle="User login activity"><thead><tr><th>User</th><th>Login name</th><th>Role</th><th>Location</th><th>Activity</th><th>Logins in period</th><th>Days with logins</th><th>Last recorded login</th></tr></thead><tbody>
      {rows.map(row=><tr key={row.id}><td>{row.name||row.login}</td><td>{row.login}</td><td>{row.roleLabel}</td><td>{row.location}</td><td>{row.activity}</td><td>{row.loginCount}</td><td>{row.loginDays}</td><td>{row.lastLogin?formatDate(row.lastLogin):'No recorded login'}</td></tr>)}
      {!rows.length&&<tr><td colSpan="8">{loading?'Loading activity…':'No users match this view.'}</td></tr>}
    </tbody></Table></div>
  </div>;
}
