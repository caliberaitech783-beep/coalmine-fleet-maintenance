import React, {useEffect,useState} from 'react';
import {DailyUpdatesPanel} from './daily-updates-list.jsx';
import {formatDisplayDateTime} from '../date-time-format.mjs';
import './breakdown-reason-history.css';

export default function BreakdownReasonHistory({reference,reason,token,Dialog}) {
  const [open,setOpen]=useState(false),[state,setState]=useState(null),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    setState(null);
    fetch(`/api/requests/${encodeURIComponent(reference)}/timeline`,{cache:'no-store',signal:controller.signal,headers:{Authorization:`Bearer ${token}`}})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load reason history.');if(!controller.signal.aborted)setState({data});})
      .catch(error=>{if(!controller.signal.aborted)setState({error:error.message});});
    return ()=>controller.abort();
  },[open,reference,token,retry]);
  if(!reference||reference==='—'||!Dialog)return <span>{reason||'—'}</span>;
  const history=Array.isArray(state?.data?.reasonHistory)?state.data.reasonHistory:[];
  const request=state?.data?.request||{};
  return <><button type="button" className="request-timeline-link" onClick={()=>setOpen(true)} title="View breakdown reason history and daily remarks">{reason||'View reason and daily remarks'}</button>
    {open&&<Dialog title={`Breakdown reason history · ${reference}`} className="request-timeline-modal breakdown-reason-history-modal" overlayClassName="breakdown-reason-history-overlay" close={()=>setOpen(false)}>
      <div className="request-timeline-content breakdown-reason-history-content">
      {!state?<p role="status">Loading reasons and daily remarks…</p>:state.error?<div><p role="alert">{state.error}</p><button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>:<>
        <h3>Current reason of BD</h3><p style={{whiteSpace:'pre-wrap'}}>{request.complaint||reason||'—'}</p>
        <h3>Saved reason changes</h3>
        {history.length?<><p style={{whiteSpace:'pre-wrap'}}>First recorded reason: {history[0].from||'—'}</p><ol>{history.map((entry,index)=><li key={index}><p style={{whiteSpace:'pre-wrap'}}>{entry.from||'—'} → {entry.to||'—'}</p><small>{entry.changedBy||entry.login||'Not recorded'} · {formatDisplayDateTime(entry.changedAt)}</small></li>)}</ol></>:<p>No saved reason changes. Earlier overwritten reasons may not have been recorded.</p>}
        <h3>Daily remarks</h3>{request.dailyRemarks?.length?<DailyUpdatesPanel remarks={request.dailyRemarks} category={request.category}/>:<p>No daily remarks recorded.</p>}
      </>}
      </div>
    </Dialog>}
  </>;
}
