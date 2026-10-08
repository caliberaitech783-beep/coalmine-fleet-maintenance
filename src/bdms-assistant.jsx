import React,{useEffect,useRef,useState,useId} from 'react';
import {createPortal} from 'react-dom';
import {MessageCircle,X,Volume2,Send} from 'lucide-react';
import {bdmsChatCanRead,BDMS_WELCOME} from '../telegram-bdms-chatbot.mjs';
import './bdms-assistant.css';

export default function BdmsAssistant({session,token}){
 const [open,setOpen]=useState(false),[language,setLanguage]=useState(''),[reply,setReply]=useState(null),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[soundBlocked,setSoundBlocked]=useState(false),[dates,setDates]=useState({from:'',to:''});
 const audio=useRef(null),dialog=useRef(null),request=useRef(null),context=useRef({}),titleId=useId();
 const permitted=bdmsChatCanRead(session);
 const play=()=>{
  audio.current??=new Audio('/caliber-pulse-welcome.mp3');
  audio.current.currentTime=0;
  audio.current.play().then(()=>setSoundBlocked(false)).catch(()=>setSoundBlocked(true));
 };
 const start=()=>{setLanguage('');setReply(null);context.current={};setError('');setQuery('');setOpen(true);play();};
 const close=()=>{request.current?.abort();audio.current?.pause();setBusy(false);setOpen(false);};
 useEffect(()=>{
  if(permitted&&new URLSearchParams(window.location.search).get('bdmsAssistant')==='1'){
   const url=new URL(window.location.href);url.searchParams.delete('bdmsAssistant');window.history.replaceState(null,'',url);start();
  }
  return ()=>{request.current?.abort();audio.current?.pause();};
 },[permitted]);
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();},[open]);
 async function ask(text){
  if(busy)return;
  setBusy(true);setError('');const controller=new AbortController();request.current=controller;
  try{
   const response=await fetch('/api/telegram/bdms-chatbot/preview',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({text,language,context:context.current}),signal:controller.signal});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load BDMS details.');
   setReply(result);setLanguage(result.language||'');context.current=result.context||{};setQuery('');
   if(result.welcome)play();else audio.current?.pause();
  }catch(e){if(e.name!=='AbortError')setError(e.message);}
  finally{if(request.current===controller){request.current=null;setBusy(false);}}
 }
 if(!permitted)return null;
 const hi=language==='hi',buttons=reply?.keyboard?.keyboard?.flat()||['English','हिंदी'];
 return <><button type="button" className="header-nav-item bdms-assistant-launch" onClick={start}><MessageCircle/><span>BDMS Assistant</span></button>{open&&createPortal(<dialog ref={dialog} className="bdms-assistant" aria-labelledby={titleId} onCancel={close}>
  <header><div><small>Caliber Pulse · BDMS</small><h2 id={titleId}>BDMS Assistant</h2><p>{session?.name||session?.login} · {hi?'आपकी भूमिका और साइट के अनुसार':'Your role and permitted sites'}</p></div><button type="button" onClick={close} aria-label="Close assistant"><X/></button></header>
  <div className="bdms-assistant-content">
   <div className="bdms-assistant-sound"><Volume2 size={18}/><span>{hi?'स्वागत संदेश':'Welcome greeting'}</span><button type="button" onClick={play}>{soundBlocked?(hi?'आवाज़ चालू करें':'Enable sound'):(hi?'फिर सुनें':'Replay')}</button></div>
   {soundBlocked&&<p role="status">{hi?'आपके ब्राउज़र को आवाज़ के लिए एक टैप चाहिए।':'Your browser requires a tap to enable sound.'}</p>}
   <div className="bdms-assistant-answer" aria-live="polite">{(reply?.text||BDMS_WELCOME).split(/(https:\/\/pulse\.cmll\.in\/[^\s]+)/g).map((part,i)=>part.startsWith('https://pulse.cmll.in/')?<a key={i} href={part} target="_blank" rel="noopener noreferrer">{hi?'अनुरोध खोलें':'Open request'}</a>:<React.Fragment key={i}>{part}</React.Fragment>)}</div>
   {error&&<p role="alert" className="bdms-assistant-error">{error}</p>}
   <div className="bdms-assistant-menu">{buttons.map(label=><button key={label} type="button" disabled={busy} onClick={()=>ask(label)}>{label}</button>)}</div>
   {language&&<><details><summary>{hi?'तारीखों के अनुसार ब्रेकडाउन':'Breakdowns by custom dates'}</summary><form onSubmit={e=>{e.preventDefault();ask(`/bd ${dates.from} ${dates.to}`);}}><label>{hi?'से':'From'}<input type="date" required value={dates.from} onChange={e=>setDates({...dates,from:e.target.value})}/></label><label>{hi?'तक':'To'}<input type="date" required min={dates.from} value={dates.to} onChange={e=>setDates({...dates,to:e.target.value})}/></label><button disabled={busy}>{hi?'दिखाएँ':'Show'}</button></form></details>
   <form className="bdms-assistant-query" onSubmit={e=>{e.preventDefault();if(query.trim())ask(query.trim());}}><input aria-label="BDMS question" maxLength={300} value={query} onChange={e=>setQuery(e.target.value)} placeholder={hi?'प्रश्न या /find V160':'Query or /find V160'}/><button disabled={busy||!query.trim()}><Send size={18}/>{hi?'भेजें':'Send'}</button></form></>}
   {busy&&<p role="status">{hi?'जानकारी लोड हो रही है…':'Loading your BDMS details…'}</p>}
  </div>
 </dialog>,document.body)}</>;
}
