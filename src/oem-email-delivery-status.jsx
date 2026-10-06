import React,{useEffect,useState} from 'react';

export default function OemEmailDeliveryStatus({session}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState('');
  const headers={Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'};
  const load=async()=>{
    try{const response=await fetch('/api/oem-email-deliveries',{headers,cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load delivery status.');setData(result);setError('');}
    catch(e){setError(e.message);}
  };
  useEffect(()=>{void load();},[session.token]);
  const action=async(path,body)=>{
    setBusy(true);setNotice('');setError('');
    try{const response=await fetch(`/api/oem-email-deliveries/${path}`,{method:'POST',headers,body:JSON.stringify(body||{})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Operation failed.');await load();setNotice(result.message);}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const retry=row=>{
    const reason=window.prompt(`Retry only this failed email to ${row.email}? The report will use current active BD cases. Enter a reason:`);
    if(!reason?.trim())return;
    void action('retry',{day:row.day,recipientKey:row.recipient_key,reason:reason.trim()});
  };
  const time=value=>value?new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'Not recorded';
  const rows=(data?.deliveries||[]).filter(row=>[row.oem,row.email,row.status,row.day,row.level].some(value=>String(value||'').toLowerCase().includes(query.toLowerCase())));
  return <section className="panel pagepanel">
    <header><h1>OEM Email Delivery Status</h1><div><button disabled={busy} onClick={()=>load()}>Refresh</button> <button disabled={busy} onClick={()=>action('check')}>Check email connection</button></div></header>
    <p>SMTP accepted means the mail server accepted the email—not proof of inbox delivery or that the OEM read it.</p>
    {data&&<p>Sender: {data.sender} · Scheduler: {data.schedulerEnabled?'Enabled':'Disabled'} · Credentials: {data.configured?'Configured (not verified)':'Missing'}<br/>{data.schedule}<br/>{data.note}</p>}
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <input type="search" aria-label="Search OEM email deliveries" placeholder="Search OEM, recipient, date or status" value={query} onChange={event=>setQuery(event.target.value)}/>
    <div style={{overflowX:'auto',marginTop:16}}><table><thead><tr>{['Scheduled (IST)','OEM / Level','Recipient','BD cases','Status','PDF / Excel','Last attempt (IST)','Accepted (IST)','Message ID','Acknowledgement','Error / Retry'].map(label=><th key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(row=><tr key={`${row.day}:${row.recipient_key}`}>
        <td>{row.day} {row.recipient_key.includes(':test-1300')?'1:00 PM':row.recipient_key.includes(':test-1100')?'11:00 AM':row.recipient_key.includes(':extra-1900')?'7:00 PM':'5:00 PM'}</td>
        <td>{row.oem} / {row.level}</td><td>{row.email}</td><td>{row.case_count}</td><td>{row.status}</td>
        <td>{row.attachments?.length?row.attachments.map(file=><div key={file.filename}>{file.filename} ({file.bytes} bytes)</div>):'Not recorded for this attempt'}</td>
        <td>{time(row.last_attempt_at)}</td><td>{time(row.sent_at)}</td><td>{row.message_id||'Not recorded'}</td><td>{row.acknowledgement_status||'Not recorded / not requested'}</td>
        <td>{row.error||'—'}{row.retry_safe&&row.status==='Failed / review required'&&!row.message_id?<button disabled={busy} onClick={()=>retry(row)}>Retry failed email</button>:row.status==='Failed / review required'?<p>Manual review required; retry blocked to prevent duplicates.</p>:null}
          {!!row.attempts?.length&&<details><summary>Retry history</summary>{row.attempts.map((attempt,index)=><p key={index}>{time(attempt.at)} · {attempt.actor} · {attempt.reason} · Previous: {attempt.previousError}</p>)}</details>}
        </td></tr>)}{!rows.length&&<tr><td colSpan={11}>{data?'No recorded attempts match this view.':'Loading…'}</td></tr>}</tbody></table></div>
  </section>;
}
