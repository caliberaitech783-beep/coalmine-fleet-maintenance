import React, {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {record as recordRemoteSession, Replayer} from "rrweb";
import {AlertTriangle, CheckCircle2, Eye, Hand, MonitorUp, MousePointer2, ShieldCheck, X} from "lucide-react";
import "rrweb/dist/style.css";
import "./remote-assistance.css";

const ASSISTANCE_POLL_MS=2000;
const COMMAND_POLL_MS=700;

async function assistanceJson(url,{token,method="GET",body,signal}={}){
  const response=await fetch(url,{
    method,signal,cache:"no-store",
    headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},
    body:body?JSON.stringify(body):undefined,
  });
  if(response.status===204)return null;
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(result.error||"Remote assistance request failed."),{status:response.status});
  return result;
}

function remainingLabel(expiresAt){
  const seconds=Math.max(0,Math.ceil((new Date(expiresAt).getTime()-Date.now())/1000));
  return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
}

export function RemoteAssistanceRequestDialog({row,token,onClose,onRequested}){
  const [accessLevel,setAccessLevel]=useState("control");
  const [durationMinutes,setDurationMinutes]=useState(15);
  const [reason,setReason]=useState("");
  const [sending,setSending]=useState(false);
  const [error,setError]=useState("");
  const submit=async(event)=>{
    event.preventDefault();
    if(reason.trim().length<5)return setError("Enter a clear reason for the assistance request.");
    setSending(true);setError("");
    try{
      const result=await assistanceJson(`/api/user-sessions/${encodeURIComponent(row.sessionId)}/assistance`,{
        token,method:"POST",body:{accessLevel,durationMinutes,reason:reason.trim()},
      });
      onRequested?.(result.assistance);
    }catch(requestError){setError(requestError.message);}
    finally{setSending(false);}
  };
  return createPortal(<div className="remote-assistance-overlay" data-remote-assistance-ui>
    <section className="remote-assistance-dialog" role="dialog" aria-modal="true" aria-labelledby="remote-request-title">
      <header><span><MonitorUp /></span><div><small>Secure in-app assistance</small><h2 id="remote-request-title">Request access to {row.name||row.login||"user"}&apos;s BDMS tab</h2></div><button type="button" onClick={onClose} aria-label="Close"><X /></button></header>
      <form onSubmit={submit}>
        <div className="remote-assistance-recipient"><b>{row.name||"Unknown user"}</b><span>{row.login||"No login"} · {row.location||"Not assigned"}</span><i>Online</i></div>
        <div className="remote-assistance-fields">
          <label><span>Access level</span><select value={accessLevel} onChange={(event)=>setAccessLevel(event.target.value)}><option value="control">Control this BDMS tab</option><option value="view">View this BDMS tab only</option></select></label>
          <label><span>Maximum duration</span><select value={durationMinutes} onChange={(event)=>setDurationMinutes(Number(event.target.value))}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option></select></label>
          <label className="wide"><span>Reason for assistance</span><textarea autoFocus maxLength="500" rows="4" value={reason} onChange={(event)=>{setReason(event.target.value);setError("");}} placeholder="Describe why access is required..." /></label>
        </div>
        <div className="remote-assistance-boundary"><ShieldCheck /><p><b>User approval is required.</b> Access is restricted to the open BDMS tab. Other applications, device files, passwords, file inputs, and operating-system controls are not available.</p></div>
        {error&&<p className="remote-assistance-error" role="alert"><AlertTriangle />{error}</p>}
        <footer><button type="button" onClick={onClose} disabled={sending}>Cancel</button><button type="submit" className="primary" disabled={sending}>{sending?"Sending request...":"Send approval request"}</button></footer>
      </form>
    </section>
  </div>,document.body);
}

function safeRemoteTarget(node){
  return node instanceof Element&&!node.closest("[data-remote-assistance-ui]")&&!node.closest('input[type="file"]')&&!node.closest('input[type="password"]');
}

function setNativeControlValue(node,payload){
  if(!safeRemoteTarget(node))return;
  if(node instanceof HTMLInputElement&&["checkbox","radio"].includes(node.type)){
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"checked")?.set;
    setter?.call(node,Boolean(payload.checked));
  }else if(node instanceof HTMLInputElement){
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    setter?.call(node,String(payload.value??""));
  }else if(node instanceof HTMLTextAreaElement){
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set;
    setter?.call(node,String(payload.value??""));
  }else if(node instanceof HTMLSelectElement){
    const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")?.set;
    setter?.call(node,String(payload.value??""));
  }else return;
  node.dispatchEvent(new Event("input",{bubbles:true}));
  node.dispatchEvent(new Event("change",{bubbles:true}));
}

