import React,{useEffect,useMemo,useState} from 'react';
import {BookUser,Contact,Wallet,Landmark,Network,Settings,BookOpen,Percent,ArrowLeft,RefreshCw} from 'lucide-react';
import {ACCOUNT_VIEWS,ACCOUNT_SECTIONS} from '../iboss-accounts.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {indiaDateTimeInputValue} from '../report-date-range.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import DateInput from './date-input.mjs';
import './stock-statement.css';
import './iboss-accounts.css';
const icons=[BookUser,Contact,Wallet,Landmark,Settings,Network,BookOpen,Percent];
export default function IbossAccounts({token,ReportSection,initialSection='masters'}) {
 const [section,setSection]=useState(initialSection);
 const [view,setView]=useState('');
 const [range,setRange]=useState(()=>({from:indiaDateTimeInputValue(new Date(Date.now()-29*86400000)).slice(0,10),to:indiaDateTimeInputValue().slice(0,10)}));
 const [draft,setDraft]=useState(range),[attempt,setAttempt]=useState(0),[validation,setValidation]=useState('');
 const [data,setData]=useState({rows:[],loading:false,error:''});
 const definition=ACCOUNT_VIEWS[view];
 useEffect(()=>{setSection(initialSection);setView('');setValidation('');},[initialSection]);
 useEffect(()=>{
  if(!view)return;
  const controller=new AbortController();setData({rows:[],loading:true,error:''});
  fetch(`/api/reports/iboss-accounts/${view}?${new URLSearchParams(range)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
   .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load Accounts data.');return body;})
   .then(body=>{if(!controller.signal.aborted)setData({...body,loading:false,error:''});})
   .catch(error=>{if(!controller.signal.aborted)setData({rows:[],loading:false,error:error.message});});
  return ()=>controller.abort();
 },[token,view,range,attempt]);
 const columns=useMemo(()=>definition?.columns.map(column=>({...column,value:row=>(column.date||column.key.endsWith('_DATE'))&&row[column.key]?formatDisplayDate(row[column.key]):row[column.key]??'',sortValue:row=>row[column.key]}))||[],[definition]);
 const open=key=>{
  if(key==='day-book'){const today=indiaDateTimeInputValue().slice(0,10);const currentDay={from:today,to:today};setRange(currentDay);setDraft(currentDay);}
  setData({rows:[],loading:true,error:''});setValidation('');setView(key);
 };
 const refresh=event=>{event.preventDefault();try{if(definition.dated)purchaseOrderRange(draft.from,draft.to);if(definition.asOf)purchaseOrderRange(draft.to,draft.to);setValidation('');setRange({...draft});setAttempt(value=>value+1);}catch(error){setValidation(error.message);}};
 const changeSection=(next,focus=false)=>{setSection(next);setView('');setValidation('');if(focus)queueMicrotask(()=>document.getElementById(`accounts-tab-${next}`)?.focus());};
 const sectionKeyDown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();changeSection(event.key==='Home'?'masters':event.key==='End'?'transactions':section==='masters'?'transactions':'masters',true);};
 return <section className="reports-workspace stock-statement iboss-accounts">
  <h1><Landmark aria-hidden="true"/> Accounts</h1>
  <div className="iboss-accounts-sections" role="tablist" aria-label="Accounts sections" onKeyDown={sectionKeyDown}>{[['masters','Masters'],['transactions','Transactions']].map(([key,label])=><button key={key} type="button" role="tab" id={`accounts-tab-${key}`} tabIndex={section===key?0:-1} aria-selected={section===key} aria-controls={`accounts-panel-${key}`} onClick={()=>changeSection(key)}>{label}</button>)}</div>
  <div className="iboss-accounts-panel" role="tabpanel" id={`accounts-panel-${section}`} aria-labelledby={`accounts-tab-${section}`}>
   <h2>{section==='transactions'?'Transactions':'Masters'}</h2>
   <div className="iboss-accounts-grid">{ACCOUNT_SECTIONS[section].map((key,index)=>{const entry=ACCOUNT_VIEWS[key],Icon=icons[index%icons.length];return <button type="button" key={key} aria-pressed={view===key} onClick={()=>open(key)}><span className={`iboss-account-icon tone-${index%icons.length}`}><Icon aria-hidden="true"/></span><span>{entry.title}</span></button>;})}</div>
  </div>
  <div hidden role="tabpanel" id={`accounts-panel-${section==='masters'?'transactions':'masters'}`} aria-labelledby={`accounts-tab-${section==='masters'?'transactions':'masters'}`}/>
  {definition&&<>
   <form className="stock-statement-filters" onSubmit={refresh}>
    <button type="button" onClick={()=>{setView('');setValidation('');}}><ArrowLeft/>All Accounts menus</button>
    {definition.dated&&<><label>From<DateInput value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label><label>To<DateInput value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label></>}
    {definition.asOf&&<label>Stored balances on / before<DateInput value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>}
    <button type="submit" disabled={data.loading}><RefreshCw/>{data.loading?'Loading…':'Refresh'}</button>
   </form>
   {validation&&<p role="alert">{validation}</p>}
   {data.loading?<p role="status">Loading {definition.title} from Oracle…</p>:data.error?<p role="alert">{data.error}</p>:<>
    <p>{definition.note||'Current records from the connected Oracle database.'}</p>
    <ReportSection key={view} title={definition.title} category="iboss-accounts" description={`${definition.asOf?`Stored on / before ${formatDisplayDate(range.to)} · `:definition.dated?`${formatDisplayDate(range.from)} to ${formatDisplayDate(range.to)} · `:''}${data.rows.length.toLocaleString('en-IN')} records · Checked ${new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}`} rows={data.rows} columns={columns} rowKey={(row,index)=>`${row.ID}-${index}`} emptyMessage="No Oracle records match this report and date range."/>
   </>}
  </>}
 </section>;
}
