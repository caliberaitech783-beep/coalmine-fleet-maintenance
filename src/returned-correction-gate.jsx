import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CorrectionCard} from './request-corrections.jsx';
import {startVisiblePoll} from './visible-poll.mjs';
import './returned-correction-gate.css';

function EvidenceDialog({title,close,children}){
  return <section className="returned-correction-evidence" role="dialog" aria-label={title}><header><h3>{title}</h3><button type="button" onClick={close}>Close image</button></header>{children}</section>;
}

export default function ReturnedCorrectionGate({token}){
  const [state,setState]=useState({records:[],fieldOptions:{},error:''});
  const dialog=useRef(null),reload=useRef(async()=>{});
  const blocked=state.records.length>0;
  useEffect(()=>{
    let active=true,pending=null;
    const load=()=>{
      if(pending)return pending;
      pending=fetch('/api/request-corrections/returned',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}})
        .then(async response=>{const body=await response.json();if(!response.ok||!Array.isArray(body.records))throw new Error(body.error||'Could not refresh returned corrections.');return body;})
        .then(body=>{if(active)setState({records:body.records,fieldOptions:body.fieldOptions||{},error:''});})
        .catch(error=>{if(active)setState(current=>({...current,error:error.message}));})
        .finally(()=>{pending=null;});
      return pending;
    };
    reload.current=async()=>{if(pending)await pending;return load();};
    void load();
    const stop=startVisiblePoll(load,30000);
    return ()=>{active=false;stop();reload.current=async()=>{};};
  },[token]);
  useEffect(()=>{
    if(!blocked||!dialog.current)return undefined;
    const element=dialog.current;
    element.showModal();
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return ()=>{element.close();document.body.style.overflow=overflow;};
  },[blocked]);
  if(!blocked)return null;
  return createPortal(<dialog className="returned-correction-gate" ref={dialog} onCancel={event=>event.preventDefault()} aria-labelledby="returned-correction-title">
    <header><h2 id="returned-correction-title">Correction requires your action</h2><p>Admin could not apply your correction. Edit and resubmit it for fresh PM approval, or delete this correction to continue. The maintenance request is not deleted.</p></header>
    {state.error&&<div role="alert">{state.error}<button type="button" onClick={()=>reload.current()}>Retry</button></div>}
    {state.records.map(record=><CorrectionCard key={record.id} record={record} capabilities={{}} token={token} Modal={EvidenceDialog} forced fieldOptions={state.fieldOptions} onChanged={()=>reload.current()} />)}
  </dialog>,document.body);
}