function applyRemoteCommand(command){
  const payload=command.payload||{};
  const node=Number(payload.nodeId)===-1?window:recordRemoteSession.mirror.getNode(Number(payload.nodeId));
  if(command.type==="click"&&safeRemoteTarget(node)){
    node.scrollIntoView?.({block:"nearest",inline:"nearest"});
    node.focus?.({preventScroll:true});
    node.click?.();
  }else if(command.type==="input")setNativeControlValue(node,payload);
  else if(command.type==="scroll"){
    if(node===window)window.scrollTo({left:Number(payload.x)||0,top:Number(payload.y)||0,behavior:"auto"});
    else if(safeRemoteTarget(node))node.scrollTo?.({left:Number(payload.x)||0,top:Number(payload.y)||0,behavior:"auto"});
  }
}

export function RemoteAssistanceAgent({session}){
  const [assistance,setAssistance]=useState(null);
  const [responding,setResponding]=useState("");
  const [error,setError]=useState("");
  const [,setClock]=useState(0);
  const commandCursor=useRef(0);
  const eventQueue=useRef([]);
  const recordingActive=Boolean(assistance&&["Approved","Active"].includes(assistance.status));
  useEffect(()=>{
    if(!session?.token){setAssistance(null);return undefined;}
    const controller=new AbortController();let timer;
    const poll=async()=>{
      try{
        const result=await assistanceJson("/api/remote-assistance/current",{token:session.token,signal:controller.signal});
        if(!controller.signal.aborted)setAssistance(result.assistance||null);
      }catch(pollError){if(pollError.name!=="AbortError"&&pollError.status!==401)console.warn("Remote assistance check failed.",pollError);}
      finally{if(!controller.signal.aborted)timer=window.setTimeout(poll,ASSISTANCE_POLL_MS);}
    };
    void poll();
    return()=>{controller.abort();window.clearTimeout(timer);};
  },[session?.token]);
  useEffect(()=>{
    if(!assistance?.expiresAt)return undefined;
    const timer=window.setInterval(()=>setClock((value)=>value+1),1000);
    return()=>window.clearInterval(timer);
  },[assistance?.id,assistance?.expiresAt]);
  useEffect(()=>{
    if(!assistance||!recordingActive)return undefined;
    let stopped=false,uploading=false,flushTimer,commandTimer;
    commandCursor.current=0;
    const flush=async()=>{
      if(stopped||uploading||!eventQueue.current.length)return;
      uploading=true;
      const events=eventQueue.current.splice(0,100);
      try{await assistanceJson(`/api/remote-assistance/${encodeURIComponent(assistance.id)}/events`,{token:session.token,method:"POST",body:{events}});}
      catch(uploadError){eventQueue.current.unshift(...events);if(uploadError.status===409)setAssistance(null);}
      finally{uploading=false;if(!stopped&&eventQueue.current.length>=20)void flush();}
    };
    const stopRecording=recordRemoteSession({
      emit(event){eventQueue.current.push(event);if(eventQueue.current.length>=20)void flush();},
      blockSelector:'[data-remote-assistance-ui],input[type="file"]',
      maskInputOptions:{password:true},recordCanvas:false,inlineImages:false,collectFonts:false,mousemoveWait:100,
    });
    flushTimer=window.setInterval(()=>void flush(),500);
    const pollCommands=async()=>{
      try{
        const result=await assistanceJson(`/api/remote-assistance/${encodeURIComponent(assistance.id)}/commands?after=${commandCursor.current}`,{token:session.token});
        for(const command of result.commands||[]){applyRemoteCommand(command);commandCursor.current=Math.max(commandCursor.current,Number(command.id)||0);}
      }catch(commandError){if(commandError.status===409||commandError.status===404)setAssistance(null);}
      finally{if(!stopped)commandTimer=window.setTimeout(pollCommands,COMMAND_POLL_MS);}
    };
    void pollCommands();
    return()=>{stopped=true;stopRecording?.();window.clearInterval(flushTimer);window.clearTimeout(commandTimer);eventQueue.current=[];};
  },[assistance?.id,recordingActive,session?.token]);
  const respond=async(decision)=>{
    setResponding(decision);setError("");
    try{
      const result=await assistanceJson(`/api/remote-assistance/${encodeURIComponent(assistance.id)}/respond`,{token:session.token,method:"PATCH",body:{decision}});
      setAssistance(decision==="approve"?result.assistance:null);
    }catch(responseError){setError(responseError.message);}
    finally{setResponding("");}
  };
  const end=async()=>{
    if(!assistance)return;
    setResponding("end");
    try{await assistanceJson(`/api/remote-assistance/${encodeURIComponent(assistance.id)}/end`,{token:session.token,method:"PATCH"});setAssistance(null);}
    catch(endError){setError(endError.message);}
    finally{setResponding("");}
  };
  if(!assistance)return null;
  if(assistance.status==="Pending")return createPortal(<div className="remote-assistance-overlay" data-remote-assistance-ui>
    <section className="remote-approval-dialog" role="alertdialog" aria-modal="true" aria-labelledby="remote-approval-title">
      <header><small>BDMS assistance request</small><h2 id="remote-approval-title">{assistance.requesterName||assistance.requesterLogin||"Administrator"} is requesting {assistance.accessLevel==="control"?"control":"a live view"}</h2></header>
      <div className="remote-approval-body">
        <dl><div><dt>Requested by</dt><dd>{assistance.requesterName||assistance.requesterLogin}</dd></div><div><dt>Access</dt><dd>{assistance.accessLevel==="control"?"Click, type, scroll and navigate":"View only"}</dd></div><div><dt>Duration</dt><dd>{assistance.durationMinutes} minutes maximum</dd></div><div><dt>Scope</dt><dd>This BDMS tab only</dd></div></dl>
        <blockquote>{assistance.reason}</blockquote>
        <div className="remote-assistance-boundary"><ShieldCheck /><p>The administrator cannot access other apps, files, passwords, your camera, microphone, or device settings. You can end assistance at any time.</p></div>
        {error&&<p className="remote-assistance-error" role="alert"><AlertTriangle />{error}</p>}
      </div>
      <footer><button type="button" className="danger" onClick={()=>respond("decline")} disabled={Boolean(responding)}>{responding==="decline"?"Declining...":"Decline"}</button><button type="button" className="primary" onClick={()=>respond("approve")} disabled={Boolean(responding)}>{responding==="approve"?"Approving...":"Approve BDMS assistance"}</button></footer>
    </section>
  </div>,document.body);
  return createPortal(<aside className="remote-assistance-active" data-remote-assistance-ui role="status"><span><CheckCircle2 /></span><div><b>{assistance.accessLevel==="control"?"BDMS control active":"BDMS view active"}</b><small>{assistance.requesterName||assistance.requesterLogin||"Administrator"} · This tab only</small></div><time>{remainingLabel(assistance.expiresAt)}</time><button type="button" onClick={end} disabled={responding==="end"}><X />{responding==="end"?"Ending...":"End"}</button>{error&&<em>{error}</em>}</aside>,document.body);
}

