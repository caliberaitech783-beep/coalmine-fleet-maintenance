import React,{useEffect,useRef,useState} from 'react';
import {Send} from 'lucide-react';
import {readApiJson} from './api-response.mjs';
import './mis-telegram-approval.css';

const DESTINATION='https://pulse-ll.cmll.in';
const POLL_MS=2000;

// MIS sign-in by tapping Approve on a Telegram message from the Pulse bot, instead of the
// password. The page shows a 2-digit number that the Telegram message repeats, waits for
// the tap, then continues to Pulse-II by itself.
export function useMisTelegramApproval({handoff,remember,onError,onNotice,fetchImpl=globalThis.fetch,assign=url=>window.location.assign(url)}){
  const [request,setRequest]=useState(null),[sending,setSending]=useState(false),[now,setNow]=useState(()=>Date.now());
  const rememberRef=useRef(remember);rememberRef.current=remember;
  const callbacks=useRef({onError,onNotice});callbacks.current={onError,onNotice};
  const send=async username=>{
    if(sending||request)return;
    setSending(true);callbacks.current.onError('');callbacks.current.onNotice('');
    try{
      const response=await fetchImpl('/api/mis-login/telegram-approval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,...handoff})});
      const data=await readApiJson(response,'Could not send the approval to Telegram.');
      setRequest({token:data.requestToken,number:data.number,endsAt:Date.now()+Number(data.expiresInSeconds||180)*1000});
      callbacks.current.onNotice(data.message||'Check Telegram.');
    }catch(error){callbacks.current.onError(error.message);}
    finally{setSending(false);}
  };
  const cancel=()=>{setRequest(null);callbacks.current.onNotice('');};
  useEffect(()=>{
    if(!request)return;
    let stopped=false,timer;
    const poll=async()=>{
      if(stopped)return;
      setNow(Date.now());
      if(Date.now()>request.endsAt){setRequest(null);callbacks.current.onNotice('');callbacks.current.onError('The Telegram request ended without an answer. Press Sign in to send a new one.');return;}
      try{
        const response=await fetchImpl('/api/mis-login/telegram-approval/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestToken:request.token,remember:rememberRef.current===true,...handoff})});
        const data=await readApiJson(response,'Could not check the Telegram answer.');
        if(stopped)return;
        if(data.status==='approved'){
          const target=new URL(data.redirectUrl);
          if(target.origin!==DESTINATION||target.pathname!=='/api/mis-credentials/callback')throw new Error('Invalid MIS sign-in destination.');
          stopped=true;callbacks.current.onNotice('Approved. Opening MIS…');assign(target.toString());return;
        }
        if(data.status==='rejected'){setRequest(null);callbacks.current.onNotice('');callbacks.current.onError('The sign-in was rejected in Telegram.');return;}
        if(data.status==='expired'){setRequest(null);callbacks.current.onNotice('');callbacks.current.onError('The Telegram request ended. Press Sign in to send a new one.');return;}
      }catch(error){if(!stopped)callbacks.current.onError(error.message);}
      if(!stopped)timer=setTimeout(poll,POLL_MS);
    };
    timer=setTimeout(poll,POLL_MS);
    return()=>{stopped=true;clearTimeout(timer);};
  },[request?.token]);
  const secondsLeft=request?Math.max(0,Math.round((request.endsAt-now)/1000)):0;
  return {send,cancel,sending,waiting:Boolean(request),number:request?.number,secondsLeft};
}

export function MisTelegramApprovalPanel({approval}){
  if(!approval.waiting)return <p className="mis-approval-hint"><Send aria-hidden="true"/>Press <b>Sign in</b> and an <b>Approve / Reject</b> message comes to your Telegram chat with the Pulse bot. Connect Telegram in Pulse first if you have not.</p>;
  const minutes=Math.floor(approval.secondsLeft/60),seconds=String(approval.secondsLeft%60).padStart(2,'0');
  return <div className="mis-approval-wait" role="status" aria-live="polite">
    <small>Number on this screen</small>
    <strong>{approval.number}</strong>
    <span>Open Telegram and tap <b>Approve ({approval.number})</b>. MIS opens here by itself.</span>
    <small>Waiting… {minutes}:{seconds}</small>
    <button type="button" onClick={approval.cancel}>Cancel</button>
  </div>;
}

export function MisSignInMethodSwitch({approvalMode,onChange}){
  return <button type="button" className="mis-signin-switch" onClick={()=>onChange(!approvalMode)}>
    {approvalMode?'Use my password instead':'Sign in with Telegram approval instead'}
  </button>;
}
