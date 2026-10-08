import {recordCountLabel} from './iboss-record-count.mjs';
import React,{useEffect,useRef,useState} from 'react';
import {ACCOUNT_VIEWS} from '../iboss-accounts.mjs';
import {indiaDateTimeInputValue} from '../report-date-range.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import {chatOptions,filterChatOptions,matchChatQuestion,vendorSearchText} from './iboss-chat-options.mjs';
import {createAccountPageLoader} from './iboss-account-loader.mjs';
import DateInput from './date-input.mjs';

export default function IbossChat({token,allowed,ReportSection}){
 const options=chatOptions(allowed),today=indiaDateTimeInputValue().slice(0,10);
 const [question,setQuestion]=useState(''),[range,setRange]=useState({from:today,to:today});
 const [vendorQuery,setVendorQuery]=useState(''),[vendors,setVendors]=useState({rows:[],loading:false,error:''}),[vendorOpen,setVendorOpen]=useState(false);
 const [request,setRequest]=useState(null),[error,setError]=useState('');
 const [data,setData]=useState({rows:[],loading:false});const loader=useRef(null);
 const definition=request&&ACCOUNT_VIEWS[request.view];
 useEffect(()=>{
  if(!request)return;
  const active=createAccountPageLoader({url:`/api/reports/iboss-accounts/${request.view}?${new URLSearchParams({...request.range,search:request.search||''})}`,token,onChange:setData});
  loader.current=active;void active.loadMore();active.loadCount();
  return ()=>{active.dispose();loader.current=null;};
 },[request,token]);
 const filtered=filterChatOptions(question,options);
 const lookup=vendorQuery||((!filtered.length||/\b(vendor|supplier|ledger|account)\b/i.test(question))?vendorSearchText(question):'');
 const canLookup=allowed.includes('Transactions')&&lookup.length>=2;
 useEffect(()=>{
  if(!canLookup){setVendors({rows:[],loading:false,error:''});return;}
  const controller=new AbortController();setVendors({rows:[],loading:true,error:''});
  const timer=setTimeout(async()=>{try{
   const response=await fetch(`/api/reports/iboss-accounts/chat-account-search?${new URLSearchParams({search:lookup,page:'0'})}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw new Error('Account search is unavailable. Please try again.');
   const body=await response.json();if(!controller.signal.aborted)setVendors({rows:body.rows||[],loading:false,error:''});
  }catch(e){if(!controller.signal.aborted)setVendors({rows:[],loading:false,error:e.message});}},350);
  return ()=>{clearTimeout(timer);controller.abort();};
 },[canLookup,lookup,token]);
 const ask=option=>{
  if(option.needsVendor){setVendorOpen(true);setError('Enter at least two letters of the account name or code, then choose its ledger below.');return;}
  try{
   const selected=/^Today's /.test(option.prompt)?{from:today,to:today}:range;
   purchaseOrderRange(selected.from,selected.to);setRange(selected);setQuestion(option.prompt);setError('');
   setData({rows:[],loading:true});setRequest({view:option.view,prompt:option.prompt,range:{...selected},search:option.search});
  }catch(e){setError(e.message);}
 };
 const submit=event=>{event.preventDefault();const option=matchChatQuestion(question,options);if(option)ask(option);else setError('Choose a matching suggestion or account ledger below to confirm what you want to check.');};
 return <div className="iboss-chat">
  <h2>Accounts Chat Bot</h2>
  <p>Choose a question or search for an Accounts report. Answers use your connected ERP records.</p>
  <form onSubmit={submit} className="stock-statement-filters">
   <label className="iboss-chat-question">What would you like to check?<input value={question} onChange={event=>{setQuestion(event.target.value);setVendorQuery('');setError('');}} placeholder="Type payment, EMI, bank closing or a vendor name" maxLength={200}/></label>
   <label>From<DateInput value={range.from} onChange={event=>setRange({...range,from:event.target.value})}/></label>
   <label>To / balance date<DateInput value={range.to} onChange={event=>setRange({...range,to:event.target.value})}/></label>
   <button type="submit">Ask</button><button type="button" className="secondary" onClick={()=>{setQuestion('');setVendorQuery('');setVendorOpen(false);setError('');}}>Show all suggestions</button>
  </form>
  <p>Questions starting with “Today's” use today in India. Other reports use the selected dates where supported.</p>
  {error&&<p role="alert">{error}</p>}
  <div className="iboss-chat-suggestions" aria-label="Suggested Accounts questions">{filtered.map(option=><button type="button" className="secondary" key={`${option.view}-${option.prompt}`} onClick={()=>ask(option)}>{option.prompt}</button>)}</div>
  {!filtered.length&&<p>No matching report suggestion. Matching account ledgers appear below; otherwise try payment, EMI, bank or balance.</p>}
  {allowed.includes('Transactions')&&(vendorOpen||canLookup)&&<div className="iboss-chat-answer">
   <label>Find account ledger<input aria-label="Account name or code" value={vendorQuery} onChange={event=>setVendorQuery(event.target.value)} placeholder="At least two letters of name or code" maxLength={120}/></label>
   {vendors.loading&&<p role="status">Searching account ledgers…</p>}
   {vendors.error&&<p role="alert">{vendors.error}</p>}
   {!vendors.loading&&canLookup&&!vendors.error&&!vendors.rows.length&&<p>No matching account ledger found.</p>}
   <div className="iboss-chat-suggestions">{vendors.rows.map(row=><button type="button" className="secondary" key={row.ACCOUNT_CODE} onClick={()=>ask({view:'chat-account-closing',prompt:`Closing balance: ${row.ACCOUNT_NAME} (${row.ACCOUNT_CODE})`,search:row.ACCOUNT_CODE})}>Closing balance — {row.ACCOUNT_NAME} ({row.ACCOUNT_CODE})</button>)}</div>
   {vendors.rows.length===20&&<p>Showing the first 20 matching ledgers. Type more letters to narrow the search.</p>}
  </div>}
  {request&&<section className="iboss-chat-answer" aria-label="ERP answer" aria-busy={!!data.loading}>
   <h3>{request.prompt}</h3>
   {data.loading?<p role="status">Fetching ERP records…</p>:<>
    <p>{definition.note||'Records from the connected Oracle database.'}</p>
    {definition.asOf&&<p><strong>Latest stored balances on or before {formatDisplayDate(request.range.to)}.</strong> Check each Stored Balance Date; an earlier snapshot is not confirmed closing for the selected day.</p>}
    {data.error&&<p role="alert">{data.error} <button type="button" onClick={()=>loader.current?.loadMore()}>Retry</button></p>}
    {!data.error||data.rows.length>0?<>
     <p role="status">{recordCountLabel(data,definition.summary?'summary groups':'records')} {definition.summary?'Each count and amount covers all matching source records in its group. ':''}Search and exports cover loaded rows only. Fetched {new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST.</p>
     <ReportSection key={`${request.view}-${request.search||''}-${request.range.from}-${request.range.to}`} title={definition.title} description={definition.dated?`${formatDisplayDate(request.range.from)} to ${formatDisplayDate(request.range.to)}`:definition.asOf?`On or before ${formatDisplayDate(request.range.to)}`:'All ERP records; no date filter'} category="iboss-accounts" rows={data.rows} columns={definition.columns.map(column=>({...column,value:row=>row[column.key]??''}))} exportLabel={data.hasMore?'Generate (loaded rows)':'Generate'} emptyMessage="No ERP records match this report and date range."/>
     {data.hasMore&&<button type="button" disabled={data.loadingMore} onClick={()=>loader.current?.loadMore()}>{data.loadingMore?'Loading…':'Load 500 more records'}</button>}
    </>:null}
   </>}
  </section>}
 </div>;
}