function remoteNodePayload(replayer,target){
  return {nodeId:replayer.getMirror().getId(target)};
}

export function RemoteAssistanceControlRoom({assistance,token,onClose,onEnded}){
  const root=useRef(null);
  const replayer=useRef(null);
  const batchCursor=useRef(0);
  const pendingEvents=useRef([]);
  const [status,setStatus]=useState(assistance.status);
  const [expiresAt,setExpiresAt]=useState(assistance.expiresAt);
  const [connected,setConnected]=useState(false);
  const [error,setError]=useState("");
  const [,setClock]=useState(0);
  const canControl=assistance.accessLevel==="control";
  const sendCommand=async(type,payload)=>{
    try{await assistanceJson(`/api/remote-assistance/${encodeURIComponent(assistance.id)}/commands`,{token,method:"POST",body:{type,payload}});}
    catch(commandError){setError(commandError.message);}
  };
  useEffect(()=>{
    const timer=window.setInterval(()=>setClock((value)=>value+1),1000);
    return()=>window.clearInterval(timer);
  },[]);
  useEffect(()=>{
    let stopped=false,timer;
    const bindInteraction=()=>{
      const instance=replayer.current;if(!instance||!canControl)return;
      instance.enableInteract();
      const frame=instance.iframe;
      const doc=frame?.contentDocument;
      if(!doc||doc.__bdmsRemoteBound)return;
      doc.__bdmsRemoteBound=true;
      doc.addEventListener("click",(event)=>{
        if(!event.isTrusted)return;
        event.preventDefault();event.stopPropagation();
        const target=event.target?.closest?.('button,a,input,select,textarea,label,[role="button"],[role="tab"],[role="menuitem"]')||event.target;
        const payload=remoteNodePayload(instance,target);
        if(payload.nodeId>=0)void sendCommand("click",payload);
      },true);
      doc.addEventListener("input",(event)=>{
        if(!event.isTrusted)return;
        const target=event.target;
        if(!(target instanceof frame.contentWindow.Element))return;
        if(target.matches?.('input[type="password"],input[type="file"]'))return;
        const payload={...remoteNodePayload(instance,target),value:target.value,checked:target.checked};
        if(payload.nodeId>=0)void sendCommand("input",payload);
      },true);
      doc.addEventListener("scroll",(event)=>{
        if(!event.isTrusted)return;
        const target=event.target===doc?doc.scrollingElement:event.target;
        const payload={...remoteNodePayload(instance,target),x:target?.scrollLeft||0,y:target?.scrollTop||0};
        if(target===doc.scrollingElement)payload.nodeId=-1;
        void sendCommand("scroll",payload);
      },true);
    };
    const addEvents=(events)=>{
      if(!events.length)return;
      if(!replayer.current){
        pendingEvents.current.push(...events);
        if(!pendingEvents.current.some(event=>Number(event?.type)===2)||!root.current)return;
        replayer.current=new Replayer(pendingEvents.current,{root:root.current,liveMode:true,skipInactive:true,showWarning:false,showDebug:false,mouseTail:false});
        replayer.current.startLive();setConnected(true);
        window.setTimeout(bindInteraction,250);
      }else events.forEach(event=>replayer.current.addEvent(event));
    };
    const poll=async()=>{
      try{
        const result=await assistanceJson(`/api/remote-assistance/${encodeURIComponent(assistance.id)}/events?after=${batchCursor.current}`,{token});
        setStatus(result.assistance?.status||status);setExpiresAt(result.assistance?.expiresAt||expiresAt);
        for(const batch of result.batches||[]){addEvents(Array.isArray(batch.events)?batch.events:[]);batchCursor.current=Math.max(batchCursor.current,Number(batch.id)||0);}
        if(["Ended","Expired","Declined"].includes(result.assistance?.status))onEnded?.();
      }catch(pollError){if(![404,409].includes(pollError.status))setError(pollError.message);else onEnded?.();}
      finally{if(!stopped)timer=window.setTimeout(poll,800);}
    };
    void poll();
    return()=>{stopped=true;window.clearTimeout(timer);replayer.current?.destroy();replayer.current=null;};
  },[assistance.id,token,canControl]);
  const end=async()=>{
    try{await assistanceJson(`/api/remote-assistance/${encodeURIComponent(assistance.id)}/end`,{token,method:"PATCH"});onEnded?.();}
    catch(endError){setError(endError.message);}
  };
  return createPortal(<div className="remote-control-overlay" data-remote-assistance-ui>
    <section className="remote-control-room" role="dialog" aria-modal="true" aria-labelledby="remote-control-title">
      <header><span><MousePointer2 /></span><div><h2 id="remote-control-title">Live BDMS Assistance · {assistance.targetName||assistance.targetLogin}</h2><p>{canControl?"Click, type and scroll inside the mirrored BDMS tab":"Secure view-only session"}</p></div><i className={connected?"connected":"waiting"}>{connected?"Live":"Waiting for screen"}</i><time>{remainingLabel(expiresAt)}</time><button type="button" onClick={onClose} title="Close viewer"><X /></button><button type="button" className="end" onClick={end}>End assistance</button></header>
      <div className="remote-control-stage"><div className="remote-control-canvas" ref={root}>{!connected&&<div className="remote-control-waiting"><MonitorUp /><b>{status==="Pending"?"Waiting for user approval":"Connecting to the user’s BDMS tab"}</b><span>The live view appears here after the user approves.</span></div>}</div></div>
      <footer><span><ShieldCheck /> Restricted to the approved BDMS tab</span><span>{canControl?<><Hand /> Control enabled</>:<><Eye /> View only</>}</span>{error&&<b role="alert"><AlertTriangle />{error}</b>}</footer>
    </section>
  </div>,document.body);
}

