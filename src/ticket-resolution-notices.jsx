import React,{useEffect,useRef,useState} from 'react';
import {startVisiblePoll} from './visible-poll.mjs';
import {ProtectedAttachment,ProtectedAudio} from './protected-media.jsx';
import './ticket-resolution-notices.css';

export default function TicketResolutionNotices({token}){
  const [records,setRecords]=useState([]),[error,setError]=useState(''),[closing,setClosing]=useState('');
  const dismissed=useRef(new Set()),active=useRef(false),saving=useRef(false);
  useEffect(()=>{
    active.current=true;
    const stop=startVisiblePoll(async()=>{
      try{
        const response=await fetch('/api/tickets/resolution-notices',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
        const body=await response.json();
        if(!response.ok||!Array.isArray(body))throw new Error(body.error||'Could not refresh ticket resolutions.');
        if(active.current)setRecords(body.filter(ticket=>!dismissed.current.has(ticket.reference)));
      }catch{/* Keep the last visible notices during a network failure. */}
    },30000);
    return()=>{active.current=false;stop();};
  },[token]);
  const acknowledge=async(reference)=>{
    if(saving.current)return;
    saving.current=true;setClosing(reference);setError('');
    try{
      const response=await fetch('/api/tickets/acknowledge-resolution',{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({reference})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Could not close this notice. Please retry.');
      if(active.current){dismissed.current.add(reference);setRecords(current=>current.filter(ticket=>ticket.reference!==reference));}
    }catch(problem){if(active.current)setError(problem.message);}
    finally{saving.current=false;if(active.current)setClosing('');}
  };
  if(!records.length)return null;
  return <aside className="ticket-resolution-notices" aria-label="Your resolved tickets" aria-live="polite">
    <header><h2>Admin resolved your ticket{records.length===1?'':'s'}</h2><p>Review the resolution and close each notice. These notices stay here until you close them.</p></header>
    {error&&<p role="alert">{error}</p>}
    <div className="ticket-resolution-notice-list">{records.map(ticket=><article key={ticket.reference}>
      <h3>{ticket.reference}</h3><p>{ticket.message||'Ticket submitted with audio'}</p>
      <strong>Resolution</strong><p>{ticket.resolutionMessage||'Listen to the resolution audio below.'}</p>
      {ticket.resolutionAudioAvailable&&<ProtectedAudio url={`/api/tickets/${encodeURIComponent(ticket.reference)}/media/resolution-audio`} token={token} label="Resolution audio" />}
      {ticket.resolutionAttachmentAvailable&&<ProtectedAttachment url={`/api/tickets/${encodeURIComponent(ticket.reference)}/media/resolution-attachment`} token={token} fileName={ticket.resolutionAttachmentName} contentType={ticket.resolutionAttachmentType} label="Resolution attachment" />}
      <small>Resolved by {ticket.resolvedBy} · {ticket.resolvedAt} IST</small>
      <button type="button" disabled={Boolean(closing)} onClick={()=>acknowledge(ticket.reference)}>{closing===ticket.reference?'Closing…':'Close resolution notice'}</button>
    </article>)}</div>
  </aside>;
}
