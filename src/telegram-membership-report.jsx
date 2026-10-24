import React,{useEffect,useState} from 'react';

const columns=[
  {key:'name',label:'Employee',value:row=>row.name},
  {key:'login',label:'Login',value:row=>row.login},
  {key:'site',label:'Required site',value:row=>row.site},
  {key:'status',label:'Membership status',value:row=>row.status},
  {key:'checkedAt',label:'Last verified',value:row=>row.checkedAt||'Not verified'},
  {key:'inviteLink',label:'Joining link',value:row=>row.inviteLink||'Site allocation required'},
];

function MembershipTable({rows,columns}){
  return <div style={{overflowX:'auto'}}><table><thead><tr>{columns.map(column=><th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={`${row.login}:${row.site}`}>{columns.map(column=><td key={column.key}>{column.value(row)}</td>)}</tr>)}</tbody></table></div>;
}

export default function TelegramMembershipReport({token,ReportSection=MembershipTable}){
  const [users,setUsers]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[progress,setProgress]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setUsers([]);setError('');setLoading(true);
    (async()=>{
      let offset=0;const collected=[];
      do{
        const response=await fetch(`/api/telegram/site-groups/membership?offset=${offset}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Could not verify membership. Retry the report.');
        const result=await response.json();collected.push(...result.users);
        if(controller.signal.aborted)return;
        setUsers([...collected]);setProgress(`${collected.length} of ${result.total} accounts checked`);
        offset=result.nextOffset;
      }while(offset!==null);
    })().catch(error=>{if(!controller.signal.aborted)setError(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[token,revision]);
  const rows=users.filter(user=>!user.allowed).flatMap(user=>user.groups.length?user.groups.filter(group=>!group.joined).map(group=>({...group,name:user.name,login:user.login})):[{name:user.name,login:user.login,site:user.site||'Unassigned',status:'Site allocation required'}]);
  return <section>
    <h2>Telegram Site Groups — Not Joined Report</h2>
    <p>All configured login accounts are checked, including users who have never signed in. Every assigned site group is mandatory; previous Telegram exemptions do not apply.</p>
    <button type="button" disabled={loading} onClick={()=>setRevision(value=>value+1)}>{loading?'Checking membership…':'Refresh membership'}</button>
    <p role="status">{progress}{loading?' · Report incomplete while checking':''}</p>
    {error&&<p role="alert">{error} Results below are incomplete.</p>}
    <ReportSection title="Telegram Site Groups — Not Joined Report" description={`${rows.length} missing memberships or setup issues · ${users.filter(user=>user.allowed).length} accounts fully verified${loading||error?' · Partial results':''}`} rows={rows} columns={columns} rowKey={row=>`${row.login}:${row.site}`} emptyMessage={loading?'Checking accounts…':'No missing memberships in checked accounts.'}/>
  </section>;
}