export function RemoteAssistanceAction({row,token,onChanged}){
  const [requesting,setRequesting]=useState(false);
  const [viewing,setViewing]=useState(false);
  const assistance=useMemo(()=>row.assistanceId?{
    id:row.assistanceId,status:row.assistanceStatus,accessLevel:row.assistanceAccessLevel,reason:row.assistanceReason,
    durationMinutes:row.assistanceDurationMinutes,expiresAt:row.assistanceExpiresAt,targetName:row.name,targetLogin:row.login,
  }:null,[row]);
  if(row.current)return <span className="remote-assistance-unavailable">Current session</span>;
  if(!row.online)return <span className="remote-assistance-unavailable">Offline</span>;
  return <>
    {assistance?.status==="Pending"?<button type="button" className="remote-assistance-button pending" disabled><MonitorUp />Awaiting approval</button>
      :assistance&&["Approved","Active"].includes(assistance.status)?<button type="button" className="remote-assistance-button active" onClick={()=>setViewing(true)}><MonitorUp />Open assistance</button>
      :<button type="button" className="remote-assistance-button" onClick={()=>setRequesting(true)}><MonitorUp />Request access</button>}
    {requesting&&<RemoteAssistanceRequestDialog row={row} token={token} onClose={()=>setRequesting(false)} onRequested={()=>{setRequesting(false);onChanged?.();}} />}
    {viewing&&assistance&&<RemoteAssistanceControlRoom assistance={assistance} token={token} onClose={()=>setViewing(false)} onEnded={()=>{setViewing(false);onChanged?.();}} />}
  </>;
}
