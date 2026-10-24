import React,{useEffect,useState} from 'react';
import {canViewTelegramUnlinkedReport,telegramUnlinkedRows} from './telegram-unlinked-report.mjs';
import TelegramMembershipReport from './telegram-membership-report.jsx';

const columns=[
  {key:'name',label:'Employee name',value:row=>row.name},
  {key:'login',label:'Login',value:row=>row.login},
  {key:'role',label:'Role',value:row=>row.role||'—'},
  {key:'site',label:'Site / location',value:row=>row.site||'—'},
  {key:'status',label:'Telegram status',value:row=>row.status},
  {key:'exemption',label:'Login requirement exemption',value:row=>row.exemption},
];

export default function TelegramUnlinkedReport({session,ReportSection,onBack}) {
  const allowed=canViewTelegramUnlinkedReport(session);
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    if(!allowed)return;
    const controller=new AbortController();
    setLoading(true);setError('');setData(null);
    Promise.all(['/api/telegram/settings','/api/user-login-history'].map(url=>fetch(url,{headers:{Authorization:`Bearer ${session.token}`},cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error(response.status===403?'You do not have access to this report.':'Could not load Telegram link status or login history. Please retry.');return response.json();})))
      .then(([telegram,history])=>({...telegram,loginUsers:history.users}))
      .then(result=>{if(!controller.signal.aborted)setData(result);})
      .catch(err=>{if(!controller.signal.aborted)setError(err.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[allowed,session?.token,refresh]);
  if(!allowed)return <section className="panel"><h1>Access denied</h1><p>This report is available to Admin and Super Admin.</p></section>;
  const rows=telegramUnlinkedRows(data?.users||[],data?.loginUsers||[]);
  return <section className="reports-page panel pagepanel">
    <header><div><h1>Telegram Membership Report</h1><p>Check required site group membership for all users. The legacy connection report is included below; its historical exemptions do not bypass mandatory membership.</p></div><div className="reports-header-actions"><button onClick={onBack}>Back to reports</button><button disabled={loading} onClick={()=>setRefresh(value=>value+1)}>{loading?'Loading…':'Refresh'}</button></div></header>
    {error&&<p role="alert">{error}</p>}
    {loading&&<p role="status">Loading Telegram link status…</p>}
    <TelegramMembershipReport token={session.token} ReportSection={ReportSection}/>
    {data&&<ReportSection title="Telegram Not Linked Report" description={`${rows.length} logged-in users not linked · ${rows.filter(row=>row.exempt).length} exempt`} rows={rows} columns={columns} rowKey={row=>row.login} emptyMessage="No users with a recorded login are waiting to link Telegram." />}
  </section>;
}
