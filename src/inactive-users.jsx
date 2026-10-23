import React,{useEffect,useState} from 'react';
const day=offset=>new Date(Date.now()+330*60000+offset*86400000).toISOString().slice(0,10);
export default function InactiveUsers({token,Table,Modal,formatDate,query=''}){
 const[from,setFrom]=useState(()=>day(0)),[to,setTo]=useState(()=>day(0));
 const[range,setRange]=useState(()=>({from:day(0),to:day(0)})),[refresh,setRefresh]=useState(0);
 const[state,setState]=useState({loading:true,data:null,error:''}),[open,setOpen]=useState(false),[selected,setSelected]=useState(null);
 useEffect(()=>{const controller=new AbortController();setState({loading:true,data:null,error:''});setOpen(false);setSelected(null);
  fetch('/api/inactive-users?'+new URLSearchParams(range),{signal:controller.signal,cache:'no-store',headers:{Authorization:`Bearer ${token}`}})
   .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load inactive users.');return data})
   .then(data=>{if(!controller.signal.aborted)setState({loading:false,data,error:''})})
   .catch(error=>{if(!controller.signal.aborted)setState({loading:false,data:null,error:error.message})});
  return()=>controller.abort();
 },[token,range.from,range.to,refresh]);
 const rows=(state.data?.users||[]).filter(row=>[row.name,row.login,row.roleLabel,row.location,row.accountStatus].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 return <section className="login-activity-panel inactive-users-panel">
  <h2>Inactive users · No login in selected dates</h2>
  <form className="login-activity-controls" onSubmit={event=>{event.preventDefault();setRange({from,to});setRefresh(value=>value+1)}}>
   <label>From date<input type="date" required value={from} max={to} onChange={event=>setFrom(event.target.value)}/></label>
   <label>To date<input type="date" required value={to} min={from} max={day(0)} onChange={event=>setTo(event.target.value)}/></label>
   <button type="submit" className="secondary" disabled={state.loading}>Apply dates</button>
  </form>
  <p>India dates, including both selected dates. This counts fresh successful logins, not whether someone is currently online. A user may keep using an earlier session without logging in again.</p>
  {state.error&&<p role="alert">{state.error}</p>}
  <div className="inactive-user-counts">
   <span>Total login accounts: <b>{state.loading?'…':state.data?.totalUsers??'—'}</b></span>
   <span>Logged in during selected dates: <b>{state.loading?'…':state.data?.loggedInUsers??'—'}</b></span>
   <button type="button" className="secondary" disabled={state.loading||!state.data} onClick={()=>setOpen(value=>!value)} aria-expanded={open} aria-label="View inactive user details">Inactive users: <strong>{state.loading?'…':state.data?.inactiveUsers??'—'}</strong> · View users</button>
  </div>
  {state.data&&<p>Complete date-range tracking is available from {state.data.completeFrom}. Older detailed history may have been removed. Accounts without a configured Pulse password are excluded.</p>}
  {open&&<div className="login-history-table"><p>{rows.length} users match the current search.</p><Table preserveColumnOrder exportTitle={`Inactive users ${range.from} to ${range.to}`}><thead><tr><th>User</th><th>Username</th><th>Role</th><th>Location</th><th>Account status</th><th>Last login</th><th>Last activity</th></tr></thead><tbody>
   {rows.map(row=><tr key={row.id}><td><button type="button" className="secondary" onClick={()=>setSelected(row)}>{row.name}</button></td><td>{row.login}</td><td>{row.roleLabel}</td><td>{row.location}</td><td>{row.accountStatus}</td><td>{row.lastLogin?formatDate(row.lastLogin):'No recorded login'}</td><td>{row.lastActivity?formatDate(row.lastActivity):'No recorded activity'}</td></tr>)}
   {!rows.length&&<tr><td colSpan="7">No inactive users match this date range and search.</td></tr>}
  </tbody></Table></div>}
  {selected&&<Modal title="Inactive user details" close={()=>setSelected(null)}><dl>{[['Name',selected.name],['Username',selected.login],['Role',selected.roleLabel],['Location',selected.location],['Account status',selected.accountStatus],['Selected dates',`${range.from} to ${range.to}`],['Last login',selected.lastLogin?formatDate(selected.lastLogin):'No recorded login'],['Last activity',selected.lastActivity?formatDate(selected.lastActivity):'No recorded activity']].map(([label,value])=><React.Fragment key={label}><dt><b>{label}</b></dt><dd>{value||'Not assigned'}</dd></React.Fragment>)}</dl></Modal>}
 </section>;
}
